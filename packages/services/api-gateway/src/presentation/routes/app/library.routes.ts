/**
 * Member Library Routes
 * Music library discovery and exploration endpoints
 *
 * SCALABILITY: Response caching applied to high-traffic read endpoints
 * - /explore: 2 min cache + 5 min stale-while-revalidate (semi-personalized)
 * - /shared: 5 min cache (public content)
 * - /track/:trackId: 5 min cache (read-only)
 *
 * POLICY LAYER: Routes use declarative policies for auth, rate limiting, logging
 * - Policies are resolved from ServiceManifest defaults + route-level overrides
 * - createProxyHandler applies policies automatically
 *
 * Refactored to use createProxyHandler for reduced duplication
 */
import { LIBRARY_SOURCE } from '@aiponge/shared-contracts';

import { Router } from 'express';
import { extractAuthContext } from '@aiponge/platform-core';
import { createProxyHandler, createPolicyRoute, CACHE_KEYS } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
import { createResponseCacheMiddleware, CACHE_PRESETS } from '../../middleware/ResponseCacheMiddleware';
import { GatewayConfig as GwConfig } from '../../../config/GatewayConfig';

const router: Router = Router();

const SERVICE = 'music-service';
const LOG_LIBRARY = '[LIBRARY]';

const cacheConfig = GwConfig.rateLimit.isRedisEnabled ? { redis: GwConfig.rateLimit.redis } : {};

const cacheExplore = createResponseCacheMiddleware({
  ...CACHE_PRESETS.explore,
  ...cacheConfig,
});

const cacheShared = createResponseCacheMiddleware({
  ...CACHE_PRESETS.catalog,
  ...cacheConfig,
});

const cacheTrack = createResponseCacheMiddleware({
  ...CACHE_PRESETS.catalog,
  varyByHeaders: ['accept-language'],
  ...cacheConfig,
});

const cacheAlbums = createResponseCacheMiddleware({
  ...CACHE_PRESETS.catalog,
  ...cacheConfig,
});

// ============================================================================
// EXPLORE & DISCOVERY
// ============================================================================

/**
 * GET /api/app/library/explore
 * Spotify-style explore feed with curated sections
 * CACHED: 2 min TTL, varies by user
 */
router.get(
  '/explore',
  injectAuthenticatedUserId,
  cacheExplore,
  createProxyHandler({
    service: SERVICE,
    path: '/api/music/library/explore',
    logPrefix: '[EXPLORE FEED]',
    errorMessage: 'Failed to fetch explore feed',
  })
);

/**
 * GET /api/app/library/shared
 * Get shared library tracks (available to all users)
 * CACHED: 5 min TTL, public content
 */
router.get(
  '/shared',
  injectAuthenticatedUserId,
  cacheShared,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const params = new URLSearchParams(req.query as Record<string, string>);
      params.set('source', LIBRARY_SOURCE.SHARED);
      return `/api/music/library?${params.toString()}`;
    },
    logPrefix: '[SHARED LIBRARY]',
    errorMessage: 'Failed to fetch shared library',
  })
);

/**
 * GET /api/app/library/private
 * Get user's private library tracks
 */
router.get(
  '/private',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const params = new URLSearchParams(req.query as Record<string, string>);
      params.set('source', LIBRARY_SOURCE.PRIVATE);
      return `/api/music/library?${params.toString()}`;
    },
    logPrefix: '[PRIVATE LIBRARY]',
    errorMessage: 'Failed to fetch user library',
  })
);

// ============================================================================
// TRACK OPERATIONS
// ============================================================================

/**
 * GET /api/app/library/track/:trackId
 * Get track details
 * CACHED: 5 min TTL, read-only
 */
