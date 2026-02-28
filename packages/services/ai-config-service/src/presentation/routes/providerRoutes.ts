/**
 * Provider Routes - HTTP route definitions for provider operations
 * Defines all API endpoints and connects them to controller methods
 */

import { Router } from 'express';
import { ProviderController } from '../controllers/ProviderController';
import { requestValidationMiddleware as _requestValidationMiddleware } from '../middleware/validation';
import { authenticationMiddleware } from '../middleware/authentication';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { loggingMiddleware } from '../middleware/logging';

const router: Router = Router();

// Apply middleware to all provider routes
router.use(loggingMiddleware);
router.use(authenticationMiddleware);
router.use(rateLimitMiddleware);

// Provider Operations Routes

/**
 * POST /api/providers/invoke
 * Invoke a provider with circuit breaker protection and automatic failover
 */
router.post('/invoke', ProviderController.invokeProvider);

/**
 * POST /api/providers/select
 * Select the best provider for a given operation based on requirements
 */
router.post('/select', ProviderController.selectProvider);

/**
 * GET /api/providers/health
 * Get health status of providers (all providers or specific provider by query param)
 * Query parameters:
 * - providerId?: string - Get health for specific provider
 * - providerType?: string - Filter by provider type
 * - includeMetrics?: boolean - Include performance metrics
 */
router.get('/health', ProviderController.getProviderHealth);

/**
 * POST /api/providers/test
 * Test a provider with a sample request to verify connectivity
 */
router.post('/test', ProviderController.testProvider);

/**
 * GET /api/providers/statistics
 * Get usage statistics and performance metrics
 * Query parameters:
 * - timeRangeMinutes?: number - Time range for statistics (default: 60)
 * - groupBy?: 'provider' | 'operation' | 'hour' - Grouping strategy (default: 'provider')
 */
router.get('/statistics', ProviderController.getStatistics);

/**
 * GET /api/providers/capabilities
 * Get providers that support a specific capability
 * Query parameters:
 * - capability: string - Required capability to filter by
 */
router.get('/capabilities', ProviderController.getProvidersByCapability);

/**
 * GET /api/providers/catalog
 * Get available provider catalog with optional filtering
 * Query parameters:
 * - type?: 'llm-text' | 'llm-image' | 'music' - Filter by provider type
 */
router.get('/catalog', ProviderController.getCatalog);

// Configuration Routes

/**
 * GET /api/providers/config/load-balancing
 * Get current load balancing configuration
 */
router.get('/config/load-balancing', ProviderController.getLoadBalancingConfig);

/**
 * POST /api/providers/config/load-balancing
 * Configure load balancing strategy
 */
router.post('/config/load-balancing', ProviderController.configureLoadBalancing);

// System Health Routes

/**
 * GET /api/providers/proxy/health
 * Get proxy health and performance status
 */
router.get('/proxy/health', ProviderController.getProxyHealth);

// Provider Configuration Management Routes

/**
 * GET /api/providers/configurations
 * Get all provider configurations with optional filtering
 * Query parameters:
 * - type?: 'llm-text' | 'llm-image' | 'music' - Filter by provider type
 * - includeAnalytics?: boolean - Include analytics data
 */
router.get('/configurations', ProviderController.getAllProviderConfigurations);

/**
 * GET /api/providers/configurations/:id
 * Get specific provider configuration by ID
 */
router.get('/configurations/:id', ProviderController.getProviderConfiguration);

/**
 * POST /api/providers/configurations
 * Create new provider configuration
 */
router.post('/configurations', ProviderController.createProviderConfiguration);

/**
 * PATCH /api/providers/configurations/:id
 * Update provider configuration (partial update)
 */
router.patch('/configurations/:id', ProviderController.updateProviderConfiguration);

/**
 * DELETE /api/providers/configurations/:id
 * Delete provider configuration
 */
router.delete('/configurations/:id', ProviderController.deleteProviderConfiguration);

/**
 * POST /api/providers/configurations/:id/set-primary
 * Set provider as primary for its type
 */
router.post('/configurations/:id/set-primary', ProviderController.setProviderAsPrimary);

/**
 * POST /api/providers/configurations/:id/health-check
 * Run health check on provider
 */
router.post('/configurations/:id/health-check', ProviderController.healthCheckProvider);

/**
 * POST /api/providers/configurations/:id/test
 * Test provider with sample request
 */
router.post('/configurations/:id/test', ProviderController.testProviderConfiguration);

export { router as providerRoutes };
