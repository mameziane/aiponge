/**
 * Member Subscriptions Routes
 * Usage tracking and subscription limit management
 *
 * All business validation (usage types, tier validation) is handled by user-service.
 * Gateway is a thin proxy layer with auth injection.
 */

import { Router } from 'express';
import { extractAuthContext } from '@aiponge/platform-core';
import { createProxyHandler, createPolicyRoute } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';

const router: Router = Router();

const SERVICE = 'user-service';
const LOG = '[SUBSCRIPTIONS]';

/**
 * GET /api/app/subscriptions/config
 * Get subscription tier configuration (Single Source of Truth)
 * Public endpoint - no auth required
 */
router.get(
  '/config',
  ...createPolicyRoute({
    service: SERVICE,
    path: '/api/subscriptions/config',
    logPrefix: LOG,
    errorMessage: 'Failed to fetch subscription config',
    policies: {
      auth: false,
    },
  })
);

/**
 * GET /api/app/subscriptions/status
 * Get current user's subscription status (tier from backend database)
 */
router.get(
  '/status',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/subscriptions/${extractAuthContext(req).userId}`,
    logPrefix: LOG,
    errorMessage: 'Failed to fetch subscription status',
  })
);

/**
 * GET /api/app/subscriptions/usage
 * Get current usage limits for authenticated user
 */
router.get(
  '/usage',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/subscriptions/${extractAuthContext(req).userId}/usage`,
    logPrefix: LOG,
    errorMessage: 'Failed to fetch usage limits',
  })
);

/**
 * POST /api/app/subscriptions/increment-usage
 * Increment usage counter for a feature
 * Body: { type: 'songs' | 'lyrics' | 'insights' }
 * Validation of usage type is handled by user-service
 */
router.post(
  '/increment-usage',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/subscriptions/${extractAuthContext(req).userId}/increment-usage`,
    logPrefix: LOG,
    errorMessage: 'Failed to increment usage',
  })
);

/**
 * POST /api/app/subscriptions/check-limit
 * Check if user has available quota for a feature (does not increment)
 * Body: { type: 'songs' | 'lyrics' | 'insights' }
 * Validation of usage type is handled by user-service
 */
router.post(
  '/check-limit',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/subscriptions/${extractAuthContext(req).userId}/check-limit`,
    logPrefix: LOG,
    errorMessage: 'Failed to check usage limit',
  })
);

/**
 * POST /api/app/subscriptions/check-eligibility
 * Check if user is eligible to use a feature (server-side gating)
 * Body: { featureType: 'songs' | 'lyrics' | 'insights' }
 * Validation of feature type is handled by user-service
 */
router.post(
  '/check-eligibility',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/subscriptions/${extractAuthContext(req).userId}/check-eligibility`,
    logPrefix: LOG,
    errorMessage: 'Failed to check usage eligibility',
  })
);

/**
 * POST /api/app/subscriptions/sync
 * Sync subscription status from RevenueCat after purchase
 * Body: { tier, productId?, entitlementId? }
 * Tier validation is handled by user-service
 *
 * SECURITY NOTE: This endpoint is for SANDBOX/DEV testing only!
 */
router.post(
  '/sync',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/subscriptions/${extractAuthContext(req).userId}`,
    logPrefix: LOG,
    errorMessage: 'Failed to sync subscription',
    transformBody: req => {
      const { tier, productId, entitlementId } = req.body;
      return {
        subscriptionTier: tier,
        productId: productId || `sandbox_sync_${tier}`,
        entitlementId: entitlementId || tier,
        status: 'active',
        source: 'client-sync-sandbox',
      };
    },
  })
);

export default router;
