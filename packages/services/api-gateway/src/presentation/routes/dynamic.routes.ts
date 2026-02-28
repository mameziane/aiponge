/**
 * Dynamic Routes Handler
 * Express routes for the enhanced dynamic router
 */

import { Router, Request, Response } from 'express';
import { DynamicRouter } from '../../services/DynamicRouter';
import { ServiceLocator, serializeError } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { ServiceErrors } from '../utils/response-helpers';

const logger = getLogger('api-gateway-dynamic.routes');

export class DynamicRoutesHandler {
  private router: Router;
  private dynamicRouter: DynamicRouter;

  constructor(dynamicRouter: DynamicRouter) {
    this.router = Router();
    this.dynamicRouter = dynamicRouter;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Gateway management endpoints
    this.router.get('/gateway/routes', this.getRoutes.bind(this));
    this.router.post('/gateway/routes', this.addRoute.bind(this));
    this.router.delete('/gateway/routes', this.removeRoute.bind(this));

    // Service discovery endpoints
    this.router.get('/gateway/services', this.getServices.bind(this));
    this.router.get('/gateway/services/:serviceName/stats', this.getServiceStats.bind(this));
    this.router.get('/gateway/services/:serviceName/health', this.checkServiceHealth.bind(this));

    // Metrics and monitoring endpoints
    this.router.get('/gateway/metrics', this.getMetrics.bind(this));
    this.router.delete('/gateway/metrics', this.clearMetrics.bind(this));

    // Gateway status and health
    this.router.get('/gateway/status', this.getGatewayStatus.bind(this));
    this.router.get('/gateway/health', this.getGatewayHealth.bind(this));

    // Debug and troubleshooting endpoints - DEVELOPMENT ONLY
    // SECURITY: These endpoints are gated to development mode only
    if (process.env.NODE_ENV !== 'production') {
      this.router.get('/gateway/debug/discovery', this.getDiscoveryStatus.bind(this));
      this.router.get('/gateway/debug/routes/:path(*)', this.debugRoute.bind(this));
      logger.debug('Debug endpoints enabled (development mode)');
    } else {
      logger.debug('Debug endpoints disabled (production mode)');
    }
  }

