/**
 * Plan Orchestration Flow Use Case
 * Handles the planning step of an orchestration flow (wellness, meditation, etc.).
 *
 * Flow: transcript → fetch context → LLM plan → create/update session → return plan.
 * Single LLM call, sub-2s target. Idempotent on re-plan (same sessionId).
 */

import { getLogger } from '../../config/service-urls';
import {
  CONTENT_VISIBILITY,
  WellnessLLMPlanOutputSchema,
  ORCHESTRATION_SESSION_TRANSITIONS,
  assertValidTransition,
  type WellnessPlanResponse,
  type OrchestrationMember,
} from '@aiponge/shared-contracts';
import type { UserServiceClient } from '../../infrastructure/clients/UserServiceClient';
import type { ProvidersServiceClient, ProviderRequest } from '../../infrastructure/clients/ProvidersServiceClient';
import type { OrchestrationSessionRepository } from '../../infrastructure/database/repositories/OrchestrationSessionRepository';
import type { InsertOrchestrationSession } from '../../schema/orchestration-session-schema';
import type { ContentTemplateService } from '../../domains/services/ContentTemplateService';
import { OrchestrationEventPublisher } from '../../infrastructure/events/OrchestrationEventPublisher';

const logger = getLogger('plan-orchestration-flow-usecase');

interface PlanOrchestrationFlowInput {
  transcript: string;
  recipientId: string | null; // null = self
  sessionId: string | null; // null = new session, set = re-plan
  creatorId: string;
}

interface PlanOrchestrationFlowResult {
  success: boolean;
  data?: WellnessPlanResponse;
  error?: string;
}

export class PlanOrchestrationFlowUseCase {
  constructor(
    private readonly userServiceClient: UserServiceClient,
    private readonly contentTemplateService: ContentTemplateService,
    private readonly providersServiceClient: ProvidersServiceClient,
    private readonly sessionRepository: OrchestrationSessionRepository
  ) {}

