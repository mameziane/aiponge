/**
 * Lifecycle Controller
 * Thin wrapper for lifecycle event endpoints — delegates to use cases.
 */

import type { Request, Response } from 'express';
import { getResponseHelpers, serializeError, createLogger } from '@aiponge/platform-core';
import { lifecycleEventRequestSchema, lifecycleEventBatchRequestSchema } from '@aiponge/shared-contracts';
import { RecordLifecycleEventUseCase } from '../../application/use-cases/lifecycle/RecordLifecycleEventUseCase';
import { BatchRecordLifecycleEventsUseCase } from '../../application/use-cases/lifecycle/BatchRecordLifecycleEventsUseCase';

const { sendSuccess, sendCreated, ServiceErrors } = getResponseHelpers();
const logger = createLogger('ai-analytics-service:lifecycle-controller');

export class LifecycleController {
  constructor(
    private readonly recordUseCase: RecordLifecycleEventUseCase,
    private readonly batchUseCase: BatchRecordLifecycleEventsUseCase
  ) {}

  async recordEvent(req: Request, res: Response): Promise<void> {
    try {
      const parsed = lifecycleEventRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        ServiceErrors.badRequest(res, parsed.error.message, req);
        return;
      }

      const userId = (req as unknown as Record<string, unknown>).userId as string;
      const correlationId =
        (req.headers['x-correlation-id'] as string) || `cor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const result = await this.recordUseCase.execute({
        eventType: parsed.data.eventType,
        userId,
        platform: parsed.data.platform,
        sessionId: parsed.data.sessionId ?? null,
        metadata: (parsed.data.metadata as Record<string, unknown>) ?? {},
        correlationId,
        source: 'mobile-app',
      });

      sendCreated(res, { eventId: result.eventId });
    } catch (error) {
      logger.error('Failed to record lifecycle event', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to record lifecycle event', req);
    }
  }

  async recordEventsBatch(req: Request, res: Response): Promise<void> {
    try {
      const parsed = lifecycleEventBatchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        ServiceErrors.badRequest(res, parsed.error.message, req);
        return;
      }

      const userId = (req as unknown as Record<string, unknown>).userId as string;
      const correlationId =
        (req.headers['x-correlation-id'] as string) || `cor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const events = parsed.data.events.map(e => ({
        eventType: e.eventType,
        userId,
        platform: e.platform,
        sessionId: e.sessionId ?? null,
        metadata: (e.metadata as Record<string, unknown>) ?? {},
        correlationId,
        source: 'mobile-app',
      }));

      const result = await this.batchUseCase.execute(events);

      sendSuccess(res, {
        accepted: result.accepted,
        rejected: result.rejected,
        errors: result.errors,
      });
    } catch (error) {
      logger.error('Failed to batch record lifecycle events', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to batch record lifecycle events', req);
    }
  }
}
