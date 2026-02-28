/**
 * Member Music Routes
 * Music library and generation operations
 */

import { Router } from 'express';
import { extractAuthContext, getValidation } from '@aiponge/platform-core';
import { createPolicyRoute } from '../helpers/routeHelpers';
import { MusicGenerateSchema, isPrivilegedRole, normalizeRole } from '@aiponge/shared-contracts';

const { validateBody } = getValidation();

const router: Router = Router();

/**
 * NOTE: Library routes (/library/*) have been moved to library.routes.ts
 * for clean domain separation and to prevent routing conflicts.
 */

/**
 * POST /api/app/music/generate
 * Generate music from text → lyrics → music pipeline
 * Proxied to music-service which handles quota checking, generation, and usage tracking.
 * Role-based routing: privileged → /api/library/generate-track, regular → /api/music/generate-track
 */
router.post(
  '/generate',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => {
      const { role } = extractAuthContext(req);
      return isPrivilegedRole(normalizeRole(role)) ? '/api/library/generate-track' : '/api/music/generate-track';
    },
    logPrefix: '[MUSIC GENERATE]',
    errorMessage: 'Failed to generate music',
    middleware: [validateBody(MusicGenerateSchema)],
    transformBody: (req, userId) => ({
      ...req.body,
      userId,
      librarianUserId: isPrivilegedRole(normalizeRole(extractAuthContext(req).role)) ? userId : undefined,
    }),
  })
);

/**
 * POST /api/app/music/generate-album
 * Generate album from book chapter - batch song generation
 * Proxied to music-service which handles quota, credit reservation, generation, and settlement.
 * Role-based routing: privileged → /api/library/generate-album, regular → /api/music/generate-album
 */
router.post(
  '/generate-album',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => {
      const { role } = extractAuthContext(req);
      return isPrivilegedRole(normalizeRole(role)) ? '/api/library/generate-album' : '/api/music/generate-album';
    },
    logPrefix: '[ALBUM GENERATE]',
    errorMessage: 'Failed to generate album',
    transformBody: (req, userId) => ({ ...req.body, userId }),
  })
);

/**
 * POST /api/app/music/generate-album-async
 * Queue album generation as a background job
 * Uses same music-service endpoint - the service handles async processing internally
 */
router.post(
  '/generate-album-async',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => {
      const { role } = extractAuthContext(req);
      return isPrivilegedRole(normalizeRole(role)) ? '/api/library/generate-album' : '/api/music/generate-album';
    },
    logPrefix: '[ALBUM GENERATE ASYNC]',
    errorMessage: 'Failed to start album generation',
    transformBody: (req, userId) => ({ ...req.body, userId }),
  })
);

router.get(
  '/album-requests/active',
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/music/album-requests/active',
  })
);

router.get(
  '/album-requests/active/all',
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/music/album-requests/active/all',
  })
);

router.get(
  '/album-requests/:id',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/music/album-requests/${req.params.id}`,
    policies: { rateLimit: { preset: 'lenient' } },
  })
);

router.get(
  '/song-requests/:id',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/music/song-requests/${req.params.id}`,
    logPrefix: '[SONG REQUEST PROGRESS]',
    policies: { rateLimit: { preset: 'lenient' } },
  })
);

router.get(
  '/requests/:requestId',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/music/requests/${req.params.requestId}`,
    logPrefix: '[MUSIC REQUEST STATUS]',
    policies: { rateLimit: { preset: 'lenient' } },
  })
);

router.delete(
  '/songs/:songId',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/library/track/${req.params.songId}`,
    method: 'DELETE',
    logPrefix: '[DELETE SONG]',
  })
);

router.post(
  '/analytics/play-count',
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/music/library/track-play',
    logPrefix: '[PLAY COUNT]',
  })
);

/**
 * POST /api/app/music/analyze-preferences
 * Analyze user's free-text music preferences using AI
 * Returns structured data for music generation
 * Proxied to music-service which handles AI prompt construction and response parsing
 */
router.post(
  '/analyze-preferences',
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/music/analyze-preferences',
    logPrefix: '[ANALYZE PREFERENCES]',
    errorMessage: 'Failed to analyze preferences',
  })
);

/**
 * POST /api/app/music/feedback
 * Submit user feedback on generated music helpfulness
 * Validation of trackId/wasHelpful is handled by music-service.
 */
router.post(
  '/feedback',
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/feedback',
    logPrefix: '[MUSIC FEEDBACK]',
    errorMessage: 'Failed to submit feedback',
    transformBody: (req, userId) => ({ ...req.body, userId }),
  })
);

/**
 * GET /api/app/music/feedback/:trackId
 * Check if user has already submitted feedback for a track
 */
router.get(
  '/feedback/:trackId',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/feedback/${req.params.trackId}`,
    logPrefix: '[MUSIC FEEDBACK]',
    errorMessage: 'Failed to check feedback',
    query: req => ({ userId: extractAuthContext(req).userId }),
  })
);

// ================================================
// BATCH OPERATIONS - Proxy to music-service
// ================================================

router.patch(
  '/tracks/batch',
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/library/tracks/batch',
    method: 'PATCH',
  })
);

router.post(
  '/favorites/batch',
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/library/favorites/batch',
  })
);

export default router;
