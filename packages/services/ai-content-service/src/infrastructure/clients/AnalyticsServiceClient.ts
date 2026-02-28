/**
 * AI Analytics Service HTTP Client
 * Handles communication with ai-analytics-service for metrics and event tracking
 *
 * Fire-and-forget methods (recordEvent, recordEvents, recordMetric) use the event bus
 * publisher exclusively. HTTP is only used for query operations that require responses.
 */

import { createServiceClient, type HttpClient, getServiceUrl, getLogger } from '../../config/service-urls';
import {
  getAnalyticsEventPublisher,
  type AnalyticsEventPublisher,
  withServiceResilience,
} from '@aiponge/platform-core';
import { ProviderError } from '../../application/errors';

export interface AnalyticsEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface MetricEntry {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  timestamp?: Date;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsQuery {
  eventTypes?: string[];
  metricNames?: string[];
  startDate: Date;
  endDate: Date;
  filters?: Record<string, unknown>;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  groupBy?: string[];
}

export interface AnalyticsResponse {
  events?: AnalyticsEvent[];
  metrics?: Array<{
    name: string;
    value: number;
    timestamp: Date;
    tags?: Record<string, string>;
  }>;
  aggregations?: Record<string, number>;
  totalCount: number;
  timeRange: {
    start: Date;
    end: Date;
  };
}

export interface ServiceMetrics {
  contentGeneration: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    totalCost: number;
  };
  templates: {
    totalTemplates: number;
    activeTemplates: number;
    totalUsage: number;
    averageRating: number;
  };
  providers: {
    totalProviderCalls: number;
    providerDistribution: Record<string, number>;
    averageCost: number;
    averageLatency: number;
  };
}

export class AnalyticsServiceClient {
  private httpClient: HttpClient;
  private readonly logger = getLogger('analytics-service-client');
  private eventPublisher: AnalyticsEventPublisher;

  constructor(
    baseURL?: string,
    config?: {
      timeout?: number;
      batchSize?: number;
      batchInterval?: number;
      headers?: Record<string, string>;
    }
  ) {
    const { httpClient } = createServiceClient('ai-analytics-service');
    this.httpClient = httpClient;
    this.eventPublisher = getAnalyticsEventPublisher('ai-content-service', {
      batchSize: config?.batchSize || 100,
      batchInterval: config?.batchInterval || 5000,
    });

    this.logger.info('📊 Initialized with event bus publisher', {
      module: 'analytics_service_client',
      operation: 'constructor',
      phase: 'client_initialization_complete',
    });
  }

