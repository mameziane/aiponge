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

      const timestamp = new Date();

      await this.registry.metricsCollector.recordMetric({
        name: eventType,
        value: 1,
        timestamp,
        serviceName: 'ai-analytics-service',
        source: userId || 'anonymous',
        metricType: 'counter',
        tags: eventData ? Object.fromEntries(Object.entries(eventData).map(([k, v]) => [k, String(v)])) : undefined,
      });

      // Also record to user activity logs when userId is present
      if (userId) {
        this.registry.repository
          .recordUserActivity({
            timestamp,
            userId,
            userType: (eventData?.userType as string) || 'user',
            sessionId: (eventData?.sessionId as string) || null,
            action: eventType,
            resource: (eventData?.resource as string) || (eventData?.feature as string) || null,
            workflowType: (eventData?.workflowType as string) || null,
            providerId: (eventData?.providerId as string) || null,
            cost: (eventData?.cost as number) || 0,
            success: eventData?.success !== false,
            errorCode: (eventData?.errorCode as string) || null,
            userAgent: req.get('user-agent') || null,
            ipAddress: null,
            processingTime: (eventData?.durationMs as number) || null,
            location: null,
            metadata: eventData || null,
          })
          .catch(err => {
            logger.debug('Failed to record user activity from trackEvent (non-blocking)', {
              error: serializeError(err),
            });
          });
      }

      sendSuccess(res, {
        event: 'tracked',
        eventType,
        timestamp: timestamp.toISOString(),
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
