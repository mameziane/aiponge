import {
  pgTable,
  varchar,
  integer,
  timestamp,
  text,
  uuid,
  jsonb,
  boolean,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from '../user-schema';
import { libEntries } from '../library-schema';
import type {
  Entry,
  InsertEntry,
  Chapter,
  InsertChapter,
  Illustration,
  InsertIllustration,
  Book,
  InsertBook,
} from '../library-schema';

export type { Entry, InsertEntry, Chapter, InsertChapter, Illustration, InsertIllustration, Book, InsertBook };

export const usrProfiles = pgTable(
  'usr_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    totalInsights: integer('total_insights').default(0).notNull(),
    totalReflections: integer('total_reflections').default(0).notNull(),
    totalEntries: integer('total_entries').default(0).notNull(),
    onboardingInitialized: boolean('onboarding_initialized').default(false).notNull(),
    lastVisitedRoute: varchar('last_visited_route', { length: 255 }),
    lastUpdated: timestamp('last_updated').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    activeIdx: index('idx_usr_profiles_active')
      .on(table.userId)
      .where(sql`deleted_at IS NULL`),
  })
);

export const usrProfileThemeFrequencies = pgTable('usr_profile_theme_frequencies', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: varchar('theme', { length: 255 }).notNull(),
  count: integer('count').default(1).notNull(),
  firstSeen: timestamp('first_seen').defaultNow().notNull(),
  lastSeen: timestamp('last_seen').defaultNow().notNull(),
});