  /**
   * Record a single analytics event (fire-and-forget via event bus)
   */
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
      this.logger.debug('📊 Failed to publish event (non-blocking)', {
        module: 'analytics_service_client',
        operation: 'record_event',
        error: error instanceof Error ? error.message : String(error),
        phase: 'event_publish_failed',
      });
    }
  }

  /**
   * Record multiple analytics events (fire-and-forget via event bus)
   */
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
      this.logger.debug('📊 Failed to publish events batch (non-blocking)', {
        module: 'analytics_service_client',
        operation: 'record_events',
        error: error instanceof Error ? error.message : String(error),
        phase: 'events_publish_failed',
      });
    }
  }

  /**
   * Record a single metric (fire-and-forget via event bus)
   */
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
      this.logger.debug('📊 Failed to publish metric (non-blocking)', {
        module: 'analytics_service_client',
        operation: 'record_metric',
        error: error instanceof Error ? error.message : String(error),
        phase: 'metric_publish_failed',
      });
    }
  }

  /**
   * Record multiple metrics
   */
  async recordMetrics(metrics: MetricEntry[]): Promise<void> {
    return withServiceResilience('ai-analytics-service', 'recordMetrics', async () => {
      try {
        this.logger.info('📊 Recording metrics', {
          module: 'analytics_service_client',
          operation: 'flush_metrics',
          metricCount: metrics.length,
          phase: 'metrics_recording_start',
        });

        const response = await this.makeRequest<{ recorded: number; failed: number }>('POST', '/api/metrics/batch', {
          metrics,
        });

        this.logger.info('✅ Recorded metrics', {
          module: 'analytics_service_client',
          operation: 'flush_metrics',
          recordedCount: response.data.recorded,
          phase: 'metrics_recording_success',
        });

        if (response.data.failed > 0) {
          this.logger.warn('⚠️ Metrics failed to record', {
            module: 'analytics_service_client',
            operation: 'flush_metrics',
            failedCount: response.data.failed,
            phase: 'metrics_recording_partial_failure',
          });
        }
      } catch (error) {
        this.logger.warn('📊 Failed to record metrics batch (non-blocking)', {
          module: 'analytics_service_client',
          operation: 'flush_metrics',
          error: error instanceof Error ? error.message : String(error),
          phase: 'metrics_batch_recording_failed',
        });
      }
    });
  }

  /**
   * Query analytics data
   */
  async queryAnalytics(query: AnalyticsQuery): Promise<AnalyticsResponse> {
    return withServiceResilience('ai-analytics-service', 'queryAnalytics', async () => {
      try {
        this.logger.info('🔍 Querying analytics data', {
          module: 'analytics_service_client',
          operation: 'query_analytics_data',
          phase: 'analytics_query_start',
        });

        const response = await this.makeRequest<AnalyticsResponse>(
          'POST',
          '/api/query',
          query as unknown as Record<string, unknown>
        );

        this.logger.info('✅ Retrieved analytics records', {
          module: 'analytics_service_client',
          operation: 'query_analytics_data',
          totalCount: response.data.totalCount,
          phase: 'analytics_query_success',
        });
        return response.data;
      } catch (error) {
        this.logger.error('❌ Analytics query failed', {
          module: 'analytics_service_client',
          operation: 'query_analytics_data',
          error: error instanceof Error ? error.message : String(error),
          phase: 'analytics_query_failed',
        });
        throw this.handleError(error, 'ANALYTICS_QUERY_FAILED');
      }
    });
  }

  /**
   * Get service-specific metrics
   */
  async getServiceMetrics(timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): Promise<ServiceMetrics> {
    return withServiceResilience('ai-analytics-service', 'getServiceMetrics', async () => {
      try {
        this.logger.info('📈 Fetching service metrics', {
          module: 'analytics_service_client',
          operation: 'get_service_metrics',
          timeframe,
          phase: 'service_metrics_fetch_start',
        });

        const response = await this.makeRequest<ServiceMetrics>('GET', `/api/services/ai-content-service/metrics`, {
          params: { timeframe },
        });

        this.logger.info('✅ Retrieved service metrics', {
          module: 'analytics_service_client',
          operation: 'get_service_metrics',
          phase: 'service_metrics_fetch_success',
        });
        return response.data;
      } catch (error) {
        this.logger.error('❌ Service metrics query failed', {
          module: 'analytics_service_client',
          operation: 'get_service_metrics',
          error: error instanceof Error ? error.message : String(error),
          phase: 'service_metrics_query_failed',
        });
        throw this.handleError(error, 'SERVICE_METRICS_FAILED');
      }
    });
  }

  /**
   * Get content generation analytics
   */
  async getContentAnalytics(params: {
    contentType?: string;
    userId?: string;
    startDate: Date;
    endDate: Date;
  }): Promise<{
    totalGenerations: number;
    successRate: number;
    averageProcessingTime: number;
    contentTypeDistribution: Record<string, number>;
    qualityScores: {
      average: number;
      distribution: Record<string, number>;
    };
    costAnalysis: {
      total: number;
      average: number;
      byProvider: Record<string, number>;
    };
  }> {
    return withServiceResilience('ai-analytics-service', 'getContentAnalytics', async () => {
      try {
        this.logger.info('📊 Fetching content analytics', {
          module: 'analytics_service_client',
          operation: 'get_content_analytics',
          phase: 'content_analytics_fetch_start',
        });

        const response = await this.makeRequest<{
          totalGenerations: number;
          successRate: number;
          averageProcessingTime: number;
          contentTypeDistribution: Record<string, number>;
          qualityScores: {
            average: number;
            distribution: Record<string, number>;
          };
          costAnalysis: {
            total: number;
            average: number;
            byProvider: Record<string, number>;
          };
        }>('GET', '/api/content/analytics', {
          params,
        });

        this.logger.info('✅ Retrieved content analytics', {
          module: 'analytics_service_client',
          operation: 'get_content_analytics',
          phase: 'content_analytics_fetch_success',
        });
        return response.data;
      } catch (error) {
        this.logger.error('❌ Content analytics query failed', {
          module: 'analytics_service_client',
          operation: 'get_content_analytics',
          error: error instanceof Error ? error.message : String(error),
          phase: 'content_analytics_query_failed',
        });
        throw this.handleError(error, 'CONTENT_ANALYTICS_FAILED');
      }
    });
  }

  /**
   * Track content generation workflow
   */
  trackContentWorkflow(workflowData: {
    requestId: string;
    userId: string;
    contentType: string;
    stage: string;
    status: 'started' | 'completed' | 'failed';
    duration?: number;
    metadata?: Record<string, unknown>;
  }): void {
    const event: AnalyticsEvent = {
      eventType: 'content_workflow_stage',
      eventData: workflowData,
      timestamp: new Date(),
      userId: workflowData.userId,
      metadata: {
        service: 'ai-content-service',
        ...workflowData.metadata,
      },
    };

    this.recordEvent(event);
  }

  /**
   * Check analytics service health
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    responseTime: number;
    queueSize: number;
  }> {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest<{
        status: string;
        queueSize: number;
        timestamp: string;
      }>('GET', '/health');

      const responseTime = Date.now() - startTime;

      return {
        status: response.data.status as 'healthy' | 'degraded' | 'unhealthy',
        timestamp: new Date(),
        responseTime,
        queueSize: response.data.queueSize,
      };
    } catch (error) {
      this.logger.error('Analytics service health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime: Date.now() - startTime,
        queueSize: 0,
      };
    }
  }

  /**
   * Flush event publisher buffer
   */
  async flush(): Promise<void> {
    try {
      await this.eventPublisher.flushEvents();
      this.logger.info('✅ Flushed event publisher buffer', {
        module: 'analytics_service_client',
        operation: 'flush_all',
        phase: 'flush_all_success',
      });
    } catch (error) {
      this.logger.warn('⚠️ Error during flush', {
        module: 'analytics_service_client',
        operation: 'flush_all',
        error: error instanceof Error ? error.message : String(error),
        phase: 'flush_all_error',
      });
    }
  }

  /**
   * Graceful shutdown - flush event publisher
   */
  async shutdown(): Promise<void> {
    try {
      await this.flush();
      this.logger.info('🛑 Graceful shutdown completed', {
        module: 'analytics_service_client',
        operation: 'shutdown',
        phase: 'shutdown_completed',
      });
    } catch (error) {
      this.logger.warn('⚠️ Error during shutdown', {
        module: 'analytics_service_client',
        operation: 'shutdown',
        error: error instanceof Error ? error.message : String(error),
        phase: 'shutdown_error',
      });
    }
  }

  // ===== PRIVATE METHODS =====

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data?: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<{ data: T }> {
    const url = `${getServiceUrl('ai-analytics-service')}${path}`;

    let response: { data: T };
    switch (method) {
      case 'GET':
        response = await this.httpClient.get(url, options);
        break;
      case 'POST':
        response = await this.httpClient.post(url, data, options);
        break;
      case 'PUT':
        response = await this.httpClient.put(url, data, options);
        break;
      case 'DELETE':
        response = await this.httpClient.delete(url, options);
        break;
      default:
        throw ProviderError.configurationError(`Unsupported HTTP method: ${method}`);
    }

    return { data: response.data };
  }

  private handleError(error: unknown, context: string): Error {
    const err = error as {
      response?: { status: number; data?: { message?: string; error?: string } };
      request?: unknown;
      message?: string;
    };
    if (err.response) {
      const { status, data } = err.response;
      return new Error(`${context}: HTTP ${status} - ${data?.message || data?.error || 'Unknown error'}`);
    } else if (err.request) {
      return new Error(`${context}: No response from analytics service`);
    } else {
      return new Error(`${context}: ${err.message}`);
    }
  }
}
