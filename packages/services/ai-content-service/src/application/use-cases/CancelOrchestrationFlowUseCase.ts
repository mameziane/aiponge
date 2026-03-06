/**
 * Cancel Orchestration Flow Use Case
 * Cancels a session if it is still in a cancellable state (planning, reviewing).
 * Sets status = 'cancelled' and deletedAt = now().
 */

import { getLogger } from '../../config/service-urls';
import type { OrchestrationSessionRepository } from '../../infrastructure/database/repositories/OrchestrationSessionRepository';

const logger = getLogger('cancel-orchestration-flow');

const CANCELLABLE_STATES = ['planning', 'reviewing'];

interface CancelRequest {
  sessionId: string;
  creatorId: string;
}

interface CancelResult {
  success: boolean;
  data?: { sessionId: string; previousStatus: string; newStatus: string };
  error?: string;
}

export class CancelOrchestrationFlowUseCase {
  constructor(private readonly sessionRepository: OrchestrationSessionRepository) {}

  async execute(request: CancelRequest): Promise<CancelResult> {
    const { sessionId, creatorId } = request;

    try {
      const session = await this.sessionRepository.getByIdAndCreator(sessionId, creatorId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      if (!CANCELLABLE_STATES.includes(session.status)) {
        return {
          success: false,
          error: `Cannot cancel session in '${session.status}' state. Only cancellable in: ${CANCELLABLE_STATES.join(', ')}`,
        };
      }

      const previousStatus = session.status;
      await this.sessionRepository.updateStatus(sessionId, 'cancelled', {
        deletedAt: new Date(),
      });

      logger.info('Orchestration session cancelled', {
        sessionId,
        creatorId,
        previousStatus,
      });

      return {
        success: true,
        data: { sessionId, previousStatus, newStatus: 'cancelled' },
      };
    } catch (error) {
      logger.error('Failed to cancel orchestration session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: 'Failed to cancel session' };
    }
  }
}
