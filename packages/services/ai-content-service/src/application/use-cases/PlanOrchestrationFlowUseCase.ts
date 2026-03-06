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

      const validation = WellnessLLMPlanOutputSchema.safeParse(parsedPlan);
      if (!validation.success) {
        logger.warn('LLM plan validation failed', { errors: validation.error.message });
        return { success: false, error: `Invalid plan structure: ${validation.error.message}` };
      }

      const plan = validation.data;

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
}
