/**
 * Subscription Tab Component
 * Clean, clear subscription tiers with proper React Native styling
 * All tier display data driven by tierDisplayConfig
 */

import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../../i18n';
import { useSubscriptionData } from '../../contexts/SubscriptionContext';
import { useUsageTracking } from '../../hooks/profile/useUsageTracking';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { fontFamilies } from '../../theme/typography';
import type { IconName } from '../../types/ui.types';
import { TIER_IDS, isPaidTier as isPaidTierCheck } from '@aiponge/shared-contracts';
import {
  getTierDisplay,
  getComparisonFeatures,
  getUpgradeFeatures,
  TIER_DISPLAY,
  PAID_TIERS,
  type TierId,
  type TierFeatureItem,
} from '../../constants/tierDisplayConfig';

export function SubscriptionTab() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentTier, tierConfig, isLoading } = useSubscriptionData();
  const { usage, loading: usageLoading } = useUsageTracking();
  const { t } = useTranslation();

  if (isLoading || usageLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.purple[400]} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (isPaidTierCheck(currentTier)) {
    return <ActiveTierView tier={currentTier} usage={usage} />;
  }

  return <GuestTierView usage={usage} currentTier={currentTier} />;
}

interface UsageData {
  songs?: {
    current?: number;
    limit?: number;
  };
}

