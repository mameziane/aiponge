/**
 * Admin API Routes
 * Aggregated endpoints for admin dashboard - uses domain-specific controllers
 * Split into AdminHealthController, AdminProvidersController, and AdminAggregationController
 */

import { Router, Request, Response } from 'express';
import { adminController } from '../controllers/AdminAggregationController';
import { adminHealthController } from '../controllers/AdminHealthController';
import { adminProvidersController } from '../controllers/AdminProvidersController';
import { wrapAsync } from './helpers/routeHelpers';
import { proxyToUserService } from './helpers/proxyHelpers';
import { getLogger } from '../../config/service-urls';
import { getCacheStats, clearCache, invalidateCachePattern } from '../middleware/ResponseCacheMiddleware';
import { getIdempotencyCacheStats } from '../middleware/IdempotencyMiddleware';
import { isSharedRedisReady } from '../middleware/RedisRateLimitMiddleware';
import { ServiceLocator, errorMessage, extractAuthContext } from '@aiponge/platform-core';
import { sendSuccess, ServiceErrors } from '../utils/response-helpers';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-admin.routes');
const router: Router = Router();

// ============================================================================
// AI TEMPLATE ADMIN ENDPOINTS (Proxied to ai-content-service)
// ============================================================================

const proxyToAiContent = async (req: Request, res: Response, path: string, method: string = 'GET') => {
  const aiContentServiceUrl = ServiceLocator.getServiceUrl('ai-content-service');

  const queryString =
    Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query as Record<string, string>).toString() : '';

  const targetUrl = `${aiContentServiceUrl}${path}${queryString}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
  };

  const { userId } = extractAuthContext(req);
  if (userId) {
    headers['x-user-id'] = userId;
  }

  if (req.headers['authorization']) {
    headers['authorization'] = req.headers['authorization'] as string;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (method !== 'GET' && method !== 'HEAD' && req.body) {
    fetchOptions.body = JSON.stringify(req.body);
  }

  const response = await gatewayFetch(targetUrl, fetchOptions);
  const data = await response.json();
  res.status(response.status).json(data);
};

router.get(
  '/templates',
  wrapAsync(async (req, res) => {
    await proxyToAiContent(req, res, '/api/templates');
  })
);

router.get(
  '/templates/:templateId',
  wrapAsync(async (req, res) => {
    await proxyToAiContent(req, res, `/api/templates/${req.params.templateId}`);
  })
);

router.post(
  '/templates',
  wrapAsync(async (req, res) => {
    await proxyToAiContent(req, res, '/api/templates', 'POST');
  })
);

router.patch(
  '/templates/:templateId',
  wrapAsync(async (req, res) => {
    await proxyToAiContent(req, res, `/api/templates/${req.params.templateId}`, 'PATCH');
  })
);

router.delete(
  '/templates/:templateId',
  wrapAsync(async (req, res) => {
    await proxyToAiContent(req, res, `/api/templates/${req.params.templateId}`, 'DELETE');
  })
);

router.get(
  '/templates/:templateId/translations',
  wrapAsync(async (req, res) => {
    await proxyToAiContent(req, res, `/api/templates/${req.params.templateId}/translations`);
  })
);

router.put(
  '/templates/:templateId/translations',
  wrapAsync(async (req, res) => {
    await proxyToAiContent(req, res, `/api/templates/${req.params.templateId}/translations`, 'PUT');
  })
);

router.delete(
  '/templates/:templateId/translations/:locale',
  wrapAsync(async (req, res) => {
    await proxyToAiContent(
      req,
      res,
      `/api/templates/${req.params.templateId}/translations/${req.params.locale}`,
      'DELETE'
    );
  })
);

// ============================================================================
// HEALTH & MONITORING ENDPOINTS (AdminHealthController)
// ============================================================================

router.get('/health-overview', wrapAsync(adminHealthController.getSystemHealthOverview.bind(adminHealthController)));
router.get(
  '/circuit-breaker-stats',
  wrapAsync(adminHealthController.getCircuitBreakerStatsEndpoint.bind(adminHealthController))
);
router.get('/quality-metrics', wrapAsync(adminHealthController.getQualityMetrics.bind(adminHealthController)));
router.get('/service-metrics', wrapAsync(adminHealthController.getServiceMetrics.bind(adminHealthController)));
router.get('/system-topology', wrapAsync(adminHealthController.getSystemTopology.bind(adminHealthController)));
router.get('/system-diagnostics', wrapAsync(adminHealthController.getSystemDiagnostics.bind(adminHealthController)));
router.get('/test-endpoints', wrapAsync(adminHealthController.getTestEndpoints.bind(adminHealthController)));
router.post('/test-endpoint', wrapAsync(adminHealthController.testEndpoint.bind(adminHealthController)));

router.get('/recent-errors', wrapAsync(adminHealthController.getRecentErrors.bind(adminHealthController)));
router.get(
  '/errors/:correlationId',
  wrapAsync(adminHealthController.getErrorByCorrelationId.bind(adminHealthController))
);
router.get('/error-stats', wrapAsync(adminHealthController.getErrorStats.bind(adminHealthController)));

// Monitoring Scheduler Control (proxy to system-service monitoring module)
router.get('/monitoring-config', wrapAsync(adminHealthController.getMonitoringConfig.bind(adminHealthController)));
router.post('/monitoring-config', wrapAsync(adminHealthController.updateMonitoringConfig.bind(adminHealthController)));
router.get(
  '/monitoring-health-summary',
  wrapAsync(adminHealthController.getMonitoringHealthSummary.bind(adminHealthController))
);
router.get('/monitoring-issues', wrapAsync(adminHealthController.getMonitoringIssues.bind(adminHealthController)));

router.get(
  '/resilience-stats',
  wrapAsync(adminHealthController.getAggregatedResilienceStats.bind(adminHealthController))
);

// ============================================================================
// PROVIDER MANAGEMENT ENDPOINTS (AdminProvidersController)
// ============================================================================

router.get('/providers', wrapAsync(adminProvidersController.getProviders.bind(adminProvidersController)));
router.get(
  '/ai/providers/config',
  wrapAsync(adminProvidersController.getAIProvidersConfig.bind(adminProvidersController))
);

// Provider Configurations - CRUD endpoints
router.get(
  '/provider-configurations',
  wrapAsync(adminProvidersController.getProviderConfigurations.bind(adminProvidersController))
);
router.get(
  '/provider-configurations/:id',
  wrapAsync(adminProvidersController.getProviderConfigurationById.bind(adminProvidersController))
);
router.post(
  '/provider-configurations',
  wrapAsync(adminProvidersController.createProviderConfiguration.bind(adminProvidersController))
);
router.post(
  '/provider-configurations/discover',
  wrapAsync(adminProvidersController.discoverProviders.bind(adminProvidersController))
);
router.patch(
  '/provider-configurations/:id',
  wrapAsync(adminProvidersController.updateProviderConfiguration.bind(adminProvidersController))
);
router.delete(
  '/provider-configurations/:id',
  wrapAsync(adminProvidersController.deleteProviderConfiguration.bind(adminProvidersController))
);
router.post(
  '/provider-configurations/:id/set-primary',
  wrapAsync(adminProvidersController.setProviderAsPrimary.bind(adminProvidersController))
);
router.post(
  '/provider-configurations/:id/health-check',
  wrapAsync(adminProvidersController.healthCheckProviderConfiguration.bind(adminProvidersController))
);
router.post(
  '/provider-configurations/:id/test',
  wrapAsync(adminProvidersController.testProviderConfiguration.bind(adminProvidersController))
);

router.get(
  '/ai/providers/available',
  wrapAsync(adminProvidersController.getAIProvidersConfig.bind(adminProvidersController))
);

// MusicAPI.ai Credits Balance and Refresh
router.get('/musicapi-credits', wrapAsync(adminProvidersController.getMusicApiCredits.bind(adminProvidersController)));
router.post(
  '/musicapi-credits/refresh',
  wrapAsync(adminProvidersController.refreshMusicApiCredits.bind(adminProvidersController))
);

// ============================================================================
// AGGREGATION ENDPOINTS (AdminAggregationController - Lightweight)
// ============================================================================

// User Profile Data
router.get('/user-profile/:userId', wrapAsync(adminController.getUserProfileData.bind(adminController)));

// User Credits Statistics
router.get('/user-credits-stats', wrapAsync(adminController.getUserCreditsStats.bind(adminController)));

// Product Metrics (aggregated from user-service and music-service)
router.get('/product-metrics', wrapAsync(adminController.getProductMetrics.bind(adminController)));

// Song Replay Rate (proxied to music-service)
router.get('/replay-rate', async (req: Request, res: Response) => {
  try {
    const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');
    const days = req.query.days || '7';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
    };
    const { userId } = extractAuthContext(req);
    if (userId) {
      headers['x-user-id'] = userId;
    }
    if (req.headers['authorization']) {
      headers['authorization'] = req.headers['authorization'] as string;
    }
    const response = await gatewayFetch(`${musicServiceUrl}/admin/replay-rate?days=${days}`, { headers });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('Failed to proxy replay-rate to music-service', { error });
    ServiceErrors.serviceUnavailable(res, 'Failed to fetch replay rate metrics', req);
  }
});

// ============================================================================
// CACHE MANAGEMENT ENDPOINTS
// ============================================================================

router.get('/cache/stats', async (_req: Request, res: Response) => {
  const responseCache = await getCacheStats();
  const idempotencyCache = getIdempotencyCacheStats(isSharedRedisReady);

  sendSuccess(res, {
    responseCache,
    idempotencyCache,
  });
});

router.post('/cache/invalidate', async (req: Request, res: Response) => {
  const { pattern } = req.body;

  if (!pattern || typeof pattern !== 'string') {
    ServiceErrors.badRequest(res, 'Pattern is required', req);
    return;
  }

  const count = await invalidateCachePattern(pattern);
  logger.info('Cache invalidated via admin endpoint', { pattern, count });

  sendSuccess(res, {
    pattern,
    invalidatedCount: count,
  });
});

router.post('/cache/clear', (_req: Request, res: Response) => {
  clearCache();
  logger.info('Cache cleared via admin endpoint');

  sendSuccess(res, { message: 'Response cache cleared' });
});

// ============================================================================
// SAFETY & COMPLIANCE ENDPOINTS (Proxied to user-service)
// ============================================================================

router.get(
  '/safety/risk-stats',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/admin/safety/risk-stats');
  })
);

router.get(
  '/safety/risk-flags',
  wrapAsync(async (req, res) => {
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const path = queryString ? `/api/admin/safety/risk-flags?${queryString}` : '/api/admin/safety/risk-flags';
    await proxyToUserService(req, res, path);
  })
);

router.get(
  '/safety/risk-flags/:flagId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/admin/safety/risk-flags/${req.params.flagId}`);
  })
);

