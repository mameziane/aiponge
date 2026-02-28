/**
 * Health Controller - Service health monitoring endpoints
 * Provides comprehensive health checks for service dependencies
 */

import { Request, Response, NextFunction } from 'express';
import { contentServiceConfig } from '../../config/service-config';
import { createHttpClient, ServiceLocator, serializeError } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('ai-content-service-healthcontroller');

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  dependencies?: {
    database?: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    aiConfigService?: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    analyticsService?: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
  };
  metrics?: {
    memory: ReturnType<typeof process.memoryUsage>;
    cpu?: number;
    activeConnections?: number;
  };
}

export class HealthController {
  private readonly httpClient = createHttpClient({ serviceName: 'ai-content-service' });

  constructor(
    private readonly dbPool?: { query: (sql: string) => Promise<unknown> },
    private readonly providersClient?: { healthCheck: () => Promise<{ success: boolean }> },
    private readonly analyticsClient?: { healthCheck: () => Promise<{ success: boolean }> }
  ) {}

  /**
   * Basic health check
   * GET /health
   */
  async health(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const health: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: contentServiceConfig.server.name,
        version: contentServiceConfig.server.version,
        uptime: process.uptime(),
        metrics: {
          memory: process.memoryUsage(),
        },
      };

      // Check dependencies if available
      if (this.dbPool || this.providersClient || this.analyticsClient) {
        health.dependencies = await this.checkDependencies();

        // Determine overall status based on dependencies
        const dependencyStatuses = Object.values(health.dependencies).map(dep => dep?.status);
        if (dependencyStatuses.includes('unhealthy')) {
          health.status = 'unhealthy';
        } else if (dependencyStatuses.includes('degraded')) {
          health.status = 'degraded';
        }
      }

      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Error in health check:', { error: serializeError(error) });
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: contentServiceConfig.server.name,
        version: contentServiceConfig.server.version,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Liveness probe - indicates if the service is running
   * GET /health/live
   */
  async liveness(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        service: contentServiceConfig.server.name,
        uptime: process.uptime(),
      });
    } catch (error) {
      logger.error('Error in liveness check:', { error: serializeError(error) });
      res.status(503).json({
        status: 'dead',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Readiness probe - indicates if the service can handle requests
   * GET /health/ready
   */
  async readiness(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      // Check if essential dependencies are available
      const dependencies = await this.checkDependencies();

      const isReady = !dependencies.database || dependencies.database.status !== 'unhealthy';

      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          service: contentServiceConfig.server.name,
          dependencies,
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          service: contentServiceConfig.server.name,
          dependencies,
          message: 'Essential dependencies are not available',
        });
      }
    } catch (error) {
      logger.error('Error in readiness check:', { error: serializeError(error) });
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Startup probe - indicates if the service has finished initializing
   * GET /health/startup
   */
  async startup(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      // Check if service has been running long enough to be considered started
      const minStartupTime = 5; // 5 seconds
      const hasStarted = process.uptime() > minStartupTime;

      if (hasStarted) {
        res.status(200).json({
          status: 'started',
          timestamp: new Date().toISOString(),
          service: contentServiceConfig.server.name,
          uptime: process.uptime(),
        });
      } else {
        res.status(503).json({
          status: 'starting',
          timestamp: new Date().toISOString(),
          service: contentServiceConfig.server.name,
          uptime: process.uptime(),
          message: 'Service is still starting up',
        });
      }
    } catch (error) {
      logger.error('Error in startup check:', { error: serializeError(error) });
      res.status(503).json({
        status: 'startup_failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check status of all dependencies
   */
  private async checkDependencies(): Promise<NonNullable<HealthStatus['dependencies']>> {
    const dependencies: NonNullable<HealthStatus['dependencies']> = {};

    // Always check database using Neon HTTP (no pool required)
    if (process.env.DATABASE_URL) {
      dependencies.database = await this.checkDatabase();
    }

    // Check providers service
    if (this.providersClient) {
      dependencies.aiConfigService = await this.checkProvidersService();
    }

    // Check analytics service
    if (this.analyticsClient) {
      dependencies.analyticsService = await this.checkAnalyticsService();
    }

    return dependencies;
  }

  /**
   * Check database health using DatabaseConnectionFactory
   */
  private async checkDatabase(): Promise<NonNullable<HealthStatus['dependencies']>['database']> {
    const startTime = Date.now();

    try {
      const { getSQLConnection } = await import('../../infrastructure/database/DatabaseConnectionFactory');
      const sql = getSQLConnection();
      await sql`SELECT 1`;

      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        responseTime,
      };
    } catch (error) {
      logger.warn('Database health check failed', { error: error instanceof Error ? error.message : String(error) });
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  /**
   * Check providers service health
   */
  private async checkProvidersService(): Promise<NonNullable<HealthStatus['dependencies']>['aiConfigService']> {
    const startTime = Date.now();

    try {
      // Check if providers service is available using HTTP client
      const serviceUrl = ServiceLocator.getServiceUrl('ai-config-service');
      const _response = await this.httpClient.get(`${serviceUrl}/health`);
      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 2000 ? 'healthy' : 'degraded',
        responseTime,
      };
    } catch (error) {
      logger.warn('Providers service health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown providers service error',
      };
    }
  }

  /**
   * Check analytics service health
   */
  private async checkAnalyticsService(): Promise<NonNullable<HealthStatus['dependencies']>['analyticsService']> {
    const startTime = Date.now();

    try {
      // Check if analytics service is available using HTTP client
      const serviceUrl = ServiceLocator.getServiceUrl('ai-analytics-service');
      const _response = await this.httpClient.get(`${serviceUrl}/health`);
      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 2000 ? 'healthy' : 'degraded',
        responseTime,
      };
    } catch (error) {
      logger.warn('Analytics service health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown analytics service error',
      };
    }
  }
}