function ActiveTierView({ tier, usage }: { tier: TierId; usage: UsageData | null }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const config = getTierDisplay(tier);
  const songsUsed = usage?.songs?.current ?? 0;
  const songsLimit = usage?.songs?.limit ?? 5;
  const usagePercent = Math.min((songsUsed / songsLimit) * 100, 100);

  const gradientColors = colors.gradients[config.gradientKey];

  const upgradeTarget = config.canUpgradeTo;
  const upgradeFeatures = upgradeTarget ? getUpgradeFeatures(tier) : [];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.premiumActiveCard}
        >
          <View style={styles.premiumHeader}>
            <View style={styles.premiumIcon}>
              <Ionicons name={config.icon} size={28} color={colors.absolute.white} />
            </View>
            <View style={styles.premiumHeaderText}>
              <Text style={styles.premiumTitle}>{t(`subscription.tiers.${tier}.name`)}</Text>
              <Text style={styles.premiumSubtitle}>{t(`subscription.tiers.${tier}.tagline`)}</Text>
            </View>
          </View>

          <View style={styles.premiumBenefits}>
            {config.features.map((feature, idx) => (
              <PremiumBenefit key={idx} icon={feature.icon} text={t(feature.i18nKey, feature.i18nParams)} />
            ))}
          </View>

          <View style={styles.usageCardInline}>
            <Text style={styles.usageLabel}>{t('subscription.generationQuota.title')}</Text>
            <Text style={styles.usageValueLight}>
              {t('subscription.generationQuota.remaining', { remaining: songsLimit - songsUsed, total: songsLimit })}
            </Text>
            <View style={styles.progressBarLight}>
              <View style={[styles.progressFillLight, { width: `${usagePercent}%` }]} />
            </View>
            {usagePercent >= 100 && (
              <Text style={styles.usageWarningLight}>{t('subscription.generationQuota.limitReached')}</Text>
            )}
          </View>

          <View style={styles.premiumInfo}>
            <View style={styles.premiumInfoRow}>
              <Text style={styles.premiumInfoLabel}>{t('subscription.price')}</Text>
              <Text style={styles.premiumInfoValue}>{t(config.priceI18nKey)}</Text>
            </View>
            <View style={styles.premiumInfoRow}>
              <Text style={styles.premiumInfoLabel}>{t('subscription.status')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.statusDot} />
                <Text style={styles.statusActive}>{t('subscription.active')}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {upgradeTarget && upgradeFeatures.length > 0 && (
          <View style={styles.upgradePromptCard}>
            <Text style={styles.upgradePromptTitle}>
              {t('subscription.tierSwitch.upgradeTo', { tier: t(`subscription.tiers.${upgradeTarget}.name`) })}
            </Text>
            <Text style={styles.upgradePromptText}>{t(`subscription.tiers.${upgradeTarget}.description`)}</Text>

            <View style={styles.upgradeFeatures}>
              {upgradeFeatures.map((feature, idx) => (
                <UpgradeFeature key={idx} icon={feature.icon} text={t(feature.i18nKey, feature.i18nParams)} />
              ))}
            </View>

            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => router.push('/paywall')}
              data-testid={`button-upgrade-to-${upgradeTarget}`}
            >
              <Text style={styles.upgradeButtonText}>{t('subscription.upgrade')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.manageButton}
          onPress={() => Alert.alert(t('subscription.manageSubscription'), t('subscription.manageInAppStore'))}
          data-testid="button-manage-subscription"
        >
          <Ionicons name="settings-outline" size={20} color={colors.absolute.white} />
          <Text style={styles.manageButtonText}>{t('subscription.manageSubscription')}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function GuestTierView({ usage, currentTier }: { usage: UsageData | null; currentTier: TierId }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const isGuest = currentTier === TIER_IDS.GUEST;
  const freeTierId = isGuest ? TIER_IDS.GUEST : TIER_IDS.EXPLORER;
  const freeTierConfig = getTierDisplay(freeTierId);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerSection}>
          <Text style={styles.mainTitle}>{t('subscription.chooseYourPlan')}</Text>
          <Text style={styles.mainSubtitle}>{t(`subscription.tiers.${freeTierId}.description`)}</Text>
        </View>

        {PAID_TIERS.map((tierId, tierIdx) => {
          const tierConfig = getTierDisplay(tierId);
          const isTopTier = tierId === TIER_IDS.PRACTICE || tierId === TIER_IDS.STUDIO;
          const comparisonFeatures = getComparisonFeatures(tierId);

          return (
            <View
              key={tierId}
              style={[
                isTopTier ? styles.tierCardPremium : styles.tierCardSecondary,
                isTopTier && { borderColor: colors.brand.purple[600] },
              ]}
            >
              {tierConfig.showRecommendedBadge && (
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedText}>{t('subscription.recommended')}</Text>
                </View>
              )}
              <Text style={styles.tierName}>{t(`subscription.tiers.${tierId}.name`)}</Text>
              <Text style={styles.tierDescription}>{t(`subscription.tiers.${tierId}.tagline`)}</Text>

              <View style={styles.priceRow}>
                <Text style={styles.price}>{t(`subscription.tiers.${tierId}.monthlyPrice`)}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.featuresList}>
                {tierConfig.features.map((feature, idx) => (
                  <Feature
                    key={idx}
                    icon={feature.icon}
                    text={t(feature.i18nKey, feature.i18nParams)}
                    included
                    premium={isTopTier}
                  />
                ))}
                {!isTopTier && (
                  <>
                    {TIER_DISPLAY.practice.features
                      .filter(f => !f.includedInTiers.includes(tierId))
                      .map((feature, idx) => (
                        <Feature
                          key={`excluded-${idx}`}
                          icon={feature.icon}
                          text={t(feature.i18nKey, feature.i18nParams)}
                          included={false}
                        />
                      ))}
                  </>
                )}
              </View>

              <TouchableOpacity
                style={isTopTier ? styles.ctaButtonPremium : styles.ctaButtonSecondary}
                onPress={() => router.push('/paywall')}
                data-testid={`button-tier-${tierId}`}
              >
                <Text style={isTopTier ? styles.ctaButtonText : styles.ctaButtonTextSecondary}>
                  {t('subscription.tierSwitch.upgradeTo', { tier: t(`subscription.tiers.${tierId}.name`) })}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={styles.tierCardFree}>
          <Text style={styles.tierName}>{t(`subscription.tiers.${freeTierId}.name`)}</Text>
          <Text style={styles.tierDescription}>{t(`subscription.tiers.${freeTierId}.tagline`)}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>$0</Text>
            <Text style={styles.period}>{t('subscription.perMonth')}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.featuresList}>
            {(freeTierConfig.guestFeatures?.length ? freeTierConfig.guestFeatures : freeTierConfig.features).map(
              (feature, idx) => (
                <Feature
                  key={idx}
                  icon={feature.icon}
                  text={t(feature.i18nKey, feature.i18nParams)}
                  included={feature.includedInTiers.includes(freeTierId)}
                />
              )
            )}
          </View>

          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>{t('subscription.currentPlan')}</Text>
          </View>
        </View>

        <View style={styles.ethicsNote}>
          <Text style={styles.ethicsText}>{t('paywall.principleText')}</Text>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.stickyBottom} pointerEvents="box-none">
        <View pointerEvents="auto">
          <TouchableOpacity
            style={styles.stickyButton}
            onPress={() => router.push('/paywall')}
            data-testid="button-sticky-upgrade"
          >
            <LinearGradient
              colors={colors.gradients.premiumDark}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.stickyButtonGradient}
            >
              <Text style={styles.stickyButtonText}>{t('subscription.upgrade')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function PremiumBenefit({ icon, text }: { icon: IconName; text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.premiumBenefitRow}>
      <View style={styles.premiumBenefitIcon}>
        <Ionicons name={icon} size={18} color={colors.absolute.white} />
      </View>
      <Text style={styles.premiumBenefitText}>{text}</Text>
    </View>
  );
}

