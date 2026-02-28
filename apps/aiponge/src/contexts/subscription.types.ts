import type { CustomerInfo, PurchasesOffering, PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';
import {
  TIER_IDS,
  SUBSCRIPTION_TIERS,
  isPaidTier as isPaidTierCheck,
  type TierId,
  type SubscriptionTierConfig,
} from '@aiponge/shared-contracts';

export type SubscriptionTier = TierId;

export const REVENUECAT_ENTITLEMENTS = {
  PERSONAL: 'personal',
  PRACTICE: 'practice',
  STUDIO: 'studio',
} as const;

export const REVENUECAT_PRODUCT_IDS = {
  PERSONAL: {
    MONTHLY: 'subscription_monthly_personal',
    YEARLY: 'subscription_yearly_personal',
  },
  PRACTICE: {
    MONTHLY: 'subscription_monthly_practice',
    YEARLY: 'subscription_yearly_practice',
  },
  STUDIO: {
    MONTHLY: 'subscription_monthly_studio',
    YEARLY: 'subscription_yearly_studio',
  },
} as const;

export type BillingPeriod = 'monthly' | 'yearly';

export interface SubscriptionConfig {
  tiers: Record<string, SubscriptionTierConfig>;
  creditCostPerSong: number;
  defaultTier: string;
}

export const DEFAULT_CONFIG: SubscriptionConfig = {
  tiers: SUBSCRIPTION_TIERS,
  creditCostPerSong: 0,
  defaultTier: TIER_IDS.GUEST,
};

export const CONFIG_CACHE_KEY = '@aiponge/subscription_config';

export interface DerivedTierConfig {
  canGenerateMusic: boolean;
  canAccessActivityCalendar: boolean;
  canAccessInsightsReports: boolean;
  canAccessMentorLine: boolean;
  canAccessWellness: boolean;
  canDownload: boolean;
  canShare: boolean;
  canCreateCustomBooks: boolean;
  canGenerateAlbum: boolean;
  canSwitchTiers: boolean;
  hasPrioritySupport: boolean;
  canSelectFramework: boolean;
  canSelectMusicStyle: boolean;
  canAccessJournal: boolean;
}

export function deriveTierConfig(config: SubscriptionConfig, tier: TierId): DerivedTierConfig {
  const tierConfig = config.tiers[tier] ?? config.tiers[TIER_IDS.GUEST];
  return {
    canGenerateMusic: tierConfig?.features.canGenerateMusic ?? false,
    canAccessActivityCalendar: tierConfig?.features.canAccessActivityCalendar ?? false,
    canAccessInsightsReports: tierConfig?.features.canAccessInsightsReports ?? false,
    canAccessMentorLine: tierConfig?.features.canAccessMentorLine ?? false,
    canAccessWellness: tierConfig?.features.canAccessWellness ?? false,
    canDownload: tierConfig?.features.canDownloadSongs ?? false,
    canShare: tierConfig?.features.canShareSongs ?? false,
    canCreateCustomBooks: tierConfig?.features.canCreateCustomBooks ?? false,
    canGenerateAlbum: tierConfig?.features.canBatchGenerate ?? false,
    canSwitchTiers: tierConfig?.features.canSwitchTiers ?? false,
    hasPrioritySupport: tierConfig?.features.hasPrioritySupport ?? false,
    canSelectFramework: tierConfig?.features.canSelectFramework ?? false,
    canSelectMusicStyle: tierConfig?.features.canSelectMusicStyle ?? true,
    canAccessJournal: tierConfig?.features.canAccessJournal ?? false,
  };
}

export function deriveGenerationLimit(config: SubscriptionConfig, tier: TierId, billingPeriod: BillingPeriod): number {
  const tierConfig = config.tiers[tier] ?? config.tiers[TIER_IDS.GUEST];
  const monthly = tierConfig?.limits.songsPerMonth ?? 0;
  if (billingPeriod === 'yearly') {
    return monthly * 12;
  }
  return monthly;
}

export function getBillingPeriodFromProductId(productId: string | undefined): BillingPeriod {
  if (!productId) return 'monthly';
  if (productId.includes('yearly') || productId.includes('annual')) return 'yearly';
  return 'monthly';
}

export interface SubscriptionDataValue {
  isInitialized: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  creditsOffering: PurchasesOffering | null;
  isLoading: boolean;
  isPaidTier: boolean;
  currentTier: SubscriptionTier;
  currentBillingPeriod: BillingPeriod;
  tierConfig: DerivedTierConfig;
  canGenerateMusic: boolean;
  generationLimit: number;
  subscriptionConfig: SubscriptionConfig;
}

export interface SubscriptionActionsValue {
  refreshCustomerInfo: () => Promise<void>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  purchaseCredits: (product: PurchasesStoreProduct) => Promise<{ success: boolean; creditsGranted?: number }>;
  restorePurchases: () => Promise<boolean>;
  showPaywall: () => void;
  showCustomerCenter: () => void;
}

export type SubscriptionContextValue = SubscriptionDataValue & SubscriptionActionsValue;
