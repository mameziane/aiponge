import { z } from 'zod';

export const MusicGenerationVariationSchema = z.object({
  audioUrl: z.string(),
  variationNumber: z.number(),
  clipId: z.string().optional(),
});

export const MusicGenerationResponseSchema = z.object({
  success: z.boolean(),
  data: z.record(z.unknown()).optional(),
  error: z.union([
    z.string(),
    z.object({ type: z.string().optional(), message: z.string().optional() }),
  ]).optional(),
  audioUrl: z.string().optional(),
  variations: z.array(MusicGenerationVariationSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
  lyrics: z.string().optional(),
  providerId: z.string().optional(),
  model: z.string().optional(),
  cost: z.number().optional(),
  processingTimeMs: z.number().optional(),
  enhancedPrompt: z.string().optional(),
});
export type MusicGenerationResponse = z.infer<typeof MusicGenerationResponseSchema>;

export const MusicGenerationSuccessDataSchema = z.object({
  audioUrl: z.string().optional(),
  variations: z.array(MusicGenerationVariationSchema).optional(),
  lyrics: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  providerId: z.string().optional(),
  model: z.string().optional(),
  cost: z.number().optional(),
  processingTimeMs: z.number().optional(),
  enhancedPrompt: z.string().optional(),
});
export type MusicGenerationSuccessData = z.infer<typeof MusicGenerationSuccessDataSchema>;

export const ProviderConfigurationDataSchema = z.object({
  configuration: z.object({
    creditCost: z.number().optional(),
  }).passthrough().optional(),
  providerId: z.string().optional(),
  providerName: z.string().optional(),
  providerType: z.string().optional(),
});
export type ProviderConfigurationData = z.infer<typeof ProviderConfigurationDataSchema>;

export const ProviderConfigurationResponseSchema = z.object({
  success: z.boolean().optional(),
  data: ProviderConfigurationDataSchema.optional(),
  configuration: z.object({
    creditCost: z.number().optional(),
  }).passthrough().optional(),
});
export type ProviderConfigurationResponse = z.infer<typeof ProviderConfigurationResponseSchema>;

export const ImageGenerationResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    artworkUrl: z.string().optional(),
    revisedPrompt: z.string().optional(),
    templateUsed: z.string().optional(),
  }).optional(),
  metadata: z.object({
    processingTimeMs: z.number().optional(),
    imageType: z.string().optional(),
  }).passthrough().optional(),
  error: z.string().optional(),
  timestamp: z.string().optional(),
});
export type ImageGenerationResponse = z.infer<typeof ImageGenerationResponseSchema>;

export const StorageUploadResponseSchema = z.object({
  success: z.boolean(),
  fileId: z.string().optional(),
  uploadUrl: z.string().optional(),
  publicUrl: z.string().optional(),
  cdnUrl: z.string().optional(),
  error: z.string().optional(),
});
export type StorageUploadResponse = z.infer<typeof StorageUploadResponseSchema>;

export const StorageDownloadExternalResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    filePath: z.string().optional(),
    localPath: z.string().optional(),
    size: z.number().optional(),
    format: z.string().optional(),
    fileId: z.string().optional(),
  }).optional(),
  filePath: z.string().optional(),
  error: z.string().optional(),
});
export type StorageDownloadExternalResponse = z.infer<typeof StorageDownloadExternalResponseSchema>;

export const QuotaCheckResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    allowed: z.boolean(),
    reason: z.string().optional(),
    code: z.string().optional(),
    subscription: z.object({
      tier: z.string(),
      isPaidTier: z.boolean(),
      usage: z.object({
        current: z.number(),
        limit: z.number(),
        remaining: z.number(),
      }),
      resetAt: z.string().optional(),
    }).optional(),
    credits: z.object({
      currentBalance: z.number(),
      required: z.number(),
      hasCredits: z.boolean(),
      shortfall: z.number().optional(),
    }).optional(),
    shouldUpgrade: z.boolean().optional(),
    upgradeMessage: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
});
export type QuotaCheckResponse = z.infer<typeof QuotaCheckResponseSchema>;