router.get(
  '/track/:trackId',
  cacheTrack,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/music/library/track/${req.params.trackId}`,
    errorMessage: 'Failed to fetch track',
  })
);

/**
 * DELETE /api/app/library/track/:trackId
 * Delete a track from user's library - with declarative cache invalidation
 *
 * POLICY EXAMPLE: This route uses createPolicyRoute with explicit policies:
 * - auth: Automatically injected via policy layer (required by default)
 * - rateLimit: Strict preset (10 req/min) to prevent abuse
 * - logging: Debug level for tracing
 *
 * NOTE: No need to manually add injectAuthenticatedUserId - the policy layer
 * materializes auth middleware automatically based on service defaults.
 */
router.delete(
  '/track/:trackId',
  ...createPolicyRoute({
    service: SERVICE,
    path: req => `/api/music/library/track/${req.params.trackId}`,
    logPrefix: '[DELETE TRACK]',
    errorMessage: 'Failed to delete track',
    policies: {
      rateLimit: { preset: 'strict' },
      logging: { level: 'debug' },
    },
    transformResponse: data => ({
      success: true,
      message: 'Track deleted successfully',
      data,
      timestamp: new Date().toISOString(),
    }),
    invalidate: req => CACHE_KEYS.library.allForTrackUpdate(req.params.trackId as string),
  })
);

/**
 * PATCH /api/app/library/tracks/:trackId
 * Update track details (title) - with declarative cache invalidation
 */
router.patch(
  '/tracks/:trackId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/tracks/${req.params.trackId}`,
    logPrefix: '[UPDATE TRACK]',
    errorMessage: 'Failed to update track',
    transformResponse: data => ({
      success: true,
      message: 'Track updated successfully',
      data: (data as Record<string, unknown>).data,
      timestamp: new Date().toISOString(),
    }),
    invalidate: req => CACHE_KEYS.library.allForTrackUpdate(req.params.trackId as string),
  })
);

/**
 * PATCH /api/app/library/track/:trackId/artwork
 * Update track artwork URL - with declarative cache invalidation
 */
router.patch(
  '/track/:trackId/artwork',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/track/${req.params.trackId}/artwork`,
    logPrefix: '[UPDATE ARTWORK]',
    errorMessage: 'Failed to update artwork',
    transformResponse: data => ({
      success: true,
      message: 'Artwork updated successfully',
      data: (data as Record<string, unknown>).data,
      timestamp: new Date().toISOString(),
    }),
    invalidate: req => CACHE_KEYS.library.allForTrackUpdate(req.params.trackId as string),
  })
);

/**
 * POST /api/app/library/track-play
 * Record a track play for Recently Played and Top Songs tracking
 */
router.post(
  '/track-play',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/music/library/track-play',
    errorMessage: 'Failed to record play',
  })
);

/**
 * PATCH /api/app/library/tracks/bulk-update-creator-name
 * Bulk update display name in metadata for all user tracks (called when user updates their display name)
 */
router.patch(
  '/tracks/bulk-update-creator-name',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/tracks/bulk-update-creator-name',
    logPrefix: '[BULK UPDATE CREATOR NAME]',
    errorMessage: 'Failed to update creator name on tracks',
  })
);

// ============================================================================
// LIKED TRACKS
// ============================================================================

/**
 * GET /api/app/library/liked-tracks
 * Get all track IDs that the current user has liked
 */
router.get(
  '/liked-tracks',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/music/library/liked-tracks',
    errorMessage: 'Failed to fetch liked tracks',
  })
);

/**
 * POST /api/app/library/track/:trackId/like
 * Like a track
 */
router.post(
  '/track/:trackId/like',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/music/library/track/${req.params.trackId}/like`,
    logPrefix: '[LIKE TRACK]',
    errorMessage: 'Failed to like track',
  })
);

/**
 * DELETE /api/app/library/track/:trackId/like
 * Unlike a track
 */
router.delete(
  '/track/:trackId/like',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/music/library/track/${req.params.trackId}/like`,
    logPrefix: '[UNLIKE TRACK]',
    errorMessage: 'Failed to unlike track',
  })
);

// ============================================================================
// PLAYLIST ENGAGEMENT ENDPOINTS
// ============================================================================

router.post(
  '/playlist/:playlistId/like',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/playlists/${req.params.playlistId}/like`,
    logPrefix: '[LIKE PLAYLIST]',
    errorMessage: 'Failed to like playlist',
  })
);

router.delete(
  '/playlist/:playlistId/like',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/playlists/${req.params.playlistId}/like`,
    logPrefix: '[UNLIKE PLAYLIST]',
    errorMessage: 'Failed to unlike playlist',
  })
);

// ============================================================================
// FAVORITE METADATA ENDPOINTS
// ============================================================================

router.patch(
  '/track/:trackId/favorite',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/music/library/track/${req.params.trackId}/favorite`,
    logPrefix: '[UPDATE FAVORITE TRACK]',
    errorMessage: 'Failed to update favorite track metadata',
  })
);

router.patch(
  '/album/:albumId/favorite',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/music/library/album/${req.params.albumId}/favorite`,
    logPrefix: '[UPDATE FAVORITE ALBUM]',
    errorMessage: 'Failed to update favorite album metadata',
  })
);

router.patch(
  '/creator/:creatorId/follow',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/music/library/creator/${req.params.creatorId}/follow`,
    logPrefix: '[UPDATE FOLLOWED CREATOR]',
    errorMessage: 'Failed to update followed creator metadata',
  })
);

// ============================================================================
// SCHEDULE ENDPOINTS
// ============================================================================