router.post(
  '/safety/risk-flags/:flagId/resolve',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/admin/safety/risk-flags/${req.params.flagId}/resolve`, 'POST');
  })
);

router.post(
  '/safety/risk-flags',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/admin/safety/risk-flags', 'POST');
  })
);

router.get(
  '/safety/compliance-stats',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/admin/safety/compliance-stats');
  })
);

router.get(
  '/safety/data-requests',
  wrapAsync(async (req, res) => {
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const path = queryString ? `/api/admin/safety/data-requests?${queryString}` : '/api/admin/safety/data-requests';
    await proxyToUserService(req, res, path);
  })
);

router.get(
  '/safety/data-requests/:requestId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/admin/safety/data-requests/${req.params.requestId}`);
  })
);

router.post(
  '/safety/data-requests/:requestId/process',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/admin/safety/data-requests/${req.params.requestId}/process`, 'POST');
  })
);

router.post(
  '/safety/analyze',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/admin/safety/analyze', 'POST');
  })
);

router.get(
  '/safety/patterns',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/admin/safety/patterns');
  })
);

// ============================================================================
// BOOK MANAGEMENT ENDPOINTS (Librarian content management)
// ============================================================================

router.get(
  '/books',
  wrapAsync(async (req, res) => {
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const path = queryString ? `/api/library/books?${queryString}` : '/api/library/books';
    await proxyToUserService(req, res, path);
  })
);

router.get(
  '/books/:bookId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}`);
  })
);

