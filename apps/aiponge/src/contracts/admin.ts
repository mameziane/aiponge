import { z } from 'zod';
import { UUIDSchema, DateStringSchema } from './base';

export const RiskStatsSchema = z.object({
  totalFlagged: z.number(),
  highRisk: z.number(),
  mediumRisk: z.number(),
  lowRisk: z.number(),
  resolved: z.number(),
  pending: z.number(),
});

export const RiskStatsResponseSchema = z.object({
  success: z.literal(true),
  data: RiskStatsSchema,
});

export const RiskFlagSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  entryId: UUIDSchema.optional().nullable(),
  riskLevel: z.string(),
  riskType: z.string(),
  description: z.string().optional().nullable(),
  resolved: z.boolean(),
  resolvedAt: DateStringSchema.optional().nullable(),
  resolvedBy: UUIDSchema.optional().nullable(),
  createdAt: DateStringSchema.optional(),
});

export const RiskFlagsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(RiskFlagSchema),
});

export const ComplianceStatsSchema = z.object({
  totalUsers: z.number(),
  consentGiven: z.number(),
  dataExportRequests: z.number(),
  deletionRequests: z.number(),
  pendingRequests: z.number(),
});

export const ComplianceStatsResponseSchema = z.object({
  success: z.literal(true),
  data: ComplianceStatsSchema,
});

export const MonitoringConfigSchema = z.object({
  enabled: z.boolean(),
  alertThreshold: z.number().optional(),
  notifyEmail: z.string().optional().nullable(),
  checkInterval: z.number().optional(),
});

export const MonitoringConfigResponseSchema = z.object({
  success: z.literal(true),
  data: MonitoringConfigSchema,
});

export const MusicApiCreditsSchema = z.object({
  available: z.number(),
  used: z.number(),
  total: z.number(),
  lastRefreshed: DateStringSchema.optional(),
});

export const MusicApiCreditsResponseSchema = z.object({
  success: z.literal(true),
  data: MusicApiCreditsSchema,
});

export const AIPromptTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().optional(),
  variables: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const TemplatesListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(AIPromptTemplateSchema),
});

export const TemplateResponseSchema = z.object({
  success: z.literal(true),
  data: AIPromptTemplateSchema,
});

export const TemplateCategoriesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.string()),
});

export const ProviderConfigurationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  enabled: z.boolean(),
  priority: z.number().optional(),
  config: z.record(z.unknown()).optional(),
});

export const ProviderConfigResponseSchema = z.object({
  success: z.literal(true),
  data: ProviderConfigurationSchema,
});

export const ProviderHealthCheckResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    success: z.boolean(),
    latencyMs: z.number(),
    error: z.string().optional(),
  }),
});

export const DevResetResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export const TestOpenAICreditsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    working: z.boolean(),
    creditsUsed: z.number().optional(),
    response: z.string().optional(),
    error: z.string().optional(),
  }),
});

export type RiskStats = z.infer<typeof RiskStatsSchema>;
export type RiskFlag = z.infer<typeof RiskFlagSchema>;
export type ComplianceStats = z.infer<typeof ComplianceStatsSchema>;
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;
export type MusicApiCredits = z.infer<typeof MusicApiCreditsSchema>;
export type AIPromptTemplate = z.infer<typeof AIPromptTemplateSchema>;
export type ProviderConfiguration = z.infer<typeof ProviderConfigurationSchema>;
