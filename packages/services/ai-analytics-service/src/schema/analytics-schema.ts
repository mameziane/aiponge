/**
 * AI Analytics Service Database Schema
 * Optimized for TimescaleDB time-series analytics workloads
 */

import {
  pgTable,
  serial,
  varchar,
  timestamp,
  text,
  decimal,
  integer,
  boolean,
  jsonb,
  primaryKey,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// ================================
// REQUEST TRACE TABLES
// ================================

/**
 * Request traces - main table for distributed tracing visibility
 * Tracks complete request flows across services
 */
export const requestTraces = pgTable(
  'aia_request_traces',
  {
    id: serial('id').primaryKey(),
    correlationId: varchar('correlation_id', { length: 255 }).notNull(),
    userId: varchar('user_id', { length: 100 }),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }),
    totalDuration: integer('total_duration_ms'),
    status: varchar('status', { length: 50 }).notNull().default('in_progress'),
    entryService: varchar('entry_service', { length: 100 }),
    entryOperation: varchar('entry_operation', { length: 255 }),
    httpMethod: varchar('http_method', { length: 10 }),
    httpPath: varchar('http_path', { length: 500 }),
    httpStatusCode: integer('http_status_code'),
    errorMessage: text('error_message'),
    spanCount: integer('span_count').default(0),
    metadata: jsonb('metadata'),
  },
  table => [
    unique('aia_trace_correlation_id_unique').on(table.correlationId),
    index('aia_trace_start_time_idx').on(table.startTime),
    index('aia_trace_user_id_idx').on(table.userId),
    index('aia_trace_status_idx').on(table.status),
    index('aia_trace_duration_idx').on(table.totalDuration),
  ]
);

/**
 * Trace spans - individual service operations within a request trace
 */
export const traceSpans = pgTable(
  'aia_trace_spans',
  {
    id: serial('id').primaryKey(),
    correlationId: varchar('correlation_id', { length: 255 }).notNull(),
    spanId: varchar('span_id', { length: 100 }).notNull(),
    parentSpanId: varchar('parent_span_id', { length: 100 }),
    service: varchar('service', { length: 100 }).notNull(),
    operation: varchar('operation', { length: 255 }).notNull(),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }),
    duration: integer('duration_ms'),
    status: varchar('status', { length: 50 }).notNull().default('in_progress'),
    errorCode: varchar('error_code', { length: 100 }),
    errorMessage: text('error_message'),
    riskLevel: varchar('risk_level', { length: 20 }),
    metadata: jsonb('metadata'),
  },
  table => [
    index('aia_span_correlation_id_idx').on(table.correlationId),
    index('aia_span_start_time_idx').on(table.startTime),
    index('aia_span_service_idx').on(table.service),
    index('aia_span_status_idx').on(table.status),
    index('aia_span_duration_idx').on(table.duration),
  ]
);

// NOTE: aia_workflow_executions and aia_workflow_stage_executions tables dropped Jan 2026
// Workflow tracking was duplicative with aia_request_traces and aia_provider_usage_logs

// ================================
// PROVIDER ANALYTICS TABLES
// ================================

/**
 * Provider usage logs - time-series data for provider performance tracking
 * Hypertable partitioned by timestamp for TimescaleDB optimization
 */
