/**
 * System Service - Unified Schema
 * Service discovery, monitoring, and system management schemas
 * All tables use 'sys_' prefix for clear service boundaries
 */

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, uuid, index } from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

// ===== SERVICE DISCOVERY DOMAIN =====

// Service Registry Table
export const serviceRegistry = pgTable('sys_service_registry', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  version: varchar('version', { length: 50 }),
  host: varchar('host', { length: 255 }).notNull(),
  port: integer('port').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('healthy'),
  isActive: boolean('is_active').notNull().default(true),
  healthEndpoint: varchar('health_endpoint', { length: 255 }).notNull().default('/health'),
  lastHealthCheck: timestamp('last_health_check'),
  metadata: jsonb('metadata'),
  lastHeartbeat: timestamp('last_heartbeat').notNull().defaultNow(),
  leaseTTL: integer('lease_ttl').notNull().default(300000), // 5 minutes in milliseconds
  leaseExpiryAt: timestamp('lease_expiry_at')
    .notNull()
    .default(sql`NOW() + INTERVAL '5 minutes'`),
  registeredAt: timestamp('registered_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Note: Indexes will be created via migrations if needed

// Service Dependencies Table
export const serviceDependencies = pgTable('sys_service_dependencies', {
  id: uuid('id').primaryKey(),
  serviceId: uuid('service_id').notNull(),
  dependencyName: varchar('dependency_name', { length: 100 }).notNull(),
  dependencyType: varchar('dependency_type', { length: 20 }).notNull(), // hard, soft
  timeout: integer('timeout'),
  healthCheck: varchar('health_check', { length: 255 }),
  isRequired: boolean('is_required').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Service Dependencies Indexes
// Note: Indexes will be created via migrations if needed

// ===== MONITORING DOMAIN =====

// Health Checks Table
export const healthChecks = pgTable('sys_health_checks', {
  id: uuid('id').primaryKey(),
  serviceName: varchar('service_name', { length: 255 }).notNull(),
  checkType: varchar('check_type', { length: 50 }).notNull(),
  endpoint: text('endpoint').notNull(),
  intervalSeconds: integer('interval_seconds').notNull().default(30),
  timeoutMs: integer('timeout_ms').notNull().default(5000),
  retryCount: integer('retry_count').notNull().default(2),
  isEnabled: boolean('is_enabled').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Health Checks Indexes
// Note: Indexes will be created via migrations if needed

// Health Check Results Table (time-series data)
export const healthCheckResults = pgTable('sys_health_check_results', {
  id: uuid('id').primaryKey(),
  healthCheckId: uuid('health_check_id')
    .notNull()
    .references(() => healthChecks.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(),
  responseTimeMs: integer('response_time_ms').notNull(),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

// Health Check Results Indexes
// Note: Indexes will be created via migrations if needed

// Metrics Aggregates Table
export const metricsAggregates = pgTable('sys_metrics', {
  id: uuid('id').primaryKey(),
  serviceName: varchar('service_name', { length: 255 }).notNull(),
  metricName: varchar('metric_name', { length: 255 }).notNull(),
  metricType: varchar('metric_type', { length: 50 }).notNull(), // gauge, counter, histogram
  value: decimal('value').notNull(),
  labels: jsonb('labels'),
  aggregationWindow: varchar('aggregation_window', { length: 20 }).notNull(), // 1m, 5m, 1h, 1d
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

// Metrics Aggregates Indexes
// Note: Indexes will be created via migrations if needed

// ===== ALERTS DOMAIN =====

// Alert Rules Table
export const alertRules = pgTable('sys_alert_rules', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  conditionType: varchar('condition_type', { length: 100 }).notNull(),
  conditionConfig: jsonb('condition_config').notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  notificationChannels: jsonb('notification_channels').default([]),
  cooldownMinutes: integer('cooldown_minutes').default(5),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// NOTE: notification_channels is NOT a separate table - it's stored as JSONB column in sys_alert_rules
// The notificationChannels field in sys_alert_rules stores an array of channel IDs/configs inline
// If a separate notification_channels table is needed in the future, create migration first

// Alerts Table
export const alerts = pgTable('sys_alerts', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  alertRuleId: uuid('alert_rule_id').notNull(),
  serviceName: varchar('service_name', { length: 255 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata'),
  triggeredAt: timestamp('triggered_at').notNull().defaultNow(),
  acknowledgedAt: timestamp('acknowledged_at'),
  acknowledgedBy: uuid('acknowledged_by'),
  resolvedAt: timestamp('resolved_at'),
});

// ===== NOTIFICATION DOMAIN =====

// Notifications Table
export const notifications = pgTable(
  'sys_notifications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id'),
    type: varchar('type', { length: 50 }).notNull(), // email, push, in_app, sms
    channel: varchar('channel', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, sent, delivered, failed
    priority: varchar('priority', { length: 20 }).default('normal'), // low, normal, high, urgent
    metadata: jsonb('metadata'),
    templateId: varchar('template_id', { length: 255 }),
    scheduledFor: timestamp('scheduled_for'),
    sentAt: timestamp('sent_at'),
    deliveredAt: timestamp('delivered_at'),
    failedAt: timestamp('failed_at'),
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_sys_notifications_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// Notifications Indexes
// Note: Indexes will be created via migrations if needed

// ===== RELATIONS =====

export const serviceRegistryRelations = relations(serviceRegistry, ({ many }) => ({
  dependencies: many(serviceDependencies),
  healthChecks: many(healthChecks),
}));

export const serviceDependenciesRelations = relations(serviceDependencies, ({ one }) => ({
  service: one(serviceRegistry, {
    fields: [serviceDependencies.serviceId],
    references: [serviceRegistry.id],
  }),
}));

export const healthChecksRelations = relations(healthChecks, ({ many }) => ({
  results: many(healthCheckResults),
}));

export const healthCheckResultsRelations = relations(healthCheckResults, ({ one }) => ({
  healthCheck: one(healthChecks, {
    fields: [healthCheckResults.healthCheckId],
    references: [healthChecks.id],
  }),
}));

// ===== MONITORING CONFIGURATION =====

// System Configuration Table (for monitoring scheduler toggle etc.)
export const systemConfig = pgTable('sys_config', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
});

// ===== DEAD LETTER QUEUE =====

export const sysDeadLetterQueue = pgTable(
  'sys_dead_letter_queue',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    queueName: varchar('queue_name', { length: 100 }).notNull(),
    jobId: varchar('job_id', { length: 200 }),
    jobName: varchar('job_name', { length: 200 }),
    payload: jsonb('payload').notNull(),
    errorMessage: text('error_message'),
    errorStack: text('error_stack'),
    attemptsMade: integer('attempts_made').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    status: varchar('status', { length: 20 }).notNull().default('failed'),
    retriedAt: timestamp('retried_at'),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('idx_dlq_queue').on(table.queueName),
    index('idx_dlq_status').on(table.status),
    index('idx_dlq_created_at').on(table.createdAt),
  ]
);

export type DeadLetterQueueEntry = typeof sysDeadLetterQueue.$inferSelect;
export type NewDeadLetterQueueEntry = typeof sysDeadLetterQueue.$inferInsert;

// ===== TYPE EXPORTS =====

export type SystemConfig = typeof systemConfig.$inferSelect;
export type NewSystemConfig = typeof systemConfig.$inferInsert;

export type ServiceRegistry = typeof serviceRegistry.$inferSelect;
export type NewServiceRegistry = typeof serviceRegistry.$inferInsert;

export type ServiceDependency = typeof serviceDependencies.$inferSelect;
export type NewServiceDependency = typeof serviceDependencies.$inferInsert;

export type HealthCheck = typeof healthChecks.$inferSelect;
export type NewHealthCheck = typeof healthChecks.$inferInsert;

export type HealthCheckResult = typeof healthCheckResults.$inferSelect;
export type NewHealthCheckResult = typeof healthCheckResults.$inferInsert;

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;

export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;

export type MetricsAggregate = typeof metricsAggregates.$inferSelect;
export type NewMetricsAggregate = typeof metricsAggregates.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// ===== TIER 4 WS3: PRE-COMPUTED PLATFORM METRICS =====

export const platformMetrics = pgTable(
  'sys_platform_metrics',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    metricType: varchar('metric_type', { length: 50 }).notNull(),
    payload: jsonb('payload').notNull(),
    computedAt: timestamp('computed_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'),
    version: integer('version').notNull().default(1),
  },
  table => [
    index('idx_sys_platform_metrics_type').on(table.metricType),
    index('idx_sys_platform_metrics_computed').on(table.computedAt),
  ]
);

export type PlatformMetric = typeof platformMetrics.$inferSelect;
export type NewPlatformMetric = typeof platformMetrics.$inferInsert;

// ===== SYSTEM AUDIT LOG =====

export const sysAuditLog = pgTable(
  'sys_audit_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    actorId: uuid('actor_id'),
    actorType: varchar('actor_type', { length: 20 }).notNull().default('user'),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 100 }),
    resourceId: varchar('resource_id', { length: 255 }),
    metadata: jsonb('metadata'),
    correlationId: varchar('correlation_id', { length: 255 }),
    severity: varchar('severity', { length: 20 }).notNull().default('info'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [
    index('idx_sys_audit_log_actor').on(table.actorId),
    index('idx_sys_audit_log_action').on(table.action),
    index('idx_sys_audit_log_resource').on(table.resourceType, table.resourceId),
    index('idx_sys_audit_log_created_at').on(table.createdAt),
    index('idx_sys_audit_log_severity')
      .on(table.severity)
      .where(sql`severity != 'info'`),
  ]
);

export type AuditLogEntry = typeof sysAuditLog.$inferSelect;
export type NewAuditLogEntry = typeof sysAuditLog.$inferInsert;
