/**
 * Health Routes - Kubernetes-compatible health probes
 * Required for Docker healthchecks and Kubernetes liveness/readiness/startup probes
 *
 * Endpoints:
 * - GET /health - Detailed health check
 * - GET /health/live - Liveness probe (is the process running?)
 * - GET /health/ready - Readiness probe (can the service handle traffic?)
 * - GET /health/startup - Startup probe (has initialization completed?)
 */

import { Router, Request, Response } from 'express';
import { getLogger } from '../../config/service-urls';
import { serializeError } from '@aiponge/platform-core';
import { getSQLConnection } from '../../infrastructure/database/DatabaseConnectionFactory';

const logger = getLogger('health-routes');

export function createHealthRoutes(): Router {
  const router = Router();
  const startTime = Date.now();
  let startupComplete = false;

  const markStartupComplete = () => {
    startupComplete = true;
  };

  const getUptime = () => Math.floor((Date.now() - startTime) / 1000);

  const checkDatabaseHealth = async (): Promise<{ healthy: boolean; message?: string }> => {
    try {
      const pool = getSQLConnection();
      await pool.query('SELECT 1');
      return { healthy: true };
    } catch (error) {
      logger.warn('Database health check failed', { error: error instanceof Error ? error.message : String(error) });
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  };

  /**
   * Liveness probe - GET /health/live
   * Simple check that the process is responsive
   */
  router.get('/health/live', (req: Request, res: Response) => {
    res.status(200).json({
      alive: true,
      service: 'music-service',
      timestamp: new Date().toISOString(),
      uptime: getUptime(),
    });
  });

  /**
   * Readiness probe - GET /health/ready
   * Checks if service can handle traffic
   */
  router.get('/health/ready', async (req: Request, res: Response) => {
    try {
      let ready = true;
      const components: Record<string, { healthy: boolean; message?: string }> = {};

      const dbHealth = await checkDatabaseHealth();
      components.database = dbHealth;
      if (!dbHealth.healthy) {
        ready = false;
      }

      res.status(ready ? 200 : 503).json({
        ready,
        service: 'music-service',
        timestamp: new Date().toISOString(),
        uptime: getUptime(),
        components,
      });
    } catch (error) {
      res.status(503).json({
        ready: false,
        service: 'music-service',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Readiness check failed',
      });
    }
  });

  /**
   * Startup probe - GET /health/startup
   * Checks if initialization is complete
   */
  router.get('/health/startup', (req: Request, res: Response) => {
    res.status(startupComplete ? 200 : 503).json({
      started: startupComplete,
      service: 'music-service',
      timestamp: new Date().toISOString(),
      uptime: getUptime(),
      message: startupComplete ? undefined : 'Service is initializing',
    });
  });

  /**
   * Detailed health check - GET /health
   * Used by Docker HEALTHCHECK and monitoring
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const healthStatus = {
        status: 'healthy',
        service: 'music-service',
        version: process.env.SERVICE_VERSION || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        driver: 'node-postgres',
        checks: {
          database: 'unknown',
          memory: 'healthy',
          dependencies: 'healthy',
        },
      };

      const dbHealth = await checkDatabaseHealth();
      healthStatus.checks.database = dbHealth.healthy ? 'healthy' : 'unhealthy';
      if (!dbHealth.healthy) {
        logger.error('Database check failed', { error: dbHealth.message });
        healthStatus.status = 'degraded';
      }

      const memUsage = process.memoryUsage();
      const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      if (memUsageMB > 1000) {
        healthStatus.checks.memory = 'warning';
        healthStatus.status = 'degraded';
      }

      const httpStatus = healthStatus.status === 'healthy' ? 200 : 503;
      res.status(httpStatus).json(healthStatus);
    } catch (error) {
      logger.error('Health check failed', {
        error: serializeError(error),
      });
      res.status(503).json({
        status: 'unhealthy',
        service: 'music-service',
        error: error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  markStartupComplete();

  return router;
}
