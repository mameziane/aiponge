/**
 * Templates Domain Contracts
 *
 * Shared types for template operations across services:
 * - ai-config-service (owner)
 * - ai-content-service (consumer)
 * - ai-analytics-service (consumer)
 * - music-service (consumer)
 */

import { z } from 'zod';

export const TemplateContentTypeSchema = z.enum([
  'therapeutic',
  'creative',
  'analysis',
  'music',
  'system',
  'insight',
  'reflection',
]);
export type TemplateContentType = z.infer<typeof TemplateContentTypeSchema>;

export const TemplateVariableSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string().optional(),
  required: z.boolean().default(true),
  defaultValue: z.unknown().optional(),
});
export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;

export const TemplateMetadataSchema = z.object({
  author: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  language: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type TemplateMetadata = z.infer<typeof TemplateMetadataSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  content: z.string(),
  contentType: TemplateContentTypeSchema,
  variables: z.array(TemplateVariableSchema).optional(),
  metadata: TemplateMetadataSchema.optional(),
  isActive: z.boolean().default(true),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});
export type Template = z.infer<typeof TemplateSchema>;

export const TemplateExecutionRequestSchema = z.object({
  templateId: z.string(),
  contentType: TemplateContentTypeSchema.optional(),
  variables: z.record(z.unknown()),
  options: z
    .object({
      userId: z.string().optional(),
      maxLength: z.number().optional(),
      temperature: z.number().optional(),
      fallbackToDefault: z.boolean().optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
    })
    .optional(),
});
export type TemplateExecutionRequest = z.infer<typeof TemplateExecutionRequestSchema>;

export const TemplateExecutionResponseSchema = z.object({
  success: z.boolean(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  processingTimeMs: z.number().optional(),
  templateId: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type TemplateExecutionResponse = z.infer<typeof TemplateExecutionResponseSchema>;

export const CreateTemplateRequestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  content: z.string(),
  contentType: TemplateContentTypeSchema,
  variables: z.array(TemplateVariableSchema).optional(),
  metadata: TemplateMetadataSchema.optional(),
});
export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequestSchema>;

export const UpdateTemplateRequestSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  contentType: TemplateContentTypeSchema.optional(),
  variables: z.array(TemplateVariableSchema).optional(),
  metadata: TemplateMetadataSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTemplateRequest = z.infer<typeof UpdateTemplateRequestSchema>;

export const TemplateSearchFiltersSchema = z.object({
  contentType: TemplateContentTypeSchema.optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});
export type TemplateSearchFilters = z.infer<typeof TemplateSearchFiltersSchema>;

export const TemplateListResponseSchema = z.object({
  templates: z.array(TemplateSchema),
  total: z.number(),
  hasMore: z.boolean(),
});
export type TemplateListResponse = z.infer<typeof TemplateListResponseSchema>;

export const MusicTemplateExecutionRequestSchema = TemplateExecutionRequestSchema.extend({
  musicVariables: z
    .object({
      entry: z.string().optional(),
      mood: z.string().optional(),
      genre: z.string().optional(),
      style: z.string().optional(),
      tempo: z.string().optional(),
      language: z.string().optional(),
    })
    .optional(),
});
export type MusicTemplateExecutionRequest = z.infer<typeof MusicTemplateExecutionRequestSchema>;

export const MusicTemplateExecutionResultSchema = TemplateExecutionResponseSchema.extend({
  lyrics: z.string().optional(),
  musicPrompt: z.string().optional(),
  artworkPrompt: z.string().optional(),
});
export type MusicTemplateExecutionResult = z.infer<typeof MusicTemplateExecutionResultSchema>;