router.post(
  '/books',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/library/books', 'POST');
  })
);

router.patch(
  '/books/:bookId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}`, 'PATCH');
  })
);

router.delete(
  '/books/:bookId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}`, 'DELETE');
  })
);

router.post(
  '/books/:bookId/publish',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}/publish`, 'POST');
  })
);

router.post(
  '/books/:bookId/generate-cover',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}/generate-cover`, 'POST');
  })
);

// Chapter management
router.get(
  '/books/:bookId/chapters',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}/chapters`);
  })
);

router.get(
  '/book-chapters/:chapterId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/chapters/${req.params.chapterId}`);
  })
);

router.post(
  '/book-chapters',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/library/chapters', 'POST');
  })
);

router.patch(
  '/book-chapters/:chapterId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/chapters/${req.params.chapterId}`, 'PATCH');
  })
);

router.delete(
  '/book-chapters/:chapterId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/chapters/${req.params.chapterId}`, 'DELETE');
  })
);

// Entry management
router.get(
  '/book-chapters/:chapterId/entries',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/chapters/${req.params.chapterId}/entries`);
  })
);

router.post(
  '/book-entries',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/library/entries', 'POST');
  })
);

router.patch(
  '/book-entries/:entryId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/entries/${req.params.entryId}`, 'PATCH');
  })
);

