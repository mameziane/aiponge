/**
 * TierConfigClient — Code-only tier configuration
 *
 * All tier configuration now comes from the canonical code constants
 * in @aiponge/shared-contracts subscription-tiers.ts.
 * No DB, no HTTP, no caching — just thin wrappers around the shared helpers.
 */
import {
  SUBSCRIPTION_TIERS,
  normalizeTier,
  getTierFeatures as getCodeTierFeatures,
  getTierLimits as getCodeTierLimits,
  canGenerateBookAtDepth as codeCanGenerateBookAtDepth,
  getMaxBookDepth as codeGetMaxBookDepth,
  hasTierFeature as codeHasTierFeature,
  hasReachedLimit as codeHasReachedLimit,
  getTierCreditCosts as codeGetTierCreditCosts,
  getCreditCost as codeGetCreditCost,
  getGenerationSettings as codeGetGenerationSettings,
  type SubscriptionTierLimits,
  type SubscriptionTierFeatures,
  type TierCreditCosts,
  type TierGenerationSettings,
} from '@aiponge/shared-contracts';

export type { TierCreditCosts, TierGenerationSettings };

/**
 * Backward-compatible shape returned by getConfig / getConfigSync.
 */
export interface TierConfigJson {
  displayName: string;
  entitlementId: string | null;
  price: string | null;
  limits: SubscriptionTierLimits;
  features: SubscriptionTierFeatures;
  creditCosts?: TierCreditCosts;
  generationSettings?: TierGenerationSettings;
  ui?: { badgeColor?: string; sortOrder?: number };
}

function buildTierConfigJson(tier: string): TierConfigJson {
  const normalized = normalizeTier(tier);
  const config = SUBSCRIPTION_TIERS[normalized];
  return {
    displayName: config.name,
    entitlementId: config.entitlementId,
    price: config.price,
    limits: config.limits,
    features: config.features,
    creditCosts: config.creditCosts,
    generationSettings: config.generationSettings,
    ui: { sortOrder: Object.keys(SUBSCRIPTION_TIERS).indexOf(normalized) },
  };
}

export class TierConfigClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_options?: { useRemote?: boolean }) {
    // No-op: all config is code-based
  }

  // ---------------------------------------------------------------------------
  // Async methods (kept for API compatibility — resolve instantly)
  // ---------------------------------------------------------------------------

  async getConfig(tier: string): Promise<TierConfigJson> {
    return Promise.resolve(buildTierConfigJson(tier));
  }

  async getFeatures(tier: string): Promise<SubscriptionTierFeatures> {
    return Promise.resolve(getCodeTierFeatures(tier));
  }

  async getLimits(tier: string): Promise<SubscriptionTierLimits> {
    return Promise.resolve(getCodeTierLimits(tier));
  }

  async hasFeature(
    tier: string,
    feature: Exclude<keyof SubscriptionTierFeatures, 'maxBookDepth' | 'songBranding'>
  ): Promise<boolean> {
    return Promise.resolve(codeHasTierFeature(tier, feature));
  }

  async getMaxBookDepth(tier: string): Promise<'brief' | 'standard' | 'deep' | null> {
    return Promise.resolve(codeGetMaxBookDepth(tier));
  }

  async canGenerateBookAtDepth(tier: string, requestedDepth: 'brief' | 'standard' | 'deep'): Promise<boolean> {
    return Promise.resolve(codeCanGenerateBookAtDepth(tier, requestedDepth));
  }

  async hasReachedLimit(
    tier: string,
    action: 'songs' | 'lyrics' | 'insights' | 'books',
    currentUsage: number
  ): Promise<boolean> {
    return Promise.resolve(codeHasReachedLimit(tier, action, currentUsage));
  }

  async getCreditCosts(tier: string): Promise<TierCreditCosts> {
    return Promise.resolve(codeGetTierCreditCosts(tier));
  }

  async getCreditCost(tier: string, action: 'songs' | 'lyrics' | 'insights' | 'books'): Promise<number> {
    return Promise.resolve(codeGetCreditCost(tier, action));
  }

  async getGenerationSettings(tier: string): Promise<TierGenerationSettings> {
    return Promise.resolve(codeGetGenerationSettings(tier));
  }

  async getParallelTrackLimit(tier: string): Promise<number> {
    return Promise.resolve(codeGetGenerationSettings(tier).parallelTrackLimit);
  }

  async getStaggerDelayMs(tier: string): Promise<number> {
    return Promise.resolve(codeGetGenerationSettings(tier).staggerDelayMs);
  }

  async getMaxQuality(tier: string): Promise<'draft' | 'standard' | 'premium' | 'studio'> {
    return Promise.resolve(codeGetGenerationSettings(tier).maxQuality);
  }

  invalidateCache(_tier?: string): void {
    // No-op: no cache to invalidate
  }

  // ---------------------------------------------------------------------------
  // Static sync methods
  // ---------------------------------------------------------------------------

  static getConfigSync(tier: string): TierConfigJson {
    return buildTierConfigJson(tier);
  }

  static getFeaturesSync(tier: string): SubscriptionTierFeatures {
    return getCodeTierFeatures(tier);
  }

  static getLimitsSync(tier: string): SubscriptionTierLimits {
    return getCodeTierLimits(tier);
  }

  static hasFeatureSync(
    tier: string,
    feature: Exclude<keyof SubscriptionTierFeatures, 'maxBookDepth' | 'songBranding'>
  ): boolean {
    return codeHasTierFeature(tier, feature);
  }

  static getMaxBookDepthSync(tier: string): 'brief' | 'standard' | 'deep' | null {
    return codeGetMaxBookDepth(tier);
  }

  static canGenerateBookAtDepthSync(tier: string, requestedDepth: 'brief' | 'standard' | 'deep'): boolean {
    return codeCanGenerateBookAtDepth(tier, requestedDepth);
  }

  static hasReachedLimitSync(
    tier: string,
    action: 'songs' | 'lyrics' | 'insights' | 'books',
    currentUsage: number
  ): boolean {
    return codeHasReachedLimit(tier, action, currentUsage);
  }

  static getCreditCostsSync(tier: string): TierCreditCosts {
    return codeGetTierCreditCosts(tier);
  }

  static getCreditCostSync(tier: string, action: 'songs' | 'lyrics' | 'insights' | 'books'): number {
    return codeGetCreditCost(tier, action);
  }

  static getGenerationSettingsSync(tier: string): TierGenerationSettings {
    return codeGetGenerationSettings(tier);
  }

  static getParallelTrackLimitSync(tier: string): number {
    return codeGetGenerationSettings(tier).parallelTrackLimit;
  }

  static getStaggerDelayMsSync(tier: string): number {
    return codeGetGenerationSettings(tier).staggerDelayMs;
  }

  static getMaxQualitySync(tier: string): 'draft' | 'standard' | 'premium' | 'studio' {
    return codeGetGenerationSettings(tier).maxQuality;
  }
}

export const tierConfigClient = new TierConfigClient();
