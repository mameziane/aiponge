import express from 'express';
import { getLogger } from '../../config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { notifications } from '../../schema/system-schema';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('notification-index');
const db = getDatabase('notification-index');

const router: express.Router = express.Router();
const SERVICE_NAME = 'notification-domain';

const MAX_RETRIES = 3;

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'notification-domain',
    timestamp: new Date().toISOString(),
  });
});

router.get('/', (req, res) => {
  res.json({
    service: 'notification-service',
    status: 'active',
    endpoints: [
      'GET /health - Service health check',
      'GET /list - List notifications',
      'POST /send - Send a notification',
      'POST /:id/deliver - Mark notification as delivered',
      'POST /:id/retry - Retry failed notification',
    ],
    timestamp: new Date().toISOString(),
  });
});

router.post('/send', async (req, res) => {
  try {
    const { userId, type, channel, title, message, priority, metadata, templateId, scheduledFor } = req.body;

    if (!type || !channel || !title || !message) {
      ServiceErrors.badRequest(res, 'type, channel, title, and message are required', req);
      return;
    }

    const [notification] = await db
      .insert(notifications)
      .values({
        id: sql`gen_random_uuid()`,
        userId: userId || null,
        type,
        channel,
        title,
        message,
        status: scheduledFor ? 'pending' : 'sent',
        priority: priority || 'normal',
        metadata: metadata || {},
        templateId: templateId || null,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        sentAt: scheduledFor ? null : new Date(),
        retryCount: 0,
      })
      .returning();

    sendCreated(res, notification);
  } catch (error: unknown) {
    logger.error('Failed to send notification', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to send notification', req);
  }
});

router.get('/list', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const status = req.query.status as string;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const conditions = [isNull(notifications.deletedAt)];
    if (userId) conditions.push(eq(notifications.userId, userId));
    if (status) conditions.push(eq(notifications.status, status));

    const results = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    sendSuccess(res, results);
  } catch (error: unknown) {
    logger.error('Failed to list notifications', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to list notifications', req);
  }
});

router.post('/:id/deliver', async (req, res) => {
  try {
    const [notification] = await db
      .update(notifications)
      .set({
        status: 'delivered',
        deliveredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.status, 'sent')))
      .returning();

    if (!notification) {
      ServiceErrors.notFound(res, 'Notification', req);
      return;
    }

    logger.info('Notification delivered', { notificationId: notification.id });
    sendSuccess(res, notification);
  } catch (error: unknown) {
    logger.error('Failed to mark notification delivered', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to mark notification delivered', req);
  }
});

router.post('/:id/fail', async (req, res) => {
  try {
    const { errorMessage } = req.body;
    const [notification] = await db
      .update(notifications)
      .set({
        status: 'failed',
        failedAt: new Date(),
        errorMessage: errorMessage || 'Delivery failed',
        updatedAt: new Date(),
      })
      .where(eq(notifications.id, req.params.id))
      .returning();

    if (!notification) {
      ServiceErrors.notFound(res, 'Notification', req);
      return;
    }

    sendSuccess(res, notification);
  } catch (error: unknown) {
    logger.error('Failed to mark notification as failed', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to mark notification as failed', req);
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const [existing] = await db.select().from(notifications).where(eq(notifications.id, req.params.id));

    if (!existing) {
      ServiceErrors.notFound(res, 'Notification', req);
      return;
    }

    if (existing.status !== 'failed') {
      ServiceErrors.badRequest(res, 'Only failed notifications can be retried', req);
      return;
    }

    const currentRetryCount = existing.retryCount || 0;
    if (currentRetryCount >= MAX_RETRIES) {
      ServiceErrors.badRequest(res, `Maximum retry count (${MAX_RETRIES}) reached`, req, {
        retryCount: currentRetryCount,
      });
      return;
    }

    const [notification] = await db
      .update(notifications)
      .set({
        status: 'sent',
        retryCount: currentRetryCount + 1,
        failedAt: null,
        errorMessage: null,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(notifications.id, req.params.id))
      .returning();

    logger.info('Notification retry queued', {
      notificationId: notification.id,
      retryCount: notification.retryCount,
    });

    sendSuccess(res, notification);
  } catch (error: unknown) {
    logger.error('Failed to retry notification', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to retry notification', req);
  }
});

logger.debug('NOTIFICATION Domain configured', {
  module: 'notification_index',
  operation: 'domain_initialization',
  serviceName: SERVICE_NAME,
  domain: 'notification',
  phase: 'domain_configured',
});

export default router;
