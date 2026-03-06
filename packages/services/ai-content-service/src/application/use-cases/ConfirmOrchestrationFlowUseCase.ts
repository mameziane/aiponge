/**
 * Confirm Orchestration Flow Use Case
 * Handles the confirmation step of an orchestration flow.
 *
 * Flow: validate session → transition to confirmed → initialize outputs →
 *       publish confirmed event (music-svc flips track) →
 *       publish book_requested event (user-svc generates book).
 *
 * Zero HTTP calls between services — all coordination via events.
 */

import { getLogger } from '../../config/service-urls';
import {
  ORCHESTRATION_SESSION_TRANSITIONS,
  assertValidTransition,
  type WellnessConfirmResponse,
  type WellnessBookPlan,
  type WellnessAlbumPlan,
} from '@aiponge/shared-contracts';
import type { OrchestrationSessionRepository } from '../../infrastructure/database/repositories/OrchestrationSessionRepository';
import type { InsertOrchestrationSession } from '../../schema/orchestration-session-schema';
import { OrchestrationEventPublisher } from '../../infrastructure/events/OrchestrationEventPublisher';

const logger = getLogger('confirm-orchestration-flow-usecase');

interface ConfirmOrchestrationFlowInput {
  sessionId: string;
  previewTrackId: string;
  creatorId: string;
}

interface ConfirmOrchestrationFlowResult {
  success: boolean;
  data?: WellnessConfirmResponse;
  error?: string;
}

export class ConfirmOrchestrationFlowUseCase {
  constructor(private readonly sessionRepository: OrchestrationSessionRepository) {}

  async execute(input: ConfirmOrchestrationFlowInput): Promise<ConfirmOrchestrationFlowResult> {
    const { sessionId, previewTrackId, creatorId } = input;

    try {
      // 1. Load session and verify ownership
      const session = await this.sessionRepository.getByIdAndCreator(sessionId, creatorId);
      if (!session) {
        return { success: false, error: 'Session not found or not owned by creator' };
      }

      // 2. Validate transition: reviewing → confirmed
      assertValidTransition(session.status, 'confirmed', ORCHESTRATION_SESSION_TRANSITIONS, 'orchestration-session');

      // 3. Initialize outputs for completion tracking
      const outputs: InsertOrchestrationSession['outputs'] = {
        bookRequestId: null,
        albumRequestId: null,
        bookId: null,
        albumId: null,
        bookCompleted: false,
        albumCompleted: false,
      };

      // 4. Update session: confirmed + previewTrackId + outputs
      const updated = await this.sessionRepository.updateStatus(sessionId, 'confirmed', {
        previewTrackId,
        confirmedAt: new Date(),
        outputs,
      });

      if (!updated) {
        return { success: false, error: 'Failed to update session to confirmed' };
      }

      // 5. Determine recipient relationship
      const recipientIsSelf = session.creatorId === session.recipientId;
      const dedicatedToMemberId = recipientIsSelf ? null : session.recipientId;

      // 6. Publish confirmed event — music-service flips preview track draft → active
      OrchestrationEventPublisher.flowConfirmed({
        flowType: session.flowType,
        sessionId: session.id,
        previewTrackId,
        creatorId: session.creatorId,
        recipientId: session.recipientId,
        recipientIsSelf,
        visibility: session.visibility,
        dedicatedToMemberId,
      });

      // 7. Extract book + album plan from session
      const plan = session.plan as Record<string, unknown> | null;
      const bookPlan = plan?.book as WellnessBookPlan | undefined;
      const albumPlan = plan?.album as WellnessAlbumPlan | undefined;

      if (!bookPlan || !albumPlan) {
        logger.error('Session plan missing book or album', { sessionId });
        return { success: false, error: 'Session plan is missing book or album data' };
      }

      // 8. Publish book_requested event — user-service generates the book
      OrchestrationEventPublisher.bookRequested({
        flowType: session.flowType,
        sessionId: session.id,
        creatorId: session.creatorId,
        recipientId: session.recipientId,
        recipientIsSelf,
        visibility: session.visibility,
        dedicatedToMemberId,
        previewTrackId,
        bookParams: {
          bookTypeId: bookPlan.bookTypeId,
          chapterThemes: bookPlan.chapterThemes,
          suggestedTitle: bookPlan.suggestedTitle,
        },
        albumPlan: {
          suggestedTitle: albumPlan.suggestedTitle,
          trackCount: albumPlan.trackCount,
          genres: albumPlan.genres,
          mood: albumPlan.mood,
          style: albumPlan.style,
        },
      });

      logger.info('Orchestration flow confirmed', {
        sessionId,
        flowType: session.flowType,
        recipientIsSelf,
        previewTrackId,
      });

      // 9. Build response
      const response: WellnessConfirmResponse = {
        sessionId: updated.id,
        previewTrack: {
          id: previewTrackId,
          status: 'active',
          visibility: session.visibility as 'personal' | 'shared' | 'public',
        },
        bookRequestId: updated.id, // session ID doubles as correlation for book request
        albumRequestId: null, // album is triggered after book completion
        recipientNotified: false, // notification happens after all content is ready
      };

      return { success: true, data: response };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Confirm orchestration flow failed', { error: errorMsg, sessionId, creatorId });
      return { success: false, error: errorMsg };
    }
  }
}
