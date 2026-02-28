import { z } from 'zod';
import { ApiResponseSchema, UUIDSchema, DateStringSchema } from './base';

export const ProviderConfigSchema = z.object({
  id: UUIDSchema,
  providerId: z.string(),
  providerName: z.string(),
  providerType: z.string(),
  description: z.string().optional().nullable(),
  configuration: z.record(z.unknown()).optional(),
  isActive: z.boolean(),
  isPrimary: z.boolean().optional(),
  priority: z.number().optional(),
  costPerUnit: z.number().optional().nullable(),
  creditCost: z.number().optional().nullable(),
  healthStatus: z.string().optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const PsychologicalFrameworkSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  shortName: z.string(),
  category: z.string(),
  description: z.string(),
  keyPrinciples: z.array(z.string()).optional(),
  therapeuticGoals: z.array(z.string()).optional(),
  triggerPatterns: z.array(z.string()).optional(),
  songStructureHint: z.string().optional().nullable(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const AppConfigSchema = z.object({
  features: z.record(z.boolean()).optional(),
  limits: z.record(z.number()).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const HealthCheckSchema = z.object({
  status: z.string(),
  timestamp: z.string().optional(),
  version: z.string().optional(),
  services: z
    .record(
      z.object({
        status: z.string(),
        latency: z.number().optional(),
      })
    )
    .optional(),
});

export const HealthResponseSchema = z
  .object({
    success: z.literal(true),
    data: HealthCheckSchema.optional(),
  })
  .or(HealthCheckSchema);

export const ListFrameworksResponseSchema = ApiResponseSchema(z.array(PsychologicalFrameworkSchema));
export const AppConfigResponseSchema = ApiResponseSchema(AppConfigSchema);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type PsychologicalFramework = z.infer<typeof PsychologicalFrameworkSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
