/**
 * Health Controller - Kubernetes-compatible health probes
 * Handles /health, /health/live, /health/ready, /health/startup
 */

import type { Request, Response } from 'express';
import { getResponseHelpers } from '@aiponge/platform-core';
import type { AnalyticsServiceRegistry } from '../../infrastructure/ServiceFactory';

const { ServiceErrors } = getResponseHelpers();

export class HealthController {
  constructor(private readonly registry: Pick<AnalyticsServiceRegistry, 'cache' | 'systemHealth'>) {}

  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.registry.systemHealth.healthCheck();
      const isHealthy = health.status === 'healthy';
      res.status(isHealthy ? 200 : 503).json({
        service: 'ai-analytics-service',
        status: health.status || 'healthy',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        components: health,
      });
    } catch (error) {
      ServiceErrors.serviceUnavailable(res, error instanceof Error ? error.message : 'Unknown error', req);
    }
  }

  getLiveness(_req: Request, res: Response): void {
    res.status(200).json({
      alive: true,
      service: 'ai-analytics-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  async getReadiness(req: Request, res: Response): Promise<void> {
    try {
      const dbHealthy = await this.registry.cache.ping();
      const cacheHealthy = await this.registry.cache.isReady();
      const ready = dbHealthy && cacheHealthy;

      res.status(ready ? 200 : 503).json({
        ready,
        service: 'ai-analytics-service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        components: {
          database: { healthy: dbHealthy },
          cache: { healthy: cacheHealthy },
        },
      });
    } catch (error) {
      ServiceErrors.serviceUnavailable(res, error instanceof Error ? error.message : 'Unknown error', req);
    }
  }

  getStartup(_req: Request, res: Response): void {
    res.status(200).json({
      started: true,
      service: 'ai-analytics-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }
}
