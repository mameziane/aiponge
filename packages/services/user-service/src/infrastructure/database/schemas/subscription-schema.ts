/**
 * Subscription & Usage Tracking Schema
 * Database schema for RevenueCat subscription management and usage limits
 */

import { pgTable, varchar, integer, timestamp, boolean, uuid, jsonb, index, unique, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import type { z } from 'zod';
import { users } from './user-schema';
import { TIER_IDS } from '@aiponge/shared-contracts';

export {
  SUBSCRIPTION_TIERS,
  TIER_IDS,
  VALID_TIERS,
  PAID_TIERS,
  FREE_TIERS,
  normalizeTier,
  isValidTier,
  isPaidTier,
  isFreeTier,
  isGuestTier,
  getTierConfig,
  getTierByEntitlement,
  getTierLimits,
  getTierFeatures,
  hasTierFeature,
  hasReachedLimit,
  getRemainingUsage,
  type SubscriptionTier,
  type SubscriptionTierConfig,
  type SubscriptionTierLimits,
  type SubscriptionTierFeatures,
} from '@aiponge/shared-contracts';

// User Subscriptions Table - Tracks RevenueCat subscription status
export const usrSubscriptions = pgTable(
  'usr_subscriptions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revenueCatCustomerId: varchar('revenuecat_customer_id', { length: 255 }).unique(), // RevenueCat app_user_id
    subscriptionTier: varchar('subscription_tier', { length: 50 }).notNull().default(TIER_IDS.GUEST),
    status: varchar('status', { length: 50 }).notNull().default('active'), // active, cancelled, expired, past_due
    platform: varchar('platform', { length: 50 }), // ios, android, web, stripe
    productId: varchar('product_id', { length: 255 }), // RevenueCat product identifier
    entitlementId: varchar('entitlement_id', { length: 255 }), // RevenueCat entitlement (e.g., 'personal', 'practice', 'studio')
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    trialEnd: timestamp('trial_end'), // For free trial periods
    billingIssue: boolean('billing_issue').default(false), // Payment issue flag
    lastSyncedAt: timestamp('last_synced_at').defaultNow(), // Last webhook sync
    metadata: jsonb('metadata').default('{}'), // Additional RevenueCat data
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdUnique: unique('usr_subscriptions_user_id_unique').on(table.userId),
    userIdIdx: index('usr_subscriptions_user_id_idx').on(table.userId),
    tierIdx: index('usr_subscriptions_tier_idx').on(table.subscriptionTier),
    statusIdx: index('usr_subscriptions_status_idx').on(table.status),
    revenueCatIdIdx: index('usr_subscriptions_revenuecat_id_idx').on(table.revenueCatCustomerId),
    activeIdx: index('idx_usr_subscriptions_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// Usage Limits Table - Tracks monthly usage for subscription tier limits
export const usrUsageLimits = pgTable(
  'usr_usage_limits',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    month: varchar('month', { length: 7 }).notNull(), // Format: YYYY-MM
    songsGenerated: integer('songs_generated').default(0).notNull(),
    lyricsGenerated: integer('lyrics_generated').default(0).notNull(),
    insightsGenerated: integer('insights_generated').default(0).notNull(),
    resetAt: timestamp('reset_at').notNull(), // When this month's limits reset
    metadata: jsonb('metadata').default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_usage_limits_user_id_idx').on(table.userId),
    monthIdx: index('usr_usage_limits_month_idx').on(table.month),
    userMonthIdx: index('usr_usage_limits_user_month_idx').on(table.userId, table.month),
    activeIdx: index('idx_usr_usage_limits_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

// Subscription Events Table - Audit log of subscription lifecycle events
export const usrSubscriptionEvents = pgTable(
  'usr_subscription_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => usrSubscriptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 100 }).notNull(), // initial_purchase, renewal, cancellation, reactivation, expiration, billing_issue, refund
    eventSource: varchar('event_source', { length: 50 }).notNull().default('revenuecat'), // revenuecat, manual, system
    previousTier: varchar('previous_tier', { length: 50 }),
    newTier: varchar('new_tier', { length: 50 }),
    previousStatus: varchar('previous_status', { length: 50 }),
    newStatus: varchar('new_status', { length: 50 }),
    eventData: jsonb('event_data').default('{}'), // Full webhook payload or event details
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    subscriptionIdIdx: index('usr_subscription_events_subscription_id_idx').on(table.subscriptionId),
    userIdIdx: index('usr_subscription_events_user_id_idx').on(table.userId),
    eventTypeIdx: index('usr_subscription_events_type_idx').on(table.eventType),
    createdAtIdx: index('usr_subscription_events_created_at_idx').on(table.createdAt),
  })
);

// Zod schemas for validation
export const insertSubscriptionSchema = createInsertSchema(usrSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUsageLimitsSchema = createInsertSchema(usrUsageLimits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionEventSchema = createInsertSchema(usrSubscriptionEvents).omit({
  id: true,
  createdAt: true,
});

// TypeScript types
export type Subscription = typeof usrSubscriptions.$inferSelect;
export type NewSubscription = typeof usrSubscriptions.$inferInsert;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export type UsageLimits = typeof usrUsageLimits.$inferSelect;
export type NewUsageLimits = typeof usrUsageLimits.$inferInsert;
export type InsertUsageLimits = z.infer<typeof insertUsageLimitsSchema>;

export type SubscriptionEvent = typeof usrSubscriptionEvents.$inferSelect;
export type NewSubscriptionEvent = typeof usrSubscriptionEvents.$inferInsert;
export type InsertSubscriptionEvent = z.infer<typeof insertSubscriptionEventSchema>;

// Guest Conversion State Table - Per-user tracking of guest actions
// Schema aligned with existing database structure
export const usrGuestConversionState = pgTable(
  'usr_guest_conversion_state',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    // Action counters (using database column names)
    songsGenerated: integer('songs_generated').default(0).notNull(),
    tracksPlayed: integer('tracks_played').default(0).notNull(),
    entriesSaved: integer('entries_saved').default(0).notNull(),
    // Prompt tracking
    lastPromptShown: timestamp('last_prompt_shown'),
    promptCount: integer('prompt_count').default(0).notNull(),
    // Conversion tracking
    converted: boolean('converted').default(false).notNull(),
    convertedAt: timestamp('converted_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  table => ({
    userIdIdx: index('usr_guest_conversion_state_user_id_idx').on(table.userId),
  })
);

// Zod schemas for guest conversion
export const insertGuestConversionStateSchema = createInsertSchema(usrGuestConversionState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// TypeScript types for guest conversion
export type GuestConversionState = typeof usrGuestConversionState.$inferSelect;
export type NewGuestConversionState = typeof usrGuestConversionState.$inferInsert;
export type InsertGuestConversionState = z.infer<typeof insertGuestConversionStateSchema>;

// Guest Data Migrations Table - Tracks guest-to-user data migration status
export const usrGuestDataMigrations = pgTable(
  'usr_guest_data_migrations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    guestUserId: uuid('guest_user_id').notNull(), // The original guest account ID
    newUserId: uuid('new_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // The new registered account
    status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, in_progress, completed, failed
    migratedTables: text('migrated_tables')
      .array()
      .default(sql`'{}'::text[]`), // List of tables that were migrated
    errorMessage: text('error_message'), // Error details if failed
    booksMigrated: integer('books_migrated').default(0),
    chaptersMigrated: integer('chapters_migrated').default(0),
    entriesMigrated: integer('entries_migrated').default(0),
    tracksMigrated: integer('tracks_migrated').default(0),
    albumsMigrated: integer('albums_migrated').default(0),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    guestUserIdIdx: index('usr_guest_data_migrations_guest_user_id_idx').on(table.guestUserId),
    newUserIdIdx: index('usr_guest_data_migrations_new_user_id_idx').on(table.newUserId),
    statusIdx: index('usr_guest_data_migrations_status_idx').on(table.status),
  })
);

export type GuestDataMigration = typeof usrGuestDataMigrations.$inferSelect;
export type NewGuestDataMigration = typeof usrGuestDataMigrations.$inferInsert;

// Default policy configuration
export const DEFAULT_GUEST_CONVERSION_POLICY = {
  firstSongThreshold: 1,
  tracksPlayedThreshold: 5,
  entriesCreatedThreshold: 3,
  promptCooldownMs: 24 * 60 * 60 * 1000, // 24 hours
  promptMessages: {
    'first-song': {
      title: 'Great Work!',
      message:
        'You just created your first AI-generated song! Create a free account to save it forever and keep creating.',
    },
    'multiple-tracks': {
      title: 'Loving the Music?',
      message: "You've listened to 5 tracks! Create a free account to build your library and discover more.",
    },
    entries: {
      title: 'Keep the Momentum!',
      message: "You've created 3 entries! Sign up to preserve your reflections and get personalized insights.",
    },
  },
} as const;