router.delete(
  '/book-entries/:entryId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/entries/${req.params.entryId}`, 'DELETE');
  })
);

// ============================================================================
// DEV RESET ENDPOINT (Development only - delete test data)
// ============================================================================

router.post(
  '/dev-reset',
  wrapAsync(async (req, res) => {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      ServiceErrors.forbidden(res, 'Not available in production', req);
      return;
    }
    await proxyToUserService(req, res, '/api/admin/dev-reset', 'POST');
  })
);

// ============================================================================
// AI ANALYTICS ENDPOINTS (Direct database queries for analytics data)
// ============================================================================

router.get(
  '/analytics/summary',
  wrapAsync(async (req: Request, res: Response) => {
    try {
      const analyticsServiceUrl = ServiceLocator.getServiceUrl('ai-analytics-service');

      // Forward auth headers for admin validation
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      };

      const { userId } = extractAuthContext(req);
      if (userId) {
        headers['x-user-id'] = userId;
      }
      if (req.headers['authorization']) {
        headers['authorization'] = req.headers['authorization'] as string;
      }

      const response = await gatewayFetch(`${analyticsServiceUrl}/api/analytics/summary`, {
        method: 'GET',
        headers,
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.warn('Failed to fetch analytics summary', { error: errorMessage(error) });
      ServiceErrors.serviceUnavailable(res, 'Analytics service temporarily unavailable', req);
    }
  })
);

// ============================================================================
// REQUEST TRACING ROUTES
// ============================================================================

router.get(
  '/traces/:correlationId',
  wrapAsync(async (req: Request, res: Response) => {
    try {
      const { correlationId } = req.params;
      const analyticsServiceUrl = ServiceLocator.getServiceUrl('ai-analytics-service');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      };

      const { userId } = extractAuthContext(req);
      if (userId) {
        headers['x-user-id'] = userId;
      }
      if (req.headers['authorization']) {
        headers['authorization'] = req.headers['authorization'] as string;
      }

      const response = await gatewayFetch(`${analyticsServiceUrl}/api/traces/${correlationId}`, {
        method: 'GET',
        headers,
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.warn('Failed to fetch trace', { error: errorMessage(error) });
      ServiceErrors.serviceUnavailable(res, 'Analytics service temporarily unavailable', req);
    }
  })
);

router.get(
  '/traces',
  wrapAsync(async (req: Request, res: Response) => {
    try {
      const analyticsServiceUrl = ServiceLocator.getServiceUrl('ai-analytics-service');

      const queryParams = new URLSearchParams();
      const allowedParams = [
        'userId',
        'service',
        'operation',
        'status',
        'minDuration',
        'maxDuration',
        'since',
        'until',
        'limit',
        'offset',
      ];
      for (const param of allowedParams) {
        if (req.query[param]) {
          queryParams.append(param, req.query[param] as string);
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      };

      const { userId } = extractAuthContext(req);
      if (userId) {
        headers['x-user-id'] = userId;
      }
      if (req.headers['authorization']) {
        headers['authorization'] = req.headers['authorization'] as string;
      }

      const response = await gatewayFetch(`${analyticsServiceUrl}/api/traces?${queryParams.toString()}`, {
        method: 'GET',
        headers,
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.warn('Failed to search traces', { error: errorMessage(error) });
      ServiceErrors.serviceUnavailable(res, 'Analytics service temporarily unavailable', req);
    }
  })
);

router.get(
  '/traces/slow',
  wrapAsync(async (req: Request, res: Response) => {
    try {
      const analyticsServiceUrl = ServiceLocator.getServiceUrl('ai-analytics-service');

      const queryParams = new URLSearchParams();
      if (req.query.threshold) queryParams.append('threshold', req.query.threshold as string);
      if (req.query.since) queryParams.append('since', req.query.since as string);
      if (req.query.limit) queryParams.append('limit', req.query.limit as string);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      };

      const { userId } = extractAuthContext(req);
      if (userId) {
        headers['x-user-id'] = userId;
      }
      if (req.headers['authorization']) {
        headers['authorization'] = req.headers['authorization'] as string;
      }

      const response = await gatewayFetch(`${analyticsServiceUrl}/api/traces/slow?${queryParams.toString()}`, {
        method: 'GET',
        headers,
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.warn('Failed to fetch slow requests', { error: errorMessage(error) });
      ServiceErrors.serviceUnavailable(res, 'Analytics service temporarily unavailable', req);
    }
  })
);

router.get(
  '/traces/stats',
  wrapAsync(async (req: Request, res: Response) => {
    try {
      const analyticsServiceUrl = ServiceLocator.getServiceUrl('ai-analytics-service');

      const queryParams = new URLSearchParams();
      if (req.query.since) queryParams.append('since', req.query.since as string);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
      };

      const { userId } = extractAuthContext(req);
      if (userId) {
        headers['x-user-id'] = userId;
      }
      if (req.headers['authorization']) {
        headers['authorization'] = req.headers['authorization'] as string;
      }

      const response = await gatewayFetch(`${analyticsServiceUrl}/api/traces/stats?${queryParams.toString()}`, {
        method: 'GET',
        headers,
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.warn('Failed to fetch trace stats', { error: errorMessage(error) });
      ServiceErrors.serviceUnavailable(res, 'Analytics service temporarily unavailable', req);
    }
  })
);

// ============================================================================
// DEAD LETTER QUEUE ENDPOINTS (Proxied to system-service)
// ============================================================================

const proxyToSystemService = async (req: Request, res: Response, path: string, method: string = 'GET') => {
  const systemServiceUrl = ServiceLocator.getServiceUrl('system-service');
  const targetUrl = `${systemServiceUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
  };
  const { userId, role } = extractAuthContext(req);
  if (userId) headers['x-user-id'] = userId;
  if (role) headers['x-user-role'] = role;
  if (req.headers['authorization']) headers['authorization'] = req.headers['authorization'] as string;

  const fetchOptions: RequestInit = { method, headers };
  if (method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
    fetchOptions.body = JSON.stringify(req.body);
  }

  const response = await gatewayFetch(targetUrl, fetchOptions);
  const data = await response.json();
  res.status(response.status).json(data);
};

router.get(
  '/dlq',
  wrapAsync(async (req, res) => {
    const params = new URLSearchParams();
    if (req.query.status) params.set('status', req.query.status as string);
    if (req.query.queueName) params.set('queueName', req.query.queueName as string);
    if (req.query.limit) params.set('limit', req.query.limit as string);
    if (req.query.offset) params.set('offset', req.query.offset as string);
    const qs = params.toString();
    await proxyToSystemService(req, res, `/api/dlq${qs ? '?' + qs : ''}`);
  })
);

router.post(
  '/dlq/:id/retry',
  wrapAsync(async (req, res) => {
    await proxyToSystemService(req, res, `/api/dlq/${req.params.id}/retry`, 'POST');
  })
);

router.post(
  '/dlq/:id/resolve',
  wrapAsync(async (req, res) => {
    await proxyToSystemService(req, res, `/api/dlq/${req.params.id}/resolve`, 'POST');
  })
);

export { router as adminRoutes };
