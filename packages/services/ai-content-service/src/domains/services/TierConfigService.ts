import { TierConfigJson, TierFeaturesConfig, TierLimitsConfig } from '@schema/content-schema';
import type { ITierConfigRepository, TierConfigRow } from '../ports/ITierConfigRepository';
import { getLogger } from '@config/service-urls';
import { SUBSCRIPTION_TIERS, TIER_IDS, normalizeTier, type SubscriptionTier } from '@aiponge/shared-contracts';

const logger = getLogger('tier-config-service');

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedConfigs {
  configs: Map<string, TierConfigJson>;
  loadedAt: number;
}

let cachedConfigs: CachedConfigs | null = null;

function dbConfigToTierConfig(dbConfig: TierConfigRow): TierConfigJson {
  return dbConfig.config;
}

const DEFAULT_CREDIT_COSTS: Record<
  SubscriptionTier,
  { songGeneration: number; lyricsGeneration: number; insightGeneration: number; bookGeneration: number }
> = {
  [TIER_IDS.GUEST]: { songGeneration: 15, lyricsGeneration: 0, insightGeneration: 0, bookGeneration: 5 },
  [TIER_IDS.EXPLORER]: { songGeneration: 15, lyricsGeneration: 0, insightGeneration: 0, bookGeneration: 5 },
  [TIER_IDS.PERSONAL]: { songGeneration: 15, lyricsGeneration: 0, insightGeneration: 0, bookGeneration: 5 },
  [TIER_IDS.PRACTICE]: { songGeneration: 15, lyricsGeneration: 0, insightGeneration: 0, bookGeneration: 5 },
  [TIER_IDS.STUDIO]: { songGeneration: 15, lyricsGeneration: 0, insightGeneration: 0, bookGeneration: 5 },
};

const DEFAULT_GENERATION_SETTINGS: Record<
  SubscriptionTier,
  {
    parallelTrackLimit: number;
    staggerDelayMs: number;
    maxQuality: 'draft' | 'standard' | 'premium' | 'studio';
    priorityBoost: number;
  }
> = {
  [TIER_IDS.GUEST]: { parallelTrackLimit: 1, staggerDelayMs: 5000, maxQuality: 'standard', priorityBoost: 0 },
  [TIER_IDS.EXPLORER]: { parallelTrackLimit: 1, staggerDelayMs: 5000, maxQuality: 'standard', priorityBoost: 0 },
  [TIER_IDS.PERSONAL]: { parallelTrackLimit: 2, staggerDelayMs: 4000, maxQuality: 'standard', priorityBoost: 1 },
  [TIER_IDS.PRACTICE]: { parallelTrackLimit: 3, staggerDelayMs: 3500, maxQuality: 'premium', priorityBoost: 2 },
  [TIER_IDS.STUDIO]: { parallelTrackLimit: 5, staggerDelayMs: 3000, maxQuality: 'studio', priorityBoost: 3 },
};

function codeConfigToTierConfig(tierKey: SubscriptionTier): TierConfigJson {
  const config = SUBSCRIPTION_TIERS[tierKey];
  return {
    displayName: config.name,
    entitlementId: config.entitlementId,
    price: config.price,
    limits: config.limits,
    features: config.features,
    creditCosts: DEFAULT_CREDIT_COSTS[tierKey],
    generationSettings: DEFAULT_GENERATION_SETTINGS[tierKey],
    ui: { sortOrder: Object.keys(SUBSCRIPTION_TIERS).indexOf(tierKey) },
  };
}

export class TierConfigService {
  private repository: ITierConfigRepository;

  constructor(repository: ITierConfigRepository) {
    this.repository = repository;
  }

  private isCacheValid(): boolean {
    if (!cachedConfigs) return false;
    return Date.now() - cachedConfigs.loadedAt < CACHE_TTL_MS;
  }

  private async loadConfigs(): Promise<Map<string, TierConfigJson>> {
    if (this.isCacheValid()) {
      return cachedConfigs!.configs;
    }

    try {
      const dbConfigs = await this.repository.getActiveConfigs();
      const configMap = new Map<string, TierConfigJson>();

      for (const dbConfig of dbConfigs) {
        configMap.set(dbConfig.tier, dbConfigToTierConfig(dbConfig));
      }

      cachedConfigs = { configs: configMap, loadedAt: Date.now() };
      logger.debug('Loaded tier configs from database', { count: configMap.size });
      return configMap;
    } catch (error) {
      logger.warn('Failed to load tier configs from database, using code fallback', { error });
      return this.getCodeFallbackConfigs();
    }
  }

  private getCodeFallbackConfigs(): Map<string, TierConfigJson> {
    const configMap = new Map<string, TierConfigJson>();
    for (const tierKey of Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[]) {
      configMap.set(tierKey, codeConfigToTierConfig(tierKey));
    }
    return configMap;
  }

  async getConfig(tier: string): Promise<TierConfigJson> {
    const normalizedTier = normalizeTier(tier);
    const configs = await this.loadConfigs();
    const config = configs.get(normalizedTier);

    if (config) return config;

    if (SUBSCRIPTION_TIERS[normalizedTier]) {
      return codeConfigToTierConfig(normalizedTier);
    }

    return codeConfigToTierConfig(TIER_IDS.GUEST);
  }

  async getFeatures(tier: string): Promise<TierFeaturesConfig> {
    const config = await this.getConfig(tier);
    return config.features;
  }

  async getLimits(tier: string): Promise<TierLimitsConfig> {
    const config = await this.getConfig(tier);
    return config.limits;
  }

  async hasFeature(tier: string, feature: keyof Omit<TierFeaturesConfig, 'maxBookDepth'>): Promise<boolean> {
    const features = await this.getFeatures(tier);
    return features[feature];
  }

  async getLimit(tier: string, limit: keyof TierLimitsConfig): Promise<number> {
    const limits = await this.getLimits(tier);
    return limits[limit];
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

  async getAllConfigs(): Promise<TierConfigRow[]> {
    return this.repository.getAllConfigs();
  }

  async updateTierConfig(tier: string, updates: Partial<TierConfigJson>): Promise<TierConfigRow | null> {
    const result = await this.repository.updateConfig(tier, updates);
    if (result) {
      cachedConfigs = null;
      logger.info('Tier config updated, cache invalidated', { tier });
    }
    return result;
  }

  async upsertTierConfig(tier: string, config: TierConfigJson): Promise<TierConfigRow> {
    const result = await this.repository.upsertConfig(tier, config);
    cachedConfigs = null;
    logger.info('Tier config upserted, cache invalidated', { tier });
    return result;
  }

  invalidateCache(): void {
    cachedConfigs = null;
    logger.debug('Tier config cache invalidated');
  }
}

export function createTierConfigService(repository: ITierConfigRepository): TierConfigService {
  return new TierConfigService(repository);
}
