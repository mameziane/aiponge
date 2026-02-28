/**
 * AI Config Service Database Schema
 * Unified schema combining Provider Management and Psychological Frameworks
 *
 * Active Provider Tables (2): cfg_provider_configs, cfg_provider_health
 * Active Framework Tables (1): cfg_psychological_frameworks
 *
 * NOTE: Template management has been fully migrated to aic_prompt_templates in ai-content-service.
 * NOTE: Provider usage analytics moved to aia_provider_usage_logs in ai-analytics-service.
 * NOTE: Circuit breaker state is now managed in-memory only.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  numeric,
  timestamp,
  jsonb,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// ============================================================================
// PROVIDER DOMAIN ENUMS
// ============================================================================

export const providerTypeEnum = pgEnum('provider_type', ['llm', 'music', 'image', 'video', 'audio', 'text']);
export const healthStatusEnum = pgEnum('health_status', ['healthy', 'degraded', 'unhealthy', 'error', 'unknown']);

// ============================================================================
// PSYCHOLOGICAL FRAMEWORK ENUMS
// ============================================================================

export const frameworkCategoryEnum = pgEnum('framework_category', [
  'cognitive',
  'behavioral',
  'humanistic',
  'psychodynamic',
  'integrative',
  'somatic',
  'mindfulness',
  'positive',
  'existential',
]);

// ============================================================================
// PROVIDER DOMAIN TABLES
// ============================================================================

/**
 * Provider Configurations Table
 * Stores all AI provider configurations including endpoints, templates, and settings
 */
export const providerConfigurations = pgTable(
  'cfg_provider_configs',
  {
    id: serial('id').primaryKey(),
    providerId: varchar('provider_id', { length: 255 }).notNull().unique(),
    providerName: varchar('provider_name', { length: 255 }).notNull(),
    providerType: providerTypeEnum('provider_type').notNull(),
    description: text('description'),
    configuration: jsonb('configuration').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    isPrimary: boolean('is_primary').notNull().default(false),
    priority: integer('priority').notNull().default(100),
    costPerUnit: decimal('cost_per_unit', { precision: 10, scale: 6 }).notNull().default('0.000001'),
    creditCost: integer('credit_cost').default(0),
    healthStatus: healthStatusEnum('health_status').notNull().default('unknown'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    createdBy: varchar('created_by', { length: 255 }),
    updatedBy: varchar('updated_by', { length: 255 }),
  },
  table => {
    return {
      providerTypeIdx: index('idx_cfg_provider_type').on(table.providerType),
      isActiveIdx: index('idx_cfg_is_active').on(table.isActive),
      isPrimaryIdx: index('idx_cfg_is_primary').on(table.isPrimary),
      healthStatusIdx: index('idx_cfg_health_status').on(table.healthStatus),
    };
  }
);

/**
 * Provider Health Check Log Table
 * Stores historical health check results
 */
export const providerHealthCheckLog = pgTable(
  'cfg_provider_health',
  {
    id: serial('id').primaryKey(),
    providerId: varchar('provider_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    latencyMs: integer('latency_ms'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata'),
    checkedAt: timestamp('checked_at').notNull().defaultNow(),
  },
  table => {
    return {
      providerIdIdx: index('idx_cfg_health_check_provider_id').on(table.providerId),
      checkedAtIdx: index('idx_cfg_health_check_checked_at').on(table.checkedAt),
      statusIdx: index('idx_cfg_health_check_status').on(table.status),
    };
  }
);

// ============================================================================
// PSYCHOLOGICAL FRAMEWORK TABLE
// ============================================================================

/**
 * Psychological Frameworks Table
 * Stores therapeutic framework configurations for AI content and music generation
 */
export const cfgPsychologicalFrameworks = pgTable(
  'cfg_psychological_frameworks',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    shortName: varchar('short_name', { length: 20 }).notNull(),
    category: frameworkCategoryEnum('category').notNull(),
    description: text('description').notNull(),
    keyPrinciples: text('key_principles')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    therapeuticGoals: text('therapeutic_goals')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    triggerPatterns: text('trigger_patterns')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    songStructureHint: text('song_structure_hint'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(100),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => {
    return {
      categoryIdx: index('idx_cfg_psy_frameworks_category').on(table.category),
      enabledIdx: index('idx_cfg_psy_frameworks_enabled').on(table.isEnabled),
      sortOrderIdx: index('idx_cfg_psy_frameworks_sort').on(table.sortOrder),
    };
  }
);

// ============================================================================
// PROVIDER DOMAIN: ZOD VALIDATION SCHEMAS
// ============================================================================

export const insertProviderConfigurationSchema = createInsertSchema(providerConfigurations, {
  configuration: z.object({
    endpoint: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional().default('POST'),
    headers: z.record(z.unknown()).optional().default({}),
    requestTemplate: z.record(z.unknown()),
    responseMapping: z.record(z.string()),
    timeout: z.number().positive().optional(),
    auth: z
      .object({
        headerName: z.string().default('Authorization'),
        scheme: z.string().optional(),
        envVarName: z.string().optional(),
        requiredSecrets: z.array(z.string()).optional().default([]),
      })
      .optional(),
    models: z.array(z.string()).optional().default([]),
    strengths: z.array(z.string()).optional().default([]),
    capabilities: z.array(z.string()).optional().default([]),
  }),
  providerType: z.enum(['llm', 'music', 'image', 'video', 'audio', 'text']),
  creditCost: z.number().int().nonnegative().optional().default(0),
  healthStatus: z.enum(['healthy', 'degraded', 'unhealthy', 'error', 'unknown']).optional().default('unknown'),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectProviderConfigurationSchema = createSelectSchema(providerConfigurations);
export const insertProviderHealthCheckLogSchema = createInsertSchema(providerHealthCheckLog).omit({ id: true });
export const selectProviderHealthCheckLogSchema = createSelectSchema(providerHealthCheckLog);

// ============================================================================
// PROVIDER DOMAIN: TYPE EXPORTS
// ============================================================================

export type ProviderConfigurationDB = typeof providerConfigurations.$inferSelect;
export type InsertProviderConfiguration = z.infer<typeof insertProviderConfigurationSchema>;
export type ProviderHealthCheckLog = typeof providerHealthCheckLog.$inferSelect;
export type InsertProviderHealthCheckLog = z.infer<typeof insertProviderHealthCheckLogSchema>;

export interface ProviderAuthConfig {
  headerName: string;
  scheme?: string;
  envVarName?: string;
  requiredSecrets?: string[];
}

export interface ProviderCapabilities {
  models: string[];
  strengths: string[];
  capabilities: string[];
}

// ============================================================================
// PSYCHOLOGICAL FRAMEWORK DOMAIN: TYPE EXPORTS
// ============================================================================

export type PsychologicalFrameworkDB = typeof cfgPsychologicalFrameworks.$inferSelect;
export type NewPsychologicalFramework = typeof cfgPsychologicalFrameworks.$inferInsert;

export const insertPsychologicalFrameworkSchema = createInsertSchema(cfgPsychologicalFrameworks).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectPsychologicalFrameworkSchema = createSelectSchema(cfgPsychologicalFrameworks);

export type InsertPsychologicalFramework = z.infer<typeof insertPsychologicalFrameworkSchema>;
