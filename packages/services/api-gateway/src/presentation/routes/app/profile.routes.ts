/**
 * Profile Routes
 * All user profile management endpoints under /api/app/profile
 *
 * Canonical routes:
 * - GET  /api/app/profile              - Get user's profile
 * - PATCH /api/app/profile             - Update user's profile
 * - PATCH /api/app/profile/preferences - Update user's preferences
 * - GET  /api/app/profile/wellness     - Get user's wellness score
 * - GET  /api/app/profile/puzzle-progress - Get puzzle progress
 * - PATCH /api/app/profile/puzzle-progress - Update puzzle progress
 */

import { Router } from 'express';
import { extractAuthContext, getValidation } from '@aiponge/platform-core';
import { createProxyHandler } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
const { validateBody } = getValidation();
import {
  UpdateProfileSchema,
  UpdatePreferencesSchema,
  UpdatePuzzleProgressSchema,
} from '@aiponge/shared-contracts/api/input-schemas';
import { createResponseCacheMiddleware } from '../../middleware/ResponseCacheMiddleware';

const router: Router = Router();

const PROFILE_SERVICE = 'user-service';

const profileCacheMiddleware = createResponseCacheMiddleware({
  ttlMs: 30000,
  staleWhileRevalidateMs: 60000,
  varyByHeaders: ['authorization', 'accept-language'],
  cdn: { scope: 'private' as const, maxAgeSec: 30 },
});

/**
 * GET /api/app/profile
 * Get authenticated user's profile (injects userId from JWT)
 */
router.get(
  '/',
  injectAuthenticatedUserId,
  profileCacheMiddleware,
  createProxyHandler({
    service: PROFILE_SERVICE,
    path: req => `/api/profiles/${extractAuthContext(req).userId}`,
    logPrefix: '[PROFILE]',
    errorMessage: 'Failed to fetch profile',
  })
);

/**
 * PATCH /api/app/profile/preferences
 * Update user's preferences (music preferences, notifications, theme, etc.)
 */
router.patch(
  '/preferences',
  injectAuthenticatedUserId,
  validateBody(UpdatePreferencesSchema),
  createProxyHandler({
    service: PROFILE_SERVICE,
    path: req => `/api/users/${extractAuthContext(req).userId}/preferences`,
    method: 'PATCH',
    logPrefix: '[PROFILE]',
    errorMessage: 'Failed to update preferences',
    transformBody: req => {
      const { preferences } = req.body;
      return preferences && typeof preferences === 'object' ? { preferences } : req.body;
    },
  })
);

/**
 * GET /api/app/profile/wellness
 * Get user's wellness score and metrics
 */
router.get(
  '/wellness',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: PROFILE_SERVICE,
    path: req => `/api/analytics/users/${extractAuthContext(req).userId}/wellness`,
    logPrefix: '[PROFILE]',
    errorMessage: 'Failed to fetch wellness score',
  })
);

/**
 * GET /api/app/profile/puzzle-progress
 * Get user's Self-Portrait Puzzle progress
 */
router.get(
  '/puzzle-progress',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: PROFILE_SERVICE,
    path: () => '/api/profile/puzzle-progress',
    logPrefix: '[PROFILE]',
    errorMessage: 'Failed to fetch puzzle progress',
  })
);

/**
 * PATCH /api/app/profile/puzzle-progress
 * Update user's Self-Portrait Puzzle progress (lastVisitedRoute, milestones, or incrementListens)
 */
router.patch(
  '/puzzle-progress',
  injectAuthenticatedUserId,
  validateBody(UpdatePuzzleProgressSchema),
  createProxyHandler({
    service: PROFILE_SERVICE,
    path: () => '/api/profile/puzzle-progress',
    method: 'PATCH',
    logPrefix: '[PROFILE]',
    errorMessage: 'Failed to update puzzle progress',
  })
);

/**
 * PATCH /api/app/profile
 * Update user's profile (name, displayName, birthdate, avatar, etc.)
 * Uses authenticated userId from JWT
 */
router.patch(
  '/',
  injectAuthenticatedUserId,
  validateBody(UpdateProfileSchema),
  createProxyHandler({
    service: PROFILE_SERVICE,
    path: req => `/api/profiles/${extractAuthContext(req).userId}`,
    method: 'PATCH',
    logPrefix: '[PROFILE]',
    errorMessage: 'Failed to update profile',
  })
);

router.post(
  '/mood-checkin',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: PROFILE_SERVICE,
    path: () => '/api/profile/mood-checkin',
    method: 'POST',
    logPrefix: '[PROFILE]',
    errorMessage: 'Failed to record mood check-in',
  })
);

router.get(
  '/narrative/:userId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: PROFILE_SERVICE,
    path: req => `/api/profile/narrative/${req.params.userId}`,
    logPrefix: '[PROFILE]',
    errorMessage: 'Failed to fetch personal narrative',
  })
);

export default router;
