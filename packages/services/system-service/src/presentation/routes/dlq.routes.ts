import { Router } from 'express';
import { createLogger, QueueManager } from '@aiponge/platform-core';
import { serializeError } from '@aiponge/platform-core';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { dlqService } from '../../infrastructure/queue/DLQService';

const logger = createLogger('dlq-routes');
const router = Router();

router.get('/', async (req, res) => {
  try {
    const status = (req.query.status as string) || undefined;
    const queueName = (req.query.queueName as string) || undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await dlqService.listItems({ status, queueName, limit, offset });

    sendSuccess(res, {
      items: result.items,
      pagination: {
        total: result.total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error('Failed to list DLQ items', { error: serializeError(error) });
    ServiceErrors.internal(res, 'Failed to list DLQ items', undefined, req);
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dlqService.retryItem(id, QueueManager);

    if (!result.success) {
      ServiceErrors.badRequest(res, result.error || 'Failed to retry DLQ item', req);
      return;
    }

    sendSuccess(res, { message: 'Job re-enqueued successfully' });
  } catch (error) {
    logger.error('Failed to retry DLQ item', { id: req.params.id, error: serializeError(error) });
    ServiceErrors.internal(res, 'Failed to retry DLQ item', undefined, req);
  }
});

router.post('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dlqService.resolveItem(id);

    if (!result.success) {
      ServiceErrors.badRequest(res, result.error || 'Failed to resolve DLQ item', req);
      return;
    }

    sendSuccess(res, { message: 'DLQ item marked as resolved' });
  } catch (error) {
    logger.error('Failed to resolve DLQ item', { id: req.params.id, error: serializeError(error) });
    ServiceErrors.internal(res, 'Failed to resolve DLQ item', undefined, req);
  }
});

router.post('/cleanup', async (req, res) => {
  try {
    const olderThanDays = parseInt(req.body.olderThanDays as string) || 30;
    const deleted = await dlqService.cleanupResolved(olderThanDays);

    sendSuccess(res, { deleted, olderThanDays });
  } catch (error) {
    logger.error('Failed to cleanup DLQ', { error: serializeError(error) });
    ServiceErrors.internal(res, 'Failed to cleanup DLQ', undefined, req);
  }
});

export default router;