export const providerUsageLogs = pgTable(
  'aia_provider_usage_logs',
  {
    id: serial('id').primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    providerId: varchar('provider_id', { length: 100 }).notNull(),
    providerType: varchar('provider_type', { length: 50 }).notNull(), // 'llm', 'music', 'image', 'audio'
    operation: varchar('operation', { length: 100 }).notNull(),
    requestId: varchar('request_id', { length: 255 }),
    userId: varchar('user_id', { length: 100 }),
    requestSize: integer('request_size'), // in bytes
    responseSize: integer('response_size'), // in bytes
    responseTimeMs: integer('response_time_ms'),
    queueTimeMs: integer('queue_time_ms'),
    processingTimeMs: integer('processing_time_ms'),
    cost: decimal('cost', { precision: 10, scale: 6 }).default('0'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    success: boolean('success').notNull(),
    errorType: varchar('error_type', { length: 100 }),
    errorCode: varchar('error_code', { length: 100 }),
    httpStatusCode: integer('http_status_code'),
    circuitBreakerStatus: varchar('circuit_breaker_status', { length: 20 }),
    rateLimitRemaining: integer('rate_limit_remaining'),
    rateLimitReset: timestamp('rate_limit_reset', { withTimezone: true }),
    metadata: jsonb('metadata'),
  },
  table => [
    index('aia_provider_usage_timestamp_idx').on(table.timestamp),
    index('aia_provider_usage_provider_id_idx').on(table.providerId),
    index('aia_provider_usage_operation_idx').on(table.operation),
    index('aia_provider_usage_user_id_idx').on(table.userId),
    index('aia_provider_usage_success_idx').on(table.success),
  ]
);

// NOTE: aia_provider_health_logs table removed January 2026 - never implemented.

// ================================
// SYSTEM METRICS TABLES
// ================================

/**
 * System-wide metrics time-series data
 * Hypertable partitioned by timestamp for high-performance time-series queries
 */
export const systemMetrics = pgTable(
  'aia_system_metrics',
  {
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    serviceName: varchar('service_name', { length: 100 }).notNull(),
    metricName: varchar('metric_name', { length: 200 }).notNull(),
    metricValue: decimal('metric_value', { precision: 20, scale: 10 }).notNull(),
    metricType: varchar('metric_type', { length: 50 }).notNull(), // 'counter', 'gauge', 'histogram', 'summary'
    unit: varchar('unit', { length: 50 }), // 'bytes', 'seconds', 'percent', 'requests_per_second', etc.
    tags: jsonb('tags'), // Additional labels/dimensions
    source: varchar('source', { length: 100 }).notNull(), // service instance identifier
    environment: varchar('environment', { length: 50 }).default('development'),
  },
  table => [
    primaryKey({
      columns: [table.timestamp, table.serviceName, table.metricName, table.source],
    }),
    index('aia_metrics_timestamp_idx').on(table.timestamp),
    index('aia_metrics_service_idx').on(table.serviceName),
    index('aia_metrics_metric_name_idx').on(table.metricName),
  ]
);

// NOTE: aia_cost_analytics table removed January 2026 - never implemented.

// ================================
// USER ACTIVITY ANALYTICS
// ================================

/**
 * User activity patterns and behavior analytics
 */
export const userActivityLogs = pgTable(
  'aia_user_activity_logs',
  {
    id: serial('id').primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    userId: varchar('user_id', { length: 100 }).notNull(),
    userType: varchar('user_type', { length: 50 }).notNull(),
    sessionId: varchar('session_id', { length: 255 }),
    action: varchar('action', { length: 100 }).notNull(),
    resource: varchar('resource', { length: 200 }),
    workflowType: varchar('workflow_type', { length: 100 }),
    providerId: varchar('provider_id', { length: 100 }),
    cost: decimal('cost', { precision: 10, scale: 6 }).default('0'),
    processingTime: integer('processing_time_ms'),
    success: boolean('success').notNull(),
    errorCode: varchar('error_code', { length: 100 }),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    location: jsonb('location'), // geo data
    metadata: jsonb('metadata'),
  },
  table => [
    index('aia_user_activity_timestamp_idx').on(table.timestamp),
    index('aia_user_activity_user_id_idx').on(table.userId),
    index('aia_user_activity_action_idx').on(table.action),
    index('aia_user_activity_session_id_idx').on(table.sessionId),
  ]
);

// ================================
// ZOD SCHEMAS FOR VALIDATION
// ================================

// Provider usage schemas
export const insertProviderUsageLogSchema = createInsertSchema(providerUsageLogs, {
  timestamp: z.coerce.date(),
  responseTimeMs: z.number().int().positive().optional(),
  cost: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional(),
  rateLimitReset: z.coerce.date().optional(),
});

export const selectProviderUsageLogSchema = createSelectSchema(providerUsageLogs);

// System metrics schemas
export const insertSystemMetricSchema = createInsertSchema(systemMetrics, {
  timestamp: z.coerce.date(),
  metricValue: z.string().regex(/^-?\d+(\.\d+)?$/),
});

export const selectSystemMetricSchema = createSelectSchema(systemMetrics);

// User activity schemas
export const insertUserActivityLogSchema = createInsertSchema(userActivityLogs, {
  timestamp: z.coerce.date(),
  cost: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional(),
  processingTime: z.number().int().positive().optional(),
});

export const selectUserActivityLogSchema = createSelectSchema(userActivityLogs);

// ================================
// TYPE EXPORTS
// ================================

export type ProviderUsageLog = typeof providerUsageLogs.$inferSelect;
export type InsertProviderUsageLog = z.infer<typeof insertProviderUsageLogSchema>;

export type SystemMetric = typeof systemMetrics.$inferSelect;
export type InsertSystemMetric = z.infer<typeof insertSystemMetricSchema>;

export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type InsertUserActivityLog = z.infer<typeof insertUserActivityLogSchema>;

// Request trace types
export type RequestTrace = typeof requestTraces.$inferSelect;
export type InsertRequestTrace = typeof requestTraces.$inferInsert;

export type TraceSpan = typeof traceSpans.$inferSelect;
export type InsertTraceSpan = typeof traceSpans.$inferInsert;

// Request trace schemas
export const insertRequestTraceSchema = createInsertSchema(requestTraces, {
  startTime: z.coerce.date(),
  endTime: z.coerce.date().optional(),
  totalDuration: z.number().int().min(0).optional(),
});

export const selectRequestTraceSchema = createSelectSchema(requestTraces);

export const insertTraceSpanSchema = createInsertSchema(traceSpans, {
  startTime: z.coerce.date(),
  endTime: z.coerce.date().optional(),
  duration: z.number().int().min(0).optional(),
});

export const selectTraceSpanSchema = createSelectSchema(traceSpans);