  /**
   * Get all configured routes
   * GET /api/gateway/routes
   */
  private async getRoutes(req: Request, res: Response): Promise<void> {
    try {
      const routes = this.dynamicRouter.getAllRoutes();

      res.status(200).json({
        success: true,
        routes: routes.map(({ path, config }) => ({
          path,
          serviceName: config.serviceName,
          rewritePath: config.rewritePath,
          stripPrefix: config.stripPrefix,
          timeout: config.timeout,
          retries: config.retries,
          requiresAuth: config.requiresAuth,
        })),
        total: routes.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get routes', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get routes', req);
      return;
    }
  }

  /**
   * Add a new route
   * POST /api/gateway/routes
   */
  private async addRoute(req: Request, res: Response): Promise<void> {
    try {
      const { path, serviceName, rewritePath, stripPrefix, timeout, retries, requiresAuth, headers } = req.body;

      if (!path || !serviceName) {
        ServiceErrors.badRequest(res, 'path and serviceName are required', req);
        return;
      }

      const routeConfig = {
        path,
        serviceName,
        rewritePath,
        stripPrefix,
        timeout,
        retries,
        requiresAuth,
        headers,
      };

      this.dynamicRouter.addRoute(routeConfig);

      res.status(201).json({
        success: true,
        message: 'Route added successfully',
        route: routeConfig,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to add route', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to add route', req);
      return;
    }
  }

  /**
   * Remove a route
   * DELETE /api/gateway/routes
   */
  private async removeRoute(req: Request, res: Response): Promise<void> {
    try {
      const { path } = req.body;

      if (!path) {
        ServiceErrors.badRequest(res, 'path is required', req);
        return;
      }

      const removed = this.dynamicRouter.removeRoute(path);

      if (removed) {
        res.status(200).json({
          success: true,
          message: 'Route removed successfully',
          path,
          timestamp: new Date().toISOString(),
        });
      } else {
        ServiceErrors.notFound(res, `Route ${path}`, req);
      }
    } catch (error) {
      logger.error('Failed to remove route', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to remove route', req);
      return;
    }
  }

  /**
   * Get all available services
   * GET /api/gateway/services
   */
  private async getServices(req: Request, res: Response): Promise<void> {
    try {
      const services = await this.dynamicRouter.getAvailableServices();

      res.status(200).json({
        success: true,
        services: services.map(service => ({
          id: (service as unknown as Record<string, unknown>).id as string || `${service.name}-${service.host}-${service.port}`,
          name: service.name,
          host: service.host,
          port: service.port,
          version: ((service as unknown as Record<string, unknown>).version as string) || '1.0.0',
          healthy: true, // ServiceRegistration doesn't track health status
          url: `http://${service.host}:${service.port}`,
          lastHealthCheck: new Date(),
          metadata: service.metadata || {},
        })),
        total: services.length,
        healthyCount: services.length, // All discovered services are considered healthy
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get services', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get services', req);
      return;
    }
  }

  /**
   * Get service statistics
   * GET /api/gateway/services/:serviceName/stats
   */
  private async getServiceStats(req: Request, res: Response): Promise<void> {
    try {
      const { serviceName } = req.params;
      const stats = await this.dynamicRouter.getServiceStats(serviceName as string);

      if (stats) {
        res.status(200).json({
          success: true,
          serviceName,
          stats,
          timestamp: new Date().toISOString(),
        });
      } else {
        ServiceErrors.notFound(res, `Service ${serviceName}`, req);
      }
    } catch (error) {
      logger.error('Failed to get service stats', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to get service stats', req);
      return;
    }
  }

  /**
   * Check service health
   * GET /api/gateway/services/:serviceName/health
   */
  private async checkServiceHealth(req: Request, res: Response): Promise<void> {
    try {
      const { serviceName } = req.params;
      const isHealthy = await this.dynamicRouter.getServiceStats(serviceName as string);

      res.status(200).json({
        success: true,
        serviceName,
        healthy: !!isHealthy,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to check service health', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to check service health', req);
      return;
    }
  }

  /**
   * Get gateway metrics
   * GET /api/gateway/metrics
   */
  private async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = this.dynamicRouter.getMetrics();

      res.status(200).json({
        success: true,
        metrics: {
          totalRequests: metrics.totalRequests,
          successfulRequests: metrics.successfulRequests,
          failedRequests: metrics.failedRequests,
          averageResponseTime: metrics.averageResponseTime,
          successRate: metrics.totalRequests > 0 ? (metrics.successfulRequests / metrics.totalRequests) * 100 : 0,
          requestsByService: Object.fromEntries(metrics.requestsByService),
          errorsByService: Object.fromEntries(metrics.errorsByService),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get metrics', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get metrics', req);
      return;
    }
  }

  /**
   * Clear gateway metrics
   * DELETE /api/gateway/metrics
   */
  private async clearMetrics(req: Request, res: Response): Promise<void> {
    try {
      this.dynamicRouter.clearMetrics();

      res.status(200).json({
        success: true,
        message: 'Metrics cleared successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to clear metrics', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to clear metrics', req);
      return;
    }
  }

  /**
   * Get comprehensive gateway status
   * GET /api/gateway/status
   */
  private async getGatewayStatus(req: Request, res: Response): Promise<void> {
    try {
      const [services, metrics, discoveryHealthy] = await Promise.all([
        this.dynamicRouter.getAvailableServices(),
        this.dynamicRouter.getMetrics(),
        this.dynamicRouter.isDiscoveryHealthy(),
      ]);

      const routes = this.dynamicRouter.getAllRoutes();

      res.status(200).json({
        success: true,
        gateway: {
          status: 'running',
          uptime: process.uptime(),
          version: process.env.GATEWAY_VERSION || '1.0.0',
          nodeVersion: process.version,
          environment: process.env.NODE_ENV || 'development',
        },
        discovery: {
          healthy: discoveryHealthy,
          servicesCount: services.length,
          healthyServicesCount: services.length, // All discovered services are considered healthy
        },
        routing: {
          totalRoutes: routes.length,
          totalRequests: metrics.totalRequests,
          successRate: metrics.totalRequests > 0 ? (metrics.successfulRequests / metrics.totalRequests) * 100 : 0,
          averageResponseTime: metrics.averageResponseTime,
        },
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get gateway status', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get gateway status', req);
      return;
    }
  }

  /**
   * Get gateway health
   * GET /api/gateway/health
   */
  private async getGatewayHealth(req: Request, res: Response): Promise<void> {
    try {
      const discoveryHealthy = await this.dynamicRouter.isDiscoveryHealthy();
      const services = await this.dynamicRouter.getAvailableServices();
      const healthyServicesCount = services.length; // All discovered services are considered healthy

      const status = discoveryHealthy && healthyServicesCount > 0 ? 'healthy' : 'degraded';

      res.status(status === 'healthy' ? 200 : 503).json({
        status,
        timestamp: new Date().toISOString(),
        service: 'api-gateway',
        version: process.env.GATEWAY_VERSION || '1.0.0',
        uptime: process.uptime(),
        checks: {
          serviceDiscovery: discoveryHealthy,
          availableServices: healthyServicesCount,
          totalServices: services.length,
        },
        memory: process.memoryUsage(),
      });
    } catch (error) {
      logger.error('Gateway health check failed:', { error: serializeError(error) });
      ServiceErrors.serviceUnavailable(res, 'Health check failed', req);
    }
  }

  /**
   * Get discovery service status
   * GET /api/gateway/debug/discovery
   */
  private async getDiscoveryStatus(req: Request, res: Response): Promise<void> {
    try {
      const [services, discoveryHealthy] = await Promise.all([
        this.dynamicRouter.getAvailableServices(),
        this.dynamicRouter.isDiscoveryHealthy(),
      ]);

      res.status(200).json({
        success: true,
        discovery: {
          healthy: discoveryHealthy,
          systemServiceUrl: ServiceLocator.getServiceUrl('system-service'),
        },
        services: services.map(service => ({
          name: service.name,
          healthy: true, // ServiceRegistration doesn't track health status
          lastHealthCheck: new Date(),
          metadata: service.metadata || {},
        })),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get discovery status', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to get discovery status', req);
      return;
    }
  }

  /**
   * Debug route matching
   * GET /api/gateway/debug/routes/*
   */
  private async debugRoute(req: Request, res: Response): Promise<void> {
    try {
      const testPath = `/${req.params[0] || ''}`;
      const routeConfig = this.dynamicRouter.getRouteConfig(testPath);

      res.status(200).json({
        success: true,
        debug: {
          testPath,
          matched: !!routeConfig,
          routeConfig: routeConfig || null,
          allRoutes: this.dynamicRouter.getAllRoutes().map(r => r.path),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to debug route', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to debug route', req);
      return;
    }
  }

  /**
   * Get the Express router
   */
  getRouter(): Router {
    return this.router;
  }
}

export default DynamicRoutesHandler;
