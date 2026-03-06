/**
 * Orchestration Flow Controller
 * Handles plan + confirm endpoints for orchestration flows.
 * Thin controller — all business logic is in use cases.
 */

import type { Request, Response, NextFunction } from 'express';
import { getLogger } from '../../config/service-urls';
import { serializeError, getResponseHelpers } from '@aiponge/platform-core';
import type { PlanOrchestrationFlowUseCase } from '../../application/use-cases/PlanOrchestrationFlowUseCase';
import type { ConfirmOrchestrationFlowUseCase } from '../../application/use-cases/ConfirmOrchestrationFlowUseCase';
import type { CancelOrchestrationFlowUseCase } from '../../application/use-cases/CancelOrchestrationFlowUseCase';

const { sendSuccess, ServiceErrors } = getResponseHelpers();
const logger = getLogger('orchestration-flow-controller');

export class OrchestrationFlowController {
  constructor(
    private readonly planUseCase: PlanOrchestrationFlowUseCase,
    private readonly confirmUseCase: ConfirmOrchestrationFlowUseCase,
    private readonly cancelUseCase: CancelOrchestrationFlowUseCase
  ) {}

  async planFlow(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { transcript, recipientId, sessionId } = req.body;
      const creatorId = req.headers['x-user-id'] as string;

      if (!creatorId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      if (!transcript || typeof transcript !== 'string') {
        ServiceErrors.badRequest(res, 'transcript is required', req);
        return;
      }

      const result = await this.planUseCase.execute({
        transcript,
        recipientId: recipientId || null,
        sessionId: sessionId || null,
        creatorId,
      });

      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Plan failed', req);
      }
    } catch (error) {
      logger.error('Error in planFlow', { error: serializeError(error) });
      next(error);
    }
  }

  async confirmFlow(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId, previewTrackId } = req.body;
      const creatorId = req.headers['x-user-id'] as string;

      if (!creatorId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      if (!sessionId || !previewTrackId) {
        ServiceErrors.badRequest(res, 'sessionId and previewTrackId are required', req);
        return;
      }

      const result = await this.confirmUseCase.execute({
        sessionId,
        previewTrackId,
        creatorId,
      });

      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Confirm failed', req);
      }
    } catch (error) {
      logger.error('Error in confirmFlow', { error: serializeError(error) });
      next(error);
    }
  }

  async cancelFlow(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const creatorId = req.headers['x-user-id'] as string;

      if (!creatorId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      if (!sessionId) {
        ServiceErrors.badRequest(res, 'sessionId is required', req);
        return;
      }

      const result = await this.cancelUseCase.execute({ sessionId, creatorId });

      if (result.success) {
        sendSuccess(res, result.data);
      } else {
        ServiceErrors.badRequest(res, result.error || 'Cancel failed', req);
      }
    } catch (error) {
      logger.error('Error in cancelFlow', { error: serializeError(error) });
      next(error);
    }
  }
}
