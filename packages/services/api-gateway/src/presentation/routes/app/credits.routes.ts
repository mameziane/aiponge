/**
 * Member Credits Routes
 * Credit balance, transactions, and validation endpoints
 */

import { Router } from 'express';
import { ServiceLocator, extractAuthContext } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { wrapAsync, parseErrorBody } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
import { ServiceErrors } from '../../utils/response-helpers';
import { gatewayFetch } from '@services/gatewayFetch';
import { createResponseCacheMiddleware, CACHE_PRESETS } from '../../middleware/ResponseCacheMiddleware';

const logger = getLogger('api-gateway-credits.routes');

const router: Router = Router();

const policyCacheMiddleware = createResponseCacheMiddleware({
  ...CACHE_PRESETS.config,
  cdn: { scope: 'public' as const, sMaxAgeSec: 600, maxAgeSec: 300 },
});

const balanceCacheMiddleware = createResponseCacheMiddleware({
  ttlMs: 15000,
  staleWhileRevalidateMs: 30000,
  varyByHeaders: ['authorization'],
  cdn: { scope: 'private' as const, maxAgeSec: 15 },
});

/**
 * GET /api/app/credits/policy
 * Get credit policy (costs, minimum balance requirements)
 */
router.get(
  '/policy',
  policyCacheMiddleware,
  wrapAsync(async (req, res) => {
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await gatewayFetch(`${userServiceUrl}/api/credits/policy`);

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CREDITS POLICY]')) as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to fetch credit policy',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

/**
 * GET /api/app/credits/balance
 * Get user's current credit balance
 */
router.get(
  '/balance',
  injectAuthenticatedUserId,
  balanceCacheMiddleware,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[CREDITS] Fetching balance', { userId, requestId });

    const response = await gatewayFetch(`${userServiceUrl}/api/credits/${userId}/balance`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': requestId,
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CREDITS BALANCE]')) as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to fetch credit balance',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

/**
 * GET /api/app/credits/transactions
 * Get user's credit transaction history
 * Query params: limit, offset
 */
router.get(
  '/transactions',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();

    logger.info('[CREDITS] Fetching transactions', { userId, requestId, queryString });

    const response = await gatewayFetch(`${userServiceUrl}/api/credits/${userId}/transactions?${queryString}`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': requestId,
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CREDITS TRANSACTIONS]')) as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to fetch credit transactions',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

/**
 * POST /api/app/credits/validate
 * Validate if user has sufficient credits
 * Body: { amount: number }
 */
router.post(
  '/validate',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';
    const { amount } = req.body;

    logger.info('[CREDITS] Validating credits', { userId, requestId, amount });

    const response = await gatewayFetch(`${userServiceUrl}/api/credits/${userId}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify({ amount }),
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CREDITS VALIDATE]')) as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to validate credits',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

/**
 * POST /api/app/credits/grant-revenuecat
 * Grant credits after RevenueCat in-app purchase
 * Body: { productId: string, transactionId: string }
 */
router.post(
  '/grant-revenuecat',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';
    const { productId, transactionId } = req.body;

    if (!productId || !transactionId) {
      ServiceErrors.badRequest(res, 'productId and transactionId are required', req);
      return;
    }

    logger.info('[CREDITS] RevenueCat grant request', { userId, productId, transactionId, requestId });

    const response = await gatewayFetch(`${userServiceUrl}/api/credits/grant-revenuecat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify({ userId, productId, transactionId }),
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CREDITS GRANT REVENUECAT]')) as Record<string, unknown>;
      logger.error('[CREDITS] RevenueCat grant failed', { userId, productId, transactionId, error: errorData });
      res.status(response.status).json({
        success: false,
        message: errorData.message || errorData.error || 'Failed to grant credits',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    logger.info('[CREDITS] RevenueCat grant successful', { userId, productId, transactionId, data });
    res.json(data);
  })
);

/**
 * GET /api/app/credits/gifts/sent
 * Get gifts sent by the authenticated user
 */
router.get(
  '/gifts/sent',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    const response = await gatewayFetch(`${userServiceUrl}/api/credits/${userId}/gifts/sent`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': requestId,
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CREDITS GIFTS SENT]')) as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to fetch sent gifts',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

/**
 * GET /api/app/credits/gifts/received
 * Get gifts received by the authenticated user
 */
router.get(
  '/gifts/received',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    const response = await gatewayFetch(`${userServiceUrl}/api/credits/${userId}/gifts/received`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': requestId,
      },
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CREDITS GIFTS RECEIVED]')) as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to fetch received gifts',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

/**
 * POST /api/app/credits/gifts/send
 * Send a credit gift to another user
 */
router.post(
  '/gifts/send',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    const response = await gatewayFetch(`${userServiceUrl}/api/credits/gift/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify({ ...req.body, senderId: userId }),
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CREDITS GIFTS SEND]')) as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to send gift',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

/**
 * POST /api/app/credits/gifts/claim
 * Claim a credit gift using a claim token
 */
router.post(
  '/gifts/claim',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    const response = await gatewayFetch(`${userServiceUrl}/api/credits/gift/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify({ ...req.body, claimerId: userId }),
    });

    if (!response.ok) {
      const errorData = (await parseErrorBody(response, '[CREDITS GIFTS CLAIM]')) as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.message || 'Failed to claim gift',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

export default router;
