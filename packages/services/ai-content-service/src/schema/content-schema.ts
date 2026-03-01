/**
 * Content Service Database Schema
 * Comprehensive schema for content generation operations, templates, and results
 */

import {
  pgTable,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  boolean,
  uuid,
  decimal,
  index,
  primaryKey as _primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';

// =============================================================================
// CONTENT REQUESTS
// =============================================================================

export const contentRequests = pgTable(
  'aic_content_requests',
  {
    id: varchar('id', { length: 255 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    // 'article', 'blog', 'creative', 'technical', 'email', 'social'
    contentType: varchar('content_type', { length: 50 }).notNull(),
    prompt: text('prompt').notNull(),

    // Generation parameters
    parameters: jsonb('parameters').$type<{
      maxLength?: number;
      temperature?: number;
      tone?: 'formal' | 'casual' | 'professional' | 'friendly' | 'persuasive';
      targetAudience?: string;
      style?: 'informative' | 'narrative' | 'promotional' | 'educational';
      language?: string;
      includeOutline?: boolean;
      seoOptimize?: boolean;
    }>(),

    // Request options
    options: jsonb('options').$type<{
      includeAlternatives?: boolean;
      optimizeForSEO?: boolean;
      addCitations?: boolean;
      formatOutput?: 'plain' | 'markdown' | 'html';
      priority?: 'low' | 'normal' | 'high';
      templateId?: string;
    }>(),

    // Status tracking: 'pending', 'processing', 'completed', 'failed', 'cancelled'
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    workflowId: varchar('workflow_id', { length: 255 }),

    // Provider information
    providerId: varchar('provider_id', { length: 100 }),
    model: varchar('model', { length: 100 }),

    // Metadata
    metadata: jsonb('metadata').$type<{
      sourceService?: string;
      requestIp?: string;
      userAgent?: string;
      apiVersion?: string;
      clientId?: string;
    }>(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: uuid('created_by'),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('content_requests_user_id_idx').on(table.userId),
    index('content_requests_status_idx').on(table.status),
    index('content_requests_content_type_idx').on(table.contentType),
    index('content_requests_created_at_idx').on(table.createdAt),
    index('idx_aic_content_requests_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// =============================================================================
// CONTENT RESULTS
// =============================================================================

export const contentResults = pgTable(
  'aic_content_results',
  {
    id: varchar('id', { length: 255 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    requestId: varchar('request_id', { length: 255 })
      .references(() => contentRequests.id, { onDelete: 'cascade' })
      .notNull(),

    // Generated content
    content: text('content').notNull(),
    formattedContent: text('formatted_content'), // HTML/Markdown formatted version

    // Content metadata
    metadata: jsonb('metadata').$type<{
      wordCount: number;
      characterCount: number;
      readingTimeMinutes: number;
      language: string;
      tokensUsed: number;
      generationTimeMs: number;

      // Quality metrics
      qualityScore: number;
      coherenceScore: number;
      relevanceScore: number;
      creativityScore: number;

      // SEO metrics
      seoScore?: number;
      readabilityScore?: number;
      keywordDensity?: Record<string, number>;

      // Provider info
      providerId: string;
      model: string;
      temperature: number;

      // Processing info
      processingSteps: string[];
      errorCount: number;
      warnings: string[];
    }>(),

    // Content analysis
    analysis: jsonb('analysis').$type<{
      sentiment: 'positive' | 'negative' | 'neutral';
      topics: string[];
      entities: Array<{ text: string; type: string; confidence: number }>;
      keyPhrases: string[];
      languageConfidence: number;
      contentStructure: {
        headings: number;
        paragraphs: number;
        bulletPoints: number;
        links: number;
      };
    }>(),

    // Version control
    version: integer('version').notNull().default(1),
    parentId: varchar('parent_id', { length: 255 }), // For versioning/iterations

    // Quality and approval
    isApproved: boolean('is_approved').default(false),
    approvedBy: varchar('approved_by', { length: 255 }),
    approvedAt: timestamp('approved_at'),

    // Publishing
    isPublished: boolean('is_published').default(false),
    publishedAt: timestamp('published_at'),
    publishUrl: varchar('publish_url', { length: 500 }),

    // Cost tracking
    cost: decimal('cost', { precision: 10, scale: 4 }).default('0.0000'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('content_results_request_id_idx').on(table.requestId),
    index('content_results_version_idx').on(table.version),
    index('content_results_is_approved_idx').on(table.isApproved),
    index('content_results_is_published_idx').on(table.isPublished),
    index('content_results_created_at_idx').on(table.createdAt),
    index('idx_aic_content_results_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// =============================================================================
// CONTENT TEMPLATES
// =============================================================================

export const promptTemplates = pgTable(
  'aic_prompt_templates',
  {
    id: varchar('id', { length: 255 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),

    // Template categorization
    contentType: varchar('content_type', { length: 50 }).notNull(),
    category: varchar('category', { length: 100 }).notNull(),
    tags: text('tags').array(), // Array of tag strings

    // Template structure
    systemPrompt: text('system_prompt').notNull(),
    userPromptStructure: text('user_prompt_structure').notNull(),

    // Variables and parameters
    requiredVariables: text('required_variables').array(),
    optionalVariables: text('optional_variables').array(),

    // Template configuration
    configuration: jsonb('configuration').$type<{
      expectedOutputFormat: string;
      postProcessingRules: string[];
      supportedStrategies: string[];
      defaultParameters: {
        maxLength?: number;
        temperature?: number;
        tone?: string;
        style?: string;
      };
      qualityMetrics: Array<{
        name: string;
        weight: number;
        target: number;
      }>;
    }>(),

    // Context analysis rules
    contextAnalysisRules: jsonb('context_analysis_rules').$type<
      Array<{
        trigger: string;
        analysis: string;
        outputVariable: string;
        fallback?: string;
      }>
    >(),

    // Inference rules
    inferenceRules: jsonb('inference_rules').$type<
      Array<{
        condition: string;
        inference: string;
        outputVariable: string;
        confidence: number;
      }>
    >(),

    // Cultural adaptations
    culturalAdaptations: jsonb('cultural_adaptations').$type<
      Array<{
        culturalContext: string[];
        adaptations: Record<string, string>;
        restrictions?: string[];
      }>
    >(),

    // LLM compatibility
    llmCompatibility: jsonb('llm_compatibility').$type<
      Array<{
        provider: string;
        models: string[];
        optimizations?: Record<string, unknown>;
      }>
    >(),

    // Template metadata
    metadata: jsonb('metadata').$type<{
      author: string;
      version: string;
      lastModified: string;
      usageCount: number;
      averageRating: number;
      complexity: 'simple' | 'moderate' | 'complex';
    }>(),

    // Template status
    isActive: boolean('is_active').notNull().default(true),
    visibility: varchar('visibility', { length: 20 }).notNull().default(CONTENT_VISIBILITY.PERSONAL),
    createdBy: varchar('created_by', { length: 255 }).notNull(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('content_templates_content_type_idx').on(table.contentType),
    index('content_templates_category_idx').on(table.category),
    index('content_templates_is_active_idx').on(table.isActive),
    index('content_templates_created_by_idx').on(table.createdBy),
  ]
);

// NOTE: aic_content_workflows table was dropped Jan 2026 - never used

// =============================================================================
// CONTENT FEEDBACK
// =============================================================================

export const contentFeedback = pgTable(
  'aic_content_feedback',
  {
    id: varchar('id', { length: 255 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    resultId: varchar('result_id', { length: 255 })
      .references(() => contentResults.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id').notNull(),
    // Feedback scores
    overallRating: integer('overall_rating').notNull(), // 1-5 scale
    qualityRating: integer('quality_rating'),
    relevanceRating: integer('relevance_rating'),
    creativityRating: integer('creativity_rating'),
    usefulnessRating: integer('usefulness_rating'),

    // Feedback details
    feedback: text('feedback'),
    improvements: text('improvements').array(),

    // Feedback metadata
    metadata: jsonb('metadata').$type<{
      feedbackType: 'manual' | 'automated';
      source: string;
      context?: string;
    }>(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('content_feedback_result_id_idx').on(table.resultId),
    index('content_feedback_user_id_idx').on(table.userId),
    index('content_feedback_overall_rating_idx').on(table.overallRating),
    index('idx_aic_content_feedback_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// =============================================================================
// CONTENT ANALYTICS
// =============================================================================

export const contentAnalytics = pgTable(
  'aic_content_analytics',
  {
    id: varchar('id', { length: 255 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Event identification: 'generation_started', 'generation_completed', 'content_viewed', etc.
    eventType: varchar('event_type', { length: 50 }).notNull(),
    // 'request', 'result', 'template'
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: varchar('entity_id', { length: 255 }).notNull(),

    // User context
    userId: varchar('user_id', { length: 255 }),
    sessionId: varchar('session_id', { length: 255 }),

    // Event data
    eventData: jsonb('event_data').$type<{
      duration?: number;
      success?: boolean;
      errorCode?: string;
      provider?: string;
      model?: string;
      contentType?: string;
      cost?: number;
      tokensUsed?: number;
      qualityScore?: number;
      userAgent?: string;
      referrer?: string;
    }>(),

    // Metrics
    metrics: jsonb('metrics').$type<Record<string, number>>(),

    // Timestamp
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('content_analytics_event_type_idx').on(table.eventType),
    index('content_analytics_entity_type_idx').on(table.entityType),
    index('content_analytics_entity_id_idx').on(table.entityId),
    index('content_analytics_user_id_idx').on(table.userId),
    index('content_analytics_timestamp_idx').on(table.timestamp),
    index('idx_aic_content_analytics_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// =============================================================================
// TIER CONFIGURATIONS
// Centralized, data-driven tier configuration for features and limits
// =============================================================================

export interface TierLimitsConfig {
  songsPerMonth: number;
  lyricsPerMonth: number;
  insightsPerMonth: number;
  booksPerMonth: number;
}

export interface TierFeaturesConfig {
  canGenerateMusic: boolean;
  canGenerateBooks: boolean;
  maxBookDepth: 'brief' | 'standard' | 'deep' | null;
  canAccessLibrary: boolean;
  canAccessActivityCalendar: boolean;
  canAccessMentorLine: boolean;
  canAccessInsightsReports: boolean;
}

export interface TierUiConfig {
  badgeColor?: string;
  sortOrder?: number;
}

export interface TierCreditCosts {
  songGeneration: number;
  lyricsGeneration: number;
  insightGeneration: number;
  bookGeneration: number;
}

export interface TierGenerationSettings {
  parallelTrackLimit: number;
  staggerDelayMs: number;
  maxQuality: 'draft' | 'standard' | 'premium' | 'studio';
  priorityBoost: number;
}

export interface TierConfigJson {
  displayName: string;
  entitlementId: string | null;
  price: string | null;
  limits: TierLimitsConfig;
  features: TierFeaturesConfig;
  creditCosts?: TierCreditCosts;
  generationSettings?: TierGenerationSettings;
  ui?: TierUiConfig;
}

export const tierConfigs = pgTable(
  'aic_tier_configs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tier: varchar('tier', { length: 50 }).notNull().unique(),
    config: jsonb('config').$type<TierConfigJson>().notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('aic_tier_configs_tier_idx').on(table.tier),
    index('aic_tier_configs_is_active_idx').on(table.isActive),
  ]
);

// =============================================================================
// DRIZZLE SCHEMA EXPORTS
// =============================================================================

export const contentSchema = {
  contentRequests,
  contentResults,
  promptTemplates,
  contentFeedback,
  contentAnalytics,
  tierConfigs,
};

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

// Content Request Schemas
export const insertContentRequestSchema = createInsertSchema(contentRequests);
export const selectContentRequestSchema = createSelectSchema(contentRequests);
export type InsertContentRequest = z.infer<typeof insertContentRequestSchema>;
export type SelectContentRequest = z.infer<typeof selectContentRequestSchema>;

// Content Result Schemas
export const insertContentResultSchema = createInsertSchema(contentResults);
export const selectContentResultSchema = createSelectSchema(contentResults);
export type InsertContentResult = z.infer<typeof insertContentResultSchema>;
export type SelectContentResult = z.infer<typeof selectContentResultSchema>;

// Prompt Template Schemas
export const insertPromptTemplateSchema = createInsertSchema(promptTemplates);
export const selectPromptTemplateSchema = createSelectSchema(promptTemplates);
export type InsertPromptTemplate = z.infer<typeof insertPromptTemplateSchema>;
export type SelectPromptTemplate = z.infer<typeof selectPromptTemplateSchema>;

export const contentTemplates = promptTemplates;
export const insertContentTemplateSchema = insertPromptTemplateSchema;
export const selectContentTemplateSchema = selectPromptTemplateSchema;
export type InsertContentTemplate = InsertPromptTemplate;
export type SelectContentTemplate = SelectPromptTemplate;

// Content Feedback Schemas
export const insertContentFeedbackSchema = createInsertSchema(contentFeedback);
export const selectContentFeedbackSchema = createSelectSchema(contentFeedback);
export type InsertContentFeedback = z.infer<typeof insertContentFeedbackSchema>;
export type SelectContentFeedback = z.infer<typeof selectContentFeedbackSchema>;

// Content Analytics Schemas
export const insertContentAnalyticsSchema = createInsertSchema(contentAnalytics);
export const selectContentAnalyticsSchema = createSelectSchema(contentAnalytics);
export type InsertContentAnalytics = z.infer<typeof insertContentAnalyticsSchema>;
export type SelectContentAnalytics = z.infer<typeof selectContentAnalyticsSchema>;

// Tier Config Schemas
export const tierCreditCostsSchema = z.object({
  songGeneration: z.number(),
  lyricsGeneration: z.number(),
  insightGeneration: z.number(),
  bookGeneration: z.number(),
});

export const tierGenerationSettingsSchema = z.object({
  parallelTrackLimit: z.number(),
  staggerDelayMs: z.number(),
  maxQuality: z.enum(['draft', 'standard', 'premium', 'studio']),
  priorityBoost: z.number(),
});

export const tierConfigJsonSchema = z.object({
  displayName: z.string(),
  entitlementId: z.string().nullable(),
  price: z.string().nullable(),
  limits: z.object({
    songsPerMonth: z.number(),
    lyricsPerMonth: z.number(),
    insightsPerMonth: z.number(),
    booksPerMonth: z.number(),
  }),
  features: z.object({
    canGenerateMusic: z.boolean(),
    canGenerateBooks: z.boolean(),
    maxBookDepth: z.enum(['brief', 'standard', 'deep']).nullable(),
    canAccessLibrary: z.boolean(),
    canAccessActivityCalendar: z.boolean(),
    canAccessMentorLine: z.boolean(),
    canAccessInsightsReports: z.boolean(),
  }),
  creditCosts: tierCreditCostsSchema.optional(),
  generationSettings: tierGenerationSettingsSchema.optional(),
  ui: z
    .object({
      badgeColor: z.string().optional(),
      sortOrder: z.number().optional(),
    })
    .optional(),
});

export const insertTierConfigSchema = createInsertSchema(tierConfigs, {
  config: tierConfigJsonSchema,
});
export const selectTierConfigSchema = createSelectSchema(tierConfigs);
export type InsertTierConfig = z.infer<typeof insertTierConfigSchema>;
export type SelectTierConfig = z.infer<typeof selectTierConfigSchema>;

// =============================================================================
// RELATIONS (Optional - for query building)
// =============================================================================

// Note: Relations can be added here for Drizzle's query builder
// Example:
// export const contentRequestsRelations = relations(contentRequests, ({ many }) => ({
//   results: many(contentResults),
//   (contentWorkflows was dropped Jan 2026)
// }));
