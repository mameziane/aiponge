/**
 * AI Providers Domain Contracts
 *
 * Shared types for AI provider operations across services.
 * NOTE: Only includes types that are consistent across all services.
 * Service-specific request/response shapes remain in each service.
 */

import { z } from 'zod';

export const ProviderStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy']);
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const ProviderOperationSchema = z.enum([
  'text_generation',
  'text_completion',
  'text_analysis',
  'image_generation',
  'music_generation',
]);
export type ProviderOperation = z.infer<typeof ProviderOperationSchema>;

export const ProviderCategorySchema = z.enum(['llm-text', 'llm-image', 'music']);
export type ProviderCategory = z.infer<typeof ProviderCategorySchema>;

export const ProviderCapabilitiesSchema = z.object({
  operations: z.array(ProviderOperationSchema),
  models: z.array(z.string()),
  maxTokens: z.number().optional(),
  supportsBatching: z.boolean().optional(),
  supportsStreaming: z.boolean().optional(),
});
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

export const ProviderMetadataSchema = z
  .object({
    processingTimeMs: z.coerce.number(),
    tokensUsed: z.coerce.number().optional(),
    cost: z.coerce.number().optional(),
  })
  .passthrough();
export type ProviderMetadata = z.infer<typeof ProviderMetadataSchema>;

// =============================================================================
// PROVIDER INPUT VALIDATION SCHEMAS
// =============================================================================

export const InvokeProviderOperationSchema = z.enum([
  'text_generation',
  'text_analysis',
  'music_generation',
  'image_generation',
  'audio_transcription',
]);
export type InvokeProviderOperation = z.infer<typeof InvokeProviderOperationSchema>;

export const InvokeProviderRequestSchema = z.object({
  providerId: z.string().optional(),
  operation: InvokeProviderOperationSchema,
  payload: z.record(z.unknown()),
  options: z
    .object({
      model: z.string().optional(),
      timeout: z.number().positive().optional(),
      fallbackProviders: z.array(z.string()).optional(),
      priority: z.enum(['speed', 'quality', 'cost']).optional(),
      responseFormat: z.enum(['json', 'text']).optional(),
      response_format: z.record(z.unknown()).optional(),
    })
    .optional(),
});
export type InvokeProviderRequest = z.infer<typeof InvokeProviderRequestSchema>;

export const SelectProviderRequestSchema = z.object({
  operation: InvokeProviderOperationSchema,
  requirements: z
    .object({
      minSuccessRate: z.number().min(0).max(1).optional(),
      maxLatencyMs: z.number().positive().optional(),
      costPreference: z.enum(['lowest', 'balanced', 'highest_quality']).optional(),
      requiredCapabilities: z.array(z.string()).optional(),
    })
    .optional(),
});
export type SelectProviderRequest = z.infer<typeof SelectProviderRequestSchema>;

export const TestProviderRequestSchema = z.object({
  providerId: z.string(),
  testPayload: z.record(z.any()).optional(),
});
export type TestProviderRequest = z.infer<typeof TestProviderRequestSchema>;

export const ProviderHealthQuerySchema = z.object({
  providerId: z.string().optional(),
  providerType: z.string().optional(),
  includeMetrics: z.boolean().optional().default(false),
});
export type ProviderHealthQuery = z.infer<typeof ProviderHealthQuerySchema>;

export const UsageStatisticsQuerySchema = z.object({
  timeRangeMinutes: z.number().positive().optional().default(60),
  groupBy: z.enum(['provider', 'operation', 'hour']).optional().default('provider'),
});
export type UsageStatisticsQuery = z.infer<typeof UsageStatisticsQuerySchema>;

export const ProviderCatalogQuerySchema = z.object({
  type: ProviderCategorySchema.optional(),
});
export type ProviderCatalogQuery = z.infer<typeof ProviderCatalogQuerySchema>;

export const LoadBalancingConfigSchema = z.object({
  type: z.enum(['round_robin', 'weighted', 'least_connections', 'health_based', 'cost_optimized']),
  config: z.record(z.unknown()).optional(),
});
export type LoadBalancingConfig = z.infer<typeof LoadBalancingConfigSchema>;

export const GenerateMusicProviderSchema = z.object({
  prompt: z.string().min(1),
  parameters: z.record(z.unknown()),
  options: z
    .object({
      timeout: z.number().positive().optional(),
      retries: z.number().min(0).max(3).optional(),
    })
    .optional(),
});
export type GenerateMusicProviderInput = z.infer<typeof GenerateMusicProviderSchema>;
