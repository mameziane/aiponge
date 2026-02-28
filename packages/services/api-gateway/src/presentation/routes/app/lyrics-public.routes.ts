/**
 * Public Lyrics Routes
 * Unauthenticated endpoints for public lyrics access
 * These routes are mounted BEFORE the global JWT middleware in app.routes.ts
 * to allow guest users to view shared library lyrics (progressive onboarding)
 */

import { Router } from 'express';
import { ServiceLocator, extractAuthContext } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { wrapAsync, parseErrorBody } from '../helpers/routeHelpers';
import { injectOptionalUserId } from '../../middleware/authorizationMiddleware';
import { optionalJwtAuthMiddleware } from '../../middleware/jwtAuthMiddleware';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-lyrics-public.routes');

const router: Router = Router();

/**
 * GET /api/app/lyrics/id/:lyricsId
 * Get lyrics by ID using unified lookup
 * Supports both guest users (shared library only) and authenticated users (shared + own lyrics)
 *
 * This endpoint is public to support progressive onboarding - guests can view
 * lyrics from shared library tracks. For user-owned lyrics, authentication is
 * validated by the backend music-service.
 *
 * Uses optionalJwtAuthMiddleware to decode JWT tokens when present, allowing
 * authenticated users to access their own lyrics without requiring authentication.
 */
router.get(
  '/id/:lyricsId',
  optionalJwtAuthMiddleware,
  injectOptionalUserId,
  wrapAsync(async (req, res) => {
    const { lyricsId } = req.params;
    const { userId } = extractAuthContext(req);
    const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');
    const type = req.query.type as string | undefined;

    const isGuest = !userId;
    logger.info('[PUBLIC LYRICS] Fetching lyrics via unified endpoint', {
      lyricsId,
      userId: userId || 'guest',
      type,
    });

    const queryParams = type ? `?visibility=${type}` : '';
    const response = await gatewayFetch(`${musicServiceUrl}/api/lyrics/${lyricsId}${queryParams}`, {
      headers: {
        ...(userId && { 'x-user-id': userId }),
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[PUBLIC LYRICS]')) as Record<string, unknown>;
      logger.error('[PUBLIC LYRICS] Failed', {
        lyricsId,
        status: response.status,
        error: errorData.message || errorData.error,
        isGuest,
      });
      res.status(response.status).json({
        success: false,
        message: errorData.message || errorData.error || 'Failed to fetch lyrics',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = (await response.json()) as Record<string, unknown>;
    logger.info('[PUBLIC LYRICS] Success', { lyricsId, source: data.source, isGuest });
    res.json(data);
  })
);

export default router;
