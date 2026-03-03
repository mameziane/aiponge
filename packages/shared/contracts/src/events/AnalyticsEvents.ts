/**
 * Analytics Service Event Contracts
 * Events for telemetry, metrics collection, and analytics tracking
 * Replaces AnalyticsServiceClient.recordEvent/recordEvents HTTP calls
 */

import { z } from 'zod';
import { baseEventSchema, generateEventId } from './BaseEvent.js';

export type AnalyticsEventType =
  | 'analytics.event.recorded'
  | 'analytics.events.batch'
  | 'analytics.metric.recorded'
  | 'analytics.provider.usage'
  | 'analytics.daily_metrics.computed'
  | 'analytics.cohort_snapshot.computed'
  | 'analytics.lifecycle.recorded';

export const analyticsEventRecordedSchema = baseEventSchema.extend({
  type: z.literal('analytics.event.recorded'),
  data: z.object({
    eventType: z.string(),
    eventData: z.record(z.unknown()),
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    deviceType: z.string().optional(),
    location: z.string().optional(),
    timestamp: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

export const analyticsEventsBatchSchema = baseEventSchema.extend({
  type: z.literal('analytics.events.batch'),
  data: z.object({
    events: z.array(
      z.object({
        eventType: z.string(),
        eventData: z.record(z.unknown()),
        userId: z.string().optional(),
        sessionId: z.string().optional(),
        deviceType: z.string().optional(),
        location: z.string().optional(),
        timestamp: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      })
    ),
    batchId: z.string(),
    sourceService: z.string(),
  }),
});

export const analyticsMetricRecordedSchema = baseEventSchema.extend({
  type: z.literal('analytics.metric.recorded'),
  data: z.object({
    metricName: z.string(),
    metricValue: z.number(),
    metricType: z.enum(['counter', 'gauge', 'histogram']),
    labels: z.record(z.string()).optional(),
    timestamp: z.string().optional(),
  }),
});

export const analyticsProviderUsageSchema = baseEventSchema.extend({
  type: z.literal('analytics.provider.usage'),
  data: z.object({
    providerId: z.string(),
    providerName: z.string(),
    operation: z.string(),
    success: z.boolean(),
    durationMs: z.number().optional(),
    tokensUsed: z.number().optional(),
    cost: z.number().optional(),
    userId: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const analyticsDailyMetricsComputedSchema = baseEventSchema.extend({
  type: z.literal('analytics.daily_metrics.computed'),
  data: z.object({
    date: z.string(),
    rowsComputed: z.number(),
  }),
});

export const analyticsCohortSnapshotComputedSchema = baseEventSchema.extend({
  type: z.literal('analytics.cohort_snapshot.computed'),
  data: z.object({
    targetMonth: z.string(),
    cohortsProcessed: z.number(),
  }),
});

export const analyticsLifecycleRecordedSchema = baseEventSchema.extend({
  type: z.literal('analytics.lifecycle.recorded'),
  data: z.object({
    eventId: z.string(),
    eventType: z.string(),
    userId: z.string(),
  }),
});

export const analyticsEventSchema = z.discriminatedUnion('type', [
  analyticsEventRecordedSchema,
  analyticsEventsBatchSchema,
  analyticsMetricRecordedSchema,
  analyticsProviderUsageSchema,
  analyticsDailyMetricsComputedSchema,
  analyticsCohortSnapshotComputedSchema,
  analyticsLifecycleRecordedSchema,
]);

export type AnalyticsEventRecordedEvent = z.infer<typeof analyticsEventRecordedSchema>;
export type AnalyticsEventsBatchEvent = z.infer<typeof analyticsEventsBatchSchema>;
export type AnalyticsMetricRecordedEvent = z.infer<typeof analyticsMetricRecordedSchema>;
export type AnalyticsProviderUsageEvent = z.infer<typeof analyticsProviderUsageSchema>;
export type AnalyticsDailyMetricsComputedEvent = z.infer<typeof analyticsDailyMetricsComputedSchema>;
export type AnalyticsCohortSnapshotComputedEvent = z.infer<typeof analyticsCohortSnapshotComputedSchema>;
export type AnalyticsLifecycleRecordedEvent = z.infer<typeof analyticsLifecycleRecordedSchema>;
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

export function createAnalyticsEvent<T extends AnalyticsEvent['type']>(
  type: T,
  data: Extract<AnalyticsEvent, { type: T }>['data'],
  source: string = 'unknown-service',
  options?: { correlationId?: string }
): Extract<AnalyticsEvent, { type: T }> {
  return {
    eventId: generateEventId('ana'),
    correlationId: options?.correlationId || generateEventId('cor'),
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    data,
  } as Extract<AnalyticsEvent, { type: T }>;
}

export function validateAnalyticsEvent(event: unknown): AnalyticsEvent {
  return analyticsEventSchema.parse(event);
}
