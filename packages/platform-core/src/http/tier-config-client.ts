import { ServiceLocator } from '../service-locator';
import { HttpClient } from './http-client';
import { createLogger } from '../logging';
import {
  SUBSCRIPTION_TIERS,
  TIER_IDS,
  normalizeTier,
  getTierFeatures as getCodeTierFeatures,
  getTierLimits as getCodeTierLimits,
  canGenerateBookAtDepth as codeCanGenerateBookAtDepth,
  getMaxBookDepth as codeGetMaxBookDepth,
  hasTierFeature as codeHasTierFeature,
  hasReachedLimit as codeHasReachedLimit,
  type SubscriptionTierLimits,
  type SubscriptionTierFeatures,
} from '@aiponge/shared-contracts';

const logger = createLogger('tier-config-client');

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

interface TierConfigJson {
  displayName: string;
  entitlementId: string | null;
  price: string | null;
  limits: SubscriptionTierLimits;
  features: SubscriptionTierFeatures;
  creditCosts?: TierCreditCosts;
  generationSettings?: TierGenerationSettings;
  ui?: { badgeColor?: string; sortOrder?: number };
}

const DEFAULT_CREDIT_COSTS: Record<string, TierCreditCosts> = {
  [TIER_IDS.GUEST]: { songGeneration: 20, lyricsGeneration: 0, insightGeneration: 0, bookGeneration: 0 },
  [TIER_IDS.PERSONAL]: { songGeneration: 15, lyricsGeneration: 0, insightGeneration: 0, bookGeneration: 10 },
  [TIER_IDS.PRACTICE]: { songGeneration: 10, lyricsGeneration: 0, insightGeneration: 0, bookGeneration: 5 },
};

const DEFAULT_GENERATION_SETTINGS: Record<string, TierGenerationSettings> = {
  [TIER_IDS.GUEST]: { parallelTrackLimit: 1, staggerDelayMs: 5000, maxQuality: 'draft', priorityBoost: 0 },
  [TIER_IDS.PERSONAL]: { parallelTrackLimit: 2, staggerDelayMs: 4000, maxQuality: 'standard', priorityBoost: 1 },
  [TIER_IDS.PRACTICE]: { parallelTrackLimit: 3, staggerDelayMs: 3500, maxQuality: 'premium', priorityBoost: 2 },
};

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedConfig {
  config: TierConfigJson;
  loadedAt: number;
}

const configCache = new Map<string, CachedConfig>();

function isCacheValid(cached: CachedConfig | undefined): boolean {
  if (!cached) return false;
  return Date.now() - cached.loadedAt < CACHE_TTL_MS;
}

function codeConfigToTierConfig(tier: string): TierConfigJson {
  const normalized = normalizeTier(tier);
  const config = SUBSCRIPTION_TIERS[normalized];
  return {
    displayName: config.name,
    entitlementId: config.entitlementId,
    price: config.price,
    limits: config.limits,
    features: config.features,
    creditCosts: DEFAULT_CREDIT_COSTS[normalized] || DEFAULT_CREDIT_COSTS[TIER_IDS.GUEST],
    generationSettings: DEFAULT_GENERATION_SETTINGS[normalized] || DEFAULT_GENERATION_SETTINGS[TIER_IDS.GUEST],
    ui: { sortOrder: Object.keys(SUBSCRIPTION_TIERS).indexOf(normalized) },
  };
}

export class TierConfigClient {
  private httpClient: HttpClient;
  private useRemote: boolean;

  constructor(options: { useRemote?: boolean } = {}) {
    this.httpClient = new HttpClient({ timeout: 5000, useServiceAuth: true, serviceName: 'tier-config-client' });
    this.useRemote = options.useRemote ?? true;
  }

  private async fetchRemoteConfig(tier: string): Promise<TierConfigJson | null> {
    if (!this.useRemote) return null;

    try {
      const serviceUrl = ServiceLocator.getServiceUrl('ai-content-service');
      const response = await this.httpClient.get<{ success: boolean; data: TierConfigJson }>(
        `${serviceUrl}/api/config/tiers/${tier}`
      );

      if (response?.success && response?.data) {
        return response.data;
      }
      return null;
    } catch (error) {
      logger.debug('Failed to fetch remote tier config, using code fallback', { tier, error });
      return null;
    }
  }

  async getConfig(tier: string): Promise<TierConfigJson> {
    const normalized = normalizeTier(tier);
    const cached = configCache.get(normalized);

    if (isCacheValid(cached)) {
      return cached!.config;
    }

    const remoteConfig = await this.fetchRemoteConfig(normalized);
    if (remoteConfig) {
      configCache.set(normalized, { config: remoteConfig, loadedAt: Date.now() });
      return remoteConfig;
    }

    return codeConfigToTierConfig(normalized);
  }

  async getFeatures(tier: string): Promise<SubscriptionTierFeatures> {
    const config = await this.getConfig(tier);
    return config.features;
  }

