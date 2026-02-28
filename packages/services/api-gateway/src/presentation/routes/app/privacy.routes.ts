/**
 * Privacy Routes
 * GDPR-compliant endpoints for user data export and deletion
 *
 * Canonical routes:
 * - GET  /api/app/privacy/export  - Export all user data (GDPR Article 20)
 * - DELETE /api/app/privacy/data  - Delete all user data (GDPR Article 17)
 */

import { Router } from 'express';
import { ServiceLocator, signUserIdHeader, serializeError, extractAuthContext } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { wrapAsync, parseErrorBody } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';
import { rateLimitMiddleware } from '../../middleware/RateLimitMiddleware';
import { ServiceErrors } from '../../utils/response-helpers';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-privacy.routes');

const router: Router = Router();

const exportRateLimit = rateLimitMiddleware({
  windowMs: 3600000,
  maxRequests: 1,
  keyType: 'per-user',
  segment: 'privacy-export',
});

/**
 * GET /api/app/privacy/export
 * Export all user data (GDPR Article 20 - Right to Data Portability)
 * Returns structured JSON export of all user data
 * Rate limited: 1 request per hour per user
 */
router.get(
  '/export',
  injectAuthenticatedUserId,
  exportRateLimit,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    logger.info('[PRIVACY EXPORT] Starting data export', { userId });

    try {
      const signedHeaders = signUserIdHeader(userId);
      const response = await gatewayFetch(`${userServiceUrl}/api/users/${userId}/export`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
          ...signedHeaders,
        },
      });

      if (!response.ok) {
        const errorData = (await parseErrorBody(response, '[PRIVACY EXPORT]')) as Record<string, unknown>;
        logger.error('[PRIVACY EXPORT] Failed', {
          userId,
          status: response.status,
          error: errorData.error || errorData.message,
        });
        res.status(response.status).json({
          success: false,
          message: errorData.error || errorData.message || 'Failed to export data',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const data = await response.json();
      logger.info('[PRIVACY EXPORT] Success', { userId });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="user-data-export-${userId}.json"`);
      res.json(data);
    } catch (error) {
      logger.error('[PRIVACY EXPORT] Exception', {
        userId,
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Data export failed', req);
    }
  })
);

/**
 * DELETE /api/app/privacy/data
 * Delete all user data (GDPR Article 17 - Right to Erasure)
 * Orchestrates deletion across all services
 */
router.delete(
  '/data',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    logger.info('[PRIVACY DELETE] Starting data deletion', { userId });

    try {
      const signedHeaders = signUserIdHeader(userId);
      const response = await gatewayFetch(`${userServiceUrl}/api/users/${userId}/data`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
          ...signedHeaders,
        },
      });

      if (!response.ok) {
        const errorData = (await parseErrorBody(response, '[PRIVACY DELETE]')) as Record<string, unknown>;
        logger.error('[PRIVACY DELETE] Failed', {
          userId,
          status: response.status,
          error: errorData.error || errorData.message,
        });
        res.status(response.status).json({
          success: false,
          message: errorData.error || errorData.message || 'Failed to delete data',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const data = await response.json();
      logger.info('[PRIVACY DELETE] Success', { userId });
      res.json(data);
    } catch (error) {
      logger.error('[PRIVACY DELETE] Exception', {
        userId,
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Data deletion failed', req);
    }
  })
);

export default router;
