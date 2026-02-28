/**
 * Member Reflections Routes
 * AI-generated reflection questions and insights endpoints
 */

import { Router } from 'express';
import { ServiceLocator, extractAuthContext, getValidation } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { createProxyHandler, wrapAsync, parseErrorBody } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
import { safetyScreeningMiddleware } from '../../middleware/SafetyScreeningMiddleware';
const { validateBody } = getValidation();
import { CreateReflectionSchema, UpdateReflectionSchema } from '@aiponge/shared-contracts/api/input-schemas';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';
import { sendStructuredError, createStructuredError, getCorrelationId } from '@aiponge/shared-contracts';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-reflections.routes');

const reflectionSafetyMiddleware = safetyScreeningMiddleware({
  blockOnCrisis: false,
  requireAcknowledgmentOnHigh: false,
});

const router: Router = Router();

/**
 * POST /api/app/reflections
 * Create a new reflection
 */
router.post(
  '/',
  injectAuthenticatedUserId,
  validateBody(CreateReflectionSchema),
  reflectionSafetyMiddleware,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[REFLECTIONS] Creating reflection', { userId, requestId });

    // SECURITY: Always use authenticated userId, never trust client-provided userId
    const { userId: _, ...safeBody } = req.body;
    const bodyWithAuthUserId = { ...safeBody, userId };

    const response = await gatewayFetch(`${userServiceUrl}/api/reflections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify(bodyWithAuthUserId),
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[REFLECTIONS CREATE]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: (errorData.message as string) || 'Failed to create reflection',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.status(201).json(data);
  })
);

/**
 * GET /api/app/reflections
 * Get user's reflections
 */
router.get(
  '/',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[REFLECTIONS] Fetching reflections', { userId, requestId });

    const response = await gatewayFetch(`${userServiceUrl}/api/reflections/${userId}`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': requestId,
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[REFLECTIONS LIST]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: (errorData.message as string) || 'Failed to fetch reflections',
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
 * GET /api/app/reflections/:id
 * Get specific reflection by ID
 */
router.get(
  '/:id',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { id } = req.params;
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[REFLECTIONS] Fetching reflection by ID', { userId, reflectionId: id, requestId });

    const response = await gatewayFetch(`${userServiceUrl}/api/reflections/${id}?userId=${userId}`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': requestId,
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[REFLECTIONS GET]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: (errorData.message as string) || 'Failed to fetch reflection',
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
 * PATCH /api/app/reflections/:id
 * Update reflection (partial update)
 */
router.patch(
  '/:id',
  injectAuthenticatedUserId,
  validateBody(UpdateReflectionSchema),
  reflectionSafetyMiddleware,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { id } = req.params;
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[REFLECTIONS] Updating reflection', { userId, reflectionId: id, requestId });

    // SECURITY: Always use authenticated userId, never trust client-provided userId
    const { userId: _, ...safeBody } = req.body;
    const bodyWithAuthUserId = { ...safeBody, userId };

    const response = await gatewayFetch(`${userServiceUrl}/api/reflections/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify(bodyWithAuthUserId),
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[REFLECTIONS UPDATE]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: (errorData.message as string) || 'Failed to update reflection',
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
 * DELETE /api/app/reflections/:id
 * Delete reflection
 */
router.delete(
  '/:id',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { id } = req.params;
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[REFLECTIONS] Deleting reflection', { userId, reflectionId: id, requestId });

    // SECURITY: Always use authenticated userId
    const response = await gatewayFetch(`${userServiceUrl}/api/reflections/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[REFLECTIONS DELETE]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: (errorData.message as string) || 'Failed to delete reflection',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    sendSuccess(res, null);
  })
);

/**
 * POST /api/app/reflections/generate
 * Generate AI reflection questions/insights
 */
router.post(
  '/generate',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const aiContentServiceUrl = ServiceLocator.getServiceUrl('ai-content-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[REFLECTIONS] Generating AI reflection', { userId, requestId });

    const AI_TIMEOUT_MS = 120000; // 2 minutes for AI content generation

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    let response: Response;
    try {
      response = await gatewayFetch(`${aiContentServiceUrl}/api/ai/reflection/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-request-id': requestId,
        },
        body: JSON.stringify(req.body),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      logger.error('[REFLECTIONS] AI service request failed', {
        userId,
        requestId,
        errorType: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        timeoutMs: AI_TIMEOUT_MS,
      });
      sendStructuredError(
        res,
        504,
        createStructuredError(
          'TIMEOUT',
          'TimeoutError',
          isTimeout ? 'AI service request timed out' : 'AI service unavailable',
          { service: 'api-gateway', correlationId: getCorrelationId(req) }
        )
      );
      return;
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[REFLECTIONS GENERATE]') as Record<string, unknown>;
      logger.warn('[REFLECTIONS] AI service returned error', {
        userId,
        requestId,
        status: response.status,
        error: errorData.message,
      });
      res.status(response.status).json({
        success: false,
        message: (errorData.message as string) || 'Failed to generate reflection',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    logger.info('[REFLECTIONS] AI reflection generated successfully', { userId, requestId });
    res.json(data);
  })
);

const SERVICE = 'user-service';

router.post(
  '/:id/continue',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/reflections/${req.params.id}/continue`,
    method: 'POST',
    logPrefix: '[REFLECTIONS]',
    errorMessage: 'Failed to continue reflection dialogue',
  })
);

router.get(
  '/:id/thread',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/reflections/${req.params.id}/thread`,
    query: req => ({ userId: req.query.userId as string }),
    logPrefix: '[REFLECTIONS]',
    errorMessage: 'Failed to fetch reflection thread',
  })
);

export default router;