  async execute(input: PlanOrchestrationFlowInput): Promise<PlanOrchestrationFlowResult> {
    const { transcript, recipientId, sessionId, creatorId } = input;

    try {
      // 1. If re-plan, verify session ownership
      if (sessionId) {
        const existing = await this.sessionRepository.getByIdAndCreator(sessionId, creatorId);
        if (!existing) {
          return { success: false, error: 'Session not found or not owned by creator' };
        }
        // Re-plan is reviewing → reviewing transition
        if (existing.status === 'reviewing') {
          assertValidTransition(
            existing.status,
            'reviewing',
            ORCHESTRATION_SESSION_TRANSITIONS,
            'orchestration-session'
          );
        }
      } else {
        // Check for concurrent sessions (one active per creator)
        const active = await this.sessionRepository.getActiveForCreator(creatorId);
        if (active) {
          return { success: false, error: `Active session already exists: ${active.id}` };
        }
      }

      // 2. Fetch context in parallel
      const [members, bookTypes] = await Promise.all([
        this.userServiceClient.getMembers(creatorId),
        this.userServiceClient.getBookTypes(),
      ]);

      // 3. Resolve recipient
      const effectiveRecipientId = recipientId || creatorId;
      const isSelf = effectiveRecipientId === creatorId;
      const recipientMember = members.find(m => m.id === effectiveRecipientId);

      // 4. Fetch recipient preferences
      const preferences = await this.userServiceClient.getPreferences(effectiveRecipientId);

      // 5. Render prompt template
      const templateResult = await this.contentTemplateService.processTemplate('wellness-flow-planner', {
        transcript,
        recipientPreferences: preferences,
        availableBookTypes: bookTypes,
        recipientName: isSelf ? null : recipientMember?.name || null,
      });

      if (!templateResult || !templateResult.systemPrompt || !templateResult.userPrompt) {
        return { success: false, error: 'Failed to render wellness-flow-planner template' };
      }

      // 6. LLM call
      const providerRequest: ProviderRequest = {
        operation: 'text_generation',
        payload: {
          prompt: templateResult.userPrompt,
          systemPrompt: templateResult.systemPrompt,
          maxTokens: 1000,
          temperature: 0.3,
          responseFormat: 'json',
        },
        options: {
          timeout: 5000,
          priority: 'high',
        },
      };

      const llmResponse = await this.providersServiceClient.generateText(providerRequest);

      if (!llmResponse.success || !llmResponse.result) {
        return {
          success: false,
          error: `LLM plan generation failed: ${llmResponse.error?.message || 'Unknown error'}`,
        };
      }

      // 7. Parse + validate LLM output
      let parsedPlan;
      try {
        parsedPlan = JSON.parse(llmResponse.result);
      } catch {
        return { success: false, error: 'LLM returned invalid JSON' };
      }

      // 7a. Normalize LLM output before validation — LLMs often produce
      // out-of-range numbers, missing fields, or slightly wrong structures.
      // Clamp and fill defaults so validation doesn't reject otherwise usable plans.
      this.normalizeLLMOutput(parsedPlan);

      const validation = WellnessLLMPlanOutputSchema.safeParse(parsedPlan);
      if (!validation.success) {
        logger.warn('LLM plan validation failed after normalization', {
          errors: validation.error.message,
          receivedKeys: Object.keys(parsedPlan),
        });
        return { success: false, error: 'Plan generation produced an incomplete result. Please try again.' };
      }

      const plan = validation.data;

      // 7b. Derive firstTrack from album plan if the LLM omitted it
      if (!plan.firstTrack) {
        plan.firstTrack = {
          prompt: plan.album.suggestedTitle,
          mood: plan.album.mood,
          genre: plan.album.genres[0] || 'ambient',
          style: plan.album.style,
        };
        logger.info('Derived firstTrack from album plan (LLM omitted it)');
      }

      // 8. Determine visibility
      const visibility = isSelf ? CONTENT_VISIBILITY.PERSONAL : CONTENT_VISIBILITY.SHARED;

      // 9. Create or update session
      let finalSessionId: string;

      if (sessionId) {
        // Re-plan: update existing session
        const updated = await this.sessionRepository.updateStatus(sessionId, 'reviewing', {
          interpretation: plan.interpretation as InsertOrchestrationSession['interpretation'],
          plan: plan as unknown as Record<string, unknown>,
          recipientId: effectiveRecipientId,
          visibility,
        });
        if (!updated) {
          return { success: false, error: 'Failed to update session' };
        }
        finalSessionId = updated.id;
      } else {
        // New session
        const session = await this.sessionRepository.create({
          flowType: 'wellness',
          creatorId,
          recipientId: effectiveRecipientId,
          transcript,
          interpretation: plan.interpretation as InsertOrchestrationSession['interpretation'],
          plan: plan as unknown as Record<string, unknown>,
          status: 'reviewing',
          visibility,
        });
        finalSessionId = session.id;
      }

      // 10. Build members list for recipient picker
      const membersList: OrchestrationMember[] = [
        { id: creatorId, name: 'Myself', relationship: 'self' as const },
        ...members
          .filter(m => m.id !== creatorId)
          .map(m => ({ id: m.id, name: m.name, relationship: 'member' as const })),
      ];

      // 11. Build response
      const response: WellnessPlanResponse = {
        sessionId: finalSessionId,
        interpretation: plan.interpretation,
        recipient: {
          id: effectiveRecipientId,
          name: isSelf ? 'Myself' : recipientMember?.name || 'Unknown',
          relationship: isSelf ? 'self' : 'member',
          visibility,
        },
        plan: {
          book: plan.book,
          album: plan.album,
          firstTrack: plan.firstTrack,
        },
        membersList,
      };

      logger.info('Orchestration flow planned', {
        sessionId: finalSessionId,
        flowType: 'wellness',
        recipientIsSelf: isSelf,
        bookType: plan.book.bookTypeId,
      });

      // Publish planned event for analytics (non-blocking)
      OrchestrationEventPublisher.flowPlanned({
        flowType: 'wellness',
        sessionId: finalSessionId,
        creatorId,
        recipientId: effectiveRecipientId,
        recipientIsSelf: isSelf,
      });

      return { success: true, data: response };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Plan orchestration flow failed', { error: errorMsg, creatorId });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Normalize LLM output before Zod validation.
   * LLMs often produce slightly out-of-spec values that are still usable:
   * - chapterCount/trackCount outside 1-20 range → clamp
   * - Missing interpretation fields → fill defaults
   * - chapterThemes/genres as empty arrays → fill with placeholder
   * - Numeric strings instead of numbers → coerce
   */
  private normalizeLLMOutput(plan: Record<string, unknown>): void {
    // Ensure interpretation exists with required fields
    if (!plan.interpretation || typeof plan.interpretation !== 'object') {
      plan.interpretation = {
        summary: 'Based on your recording',
        detectedRecipientName: null,
        emotionalState: 'reflective',
        coreNeeds: ['wellness'],
      };
    } else {
      const interp = plan.interpretation as Record<string, unknown>;
      if (!interp.summary) interp.summary = 'Based on your recording';
      if (interp.detectedRecipientName === undefined) interp.detectedRecipientName = null;
      if (!interp.emotionalState) interp.emotionalState = 'reflective';
      if (!Array.isArray(interp.coreNeeds) || interp.coreNeeds.length === 0) {
        interp.coreNeeds = ['wellness'];
      }
    }

    // Normalize book plan
    if (plan.book && typeof plan.book === 'object') {
      const book = plan.book as Record<string, unknown>;
      if (!book.bookTypeId) book.bookTypeId = 'affirmation';
      if (!book.bookTypeName) book.bookTypeName = 'Affirmation Book';
      if (!book.suggestedTitle) book.suggestedTitle = 'Your Wellness Journey';

      // Coerce and clamp chapterCount
      const rawCount = Number(book.chapterCount);
      book.chapterCount = Math.max(1, Math.min(20, Number.isFinite(rawCount) ? rawCount : 5));

      // Ensure chapterThemes exists and has entries
      if (!Array.isArray(book.chapterThemes) || book.chapterThemes.length === 0) {
        book.chapterThemes = ['Reflection', 'Growth', 'Gratitude', 'Healing', 'Hope'].slice(
          0,
          book.chapterCount as number
        );
      }
    }

    // Normalize album plan
    if (plan.album && typeof plan.album === 'object') {
      const album = plan.album as Record<string, unknown>;
      if (!album.suggestedTitle) album.suggestedTitle = 'Wellness Sounds';

      // Coerce and clamp trackCount
      const rawCount = Number(album.trackCount);
      album.trackCount = Math.max(1, Math.min(20, Number.isFinite(rawCount) ? rawCount : 5));

      if (!Array.isArray(album.genres) || album.genres.length === 0) {
        album.genres = ['ambient'];
      }
      if (!album.mood) album.mood = 'calm';
      if (!album.style) album.style = 'soothing and reflective';
    }
  }
}
