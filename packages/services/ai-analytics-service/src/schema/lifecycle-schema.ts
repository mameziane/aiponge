/**
 * Lifecycle Analytics Database Schema
 * Tables for user lifecycle tracking, cohort retention, and revenue metrics.
 * Subscription history is read cross-service from usr_subscription_events (user-service).
 */

import { pgTable, uuid, text, timestamp, date, integer, jsonb, numeric, index, unique } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { sql } from 'drizzle-orm';

// ================================
// USER LIFECYCLE EVENTS
// ================================

/**
 * Raw event stream for every meaningful user state change.
 * Source-of-truth log consumed by aggregation schedulers.
 */
export const userLifecycleEvents = pgTable(
  'aia_user_lifecycle_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    eventType: text('event_type').notNull(),
    userId: text('user_id').notNull(),
    tier: text('tier'),
    platform: text('platform'),
    sessionId: text('session_id'),
    metadata: jsonb('metadata').default({}),
    correlationId: text('correlation_id').notNull(),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  table => [
    index('idx_aia_ule_user_id').on(table.userId),
    index('idx_aia_ule_event_type').on(table.eventType),
    index('idx_aia_ule_created_at').on(table.createdAt),
    index('idx_aia_ule_user_created').on(table.userId, table.createdAt),
    index('idx_aia_ule_type_created').on(table.eventType, table.createdAt),
  ]
);

// ================================
// DAILY METRICS
// ================================

/**
 * Pre-aggregated daily rollup. Populated by DailyMetricsScheduler, queried by admin dashboard.
 */
export const dailyMetrics = pgTable(
  'aia_daily_metrics',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    date: date('date').notNull(),
    tier: text('tier').notNull(),
    platform: text('platform').notNull(),
    activeUsers: integer('active_users').default(0),
    newSignups: integer('new_signups').default(0),
    conversions: integer('conversions').default(0),
    upgrades: integer('upgrades').default(0),
    downgrades: integer('downgrades').default(0),
    churned: integer('churned').default(0),
    reactivated: integer('reactivated').default(0),
    trialStarts: integer('trial_starts').default(0),
    trialConversions: integer('trial_conversions').default(0),
    endingUsers: integer('ending_users').default(0),
    grossRevenue: numeric('gross_revenue', { precision: 12, scale: 2 }).default('0'),
    netRevenue: numeric('net_revenue', { precision: 12, scale: 2 }).default('0'),
    refunds: numeric('refunds', { precision: 12, scale: 2 }).default('0'),
    avgSessionDuration: numeric('avg_session_duration', { precision: 8, scale: 2 }).default('0'),
    contentGenerated: integer('content_generated').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  table => [
    index('idx_aia_dm_date').on(table.date),
    index('idx_aia_dm_date_tier').on(table.date, table.tier),
    unique('idx_aia_dm_date_tier_platform').on(table.date, table.tier, table.platform),
  ]
);

// ================================
// COHORT SNAPSHOTS
// ================================

/**
 * Monthly cohort retention table. One row per cohort x age x tier.
 */
export const cohortSnapshots = pgTable(
  'aia_cohort_snapshots',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    cohortMonth: date('cohort_month').notNull(),
    monthsSinceCohort: integer('months_since_cohort').notNull(),
    tier: text('tier').notNull(),
    platform: text('platform').notNull(),
    cohortSize: integer('cohort_size').notNull(),
    usersRemaining: integer('users_remaining').notNull(),
    paidUsersRemaining: integer('paid_users_remaining').default(0),
    retentionRate: numeric('retention_rate', { precision: 5, scale: 4 }).notNull(),
    revenueRetention: numeric('revenue_retention', { precision: 5, scale: 4 }).default('0'),
    cumulativeRevenue: numeric('cumulative_revenue', { precision: 12, scale: 2 }).default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  table => [
    index('idx_aia_cs_cohort_month').on(table.cohortMonth),
    unique('idx_aia_cs_cohort_months').on(table.cohortMonth, table.monthsSinceCohort, table.tier, table.platform),
  ]
);

// ================================
// ACQUISITION ATTRIBUTION
// ================================

/**
 * One row per user linking them to their acquisition source for CAC analysis.
 */
export const acquisitionAttribution = pgTable(
  'aia_acquisition_attribution',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text('user_id').notNull(),
    platform: text('platform').notNull(),
    store: text('store').notNull(),
    acquisitionSource: text('acquisition_source').notNull(),
    campaign: text('campaign'),
    adGroup: text('ad_group'),
    creative: text('creative'),
    referralCode: text('referral_code'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    costPerInstall: numeric('cost_per_install', { precision: 8, scale: 4 }),
    firstPaymentAt: timestamp('first_payment_at', { withTimezone: true }),
    firstPaymentTier: text('first_payment_tier'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  table => [
    unique('idx_aia_aa_user_id').on(table.userId),
    index('idx_aia_aa_source').on(table.acquisitionSource),
    index('idx_aia_aa_campaign').on(table.campaign),
    index('idx_aia_aa_created').on(table.createdAt),
  ]
);

// ================================
// ZOD SCHEMAS FOR VALIDATION
// ================================

export const insertUserLifecycleEventSchema = createInsertSchema(userLifecycleEvents);
export const selectUserLifecycleEventSchema = createSelectSchema(userLifecycleEvents);

export const insertDailyMetricsSchema = createInsertSchema(dailyMetrics);
export const selectDailyMetricsSchema = createSelectSchema(dailyMetrics);

export const insertCohortSnapshotSchema = createInsertSchema(cohortSnapshots);
export const selectCohortSnapshotSchema = createSelectSchema(cohortSnapshots);

export const insertAcquisitionAttributionSchema = createInsertSchema(acquisitionAttribution);
export const selectAcquisitionAttributionSchema = createSelectSchema(acquisitionAttribution);

// ================================
// TYPE EXPORTS
// ================================

export type UserLifecycleEventRow = typeof userLifecycleEvents.$inferSelect;
export type InsertUserLifecycleEventRow = typeof userLifecycleEvents.$inferInsert;

export type DailyMetricsRow = typeof dailyMetrics.$inferSelect;
export type InsertDailyMetricsRow = typeof dailyMetrics.$inferInsert;

export type CohortSnapshotRow = typeof cohortSnapshots.$inferSelect;
export type InsertCohortSnapshotRow = typeof cohortSnapshots.$inferInsert;

export type AcquisitionAttributionRow = typeof acquisitionAttribution.$inferSelect;
export type InsertAcquisitionAttributionRow = typeof acquisitionAttribution.$inferInsert;