  async getLimits(tier: string): Promise<SubscriptionTierLimits> {
    const config = await this.getConfig(tier);
    return config.limits;
  }

  async hasFeature(
    tier: string,
    feature: Exclude<keyof SubscriptionTierFeatures, 'maxBookDepth' | 'songBranding'>
  ): Promise<boolean> {
    const features = await this.getFeatures(tier);
    return !!features[feature];
  }

  async getMaxBookDepth(tier: string): Promise<'brief' | 'standard' | 'deep' | null> {
    const features = await this.getFeatures(tier);
    return features.maxBookDepth;
  }

  async canGenerateBookAtDepth(tier: string, requestedDepth: 'brief' | 'standard' | 'deep'): Promise<boolean> {
    const features = await this.getFeatures(tier);
    if (!features.canGenerateBooks || !features.maxBookDepth) return false;

    const depthHierarchy: Record<string, number> = { brief: 1, standard: 2, deep: 3 };
    const maxAllowed = depthHierarchy[features.maxBookDepth] || 0;
    const requested = depthHierarchy[requestedDepth] || 0;

    return requested <= maxAllowed;
  }

  async hasReachedLimit(
    tier: string,
    action: 'songs' | 'lyrics' | 'insights' | 'books',
    currentUsage: number
  ): Promise<boolean> {
    const limits = await this.getLimits(tier);
    const limitMap: Record<string, number> = {
      songs: limits.songsPerMonth,
      lyrics: limits.lyricsPerMonth,
      insights: limits.insightsPerMonth,
      books: limits.booksPerMonth,
    };
    const limit = limitMap[action];
    if (limit === -1) return false;
    return currentUsage >= limit;
  }

  async getCreditCosts(tier: string): Promise<TierCreditCosts> {
    const normalized = normalizeTier(tier);
    const config = await this.getConfig(tier);
    return config.creditCosts || DEFAULT_CREDIT_COSTS[normalized] || DEFAULT_CREDIT_COSTS.guest;
  }

  async getCreditCost(tier: string, action: 'songs' | 'lyrics' | 'insights' | 'books'): Promise<number> {
    const costs = await this.getCreditCosts(tier);
    const costMap: Record<string, number> = {
      songs: costs.songGeneration,
      lyrics: costs.lyricsGeneration,
      insights: costs.insightGeneration,
      books: costs.bookGeneration,
    };
    return costMap[action] ?? 0;
  }

  async getGenerationSettings(tier: string): Promise<TierGenerationSettings> {
    const normalized = normalizeTier(tier);
    const config = await this.getConfig(tier);
    return config.generationSettings || DEFAULT_GENERATION_SETTINGS[normalized] || DEFAULT_GENERATION_SETTINGS.guest;
  }

  async getParallelTrackLimit(tier: string): Promise<number> {
    const settings = await this.getGenerationSettings(tier);
    return settings.parallelTrackLimit;
  }

  async getStaggerDelayMs(tier: string): Promise<number> {
    const settings = await this.getGenerationSettings(tier);
    return settings.staggerDelayMs;
  }

  async getMaxQuality(tier: string): Promise<'draft' | 'standard' | 'premium' | 'studio'> {
    const settings = await this.getGenerationSettings(tier);
    return settings.maxQuality;
  }

  invalidateCache(tier?: string): void {
    if (tier) {
      configCache.delete(normalizeTier(tier));
    } else {
      configCache.clear();
    }
  }

  static getConfigSync(tier: string): TierConfigJson {
    return codeConfigToTierConfig(tier);
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
    const normalized = normalizeTier(tier);
    return DEFAULT_CREDIT_COSTS[normalized] || DEFAULT_CREDIT_COSTS.guest;
  }

  static getCreditCostSync(tier: string, action: 'songs' | 'lyrics' | 'insights' | 'books'): number {
    const costs = TierConfigClient.getCreditCostsSync(tier);
    const costMap: Record<string, number> = {
      songs: costs.songGeneration,
      lyrics: costs.lyricsGeneration,
      insights: costs.insightGeneration,
      books: costs.bookGeneration,
    };
    return costMap[action] ?? 0;
  }

  static getGenerationSettingsSync(tier: string): TierGenerationSettings {
    const normalized = normalizeTier(tier);
    return DEFAULT_GENERATION_SETTINGS[normalized] || DEFAULT_GENERATION_SETTINGS.guest;
  }

  static getParallelTrackLimitSync(tier: string): number {
    return TierConfigClient.getGenerationSettingsSync(tier).parallelTrackLimit;
  }

  static getStaggerDelayMsSync(tier: string): number {
    return TierConfigClient.getGenerationSettingsSync(tier).staggerDelayMs;
  }

  static getMaxQualitySync(tier: string): 'draft' | 'standard' | 'premium' | 'studio' {
    return TierConfigClient.getGenerationSettingsSync(tier).maxQuality;
  }
}

export const tierConfigClient = new TierConfigClient();
