/**
 * Credit Store Routes
 * Handles credit pack catalog and order history
 *
 * Note: Stripe has been removed. Payments are handled via RevenueCat in-app purchases.
 * Product catalog is now database-driven via user-service for dynamic pricing updates.
 */

import { Router } from 'express';
import { ServiceLocator, serializeError, extractAuthContext } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { wrapAsync, createProxyHandler, parseErrorBody } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-store.routes');

const router: Router = Router();

const SERVICE = 'user-service';

// ============================================================================
// CATALOG (Database-driven via user-service)
// ============================================================================

router.get(
  '/catalog',
  createProxyHandler({
    service: SERVICE,
    path: () => '/api/credits/catalog',
    errorMessage: 'Failed to fetch product catalog',
  })
);

router.get(
  '/products',
  createProxyHandler({
    service: SERVICE,
    path: () => '/api/credits/products',
    errorMessage: 'Failed to fetch products',
  })
);

router.get(
  '/config',
  wrapAsync(async (req, res) => {
    sendSuccess(res, {
      paymentMethod: 'in_app_purchase',
      provider: 'revenuecat',
    });
  })
);

// ============================================================================
// SIMPLE PROXY ROUTES (Order history and gift management)
// ============================================================================

/**
 * GET /api/app/store/orders
 * Get user's order history
 */
router.get(
  '/orders',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/credits/${extractAuthContext(req).userId}/orders`,
    errorMessage: 'Failed to fetch orders',
  })
);

/**
 * GET /api/app/store/gifts/sent
 * Get user's sent gifts
 */
router.get(
  '/gifts/sent',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/credits/${extractAuthContext(req).userId}/gifts/sent`,
    errorMessage: 'Failed to fetch sent gifts',
  })
);

/**
 * GET /api/app/store/gifts/received
 * Get user's received gifts
 */
router.get(
  '/gifts/received',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/credits/${extractAuthContext(req).userId}/gifts/received`,
    errorMessage: 'Failed to fetch received gifts',
  })
);

/**
 * POST /api/app/store/gift/claim
 * Claim a gift using claim token
 */
router.post(
  '/gift/claim',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { claimToken } = req.body;

    if (!claimToken) {
      ServiceErrors.badRequest(res, 'claimToken is required', req);
      return;
    }

    const { userId } = extractAuthContext(req);
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';
    const userServiceUrl = ServiceLocator.getServiceUrl(SERVICE);

    try {
      const response = await gatewayFetch(`${userServiceUrl}/api/credits/gift/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-request-id': requestId,
        },
        body: JSON.stringify({ claimToken }),
      });

      if (!response.ok) {
        const errorData = (await parseErrorBody(response, '[GIFT CLAIM]')) as Record<string, unknown>;
        res.status(response.status).json({
          success: false,
          message: errorData.message || 'Failed to claim gift',
        });
        return;
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error('[GIFT CLAIM] Failed to claim gift', {
        error: serializeError(error),
        userId,
      });
      ServiceErrors.fromException(res, error, 'Failed to claim gift', req);
      return;
    }
  })
);

export default router;
