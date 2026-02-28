/**
 * Analytics Event Subscriber
 *
 * Consumes analytics events from the event bus and persists them to database
 * Supports: provider usage, user activity, and metrics
 */

import { createEventSubscriber, type EventSubscriber, type StandardEvent, errorMessage } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { Pool } from 'pg';
import { EVENTS } from '@aiponge/shared-contracts';

const logger = getLogger('analytics-event-subscriber');

interface AnalyticsEventCache {
  recentEvents: Array<{ eventType: string; timestamp: string; userId?: string }>;
  metrics: Map<string, { value: number; lastUpdated: string }>;
  providerStats: Map<string, { successCount: number; failureCount: number; totalDuration: number; totalCost: number }>;
}

const analyticsCache: AnalyticsEventCache = {
  recentEvents: [],
  metrics: new Map(),
  providerStats: new Map(),
};

const MAX_RECENT_EVENTS = EVENTS.MAX_RECENT_EVENTS;

let dbPool: Pool | null = null;

function getDbPool(): Pool | null {
  if (!dbPool && process.env.DATABASE_URL) {
    try {
      const connStr = (process.env.DATABASE_URL || '').includes('sslmode=require')
        ? process.env.DATABASE_URL!.replace('sslmode=require', 'sslmode=verify-full')
        : process.env.DATABASE_URL!;
      dbPool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: true },
        max: 5,
        idleTimeoutMillis: 30000,
      });
      logger.debug('Analytics database pool created');
    } catch (error) {
      logger.warn('Failed to create analytics database pool', { error: errorMessage(error) });
    }
  }
  return dbPool;
}

