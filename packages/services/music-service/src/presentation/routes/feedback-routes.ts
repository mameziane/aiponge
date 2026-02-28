/**
 * Feedback Routes - Track user feedback on generated music helpfulness
 */

import { Router } from 'express';
import { eq, and, isNull } from 'drizzle-orm';
import { trackFeedback, insertTrackFeedbackSchema } from '../../schema/music-schema';
import { getLogger } from '../../config/service-urls';
import { serializeError, getResponseHelpers } from '@aiponge/platform-core';
const { sendSuccess, sendCreated, ServiceErrors } = getResponseHelpers();
import { getDatabase, DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';

const logger = getLogger('music-service-feedback');

export function createFeedbackRoutes(db?: DatabaseConnection): Router {
  const database = db || getDatabase();
  const router = Router();

  /**
   * POST /api/feedback
   * Submit user feedback on a generated track
   */
  router.post('/', async (req, res) => {
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    try {
      const validationResult = insertTrackFeedbackSchema.safeParse(req.body);

      if (!validationResult.success) {
        logger.warn('[FEEDBACK] Validation failed', {
          requestId,
          errors: validationResult.error.errors,
        });
        ServiceErrors.badRequest(res, 'Invalid feedback data', req, {
          fields: validationResult.error.errors,
        });
        return;
      }

      const feedbackData = validationResult.data;

      const existing = await database
        .select()
        .from(trackFeedback)
        .where(
          and(
            eq(trackFeedback.userId, feedbackData.userId),
            eq(trackFeedback.trackId, feedbackData.trackId),
            isNull(trackFeedback.deletedAt)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const [updated] = await database
          .update(trackFeedback)
          .set({
            wasHelpful: feedbackData.wasHelpful,
            context: feedbackData.context,
          })
          .where(and(eq(trackFeedback.id, existing[0].id), isNull(trackFeedback.deletedAt)))
          .returning();

        logger.info('[FEEDBACK] Updated existing feedback', {
          requestId,
          feedbackId: updated.id,
          trackId: feedbackData.trackId,
          wasHelpful: feedbackData.wasHelpful,
        });

        sendSuccess(res, updated);
        return;
      }

      const [inserted] = await database.insert(trackFeedback).values(feedbackData).returning();

      logger.info('[FEEDBACK] Created new feedback', {
        requestId,
        feedbackId: inserted.id,
        trackId: feedbackData.trackId,
        wasHelpful: feedbackData.wasHelpful,
      });

      sendCreated(res, inserted);
    } catch (error) {
      logger.error('[FEEDBACK] Error submitting feedback', {
        requestId,
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to submit feedback', req);
      return;
    }
  });

  /**
   * GET /api/feedback/:trackId
   * Check if user has submitted feedback for a track
   */
  router.get('/:trackId', async (req, res) => {
    const { trackId } = req.params;
    const userId = req.query.userId as string;
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    if (!userId) {
      ServiceErrors.badRequest(res, 'userId query parameter is required', req);
      return;
    }

    try {
      const [feedback] = await database
        .select()
        .from(trackFeedback)
        .where(
          and(eq(trackFeedback.userId, userId), eq(trackFeedback.trackId, trackId), isNull(trackFeedback.deletedAt))
        )
        .limit(1);

      if (!feedback) {
        ServiceErrors.notFound(res, 'Feedback', req);
        return;
      }

      sendSuccess(res, feedback);
    } catch (error) {
      logger.error('[FEEDBACK] Error checking feedback', {
        requestId,
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to check feedback', req);
      return;
    }
  });

  return router;
}
