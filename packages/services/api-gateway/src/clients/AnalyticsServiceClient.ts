/**
 * Analytics Service HTTP Client
 * Handles all communication with the external ai-analytics-service
 * Updated to use ServiceCallClient for standardized service communication
 *
 * Fire-and-forget methods (recordEvent, recordEvents, recordMetric, recordProviderUsage)
 * use the event bus exclusively. HTTP is only used for query methods.
 */

import { createServiceClient, getLogger, getServiceUrl } from '../config/service-urls';
import {
  getAnalyticsEventPublisher,
  type AnalyticsEventPublisher,
  withServiceResilience,
  errorMessage,
} from '@aiponge/platform-core';

const SERVICE_NAME = 'ai-analytics-service';

export interface AnalyticsEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  timestamp?: Date;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface MetricEntry {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  tags?: Record<string, string>;
  timestamp?: Date;
}

export interface ProviderUsage {
  providerId: string;
  providerName: string;
  operation: string;
  requestId: string;
  timestamp: Date;
  success: boolean;
  latencyMs: number;
  tokensUsed?: number;
  cost?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface TimeRange {
  startTime: Date;
  endTime: Date;
}

export interface MetricsQuery {
  metricName?: string;
  timeRange: TimeRange;
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
  groupBy?: string[];
  filters?: Record<string, unknown>;
}

export interface MetricsResult {
  metricName: string;
  timeRange: TimeRange;
  data: Array<{
    timestamp: Date;
    value: number;
    tags?: Record<string, string>;
  }>;
  aggregation: string;
  totalDataPoints: number;
}

export interface ProviderAnalytics {
  timeRange: TimeRange;
  totalRequests: number;
  overallSuccessRate: number;
  totalCost: number;
  providerBreakdown: Record<
    string,
    {
      requests: number;
      successRate: number;
      averageLatency: number;
      totalCost: number;
      operationBreakdown: Record<
        string,
        {
          requests: number;
          successRate: number;
          averageLatency: number;
          cost: number;
        }
      >;
    }
  >;
  operationAnalytics: Record<
    string,
    {
      requests: number;
      successRate: number;
      averageLatency: number;
      cost: number;
    }
  >;
}

export interface IAnalyticsServiceClient {
  recordEvent(_event: AnalyticsEvent): void;
  recordMetric(_metric: MetricEntry): void;
  recordProviderUsage(_usage: ProviderUsage): void;

  recordEvents(_events: AnalyticsEvent[]): void;
  recordMetrics(_metrics: MetricEntry[]): Promise<void>;
  recordProviderUsageMany(_usages: ProviderUsage[]): Promise<void>;

  getMetrics(_query: MetricsQuery): Promise<MetricsResult>;
  getProviderAnalytics(_timeRange: TimeRange): Promise<ProviderAnalytics>;

  getRealtimeMetrics(_metricNames: string[]): Promise<Record<string, number>>;
  getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: Record<string, number>;
    alerts: Array<{
      type: string;
      message: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }>;
  }>;
}

interface AnalyticsClientConfig {
  batchSize: number;
  batchInterval: number;
  timeout?: number;
  retries?: number;
}

export class AnalyticsServiceClient implements IAnalyticsServiceClient {
  private readonly httpClient: ReturnType<typeof createServiceClient>['httpClient'];
  private readonly logger = getLogger('AnalyticsServiceClient');
  private readonly eventPublisher: AnalyticsEventPublisher;

  constructor(config: Partial<AnalyticsClientConfig> = {}) {
    const { httpClient } = createServiceClient('ai-analytics-service');
    this.httpClient = httpClient;
    this.eventPublisher = getAnalyticsEventPublisher('api-gateway', {
      batchSize: config.batchSize || 100,
      batchInterval: config.batchInterval || 5000,
    });

    this.logger.info('Analytics service client initialized', {
      module: 'analytics_service_client',
      operation: 'constructor',
      phase: 'client_initialization_completed',
    });
  }

  recordEvent(event: AnalyticsEvent): void {
    try {
      this.eventPublisher.recordEvent({
        eventType: event.eventType,
        eventData: event.eventData,
        userId: event.userId,
        sessionId: event.sessionId,
        timestamp: event.timestamp?.toISOString(),
        metadata: event.metadata,
      });
    } catch (error) {
      this.logger.warn('Failed to record event', {
        module: 'analytics_service_client',
        operation: 'recordEvent',
        eventType: event.eventType,
        error: { message: errorMessage(error) },
      });
    }
  }

