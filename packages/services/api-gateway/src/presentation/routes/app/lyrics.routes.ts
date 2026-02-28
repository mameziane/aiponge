/**
 * Member Lyrics Routes
 * AI-generated lyrics management endpoints
 */

import { Router } from 'express';
import { ServiceLocator, extractAuthContext, getValidation } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { wrapAsync, parseErrorBody } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId, injectOptionalUserId } from '../../middleware/authorizationMiddleware';
const { validateBody } = getValidation();
import { GenerateLyricsSchema, UpdateLyricsSchema } from '@aiponge/shared-contracts/api/input-schemas';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-lyrics.routes');

const router: Router = Router();

/**
 * POST /api/app/lyrics
 * Create new AI-generated lyrics
 */
router.post(
  '/',
  injectAuthenticatedUserId,
  validateBody(GenerateLyricsSchema),
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');

    logger.info('[LYRICS CREATE] Creating lyrics', { userId });

    const response = await gatewayFetch(`${musicServiceUrl}/api/lyrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[LYRICS CREATE]')) as Record<string, unknown>;
      logger.error('[LYRICS CREATE] Failed', {
        userId,
        status: response.status,
        error: errorData.message,
      });
      res.status(response.status).json({
        success: false,
        message: (errorData.message as string) || 'Failed to create lyrics',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = (await response.json()) as Record<string, unknown>;
    logger.info('[LYRICS CREATE] Success', { userId, lyricsId: (data?.data as Record<string, unknown>)?.id });
    res.json(data);
  })
);

/**
 * GET /api/app/lyrics/id/:lyricsId
 * Get lyrics by ID using unified lookup
 * Supports both guest users (shared library only) and authenticated users (shared + own lyrics)
 */
router.get(
  '/id/:lyricsId',
  injectOptionalUserId,
  wrapAsync(async (req, res) => {
    const { lyricsId } = req.params;
    const { userId } = extractAuthContext(req);
    const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');
    const type = req.query.type as string | undefined;

    const isGuest = !userId;
    logger.info('[LYRICS GET BY ID] Fetching lyrics via unified endpoint', {
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
      const errorData = (await parseErrorBody(response, '[LYRICS GET BY ID]')) as Record<string, unknown>;
      logger.error('[LYRICS GET BY ID] Failed', {
        lyricsId,
        status: response.status,
        error: (errorData.message as string) || (errorData.error as string),
        isGuest,
      });
      res.status(response.status).json({
        success: false,
        message: (errorData.message as string) || (errorData.error as string) || 'Failed to fetch lyrics',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = (await response.json()) as Record<string, unknown>;
    logger.info('[LYRICS GET BY ID] Success', { lyricsId, source: data.source, isGuest });
    res.json(data);
  })
);

/**
 * GET /api/app/lyrics/entry/:entryId
 * Get lyrics by entry ID
 */
router.get(
  '/entry/:entryId',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { entryId } = req.params;
    const { userId } = extractAuthContext(req);
    const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');

    logger.info('[LYRICS GET BY ENTRY] Fetching lyrics', { entryId, userId });

    const response = await gatewayFetch(`${musicServiceUrl}/api/lyrics/entry/${entryId}`, {
      headers: {
        'x-user-id': userId || '',
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[LYRICS GET BY ENTRY]')) as Record<string, unknown>;
      logger.error('[LYRICS GET BY ENTRY] Failed', {
        entryId,
        status: response.status,
        error: errorData.message,
      });
      res.status(response.status).json({
        success: false,
        message: (errorData.message as string) || 'Failed to fetch lyrics',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = await response.json();
    logger.info('[LYRICS GET BY ENTRY] Success', { entryId });
    res.json(data);
  })
);

/**
 * DELETE /api/app/lyrics/:lyricsId
 * Delete lyrics by ID (internal service use for track deletion cascade)
 */
router.delete(
  '/:lyricsId',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { lyricsId } = req.params;
    const { userId } = extractAuthContext(req);
    const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');

    logger.info('[LYRICS DELETE] Deleting lyrics', { lyricsId, userId });

    const response = await gatewayFetch(`${musicServiceUrl}/api/lyrics/${lyricsId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[LYRICS DELETE]')) as Record<string, unknown>;
      logger.error('[LYRICS DELETE] Failed', {
        lyricsId,
        status: response.status,
        error: errorData.message,
      });
      res.status(response.status).json({
        success: false,
        message: (errorData.message as string) || 'Failed to delete lyrics',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = await response.json();
    logger.info('[LYRICS DELETE] Success', { lyricsId });
    res.json(data);
  })
);

export default router;