interface FeatureProps {
  icon: IconName;
  text: string;
  included: boolean;
  premium?: boolean;
}

function Feature({ icon, text, included, premium = false }: FeatureProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.featureRow}>
      <View
        style={[
          styles.featureIcon,
          included ? (premium ? styles.featureIconPremium : styles.featureIconIncluded) : styles.featureIconExcluded,
        ]}
      >
        <Ionicons
          name={included ? icon : 'close'}
          size={16}
          color={included ? (premium ? colors.absolute.white : colors.brand.purple[400]) : colors.text.gray[600]}
        />
      </View>
      <Text style={included ? styles.featureTextIncluded : styles.featureTextExcluded}>{text}</Text>
    </View>
  );
}

function UpgradeFeature({ icon, text }: { icon: IconName; text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.upgradeFeatureRow}>
      <Ionicons name={icon} size={18} color={colors.brand.purple[400]} />
      <Text style={styles.upgradeFeatureText}>{text}</Text>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.absolute.black,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 20,
      paddingBottom: 120,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.absolute.black,
    },
    loadingText: {
      color: colors.text.tertiary,
      fontFamily: fontFamilies.body.regular,
      marginTop: 12,
      fontSize: 14,
    },
    headerSection: {
      marginBottom: 24,
    },
    mainTitle: {
      fontSize: 32,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 8,
    },
    mainSubtitle: {
      fontSize: 16,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 24,
    },
    tierCardPremium: {
      backgroundColor: colors.background.darkElevated,
      borderRadius: BORDER_RADIUS.xl,
      padding: 24,
      marginBottom: 16,
      borderWidth: 3,
      borderColor: colors.brand.purple[400],
      position: 'relative',
    },
    tierCardSecondary: {
      backgroundColor: colors.background.darkElevated,
      borderRadius: BORDER_RADIUS.xl,
      padding: 24,
      marginBottom: 16,
      borderWidth: 2,
      borderColor: colors.brand.purple[400],
    },
    tierCardFree: {
      backgroundColor: colors.background.darkElevated,
      borderRadius: BORDER_RADIUS.xl,
      padding: 24,
      marginBottom: 24,
      borderWidth: 2,
      borderColor: colors.border.dark,
    },
    ethicsNote: {
      backgroundColor: colors.overlay.purple[8],
      borderRadius: BORDER_RADIUS.lg,
      padding: 20,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.overlay.purple[20],
    },
    ethicsText: {
      fontSize: 13,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      lineHeight: 20,
      textAlign: 'center',
    },
    tierName: {
      fontSize: 28,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 4,
    },
    tierDescription: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      marginBottom: 16,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 20,
    },
    price: {
      fontSize: 42,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    period: {
      fontSize: 16,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      marginBottom: 8,
      marginLeft: 4,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border.dark,
      marginBottom: 20,
    },
    featuresList: {
      marginBottom: 20,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    featureIcon: {
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    featureIconPremium: {
      backgroundColor: colors.brand.purple[400],
    },
    featureIconIncluded: {
      backgroundColor: colors.background.darkCard,
    },
    featureIconExcluded: {
      backgroundColor: colors.text.gray[800],
    },
    featureTextIncluded: {
      fontSize: 14,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.primary,
      flex: 1,
      fontWeight: '500',
    },
    featureTextExcluded: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[600],
      flex: 1,
    },
    ctaButtonPremium: {
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      marginBottom: 8,
    },
    ctaButtonText: {
      color: colors.absolute.white,
      fontSize: 16,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      textAlign: 'center',
      paddingVertical: 16,
      backgroundColor: colors.brand.purple[400],
    },
    ctaButtonSecondary: {
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: colors.brand.purple[400],
    },
    ctaButtonTextSecondary: {
      color: colors.brand.purple[400],
      fontSize: 16,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      textAlign: 'center',
      paddingVertical: 14,
    },
    currentBadge: {
      backgroundColor: colors.text.gray[800],
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: colors.border.dark,
    },
    currentBadgeText: {
      color: colors.text.tertiary,
      fontSize: 14,
      fontWeight: '600',
      fontFamily: fontFamilies.body.semibold,
      textAlign: 'center',
    },
    stickyBottom: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.overlay.dark,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.dark,
    },
    stickyButton: {
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
    },
    stickyButtonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
    },
    stickyButtonText: {
      color: colors.absolute.white,
      fontSize: 16,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      marginLeft: 8,
    },
    premiumActiveCard: {
      borderRadius: BORDER_RADIUS.xl,
      padding: 24,
      marginBottom: 16,
    },
    premiumHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 24,
    },
    premiumIcon: {
      backgroundColor: colors.border.primary,
      padding: 12,
      borderRadius: BORDER_RADIUS.lg,
      marginRight: 16,
    },
    premiumHeaderText: {
      flex: 1,
    },
    premiumTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      color: colors.absolute.white,
      marginBottom: 4,
    },
    premiumSubtitle: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
    },
    premiumBenefits: {
      marginBottom: 20,
    },
    premiumBenefitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    premiumBenefitIcon: {
      backgroundColor: colors.border.primary,
      padding: 8,
      borderRadius: BORDER_RADIUS.sm,
      marginRight: 12,
    },
    premiumBenefitText: {
      color: colors.absolute.white,
      fontSize: 14,
      fontWeight: '500',
      fontFamily: fontFamilies.body.medium,
    },
    premiumInfo: {
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.lg,
      padding: 16,
    },
    premiumInfoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    premiumInfoLabel: {
      color: colors.text.tertiary,
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
    },
    premiumInfoValue: {
      color: colors.absolute.white,
      fontSize: 16,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: BORDER_RADIUS.xs,
      backgroundColor: colors.semantic.success,
      marginRight: 6,
    },
    statusActive: {
      color: colors.semantic.success,
      fontSize: 14,
      fontWeight: '600',
      fontFamily: fontFamilies.body.semibold,
    },
    manageButton: {
      backgroundColor: colors.background.darkElevated,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 14,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border.dark,
    },
    manageButtonText: {
      color: colors.absolute.white,
      fontSize: 14,
      fontWeight: '600',
      fontFamily: fontFamilies.body.semibold,
      marginLeft: 8,
    },
    usageCardInline: {
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 16,
    },
    usageLabel: {
      fontSize: 12,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      marginBottom: 4,
    },
    usageValueLight: {
      fontSize: 18,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      color: colors.absolute.white,
      marginBottom: 8,
    },
    progressBarLight: {
      height: 6,
      backgroundColor: colors.border.primary,
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressFillLight: {
      height: '100%',
      backgroundColor: colors.absolute.white,
      borderRadius: 3,
    },
    usageWarningLight: {
      fontSize: 12,
      fontFamily: fontFamilies.body.medium,
      color: colors.social.gold,
      fontWeight: '500',
      marginTop: 8,
    },
    recommendedBadge: {
      position: 'absolute',
      top: -12,
      right: 16,
      backgroundColor: colors.brand.purple[600],
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.md,
    },
    recommendedText: {
      color: colors.absolute.white,
      fontSize: 10,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      letterSpacing: 0.5,
    },
    upgradePromptCard: {
      backgroundColor: colors.background.darkElevated,
      borderRadius: 20,
      padding: 20,
      marginTop: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.brand.purple[600],
    },
    upgradePromptTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 8,
    },
    upgradePromptText: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      marginBottom: 16,
      lineHeight: 20,
    },
    upgradeFeatures: {
      marginBottom: 16,
    },
    upgradeFeatureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    upgradeFeatureText: {
      color: colors.text.primary,
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      marginLeft: 10,
    },
    upgradeButton: {
      backgroundColor: colors.brand.purple[600],
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 14,
      alignItems: 'center',
    },
    upgradeButtonText: {
      color: colors.absolute.white,
      fontSize: 16,
      fontWeight: 'bold',
      fontFamily: fontFamilies.body.bold,
    },
  });