export const usrProfileMetrics = pgTable('usr_profile_metrics', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  period: varchar('period', { length: 50 }).notNull(),
  insightCount: integer('insight_count').default(0).notNull(),
  uniqueThemes: text('unique_themes')
    .array()
    .$type<string[]>()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usrUserPatterns = pgTable(
  'usr_user_patterns',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    patternType: varchar('pattern_type', { length: 100 }).notNull(),
    patternName: varchar('pattern_name', { length: 255 }).notNull(),
    description: text('description'),
    frequency: integer('frequency').default(1),
    strength: numeric('strength', { precision: 3, scale: 2 }),
    trend: varchar('trend', { length: 50 }),
    firstObserved: timestamp('first_observed').defaultNow().notNull(),
    lastObserved: timestamp('last_observed').defaultNow().notNull(),
    relatedThemes: text('related_themes')
      .array()
      .default(sql`'{}'::text[]`),
    triggerFactors: text('trigger_factors')
      .array()
      .default(sql`'{}'::text[]`),
    isActive: boolean('is_active').default(true),
    evidenceEntryIds: uuid('evidence_entry_ids')
      .array()
      .default(sql`'{}'::uuid[]`),
    explorationPrompt: text('exploration_prompt'),
    metadata: jsonb('metadata').default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_user_patterns_user_id_idx').on(table.userId),
    patternTypeIdx: index('usr_user_patterns_type_idx').on(table.patternType),
    isActiveIdx: index('usr_user_patterns_active_idx').on(table.isActive),
    activeIdx: index('idx_usr_user_patterns_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

export const usrUserPersonas = pgTable(
  'usr_user_personas',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    personaName: varchar('persona_name', { length: 255 }).notNull(),
    personaDescription: text('persona_description'),
    personality: jsonb('personality').notNull(),
    behavior: jsonb('behavior').notNull(),
    cognitive: jsonb('cognitive').notNull(),
    social: jsonb('social').notNull(),
    growth: jsonb('growth').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    dataPoints: integer('data_points').notNull().default(0),
    version: varchar('version', { length: 20 }).notNull().default('2.0'),
    sourceTimeframeStart: timestamp('source_timeframe_start'),
    sourceTimeframeEnd: timestamp('source_timeframe_end'),
    isActive: boolean('is_active').default(true).notNull(),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('usr_user_personas_user_id_idx').on(table.userId),
    userIdActiveIdx: index('usr_user_personas_user_id_active_idx').on(table.userId, table.isActive),
    generatedAtIdx: index('usr_user_personas_generated_at_idx').on(table.generatedAt),
    activeIdx: index('idx_usr_user_personas_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  })
);

export const usrProfileAnalytics = pgTable(
  'usr_profile_analytics',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    analysisType: varchar('analysis_type', { length: 100 }).notNull(),
    timeframe: varchar('timeframe', { length: 50 }).notNull(),
    progressIndicators: jsonb('progress_indicators').default('{}'),
    computedAt: timestamp('computed_at').defaultNow().notNull(),
    validFrom: timestamp('valid_from').notNull(),
    validTo: timestamp('valid_to').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index('usr_profile_analytics_user_id_idx').on(table.userId),
    analysisTypeIdx: index('usr_profile_analytics_type_idx').on(table.analysisType),
    timeframeIdx: index('usr_profile_analytics_timeframe_idx').on(table.timeframe),
    validFromIdx: index('usr_profile_analytics_valid_from_idx').on(table.validFrom),
  })
);

export const libBookGenerationRequests = pgTable(
  'lib_book_generation_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bookTypeId: varchar('book_type_id', { length: 50 }),
    primaryGoal: text('primary_goal').notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    language: varchar('language', { length: 10 }).default('en-US'),
    tone: varchar('tone', { length: 50 }),
    generationMode: varchar('generation_mode', { length: 20 }).default('blueprint'),
    depthLevel: varchar('depth_level', { length: 20 }),
    generatedBlueprint: jsonb('generated_blueprint'),
    usedSystemPrompt: text('used_system_prompt'),
    usedUserPrompt: text('used_user_prompt'),
    progress: jsonb('progress'),
    providerMetadata: jsonb('provider_metadata').default('{}'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    deletedAt: timestamp('deleted_at'),
  },
  table => ({
    userIdIdx: index('lib_book_generation_requests_user_id_idx').on(table.userId),
    statusIdx: index('lib_book_generation_requests_status_idx').on(table.status),
    createdAtIdx: index('lib_book_generation_requests_created_at_idx').on(table.createdAt),
    activeIdx: index('idx_lib_book_generation_requests_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
    oneActivePerUser: uniqueIndex('uq_lib_book_gen_one_active_per_user')
      .on(table.userId)
      .where(sql`status IN ('pending', 'processing') AND deleted_at IS NULL`),
  })
);

export const insertProfileSchema = createInsertSchema(usrProfiles).omit({
  lastUpdated: true,
  createdAt: true,
});

export const insertThemeFrequencySchema = createInsertSchema(usrProfileThemeFrequencies).omit({
  id: true,
  firstSeen: true,
  lastSeen: true,
});

export const insertProfileMetricsSchema = createInsertSchema(usrProfileMetrics).omit({
  id: true,
  createdAt: true,
});

export const insertBookGenerationRequestSchema = createInsertSchema(libBookGenerationRequests).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertUserPatternSchema = createInsertSchema(usrUserPatterns).omit({
  id: true,
  firstObserved: true,
  lastObserved: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProfileAnalyticsSchema = createInsertSchema(usrProfileAnalytics).omit({
  id: true,
  computedAt: true,
  createdAt: true,
});

export const insertUserPersonaSchema = createInsertSchema(usrUserPersonas).omit({
  id: true,
  generatedAt: true,
  updatedAt: true,
});

export type Profile = typeof usrProfiles.$inferSelect;
export type NewProfile = typeof usrProfiles.$inferInsert;
export type InsertProfile = z.infer<typeof insertProfileSchema>;

export type ThemeFrequency = typeof usrProfileThemeFrequencies.$inferSelect;
export type NewThemeFrequency = typeof usrProfileThemeFrequencies.$inferInsert;
export type InsertThemeFrequency = z.infer<typeof insertThemeFrequencySchema>;

export type ProfileMetrics = typeof usrProfileMetrics.$inferSelect;
export type InsertProfileMetrics = z.infer<typeof insertProfileMetricsSchema>;

export type EntryImage = Illustration;
export type NewEntryImage = InsertIllustration;
export type InsertEntryImage = InsertIllustration;

export type BookGenerationRequest = typeof libBookGenerationRequests.$inferSelect;
export type NewBookGenerationRequest = typeof libBookGenerationRequests.$inferInsert;
export type InsertBookGenerationRequest = z.infer<typeof insertBookGenerationRequestSchema>;

export type UserPattern = typeof usrUserPatterns.$inferSelect;
export type NewUserPattern = typeof usrUserPatterns.$inferInsert;
export type InsertUserPattern = z.infer<typeof insertUserPatternSchema>;

export type ProfileAnalytics = typeof usrProfileAnalytics.$inferSelect;
export type InsertProfileAnalytics = z.infer<typeof insertProfileAnalyticsSchema>;

export type UserPersonaRecord = typeof usrUserPersonas.$inferSelect;
export type NewUserPersonaRecord = typeof usrUserPersonas.$inferInsert;
export type InsertUserPersona = z.infer<typeof insertUserPersonaSchema>;

export {
  usrProfiles as profiles,
  usrProfileThemeFrequencies as themeFrequencies,
  usrProfileMetrics as profileMetrics,
  usrUserPatterns as userPatterns,
  usrProfileAnalytics as profileAnalytics,
  usrUserPersonas as userPersonas,
};
