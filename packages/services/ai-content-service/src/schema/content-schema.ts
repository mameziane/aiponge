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

// Re-export orchestration session schema for consolidated access
export { orchestrationSessions } from './orchestration-session-schema';
export type { InsertOrchestrationSession, SelectOrchestrationSession } from './orchestration-session-schema';

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
// DRIZZLE SCHEMA EXPORTS
// =============================================================================

export const contentSchema = {
  contentRequests,
  contentResults,
  promptTemplates,
  contentFeedback,
  contentAnalytics,
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

// =============================================================================
// RELATIONS (Optional - for query building)
// =============================================================================

// Note: Relations can be added here for Drizzle's query builder
// Example:
// export const contentRequestsRelations = relations(contentRequests, ({ many }) => ({
//   results: many(contentResults),
//   (contentWorkflows was dropped Jan 2026)
// }));