  recordMetric(metric: MetricEntry): void {
    try {
      this.eventPublisher.recordMetric({
        metricName: metric.name,
        metricValue: metric.value,
        metricType: metric.type === 'timer' ? 'histogram' : metric.type,
        labels: metric.tags,
        timestamp: metric.timestamp?.toISOString(),
      });
    } catch (error) {
      this.logger.warn('Failed to record metric', {
        module: 'analytics_service_client',
        operation: 'recordMetric',
        metricName: metric.name,
        error: { message: errorMessage(error) },
      });
    }
  }

  recordProviderUsage(usage: ProviderUsage): void {
    try {
      this.eventPublisher.recordProviderUsage({
        providerId: usage.providerId,
        providerName: usage.providerName,
        operation: usage.operation,
        success: usage.success,
        durationMs: usage.latencyMs,
        tokensUsed: usage.tokensUsed,
        cost: usage.cost,
        userId: undefined,
        error: usage.errorMessage,
      });
    } catch (error) {
      this.logger.warn('Failed to record provider usage', {
        module: 'analytics_service_client',
        operation: 'recordProviderUsage',
        providerId: usage.providerId,
        error: { message: errorMessage(error) },
      });
    }
  }

  recordEvents(events: AnalyticsEvent[]): void {
    try {
      this.eventPublisher.recordEvents(
        events.map(e => ({
          eventType: e.eventType,
          eventData: e.eventData,
          userId: e.userId,
          sessionId: e.sessionId,
          timestamp: e.timestamp?.toISOString(),
          metadata: e.metadata,
        }))
      );
    } catch (error) {
      this.logger.warn('Failed to record events batch', {
        module: 'analytics_service_client',
        operation: 'recordEvents',
        batchSize: events.length,
        error: { message: errorMessage(error) },
      });
    }
  }

  async recordMetrics(metrics: MetricEntry[]): Promise<void> {
    const baseUrl = getServiceUrl(SERVICE_NAME);
    await withServiceResilience(SERVICE_NAME, 'recordMetrics', () =>
      this.httpClient.post(`${baseUrl}/api/analytics/metrics/batch`, { metrics })
    );
  }

  async recordProviderUsageMany(usages: ProviderUsage[]): Promise<void> {
    const baseUrl = getServiceUrl(SERVICE_NAME);
    await withServiceResilience(SERVICE_NAME, 'recordProviderUsageMany', () =>
      this.httpClient.post(`${baseUrl}/api/analytics/providers/usage/batch`, { usages })
    );
  }

  async getMetrics(query: MetricsQuery): Promise<MetricsResult> {
    const baseUrl = getServiceUrl(SERVICE_NAME);
    const response = await withServiceResilience<{ data: MetricsResult }>(SERVICE_NAME, 'getMetrics', () =>
      this.httpClient.post(`${baseUrl}/api/analytics/metrics/query`, query)
    );
    return response.data;
  }

  async getProviderAnalytics(timeRange: TimeRange): Promise<ProviderAnalytics> {
    const baseUrl = getServiceUrl(SERVICE_NAME);
    const response = await withServiceResilience<{ data: ProviderAnalytics }>(
      SERVICE_NAME,
      'getProviderAnalytics',
      () => this.httpClient.post(`${baseUrl}/api/analytics/providers/analytics`, timeRange)
    );
    return response.data;
  }

  async getRealtimeMetrics(metricNames: string[]): Promise<Record<string, number>> {
    const baseUrl = getServiceUrl(SERVICE_NAME);
    const response = await withServiceResilience<{ data: Record<string, number> }>(
      SERVICE_NAME,
      'getRealtimeMetrics',
      () => this.httpClient.post(`${baseUrl}/api/analytics/metrics/realtime`, { metricNames })
    );
    return response.data;
  }

  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: Record<string, number>;
    alerts: Array<{
      type: string;
      message: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }>;
  }> {
    const baseUrl = getServiceUrl(SERVICE_NAME);
    const response = await withServiceResilience<{
      data: {
        status: 'healthy' | 'degraded' | 'unhealthy';
        metrics: Record<string, number>;
        alerts: Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' | 'critical' }>;
      };
    }>(SERVICE_NAME, 'getSystemHealth', () => this.httpClient.get(`${baseUrl}/api/analytics/system/health`));
    return response.data;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Analytics service client shutdown complete', {
      module: 'analytics_service_client',
      operation: 'shutdown',
      phase: 'shutdown_completed',
    });
  }

  getClientStatus(): {
    eventBusEnabled: boolean;
  } {
    return {
      eventBusEnabled: true,
    };
  }
}