async function handleEventRecorded(event: StandardEvent): Promise<void> {
  const data = event.data as {
    eventType: string;
    userId?: string;
    timestamp?: string;
    eventData?: Record<string, unknown>;
  };

  logger.debug('Processing analytics event', {
    eventType: data.eventType,
    userId: data.userId,
    source: event.source,
  });

  analyticsCache.recentEvents.push({
    eventType: data.eventType,
    timestamp: data.timestamp || event.timestamp,
    userId: data.userId,
  });

  if (analyticsCache.recentEvents.length > MAX_RECENT_EVENTS) {
    analyticsCache.recentEvents.shift();
  }

  // Persist user activity to database
  const pool = getDbPool();
  if (pool && data.userId && data.eventType) {
    try {
      await pool.query(
        `INSERT INTO aia_user_activity_logs (
          timestamp, user_id, user_type, session_id, action, resource,
          workflow_type, provider_id, cost, processing_time_ms, success,
          error_code, user_agent, ip_address, location, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          data.timestamp || new Date().toISOString(),
          data.userId,
          data.eventData?.['userType'] || 'user',
          data.eventData?.['sessionId'] || null,
          data.eventType,
          data.eventData?.['resource'] || data.eventData?.['entityType'] || null,
          data.eventData?.['workflowType'] || null,
          data.eventData?.['providerId'] || null,
          data.eventData?.['cost'] || 0,
          data.eventData?.['durationMs'] || data.eventData?.['processingTime'] || null,
          data.eventData?.['success'] !== false,
          data.eventData?.['errorCode'] || null,
          null, // user_agent - not tracked
          null, // ip_address - not tracked for privacy
          null, // location
          data.eventData ? JSON.stringify(data.eventData) : null,
        ]
      );
    } catch (error) {
      logger.debug('Failed to persist user activity (non-blocking)', { error: errorMessage(error) });
    }
  }
}

async function handleEventsBatch(event: StandardEvent): Promise<void> {
  const data = event.data as {
    events: Array<{ eventType: string; userId?: string; timestamp?: string; eventData?: Record<string, unknown> }>;
    batchId: string;
    sourceService: string;
  };

  logger.debug('Processing analytics batch', {
    batchId: data.batchId,
    eventCount: data.events.length,
    sourceService: data.sourceService,
  });

  for (const evt of data.events) {
    analyticsCache.recentEvents.push({
      eventType: evt.eventType,
      timestamp: evt.timestamp || event.timestamp,
      userId: evt.userId,
    });

    const syntheticEvent: StandardEvent = {
      ...event,
      type: evt.eventType,
      data: evt.eventData || evt,
    };

    if (evt.userId && evt.eventType) {
      handleEventRecorded(syntheticEvent).catch(err => logger.warn('Failed to record analytics event', { eventType: evt.eventType, userId: evt.userId, error: errorMessage(err) }));
    }
  }

  while (analyticsCache.recentEvents.length > MAX_RECENT_EVENTS) {
    analyticsCache.recentEvents.shift();
  }
}

async function handleMetricRecorded(event: StandardEvent): Promise<void> {
  const data = event.data as {
    metricName: string;
    metricValue: number;
    metricType: 'counter' | 'gauge' | 'histogram';
    labels?: Record<string, string>;
    serviceName?: string;
    timestamp?: string;
  };

  logger.debug('Processing metric', {
    metricName: data.metricName,
    metricValue: data.metricValue,
    metricType: data.metricType,
  });

  const existingMetric = analyticsCache.metrics.get(data.metricName);

  if (data.metricType === 'counter') {
    const currentValue = existingMetric?.value || 0;
    analyticsCache.metrics.set(data.metricName, {
      value: currentValue + data.metricValue,
      lastUpdated: event.timestamp,
    });
  } else {
    analyticsCache.metrics.set(data.metricName, {
      value: data.metricValue,
      lastUpdated: event.timestamp,
    });
  }

  // Persist metrics to database
  const pool = getDbPool();
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO aia_system_metrics (
          timestamp, service_name, metric_name, metric_value, metric_type, unit, tags, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          data.timestamp || new Date().toISOString(),
          data.serviceName || event.source,
          data.metricName,
          data.metricValue,
          data.metricType,
          null,
          data.labels ? JSON.stringify(data.labels) : null,
          event.source,
        ]
      );
    } catch (error) {
      logger.debug('Failed to persist metric (non-blocking)', { error: errorMessage(error) });
    }
  }
}

async function handleProviderUsage(event: StandardEvent): Promise<void> {
  const data = event.data as {
    providerId: string;
    providerName: string;
    operation: string;
    success: boolean;
    durationMs?: number;
    tokensUsed?: number;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    userId?: string;
    requestId?: string;
    error?: string;
    model?: string;
    modality?: string;
  };

  logger.info('Recording provider usage', {
    providerId: data.providerId,
    providerName: data.providerName,
    operation: data.operation,
    success: data.success,
    durationMs: data.durationMs,
    cost: data.cost,
  });

  // Update in-memory cache
  const stats = analyticsCache.providerStats.get(data.providerId) || {
    successCount: 0,
    failureCount: 0,
    totalDuration: 0,
    totalCost: 0,
  };

  if (data.success) {
    stats.successCount++;
  } else {
    stats.failureCount++;
  }
  if (data.durationMs) {
    stats.totalDuration += data.durationMs;
  }
  if (data.cost) {
    stats.totalCost += data.cost;
  }

  analyticsCache.providerStats.set(data.providerId, stats);

  // Persist to database
  const pool = getDbPool();
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO aia_provider_usage_logs (
          timestamp, provider_id, provider_type, operation, request_id, user_id,
          response_time_ms, cost, input_tokens, output_tokens, success,
          error_type, error_code, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          new Date().toISOString(),
          data.providerId,
          data.providerName,
          data.operation,
          data.requestId || null,
          data.userId || null,
          data.durationMs || null,
          data.cost || 0,
          data.inputTokens || data.tokensUsed || null,
          data.outputTokens || null,
          data.success,
          data.success ? null : 'error',
          data.success ? null : 'PROVIDER_ERROR',
          JSON.stringify({
            model: data.model,
            modality: data.modality,
            error: data.error,
          }),
        ]
      );
      logger.debug('Provider usage persisted to database');
    } catch (error) {
      logger.warn('Failed to persist provider usage', { error: errorMessage(error) });
    }
  }
}

async function handleTraceCompleted(event: StandardEvent): Promise<void> {
  const data = event.data as {
    correlationId: string;
    userId?: string;
    entryService: string;
    entryOperation: string;
    httpMethod: string;
    httpPath: string;
    httpStatusCode: number;
    totalDurationMs: number;
    status: 'completed' | 'error';
    errorMessage?: string;
    spanCount: number;
    metadata?: Record<string, unknown>;
  };

  logger.debug('Processing trace completed event', {
    correlationId: data.correlationId,
    userId: data.userId,
    entryService: data.entryService,
    status: data.status,
  });

  const pool = getDbPool();
  if (pool) {
    try {
      const endTime = new Date().toISOString();
      const startTime = new Date(Date.now() - (data.totalDurationMs || 0)).toISOString();

      await pool.query(
        `INSERT INTO aia_request_traces (correlation_id, user_id, start_time, end_time, total_duration_ms, status, entry_service, entry_operation, http_method, http_path, http_status_code, error_message, span_count, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          data.correlationId,
          data.userId || null,
          startTime,
          endTime,
          data.totalDurationMs,
          data.status,
          data.entryService,
          data.entryOperation,
          data.httpMethod,
          data.httpPath,
          data.httpStatusCode,
          data.errorMessage || null,
          data.spanCount,
          data.metadata ? JSON.stringify(data.metadata) : null,
        ]
      );
    } catch (error) {
      logger.debug('Failed to persist trace completed (non-blocking)', { error: errorMessage(error) });
    }
  }
}

