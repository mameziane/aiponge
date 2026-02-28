/**
 * Public Library Routes
 * Unauthenticated endpoints for public album/track access
 * These routes are mounted BEFORE the global JWT middleware in app.routes.ts
 */

import { Router } from 'express';
import { createProxyHandler } from '../helpers/routeHelpers';
import { injectOptionalUserId } from '../../middleware/authorizationMiddleware';
import { createResponseCacheMiddleware, CACHE_PRESETS } from '../../middleware/ResponseCacheMiddleware';
import { optionalJwtAuthMiddleware } from '../../middleware/jwtAuthMiddleware';

const router: Router = Router();
const SERVICE = 'music-service';

const cacheShared = createResponseCacheMiddleware(CACHE_PRESETS.catalog);

/**
 * GET /api/app/library/public-albums
 * Get published albums from shared library (available to all users including guests)
 * CACHED: 5 min TTL, public content
 */
router.get(
  '/public-albums',
  optionalJwtAuthMiddleware,
  injectOptionalUserId,
  cacheShared,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      return `/api/catalog/public-albums${queryString ? `?${queryString}` : ''}`;
    },
    logPrefix: '[PUBLIC ALBUMS]',
    errorMessage: 'Failed to fetch public albums',
  })
);

/**
 * GET /api/app/library/public-albums/:albumId
 * Get a specific public album with its tracks (available to all users including guests)
 */
router.get(
  '/public-albums/:albumId',
  optionalJwtAuthMiddleware,
  injectOptionalUserId,
  cacheShared,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/catalog/public-albums/${req.params.albumId}`,
    logPrefix: '[PUBLIC ALBUM DETAILS]',
    errorMessage: 'Failed to fetch public album',
  })
);

export default router;
