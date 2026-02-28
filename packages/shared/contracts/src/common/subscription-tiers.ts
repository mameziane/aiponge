/**
 * Centralized Subscription Tier Constants and Utilities
 * Single source of truth for subscription tier handling across all services
 *
 * v2.0 — 5-tier experience-first model:
 * Guest (free, anonymous) → Explorer (free, registered) → Personal ($9.99) → Practice ($49) → Studio ($149)
 *
 * Provides:
 * 1. Canonical tier constants (SUBSCRIPTION_TIERS)
 * 2. Type definitions (SubscriptionTier, SubscriptionTierConfig)
 * 3. Utility functions for tier validation and comparison
 * 4. Normalization to handle case-insensitive tier matching
 * 5. Tier classification (launch vs deferred, free vs paid, professional)
 */

export interface SubscriptionTierLimits {
  songsPerMonth: number; // -1 = unlimited
  lyricsPerMonth: number;
  insightsPerMonth: number;
  booksPerMonth: number; // -1 = unlimited, 0 = disabled
  songExpiresAfterHours?: number | null; // Guest only: songs disappear after this duration
  maxSharedClients?: number; // Practice/Studio: max clients for sharing, -1 = unlimited
}

export type BookDepthLevel = 'brief' | 'standard' | 'deep' | null; // null = no access

export type SongBranding = 'aiponge' | 'custom' | null;

export interface SubscriptionTierFeatures {
  canGenerateMusic: boolean;
  canGenerateBooks: boolean;
  maxBookDepth: BookDepthLevel;
  canAccessLibrary: boolean;
  canAccessActivityCalendar: boolean;
  canAccessMentorLine: boolean;
  canAccessInsightsReports: boolean;
  canSelectFramework: boolean;
  canSelectMusicStyle: boolean;
  canShareSongs: boolean;
  canAccessJournal: boolean;
  canDownloadSongs?: boolean;
  canAccessWellness?: boolean;
  canCreateCustomBooks?: boolean;
  canSwitchTiers?: boolean;
  hasPrioritySupport?: boolean;
  canShareWithClients?: boolean;
  canViewClientReflections?: boolean;
  canViewClientEngagement?: boolean;
  canBatchGenerate?: boolean;
  canWhiteLabel?: boolean;
  canAccessAPI?: boolean;
  songBranding?: SongBranding;
}

export interface SubscriptionTierConfig {
  name: string;
  entitlementId: string | null;
  price: string | null;
  annualPrice?: string | null;
  limits: SubscriptionTierLimits;
  features: SubscriptionTierFeatures;
}

/**
 * Canonical subscription tier identifiers
 * Use these constants instead of hardcoded strings
 */
export const TIER_IDS = {
  GUEST: 'guest',
  EXPLORER: 'explorer',
  PERSONAL: 'personal',
  PRACTICE: 'practice',
  STUDIO: 'studio',
} as const;

export type TierId = (typeof TIER_IDS)[keyof typeof TIER_IDS];

/**
 * Subscription tier configurations
 * Five tiers: Guest (free, anonymous) → Explorer (free, registered) → Personal ($9.99) → Practice ($49) → Studio ($149)
 */