async function handleSpanRecorded(event: StandardEvent): Promise<void> {
  const data = event.data as {
    correlationId: string;
    spanId: string;
    parentSpanId?: string;
    service: string;
    operation: string;
    durationMs: number;
    status: 'completed' | 'error';
    errorCode?: string;
    errorMessage?: string;
    riskLevel?: string;
    metadata?: Record<string, unknown>;
  };

  logger.debug('Processing span recorded event', {
    correlationId: data.correlationId,
    spanId: data.spanId,
    service: data.service,
    status: data.status,
  });

  const pool = getDbPool();
  if (pool) {
    try {
      const endTime = new Date().toISOString();
      const startTime = new Date(Date.now() - (data.durationMs || 0)).toISOString();

      await pool.query(
        `INSERT INTO aia_trace_spans (correlation_id, span_id, parent_span_id, service, operation, start_time, end_time, duration_ms, status, error_code, error_message, risk_level, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          data.correlationId,
          data.spanId,
          data.parentSpanId || null,
          data.service,
          data.operation,
          startTime,
          endTime,
          data.durationMs,
          data.status,
          data.errorCode || null,
          data.errorMessage || null,
          data.riskLevel || null,
          data.metadata ? JSON.stringify(data.metadata) : null,
        ]
      );
    } catch (error) {
      logger.debug('Failed to persist span recorded (non-blocking)', { error: errorMessage(error) });
    }
  }
}

let subscriberInstance: EventSubscriber | null = null;

export async function startAnalyticsEventSubscriber(): Promise<void> {
  if (subscriberInstance) {
    logger.warn('Analytics event subscriber already started');
    return;
  }

  subscriberInstance = createEventSubscriber('ai-analytics-service')
    .register({
      eventType: 'analytics.event.recorded',
      handler: handleEventRecorded,
    })
    .register({
      eventType: 'analytics.events.batch',
      handler: handleEventsBatch,
    })
    .register({
      eventType: 'analytics.metric.recorded',
      handler: handleMetricRecorded,
    })
    .register({
      eventType: 'analytics.provider.usage',
      handler: handleProviderUsage,
    })
    .register({
      eventType: 'analytics.trace.completed',
      handler: handleTraceCompleted,
    })
    .register({
      eventType: 'analytics.span.recorded',
      handler: handleSpanRecorded,
    });

  await subscriberInstance.start();
  logger.debug('Analytics event subscriber started successfully', {
    hasDatabase: !!getDbPool(),
  });
}

export async function stopAnalyticsEventSubscriber(): Promise<void> {
  if (subscriberInstance) {
    await subscriberInstance.shutdown();
    subscriberInstance = null;
    logger.info('Analytics event subscriber stopped');
  }
  if (dbPool) {
    await dbPool.end();
    dbPool = null;
  }
}

export function getAnalyticsCache(): Readonly<AnalyticsEventCache> {
  return analyticsCache;
}
