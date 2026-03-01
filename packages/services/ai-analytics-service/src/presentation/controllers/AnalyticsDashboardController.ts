/**
 * Analytics Dashboard Controller
 * Handles dashboard, event tracking, summary, and metrics endpoints.
 */

import type { Request, Response } from 'express';
import { serializeError, getResponseHelpers } from '@aiponge/platform-core';
import type { AnalyticsServiceRegistry } from '../../infrastructure/ServiceFactory';
import { getAnalyticsCache } from '../../infrastructure/events/AnalyticsEventSubscriber';
import { getLogger } from '../../config/service-urls';

const { sendSuccess, ServiceErrors } = getResponseHelpers();
const logger = getLogger('ai-analytics-service:dashboard-controller');

export class AnalyticsDashboardController {
  constructor(
    private readonly registry: Pick<
      AnalyticsServiceRegistry,
      'metricsCollector' | 'repository' | 'cache' | 'systemHealth'
    >
  ) {}

  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const [providerSummary, health] = await Promise.all([
        this.registry.repository.getProviderUsageSummary(),
        this.registry.systemHealth.healthCheck(),
      ]);

      sendSuccess(res, {
        providers: providerSummary,
        system: {
          status: health.status,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
      });
    } catch (error) {
      logger.error('Failed to get dashboard metrics', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to get dashboard metrics', req);
      return;
    }
  }

  async trackEvent(req: Request, res: Response): Promise<void> {
    try {
      const { eventType, eventData, userId } = req.body;
      if (!eventType) {
        ServiceErrors.badRequest(res, 'eventType is required', req);
        return;
      }

      await this.registry.metricsCollector.recordMetric({
        name: eventType,
        value: 1,
        timestamp: new Date(),
        serviceName: 'ai-analytics-service',
        source: userId || 'anonymous',
        metricType: 'counter',
        tags: eventData ? Object.fromEntries(Object.entries(eventData).map(([k, v]) => [k, String(v)])) : undefined,
      });

      sendSuccess(res, {
        event: 'tracked',
        eventType,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to track event', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to track event', req);
      return;
    }
  }

  async getSummary(_req: Request, res: Response): Promise<void> {
    try {
      const providerStats = await this.registry.repository.getProviderUsageSummary();
      const cache = getAnalyticsCache();

      sendSuccess(res, {
        providerUsage: providerStats,
        userActivity: {
          totalEvents: cache.recentEvents.length,
          recentEvents: cache.recentEvents.slice(-20),
        },
        cacheStats: {
          providerCount: cache.providerStats.size,
          metricCount: cache.metrics.size,
        },
      });
    } catch (error) {
      logger.error('Failed to get analytics summary', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to retrieve analytics summary', error, _req);
    }
  }

  async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { serviceName, metricName, startTime, endTime, metricType, source } = req.query;

      const filter = {
        serviceName: serviceName as string,
        metricName: metricName as string,
        startTime: startTime ? new Date(startTime as string) : undefined,
        endTime: endTime ? new Date(endTime as string) : undefined,
        metricType: metricType as string,
        source: source as string,
      };

      const metrics = await this.registry.repository.getMetrics(filter);
      sendSuccess(res, {
        metrics,
        count: metrics.length,
      });
    } catch (error) {
      logger.error('Failed to get metrics', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get metrics', req);
      return;
    }
  }
}