export const SUBSCRIPTION_TIERS: Record<TierId, SubscriptionTierConfig> = {
  [TIER_IDS.GUEST]: {
    name: 'Guest',
    entitlementId: null,
    price: null,
    annualPrice: null,
    limits: {
      songsPerMonth: 1,
      lyricsPerMonth: 1,
      insightsPerMonth: 0,
      booksPerMonth: 0,
      songExpiresAfterHours: 48,
    },
    features: {
      canGenerateMusic: true,
      canGenerateBooks: false,
      maxBookDepth: null,
      canAccessLibrary: false,
      canAccessActivityCalendar: false,
      canAccessMentorLine: false,
      canAccessInsightsReports: false,
      canSelectFramework: false,
      canSelectMusicStyle: true,
      canShareSongs: false,
      canAccessJournal: false,
      canDownloadSongs: false,
      canAccessWellness: false,
      canCreateCustomBooks: false,
      canSwitchTiers: false,
      hasPrioritySupport: false,
    },
  },
  [TIER_IDS.EXPLORER]: {
    name: 'Explorer',
    entitlementId: null,
    price: null,
    annualPrice: null,
    limits: {
      songsPerMonth: 2,
      lyricsPerMonth: 4,
      insightsPerMonth: 3,
      booksPerMonth: 0,
    },
    features: {
      canGenerateMusic: true,
      canGenerateBooks: false,
      maxBookDepth: null,
      canAccessLibrary: true,
      canAccessActivityCalendar: false,
      canAccessMentorLine: false,
      canAccessInsightsReports: false,
      canSelectFramework: false,
      canSelectMusicStyle: true,
      canShareSongs: true,
      canAccessJournal: true,
      canDownloadSongs: true,
      canAccessWellness: false,
      canCreateCustomBooks: false,
      canSwitchTiers: true,
      hasPrioritySupport: false,
    },
  },
  [TIER_IDS.PERSONAL]: {
    name: 'Personal',
    entitlementId: 'personal',
    price: '$9.99/month',
    annualPrice: '$79.99/year',
    limits: {
      songsPerMonth: 15,
      lyricsPerMonth: 30,
      insightsPerMonth: 30,
      booksPerMonth: 2,
    },
    features: {
      canGenerateMusic: true,
      canGenerateBooks: true,
      maxBookDepth: 'standard',
      canAccessLibrary: true,
      canAccessActivityCalendar: true,
      canAccessMentorLine: true,
      canAccessInsightsReports: false,
      canSelectFramework: false,
      canSelectMusicStyle: true,
      canShareSongs: true,
      canAccessJournal: true,
      canDownloadSongs: true,
      canAccessWellness: true,
      canCreateCustomBooks: true,
      canSwitchTiers: true,
      hasPrioritySupport: false,
    },
  },
  [TIER_IDS.PRACTICE]: {
    name: 'Practice',
    entitlementId: 'practice',
    price: '$49.00/month',
    annualPrice: '$399.99/year',
    limits: {
      songsPerMonth: 50,
      lyricsPerMonth: 100,
      insightsPerMonth: -1,
      booksPerMonth: -1,
      maxSharedClients: 50,
    },
    features: {
      canGenerateMusic: true,
      canGenerateBooks: true,
      maxBookDepth: 'deep',
      canAccessLibrary: true,
      canAccessActivityCalendar: true,
      canAccessMentorLine: true,
      canAccessInsightsReports: true,
      canSelectFramework: true,
      canSelectMusicStyle: true,
      canShareSongs: true,
      canAccessJournal: true,
      canDownloadSongs: true,
      canAccessWellness: true,
      canCreateCustomBooks: true,
      canSwitchTiers: true,
      hasPrioritySupport: true,
      canShareWithClients: true,
      canViewClientReflections: true,
      canViewClientEngagement: true,
      canBatchGenerate: true,
      songBranding: 'aiponge',
    },
  },
  [TIER_IDS.STUDIO]: {
    name: 'Studio',
    entitlementId: 'studio',
    price: '$149.00/month',
    annualPrice: '$1199.99/year',
    limits: {
      songsPerMonth: 150,
      lyricsPerMonth: 300,
      insightsPerMonth: -1,
      booksPerMonth: -1,
      maxSharedClients: -1,
    },
    features: {
      canGenerateMusic: true,
      canGenerateBooks: true,
      maxBookDepth: 'deep',
      canAccessLibrary: true,
      canAccessActivityCalendar: true,
      canAccessMentorLine: true,
      canAccessInsightsReports: true,
      canSelectFramework: true,
      canSelectMusicStyle: true,
      canShareSongs: true,
      canAccessJournal: true,
      canDownloadSongs: true,
      canAccessWellness: true,
      canCreateCustomBooks: true,
      canSwitchTiers: true,
      hasPrioritySupport: true,
      canShareWithClients: true,
      canViewClientReflections: true,
      canViewClientEngagement: true,
      canBatchGenerate: true,
      canWhiteLabel: true,
      canAccessAPI: true,
      songBranding: 'custom',
    },
  },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

/**
 * All valid tier identifiers
 */
export const VALID_TIERS: readonly SubscriptionTier[] = Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[];

/**
 * Tier classifications for filtering and gating
 */
export const FREE_TIERS: readonly SubscriptionTier[] = [TIER_IDS.GUEST, TIER_IDS.EXPLORER] as const;

export const PAID_TIERS: readonly SubscriptionTier[] = [TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO] as const;

export const PROFESSIONAL_TIERS: readonly SubscriptionTier[] = [TIER_IDS.PRACTICE, TIER_IDS.STUDIO] as const;

export const LAUNCH_TIERS: readonly SubscriptionTier[] = [
  TIER_IDS.GUEST,
  TIER_IDS.EXPLORER,
  TIER_IDS.PERSONAL,
] as const;

export const DEFERRED_TIERS: readonly SubscriptionTier[] = [TIER_IDS.PRACTICE, TIER_IDS.STUDIO] as const;

/**
 * Tier sort order for comparison and display
 */
const TIER_ORDER: Record<TierId, number> = {
  [TIER_IDS.GUEST]: 0,
  [TIER_IDS.EXPLORER]: 1,
  [TIER_IDS.PERSONAL]: 2,
  [TIER_IDS.PRACTICE]: 3,
  [TIER_IDS.STUDIO]: 4,
};

/**
 * Normalize a tier string to lowercase for case-insensitive comparison
 * Handles mixed-case tier values that may come from external sources
 */
export function normalizeTier(tier: string | null | undefined): SubscriptionTier {
  if (!tier) return TIER_IDS.GUEST;

  const normalized = tier.toLowerCase().trim();

  if (isValidTier(normalized)) {
    return normalized as SubscriptionTier;
  }

  return TIER_IDS.GUEST;
}

/**
 * Check if a string is a valid subscription tier
 */
export function isValidTier(tier: string | null | undefined): tier is SubscriptionTier {
  if (!tier) return false;
  return VALID_TIERS.includes(tier as SubscriptionTier);
}

/**
 * Check if a tier is a paid tier
 */
export function isPaidTier(tier: string | null | undefined): boolean {
  if (!tier) return false;
  const normalized = normalizeTier(tier);
  return PAID_TIERS.includes(normalized);
}

/**
 * Check if a tier is a free tier (guest or explorer)
 */
export function isFreeTier(tier: string | null | undefined): boolean {
  if (!tier) return true;
  const normalized = normalizeTier(tier);
  return FREE_TIERS.includes(normalized);
}

/**
 * Check if a tier is specifically the guest tier
 */
export function isGuestTier(tier: string | null | undefined): boolean {
  if (!tier) return true;
  return normalizeTier(tier) === TIER_IDS.GUEST;
}

/**
 * Check if a tier is the explorer tier (free, registered)
 */
export function isExplorerTier(tier: string | null | undefined): boolean {
  if (!tier) return false;
  return normalizeTier(tier) === TIER_IDS.EXPLORER;
}

/**
 * Check if a tier is a professional tier (practice or studio)
 */
export function isProfessionalTier(tier: string | null | undefined): boolean {
  if (!tier) return false;
  const normalized = normalizeTier(tier);
  return PROFESSIONAL_TIERS.includes(normalized);
}

/**
 * Check if a tier is a launch tier (available at launch)
 */
export function isLaunchTier(tier: string | null | undefined): boolean {
  if (!tier) return true;
  const normalized = normalizeTier(tier);
  return LAUNCH_TIERS.includes(normalized);
}

/**
 * Compare two tiers. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareTiers(a: string | null | undefined, b: string | null | undefined): number {
  const tierA = normalizeTier(a);
  const tierB = normalizeTier(b);
  return TIER_ORDER[tierA] - TIER_ORDER[tierB];
}

/**
 * Check if tierA is at least as high as tierB in the hierarchy
 */
export function isTierAtLeast(
  currentTier: string | null | undefined,
  requiredTier: string | null | undefined
): boolean {
  return compareTiers(currentTier, requiredTier) >= 0;
}

/**
 * Get tier configuration by tier identifier
 * Returns guest tier config for invalid/unknown tiers
 */
export function getTierConfig(tier: string | null | undefined): SubscriptionTierConfig {
  const normalized = normalizeTier(tier);
  return SUBSCRIPTION_TIERS[normalized] ?? SUBSCRIPTION_TIERS[TIER_IDS.GUEST];
}

/**
 * Get tier by RevenueCat entitlement ID
 * Maps entitlement identifiers to subscription tiers
 */
export function getTierByEntitlement(entitlementId: string | null | undefined): SubscriptionTier {
  if (!entitlementId) return TIER_IDS.GUEST;

  for (const [tierKey, config] of Object.entries(SUBSCRIPTION_TIERS)) {
    if (config.entitlementId === entitlementId) {
      return tierKey as SubscriptionTier;
    }
  }

  return TIER_IDS.GUEST;
}

/**
 * Get tier limits for a given tier
 */
export function getTierLimits(tier: string | null | undefined): SubscriptionTierLimits {
  return getTierConfig(tier).limits;
}

/**
 * Get tier features for a given tier
 */
export function getTierFeatures(tier: string | null | undefined): SubscriptionTierFeatures {
  return getTierConfig(tier).features;
}

/**
 * Check if a tier has a specific boolean feature enabled
 * Note: For maxBookDepth, use getMaxBookDepth() instead
 * Note: For songBranding, access via getTierFeatures() directly
 */
export function hasTierFeature(
  tier: string | null | undefined,
  feature: Exclude<keyof SubscriptionTierFeatures, 'maxBookDepth' | 'songBranding'>
): boolean {
  const features = getTierFeatures(tier);
  return !!features[feature];
}

/**
 * Get the maximum book depth level allowed for a tier
 * Returns null if book generation is not allowed
 */
export function getMaxBookDepth(tier: string | null | undefined): BookDepthLevel {
  return getTierFeatures(tier).maxBookDepth;
}

/**
 * Check if a tier can generate books at a specific depth level
 * Depth hierarchy: brief < standard < deep
 */
export function canGenerateBookAtDepth(
  tier: string | null | undefined,
  requestedDepth: 'brief' | 'standard' | 'deep'
): boolean {
  const features = getTierFeatures(tier);
  if (!features.canGenerateBooks || !features.maxBookDepth) {
    return false;
  }

  const depthHierarchy: Record<string, number> = {
    brief: 1,
    standard: 2,
    deep: 3,
  };

  const maxAllowed = depthHierarchy[features.maxBookDepth] || 0;
  const requested = depthHierarchy[requestedDepth] || 0;

  return requested <= maxAllowed;
}

/**
 * Check if a user has reached their usage limit for a specific action
 */
export function hasReachedLimit(
  tier: string | null | undefined,
  action: 'songs' | 'lyrics' | 'insights' | 'books',
  currentUsage: number
): boolean {
  const limits = getTierLimits(tier);

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

/**
 * Get remaining usage for a specific action
 * Returns -1 for unlimited tiers
 */
export function getRemainingUsage(
  tier: string | null | undefined,
  action: 'songs' | 'lyrics' | 'insights' | 'books',
  currentUsage: number
): number {
  const limits = getTierLimits(tier);

  const limitMap: Record<string, number> = {
    songs: limits.songsPerMonth,
    lyrics: limits.lyricsPerMonth,
    insights: limits.insightsPerMonth,
    books: limits.booksPerMonth,
  };

  const limit = limitMap[action];

  if (limit === -1) return -1;

  return Math.max(0, limit - currentUsage);
}

/**
 * Get the song expiry duration in hours for a tier
 * Returns null if songs don't expire
 */
export function getSongExpiryHours(tier: string | null | undefined): number | null {
  const limits = getTierLimits(tier);
  return limits.songExpiresAfterHours ?? null;
}

/**
 * Get the maximum number of shared clients for a tier
 * Returns -1 for unlimited, 0 or undefined for no sharing capability
 */
export function getMaxSharedClients(tier: string | null | undefined): number {
  const limits = getTierLimits(tier);
  return limits.maxSharedClients ?? 0;
}
