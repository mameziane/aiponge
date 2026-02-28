/**
 * Member Activity Routes
 * Proxies to music-service for user activity data (calendar view, track creation/listening history)
 */

import { Router } from 'express';
import { ServiceLocator, serializeError, extractAuthContext } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { createPolicyRoute, wrapAsync } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';
import { gatewayFetch } from '@services/gatewayFetch';
import { createResponseCacheMiddleware } from '../../middleware/ResponseCacheMiddleware';

const logger = getLogger('api-gateway-activity.routes');

const router: Router = Router();

const calendarCacheMiddleware = createResponseCacheMiddleware({
  ttlMs: 60000,
  staleWhileRevalidateMs: 120000,
  varyByHeaders: ['authorization', 'accept-language'],
  cdn: { scope: 'private' as const, maxAgeSec: 60 },
});

/**
 * GET /api/app/activity/calendar
 * Get aggregated activity data for calendar view
 * Proxies to music-service
 */
router.get(
  '/calendar',
  calendarCacheMiddleware,
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/music/library/activity/calendar',
    logPrefix: '[ACTIVITY CALENDAR]',
    errorMessage: 'Failed to fetch activity data',
    query: req => req.query as Record<string, string | number | undefined>,
  })
);

/**
 * GET /api/app/activity/day/:date
 * Get detailed activity for a specific day
 * Proxies to music-service
 */
router.get(
  '/day/:date',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/music/library/activity/day/${req.params.date}`,
    logPrefix: '[ACTIVITY DAY]',
    errorMessage: 'Failed to fetch day activity',
  })
);

/**
 * GET /api/app/activity/alarms
 * Get all scheduled alarms for the user
 * Proxies to music-service
 */
router.get(
  '/alarms',
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/music/library/schedules',
    logPrefix: '[GET ALARMS]',
    errorMessage: 'Failed to fetch alarms',
  })
);

/**
 * DELETE /api/app/activity/alarms/:scheduleId
 * Delete a scheduled alarm
 */
router.delete(
  '/alarms/:scheduleId',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/music/library/schedules/${req.params.scheduleId}`,
    logPrefix: '[DELETE ALARM]',
    errorMessage: 'Failed to delete alarm',
  })
);

/**
 * POST /api/app/activity/schedule-alarm
 * Schedule an alarm to play a track at a specific time on selected days
 * Transforms alarm data to schedule format and proxies to music-service
 */
router.post(
  '/schedule-alarm',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);

    if (!userId) {
      ServiceErrors.unauthorized(res, 'User ID required', req);
      return;
    }

    const { trackId, time, daysOfWeek, enabled, recurring } = req.body;

    if (!trackId || !time || !daysOfWeek || !Array.isArray(daysOfWeek)) {
      ServiceErrors.badRequest(res, 'trackId, time, and daysOfWeek are required', req);
      return;
    }

    try {
      const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');

      // Parse time string (e.g., "07:00") into hours and minutes
      const [hours, minutes] = time.split(':').map(Number);

      // Create base date with the alarm time
      const baseDate = new Date();
      baseDate.setHours(hours, minutes, 0, 0);

      // For weekly recurring alarms, create a schedule for each selected day
      const results = [];

      for (const dayOfWeek of daysOfWeek) {
        logger.info('[SCHEDULE ALARM] Creating schedule for day', {
          trackId,
          dayOfWeek,
          time,
          userId,
        });

        const response = await gatewayFetch(`${musicServiceUrl}/api/music/library/schedules`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
          body: JSON.stringify({
            userTrackId: trackId,
            baseDate: baseDate.toISOString(),
            repeatType: recurring ? 'weekly' : 'once',
            dayOfWeek: dayOfWeek,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('[SCHEDULE ALARM] Music service error', {
            status: response.status,
            error: errorText,
          });
          continue;
        }

        const data = await response.json();
        results.push(data);
      }

      if (results.length === 0) {
        ServiceErrors.internal(res, 'Failed to create any alarm schedules', undefined, req);
        return;
      }

      logger.info('[SCHEDULE ALARM] Success', {
        userId,
        trackId,
        schedulesCreated: results.length,
      });

      sendSuccess(res, results);
    } catch (error) {
      logger.error('[SCHEDULE ALARM] Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to schedule alarm', req);
      return;
    }
  })
);

export default router;
