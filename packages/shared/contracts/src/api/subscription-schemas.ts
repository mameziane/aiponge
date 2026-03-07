import { z } from 'zod';
import type { ServiceResponse } from '../common/index.js';

export const UsageLimitsSchema = z.object({
  userId: z.string(),
  tier: z.string(),
  limits: z
    .object({
      songsPerDay: z.number().optional(),
      songsPerMonth: z.number().optional(),
      insightsPerDay: z.number().optional(),
    })
    .optional(),
  usage: z
    .object({
      songsToday: z.number().optional(),
      songsThisMonth: z.number().optional(),
      insightsToday: z.number().optional(),
    })
    .optional(),
  canGenerate: z.boolean().optional(),
});
export type UsageLimits = z.infer<typeof UsageLimitsSchema>;

export type UsageLimitsResponse = ServiceResponse<UsageLimits>;

export const SubscriptionTierFeaturesResponseSchema = z.object({
  canGenerateMusic: z.boolean(),
  canGenerateBooks: z.boolean(),
  maxBookDepth: z.enum(['brief', 'standard', 'deep']).nullable(),
  canAccessLibrary: z.boolean(),
  canAccessActivityCalendar: z.boolean(),
  canAccessMentorLine: z.boolean(),
  canAccessInsightsReports: z.boolean(),
  canSelectFramework: z.boolean(),
  canSelectMusicStyle: z.boolean(),
  canShareSongs: z.boolean(),
  canAccessJournal: z.boolean(),
  canDownloadSongs: z.boolean().optional(),
  canAccessWellness: z.boolean().optional(),
  canCreateCustomBooks: z.boolean().optional(),
  canSwitchTiers: z.boolean().optional(),
  hasPrioritySupport: z.boolean().optional(),
  canShareWithClients: z.boolean().optional(),
  canViewClientReflections: z.boolean().optional(),
  canViewClientEngagement: z.boolean().optional(),
  canBatchGenerate: z.boolean().optional(),
  canWhiteLabel: z.boolean().optional(),
  canAccessAPI: z.boolean().optional(),
  songBranding: z.enum(['aiponge', 'custom']).nullable().optional(),
});
export type SubscriptionTierFeaturesResponse = z.infer<typeof SubscriptionTierFeaturesResponseSchema>;

export const SubscriptionTierLimitsResponseSchema = z.object({
  songsPerMonth: z.number(),
  lyricsPerMonth: z.number(),
  insightsPerMonth: z.number(),
  booksPerMonth: z.number(),
});
export type SubscriptionTierLimitsResponse = z.infer<typeof SubscriptionTierLimitsResponseSchema>;

export const SubscriptionTierConfigResponseSchema = z.object({
  name: z.string(),
  entitlementId: z.string().nullable(),
  price: z.string().nullable(),
  limits: SubscriptionTierLimitsResponseSchema,
  features: SubscriptionTierFeaturesResponseSchema,
});
export type SubscriptionTierConfigResponse = z.infer<typeof SubscriptionTierConfigResponseSchema>;

export const SubscriptionConfigResponseSchema = z.object({
  tiers: z.record(z.string(), SubscriptionTierConfigResponseSchema),
  creditCostPerSong: z.number(),
  defaultTier: z.string(),
});
export type SubscriptionConfigResponse = z.infer<typeof SubscriptionConfigResponseSchema>;