/**
 * POST /api/app/library/schedules
 * Create a new recurring schedule for a track
 */
router.post(
  '/schedules',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/schedules',
    logPrefix: '[CREATE SCHEDULE]',
    errorMessage: 'Failed to create schedule',
  })
);

/**
 * GET /api/app/library/schedules
 * Get all schedules for the current user
 */
router.get(
  '/schedules',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/schedules?userId=${extractAuthContext(req).userId}`,
    errorMessage: 'Failed to fetch schedules',
  })
);

/**
 * GET /api/app/library/schedules/track/:trackId
 * Get schedules for a specific track
 */
router.get(
  '/schedules/track/:trackId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/schedules?userId=${extractAuthContext(req).userId}&userTrackId=${req.params.trackId}`,
    errorMessage: 'Failed to fetch track schedules',
  })
);

/**
 * PATCH /api/app/library/schedules/:scheduleId
 * Update a schedule's settings (date, repeat type, etc.)
 */
router.patch(
  '/schedules/:scheduleId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/schedules/${req.params.scheduleId}`,
    logPrefix: '[UPDATE SCHEDULE]',
    errorMessage: 'Failed to update schedule',
  })
);

/**
 * DELETE /api/app/library/schedules/:scheduleId
 * Delete a schedule
 */
router.delete(
  '/schedules/:scheduleId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/schedules/${req.params.scheduleId}`,
    logPrefix: '[DELETE SCHEDULE]',
    errorMessage: 'Failed to delete schedule',
  })
);

// ============================================================================
// SHARE TO PUBLIC LIBRARY
// ============================================================================

/**
 * POST /api/app/library/share-to-public
 * Share a user's track to the public shared library (creates a copy)
 */
router.post(
  '/share-to-public',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: () => '/api/library/share-to-public',
    logPrefix: '[SHARE TO PUBLIC]',
    errorMessage: 'Failed to share track to public library',
    forwardAuth: true,
  })
);

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

/**
 * DELETE /api/app/library/admin/shared-track/:trackId
 * Delete a track from the shared library (admin only)
 */
router.delete(
  '/admin/shared-track/:trackId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/music/library/admin/shared-track/${req.params.trackId}`,
    logPrefix: '[ADMIN DELETE SHARED TRACK]',
    errorMessage: 'Failed to delete track from shared library',
    forwardAuth: true,
  })
);

/**
 * POST /api/app/library/admin/move-to-public
 * Move a user's track to the public shared library (admin only)
 */
router.post(
  '/admin/move-to-public',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: () => '/api/library/admin/move-to-public',
    logPrefix: '[ADMIN MOVE TO PUBLIC]',
    errorMessage: 'Failed to move track to shared library',
    forwardAuth: true,
  })
);

// ============================================================================
// PUBLIC ALBUMS (Shared Library) - MOVED TO library-public.routes.ts
// These routes are now mounted before JWT middleware for guest access
// ============================================================================

// ============================================================================
// USER ALBUMS (Chapter-based)
// ============================================================================

/**
 * GET /api/app/library/albums
 * Get user's albums (auto-created from book chapters)
 */
router.get(
  '/albums',
  injectAuthenticatedUserId,
  cacheAlbums,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      return `/api/library/albums${queryString ? `?${queryString}` : ''}`;
    },
    logPrefix: '[USER ALBUMS]',
    errorMessage: 'Failed to fetch albums',
  })
);

/**
 * GET /api/app/library/albums/:albumId
 * Get a specific album with its tracks
 */
router.get(
  '/albums/:albumId',
  injectAuthenticatedUserId,
  cacheAlbums,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/albums/${req.params.albumId}`,
    logPrefix: '[ALBUM DETAILS]',
    errorMessage: 'Failed to fetch album',
  })
);

/**
 * DELETE /api/app/library/albums/:albumId
 * Delete an album (soft-delete). Owner can delete personal, librarian/admin can delete shared.
 */
router.delete(
  '/albums/:albumId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/albums/${req.params.albumId}`,
    logPrefix: '[DELETE ALBUM]',
    errorMessage: 'Failed to delete album',
    invalidate: req => CACHE_KEYS.albums.allForAlbumDelete(req.params.albumId as string),
  })
);

/**
 * GET /api/app/library/albums/chapter/:chapterId
 * Get album by chapter ID (for checking if album exists)
 */
router.get(
  '/albums/chapter/:chapterId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/albums/chapter/${req.params.chapterId}`,
    logPrefix: '[ALBUM BY CHAPTER]',
    errorMessage: 'Failed to fetch album for chapter',
  })
);

export default router;
