import { TIER_IDS, PAID_TIERS, LAUNCH_TIERS, DEFERRED_TIERS, type TierId } from '@aiponge/shared-contracts';
import type { IconName } from '../types/ui.types';

export type { TierId } from '@aiponge/shared-contracts';
export { PAID_TIERS, LAUNCH_TIERS, DEFERRED_TIERS } from '@aiponge/shared-contracts';

export interface TierFeatureItem {
  icon: IconName;
  i18nKey: string;
  i18nParams?: Record<string, unknown>;
  includedInTiers: TierId[];
}

export interface TierDisplayConfig {
  id: TierId;
  icon: IconName;
  gradientKey: 'primary' | 'premium' | 'premiumDark' | 'primaryReverse';
  showRecommendedBadge: boolean;
  canUpgradeTo: TierId | null;
  features: TierFeatureItem[];
  guestFeatures: TierFeatureItem[];
  upgradeBenefits: { i18nKey: string }[];
  priceI18nKey: string;
}

const GUEST_FEATURES: TierFeatureItem[] = [
  {
    icon: 'musical-notes',
    i18nKey: 'subscription.tiers.guest.features.oneSong',
    includedInTiers: [TIER_IDS.GUEST, TIER_IDS.EXPLORER, TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'person-outline' as IconName,
    i18nKey: 'subscription.tiers.guest.features.noAccount',
    includedInTiers: [TIER_IDS.GUEST],
  },
  {
    icon: 'options',
    i18nKey: 'subscription.tiers.explorer.features.musicStylePrefs',
    includedInTiers: [TIER_IDS.GUEST, TIER_IDS.EXPLORER, TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
];

const EXPLORER_FEATURES: TierFeatureItem[] = [
  {
    icon: 'musical-notes',
    i18nKey: 'subscription.tiers.explorer.features.songs',
    i18nParams: { count: 2 },
    includedInTiers: [TIER_IDS.EXPLORER, TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'library',
    i18nKey: 'subscription.tiers.explorer.features.library',
    includedInTiers: [TIER_IDS.EXPLORER, TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'share-social',
    i18nKey: 'subscription.tiers.explorer.features.share',
    includedInTiers: [TIER_IDS.EXPLORER, TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'journal-outline' as IconName,
    i18nKey: 'subscription.tiers.explorer.features.journal',
    includedInTiers: [TIER_IDS.EXPLORER, TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'options',
    i18nKey: 'subscription.tiers.explorer.features.musicStylePrefs',
    includedInTiers: [TIER_IDS.GUEST, TIER_IDS.EXPLORER, TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
];

const PERSONAL_FEATURES: TierFeatureItem[] = [
  {
    icon: 'musical-notes',
    i18nKey: 'subscription.tiers.personal.features.songs',
    i18nParams: { count: 15 },
    includedInTiers: [TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'chatbubble-ellipses' as IconName,
    i18nKey: 'subscription.tiers.personal.features.mentorChat',
    includedInTiers: [TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'book',
    i18nKey: 'subscription.tiers.personal.features.books',
    includedInTiers: [TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'calendar',
    i18nKey: 'subscription.tiers.personal.features.activityCalendar',
    includedInTiers: [TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
];

const PRACTICE_FEATURES: TierFeatureItem[] = [
  {
    icon: 'musical-notes',
    i18nKey: 'subscription.tiers.practice.features.songs',
    i18nParams: { count: 50 },
    includedInTiers: [TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'color-palette',
    i18nKey: 'subscription.tiers.practice.features.frameworkSelection',
    includedInTiers: [TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'people',
    i18nKey: 'subscription.tiers.practice.features.clientSharing',
    i18nParams: { count: 50 },
    includedInTiers: [TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'chatbox-ellipses' as IconName,
    i18nKey: 'subscription.tiers.practice.features.clientReflections',
    includedInTiers: [TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'analytics',
    i18nKey: 'subscription.tiers.practice.features.engagementAnalytics',
    includedInTiers: [TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'document-text',
    i18nKey: 'subscription.tiers.practice.features.insightsReports',
    includedInTiers: [TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
  {
    icon: 'book',
    i18nKey: 'subscription.tiers.practice.features.deepBooks',
    includedInTiers: [TIER_IDS.PRACTICE, TIER_IDS.STUDIO],
  },
];

const STUDIO_FEATURES: TierFeatureItem[] = [
  {
    icon: 'musical-notes',
    i18nKey: 'subscription.tiers.studio.features.songs',
    i18nParams: { count: 150 },
    includedInTiers: [TIER_IDS.STUDIO],
  },
  {
    icon: 'people',
    i18nKey: 'subscription.tiers.studio.features.unlimitedClients',
    includedInTiers: [TIER_IDS.STUDIO],
  },
  {
    icon: 'color-wand' as IconName,
    i18nKey: 'subscription.tiers.studio.features.whiteLabel',
    includedInTiers: [TIER_IDS.STUDIO],
  },
  {
    icon: 'trending-up',
    i18nKey: 'subscription.tiers.studio.features.advancedAnalytics',
    includedInTiers: [TIER_IDS.STUDIO],
  },
  {
    icon: 'star',
    i18nKey: 'subscription.tiers.studio.features.priorityGeneration',
    includedInTiers: [TIER_IDS.STUDIO],
  },
];

const UPGRADE_BENEFITS = [
  { i18nKey: 'components.upgradePrompt.benefit1' },
  { i18nKey: 'components.upgradePrompt.benefit2' },
  { i18nKey: 'components.upgradePrompt.benefit3' },
  { i18nKey: 'components.upgradePrompt.benefit4' },
];

const USAGE_LIMIT_BENEFITS = [
  { i18nKey: 'components.usageLimitModal.benefit1' },
  { i18nKey: 'components.usageLimitModal.benefit2' },
  { i18nKey: 'components.usageLimitModal.benefit3' },
  { i18nKey: 'components.usageLimitModal.benefit4' },
  { i18nKey: 'components.usageLimitModal.benefit5' },
  { i18nKey: 'components.usageLimitModal.benefit6' },
];

export const TIER_DISPLAY: Record<TierId, TierDisplayConfig> = {
  [TIER_IDS.GUEST]: {
    id: TIER_IDS.GUEST,
    icon: 'musical-notes',
    gradientKey: 'primary',
    showRecommendedBadge: false,
    canUpgradeTo: TIER_IDS.EXPLORER,
    features: GUEST_FEATURES,
    guestFeatures: GUEST_FEATURES,
    upgradeBenefits: UPGRADE_BENEFITS,
    priceI18nKey: '',
  },
  [TIER_IDS.EXPLORER]: {
    id: TIER_IDS.EXPLORER,
    icon: 'compass-outline' as IconName,
    gradientKey: 'primary',
    showRecommendedBadge: false,
    canUpgradeTo: TIER_IDS.PERSONAL,
    features: EXPLORER_FEATURES,
    guestFeatures: [],
    upgradeBenefits: UPGRADE_BENEFITS,
    priceI18nKey: '',
  },
  [TIER_IDS.PERSONAL]: {
    id: TIER_IDS.PERSONAL,
    icon: 'heart-outline',
    gradientKey: 'primary',
    showRecommendedBadge: true,
    canUpgradeTo: TIER_IDS.PRACTICE,
    features: PERSONAL_FEATURES,
    guestFeatures: [],
    upgradeBenefits: UPGRADE_BENEFITS,
    priceI18nKey: 'subscription.tiers.personal.monthlyPrice',
  },
  [TIER_IDS.PRACTICE]: {
    id: TIER_IDS.PRACTICE,
    icon: 'people-outline',
    gradientKey: 'premiumDark',
    showRecommendedBadge: false,
    canUpgradeTo: TIER_IDS.STUDIO,
    features: PRACTICE_FEATURES,
    guestFeatures: [],
    upgradeBenefits: UPGRADE_BENEFITS,
    priceI18nKey: 'subscription.tiers.practice.monthlyPrice',
  },
  [TIER_IDS.STUDIO]: {
    id: TIER_IDS.STUDIO,
    icon: 'diamond-outline' as IconName,
    gradientKey: 'premiumDark',
    showRecommendedBadge: false,
    canUpgradeTo: null,
    features: STUDIO_FEATURES,
    guestFeatures: [],
    upgradeBenefits: UPGRADE_BENEFITS,
    priceI18nKey: 'subscription.tiers.studio.monthlyPrice',
  },
};

export const UPGRADE_TARGET: TierId = TIER_IDS.PERSONAL;

export function getTierDisplay(tier: string): TierDisplayConfig {
  if (tier in TIER_DISPLAY) return TIER_DISPLAY[tier as TierId];
  return TIER_DISPLAY[TIER_IDS.GUEST];
}

export function getUpgradeFeatures(fromTier: TierId): TierFeatureItem[] {
  const targetTier = TIER_DISPLAY[fromTier].canUpgradeTo;
  if (!targetTier) return [];
  return TIER_DISPLAY[targetTier].features;
}

export function getPaywallTiers(options?: {
  includeProfessional?: boolean;
  includeStudio?: boolean;
}): TierDisplayConfig[] {
  const { FEATURE_FLAGS } = require('./featureFlags');

  const tiers: TierId[] = [TIER_IDS.EXPLORER, TIER_IDS.PERSONAL];

  const showProfessional = options?.includeProfessional ?? FEATURE_FLAGS.ENABLE_PROFESSIONAL_TIERS;
  const showStudio = options?.includeStudio ?? FEATURE_FLAGS.ENABLE_STUDIO_TIER;

  if (showProfessional) {
    tiers.push(TIER_IDS.PRACTICE);
  }
  if (showStudio) {
    tiers.push(TIER_IDS.STUDIO);
  }

  return tiers.map(id => TIER_DISPLAY[id]);
}

export function getComparisonFeatures(
  tier: TierId
): { feature: TierFeatureItem; included: boolean; isExclusive: boolean }[] {
  const seenKeys = new Set<string>();
  const allFeatures: TierFeatureItem[] = [];
  for (const f of [...EXPLORER_FEATURES, ...PERSONAL_FEATURES, ...PRACTICE_FEATURES, ...STUDIO_FEATURES]) {
    if (!seenKeys.has(f.i18nKey)) {
      seenKeys.add(f.i18nKey);
      allFeatures.push(f);
    }
  }
  return allFeatures.map(feature => ({
    feature,
    included: feature.includedInTiers.includes(tier),
    isExclusive: feature.includedInTiers.length <= 2 && !feature.includedInTiers.includes(TIER_IDS.EXPLORER),
  }));
}

export function deriveTierBehavior(tier: TierId): {
  showUpgradePromptOnLowQuota: boolean;
  showResetDateOnLimitReached: boolean;
} {
  const display = getTierDisplay(tier);
  return {
    showUpgradePromptOnLowQuota: display.canUpgradeTo !== null,
    showResetDateOnLimitReached: tier !== TIER_IDS.GUEST,
  };
}

export { USAGE_LIMIT_BENEFITS };
