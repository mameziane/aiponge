/**
 * Paywall Screen - Ethical Pricing That Respects Your Inner Life
 * Transparent, calm, non-manipulative pricing aligned with aiponge's values
 * Uses consistent tier terminology: Guest, Explorer, Personal, Practice, Studio
 * Integrates with RevenueCat for actual pricing and purchase handling
 *
 * Tier Structure:
 * - Personal: subscription_monthly_personal, subscription_yearly_personal
 * - Practice: subscription_monthly_practice, subscription_yearly_practice
 * - Studio: subscription_monthly_studio, subscription_yearly_studio
 */

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import {
  useSubscriptionData,
  useSubscriptionActions,
  REVENUECAT_PRODUCT_IDS,
} from '../../contexts/SubscriptionContext';
import { useAuthStore, selectUser } from '../../auth/store';
import { useThemeColors, type ColorScheme, commonStyles, Z_INDEX, BORDER_RADIUS } from '../../theme';
import { fontFamilies } from '../../theme/typography';
import { LiquidGlassCard } from '../../components/ui';
import type { PurchasesPackage } from 'react-native-purchases';
import { TIER_IDS, isPaidTier as isPaidTierCheck } from '@aiponge/shared-contracts';
import { getTierDisplay, PAID_TIERS, type TierId } from '../../constants/tierDisplayConfig';

type BillingPeriod = 'monthly' | 'annual';
type SelectedTier = typeof TIER_IDS.PERSONAL | typeof TIER_IDS.PRACTICE | typeof TIER_IDS.STUDIO;

interface PackageInfo {
  pkg: PurchasesPackage;
  priceString: string;
  period: string;
  billingPeriod: BillingPeriod;
}

function parsePeriod(
  subscriptionPeriod?: string,
  productId?: string
): { billingPeriod: BillingPeriod; displayPeriod: string } {
  if (subscriptionPeriod) {
    const match = subscriptionPeriod.match(/P(\d+)([DWMY])/);
    if (match) {
      const [, count, unit] = match;
      const num = parseInt(count, 10);

      if (unit === 'Y' || (unit === 'M' && num >= 12)) {
        return {
          billingPeriod: 'annual',
          displayPeriod: num === 1 || (unit === 'M' && num === 12) ? 'year' : `${num} years`,
        };
      }
      return { billingPeriod: 'monthly', displayPeriod: num === 1 ? 'month' : `${num} months` };
    }
  }

  if (productId) {
    const id = productId.toLowerCase();
    if (id.includes('yearly') || id.includes('annual')) {
      return { billingPeriod: 'annual', displayPeriod: 'year' };
    }
  }

  return { billingPeriod: 'monthly', displayPeriod: 'month' };
}

function formatPeriod(period?: string): string {
  if (!period) return 'month';
  const match = period.match(/P(\d+)([DWMY])/);
  if (!match) return 'month';
  const [, count, unit] = match;
  const num = parseInt(count, 10);
  const unitMap: Record<string, string> = {
    D: num === 1 ? 'day' : 'days',
    W: num === 1 ? 'week' : 'weeks',
    M: num === 1 ? 'month' : 'months',
    Y: num === 1 ? 'year' : 'years',
  };
  return num === 1 ? unitMap[unit] : `${num} ${unitMap[unit]}`;
}

export function PaywallScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { offerings, isPaidTier, currentTier, isLoading } = useSubscriptionData();
  const { purchasePackage, restorePurchases } = useSubscriptionActions();
  const user = useAuthStore(selectUser);
  const isGuest = !user || user.isGuest;
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState<SelectedTier>(TIER_IDS.PERSONAL);
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState<BillingPeriod>('monthly');

  const { personalPackages, practicePackages, studioPackages } = useMemo(() => {
    if (!offerings?.availablePackages) return { personalPackages: [], practicePackages: [], studioPackages: [] };

    const personal: PackageInfo[] = [];
    const practice: PackageInfo[] = [];
    const studio: PackageInfo[] = [];

    offerings.availablePackages.forEach(pkg => {
      const productId = pkg.product.identifier.toLowerCase();
      const { billingPeriod, displayPeriod } = parsePeriod(pkg.product.subscriptionPeriod ?? undefined, productId);

      const packageInfo: PackageInfo = {
        pkg,
        priceString: pkg.product.priceString,
        period: displayPeriod,
        billingPeriod,
      };

      if (productId.includes(TIER_IDS.PERSONAL) || productId.includes('starter')) {
        personal.push(packageInfo);
      } else if (productId.includes(TIER_IDS.PRACTICE) || productId.includes('premium')) {
        practice.push(packageInfo);
      } else if (productId.includes(TIER_IDS.STUDIO)) {
        studio.push(packageInfo);
      }
    });

    const sortOrder: BillingPeriod[] = ['monthly', 'annual'];
    const sortFn = (a: PackageInfo, b: PackageInfo) =>
      sortOrder.indexOf(a.billingPeriod) - sortOrder.indexOf(b.billingPeriod);

    return {
      personalPackages: personal.sort(sortFn),
      practicePackages: practice.sort(sortFn),
      studioPackages: studio.sort(sortFn),
    };
  }, [offerings]);

  const currentTierPackages =
    selectedTier === TIER_IDS.PERSONAL
      ? personalPackages
      : selectedTier === TIER_IDS.PRACTICE
        ? practicePackages
        : studioPackages;

  // Find the package matching selected billing period
  const selectedPackage = useMemo(() => {
    return currentTierPackages.find(pkg => pkg.billingPeriod === selectedBillingPeriod) || currentTierPackages[0];
  }, [currentTierPackages, selectedBillingPeriod]);

  const hasPackages = currentTierPackages.length > 0;
  const hasMultiplePackages = currentTierPackages.length > 1;

  // Get available billing periods for the current tier
  const availableBillingPeriods = useMemo(() => {
    return currentTierPackages.map(pkg => pkg.billingPeriod);
  }, [currentTierPackages]);

  const handlePurchase = async () => {
    if (!selectedPackage) {
      Alert.alert(t('common.error'), t('paywall.noPackages'));
      return;
    }

    // Guest users must create an account before purchasing
    if (isGuest) {
      Alert.alert(
        t('paywall.accountRequired.title', { defaultValue: 'Create Your Account' }),
        t('paywall.accountRequired.message', {
          defaultValue:
            'To subscribe and manage your membership, please create an account first. Your generated content will be saved to your new account.',
        }),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
          {
            text: t('paywall.accountRequired.createAccount', { defaultValue: 'Create Account' }),
            onPress: () => router.push({ pathname: '/(auth)/register', params: { returnTo: '/paywall' } } as never),
          },
        ]
      );
      return;
    }

    try {
      setPurchaseLoading(true);
      await purchasePackage(selectedPackage.pkg);
      Alert.alert(t('common.success'), t('paywall.welcomeToPremium'));
      router.back();
    } catch (error: unknown) {
      const typedError = error as { userCancelled?: boolean };
      if (!typedError.userCancelled) {
        Alert.alert(t('common.error'), t('paywall.purchaseFailed'));
      }
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleRestore = async () => {
    try {
      setPurchaseLoading(true);
      await restorePurchases();
      Alert.alert(t('common.success'), t('paywall.purchasesRestored'));
      router.back();
    } catch {
      Alert.alert(t('common.error'), t('paywall.restoreFailed'));
    } finally {
      setPurchaseLoading(false);
    }
  };

  const getPeriodLabel = (period: BillingPeriod) => {
    switch (period) {
      case 'monthly':
        return t('subscription.perMonth');
      case 'annual':
        return t('subscription.perYear');
    }
  };

  const getPeriodBadge = (period: BillingPeriod) => {
    if (period === 'annual') return t('subscription.savings.bestValue');
    return t('subscription.savings.mostPopular');
  };

  if (isPaidTier || isPaidTierCheck(currentTier)) {
    const tierName = t(`subscription.tiers.${currentTier}.name`);

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.premiumContainer}>
          <LinearGradient colors={colors.gradients.premium} style={styles.premiumBadge}>
            <Ionicons name="star" size={48} color={colors.absolute.white} />
          </LinearGradient>

          <Text style={styles.premiumTitle}>{t('paywall.youreSubscribed', { tier: tierName })}</Text>
          <Text style={styles.premiumSubtitle}>{t('paywall.thanksForSupport')}</Text>

          <TouchableOpacity onPress={() => router.back()} style={styles.premiumButton} testID="button-close-paywall">
            <Text style={styles.premiumButtonText}>{t('paywall.continue')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.closeButtonContainer}>
          <TouchableOpacity onPress={() => router.back()} testID="button-close-paywall">
            <Ionicons name="close" size={28} color={colors.text.gray[400]} />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('paywall.headerTitle')}</Text>
        </View>

        <LiquidGlassCard intensity="light" padding={20} borderRadius={16} style={styles.ethicsBox}>
          <View style={styles.ethicsHeader}>
            <Ionicons name="information-circle-outline" size={20} color={colors.brand.purple[400]} />
            <Text style={styles.ethicsLabel}>{t('paywall.ourPrinciple')}</Text>
          </View>
          <Text style={styles.ethicsText}>{t('paywall.principleText')}</Text>
        </LiquidGlassCard>

        {/* Tier Selection Tabs */}
        <View style={styles.tierTabsContainer}>
          {PAID_TIERS.map(tierId => {
            const tierConfig = getTierDisplay(tierId);
            const isSelected = selectedTier === tierId;
            return (
              <TouchableOpacity
                key={tierId}
                style={[styles.tierTab, isSelected && styles.tierTabActive]}
                onPress={() => setSelectedTier(tierId as SelectedTier)}
                testID={`button-tier-${tierId}`}
              >
                <Ionicons
                  name={tierConfig.icon}
                  size={18}
                  color={isSelected ? colors.brand.purple[400] : colors.text.gray[400]}
                />
                <Text style={[styles.tierTabText, isSelected && styles.tierTabTextActive]}>
                  {t(`subscription.tiers.${tierId}.name`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Billing Period Selection */}
        {hasMultiplePackages && (
          <View style={styles.billingPeriodContainer}>
            <Text style={styles.sectionLabel}>{t('subscription.billingPeriod.title')}</Text>
            <View style={styles.billingPeriodButtons}>
              {[...new Set(currentTierPackages.map(p => p.billingPeriod))].map(period => (
                <TouchableOpacity
                  key={period}
                  style={[styles.periodButton, selectedBillingPeriod === period && styles.periodButtonActive]}
                  onPress={() => setSelectedBillingPeriod(period)}
                  testID={`button-period-${period}`}
                >
                  <Text
                    style={[styles.periodButtonText, selectedBillingPeriod === period && styles.periodButtonTextActive]}
                  >
                    {t(`subscription.billingPeriod.${period}`)}
                  </Text>
                  <Text
                    style={[
                      period === 'annual' ? styles.periodBadgeSavings : styles.periodBadge,
                      selectedBillingPeriod === period && styles.periodBadgeActive,
                    ]}
                  >
                    {getPeriodBadge(period)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Selected Tier Card */}
        <View style={styles.tiersContainer}>
          <View style={styles.tierCard}>
            <LinearGradient colors={[colors.overlay.brand[15], colors.overlay.brand[10]]} style={styles.tierGradientBg}>
              <View style={styles.tierHeader}>
                <View style={styles.tierNameRow}>
                  <Ionicons name={getTierDisplay(selectedTier).icon} size={24} color={colors.brand.purple[400]} />
                  <Text style={styles.tierName}>{t(`subscription.tiers.${selectedTier}.name`)}</Text>
                </View>
                {getTierDisplay(selectedTier).showRecommendedBadge && selectedBillingPeriod === 'annual' && (
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedText}>{t('paywall.recommended')}</Text>
                  </View>
                )}
                <Text style={styles.tierSubtitle}>{t(`subscription.tiers.${selectedTier}.tagline`)}</Text>
              </View>

              <View style={styles.tierPriceRow}>
                {isLoading ? (
                  <ActivityIndicator color={colors.brand.purple[400]} size="small" />
                ) : selectedPackage ? (
                  <>
                    <Text style={styles.tierPrice}>{selectedPackage.priceString}</Text>
                    <Text style={styles.tierPricePeriod}>/{selectedPackage.period}</Text>
                  </>
                ) : (
                  <Text style={styles.tierPrice}>-</Text>
                )}
              </View>

              {selectedPackage?.billingPeriod === 'annual' && (
                <Text style={styles.savingsText}>{t('subscription.savings.savePercent', { percent: '37' })}</Text>
              )}

              <View style={styles.featuresContainer}>
                {getTierDisplay(selectedTier).features.map((feature, idx) => (
                  <FeatureItem key={idx} text={t(feature.i18nKey, feature.i18nParams)} />
                ))}
              </View>
            </LinearGradient>
          </View>
        </View>

        <TouchableOpacity
          onPress={handlePurchase}
          disabled={isLoading || purchaseLoading || !hasPackages}
          style={styles.upgradeCTA}
          activeOpacity={0.8}
          testID="button-purchase"
        >
          <LinearGradient
            colors={colors.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.upgradeGradient}
          >
            {purchaseLoading || isLoading ? (
              <ActivityIndicator color={colors.absolute.white} size="small" />
            ) : selectedPackage ? (
              <Text style={styles.upgradeCTAText}>
                {t('paywall.subscribeTo', { tier: t(`subscription.tiers.${selectedTier}.name`) })} -{' '}
                {selectedPackage.priceString}/{selectedPackage.period}
              </Text>
            ) : (
              <Text style={styles.upgradeCTAText}>{t('subscription.upgrade')}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.cancelAnytime}>{t('subscription.cancelAnytime')}</Text>

        <View style={styles.freeTiersSection}>
          <Text style={styles.freeTiersSectionTitle}>{t('paywall.freeTiers', { defaultValue: 'Free Plans' })}</Text>

          <LiquidGlassCard intensity="light" padding={16} borderRadius={16} style={styles.freeTierCard}>
            <View style={styles.guestHeader}>
              <Ionicons name={getTierDisplay(TIER_IDS.GUEST).icon} size={20} color={colors.text.gray[400]} />
              <Text style={styles.guestTitle}>{t('subscription.tiers.guest.name')}</Text>
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>{t('common.free', { defaultValue: 'Free' })}</Text>
              </View>
            </View>
            <Text style={styles.guestDescription}>{t('subscription.tiers.guest.description')}</Text>
            <View style={styles.freeTierFeatures}>
              {getTierDisplay(TIER_IDS.GUEST).features.map((feature, idx) => (
                <FeatureItem key={idx} text={t(feature.i18nKey, feature.i18nParams)} />
              ))}
            </View>
          </LiquidGlassCard>

          <LiquidGlassCard intensity="light" padding={16} borderRadius={16} style={styles.freeTierCard}>
            <View style={styles.guestHeader}>
              <Ionicons name={getTierDisplay(TIER_IDS.EXPLORER).icon} size={20} color={colors.brand.purple[400]} />
              <Text style={[styles.guestTitle, { color: colors.brand.purple[400] }]}>
                {t('subscription.tiers.explorer.name')}
              </Text>
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>{t('common.free', { defaultValue: 'Free' })}</Text>
              </View>
            </View>
            <Text style={styles.guestDescription}>{t('subscription.tiers.explorer.description')}</Text>
            <View style={styles.freeTierFeatures}>
              {getTierDisplay(TIER_IDS.EXPLORER).features.map((feature, idx) => (
                <FeatureItem key={idx} text={t(feature.i18nKey, feature.i18nParams)} />
              ))}
            </View>
          </LiquidGlassCard>

          <TouchableOpacity
            style={styles.continueGuestButton}
            onPress={() => router.back()}
            testID="button-continue-guest"
          >
            <Text style={styles.continueGuestText}>{t('subscription.continueWithFree')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.transparencySection}>
          <Text style={styles.sectionTitle}>{t('paywall.whereMoneyGoes.title')}</Text>
          <Text style={styles.sectionSubtitle}>{t('paywall.whereMoneyGoes.subtitle')}</Text>

          <View style={styles.breakdownContainer}>
            <BreakdownItem percentage="45%" label={t('paywall.whereMoneyGoes.breakdown.compute')} />
            <BreakdownItem percentage="35%" label={t('paywall.whereMoneyGoes.breakdown.engineering')} />
            <BreakdownItem percentage="10%" label={t('paywall.whereMoneyGoes.breakdown.research')} />
            <BreakdownItem percentage="10%" label={t('paywall.whereMoneyGoes.breakdown.operations')} />
          </View>
        </View>

        <View style={styles.faqSection}>
          <Text style={styles.sectionTitle}>{t('paywall.faq.title')}</Text>

          <FAQItem question={t('paywall.faq.whyNotFree.question')} answer={t('paywall.faq.whyNotFree.answer')} />

          <FAQItem
            question={t('paywall.faq.payingForSpirituality.question')}
            answer={t('paywall.faq.payingForSpirituality.answer')}
          />

          <FAQItem question={t('paywall.faq.adsOrData.question')} answer={t('paywall.faq.adsOrData.answer')} />

          <FAQItem question={t('paywall.faq.canStop.question')} answer={t('paywall.faq.canStop.answer')} />
        </View>

        <TouchableOpacity
          onPress={handleRestore}
          disabled={purchaseLoading}
          style={styles.restoreButton}
          testID="button-restore-purchases"
        >
          <Text style={styles.restoreText}>{t('paywall.restorePurchases')}</Text>
        </TouchableOpacity>

        <Text style={styles.legalText}>{t('paywall.legalText')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureItem({ text }: { text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.featureItem}>
      <Ionicons name="checkmark-circle" size={18} color={colors.brand.purple[400]} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function BreakdownItem({ percentage, label }: { percentage: string; label: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <LiquidGlassCard intensity="light" padding={16} borderRadius={12}>
      <View style={styles.breakdownItemContent}>
        <Text style={styles.breakdownPercentage}>{percentage}</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.text.gray[400]} style={styles.breakdownArrow} />
        <Text style={styles.breakdownLabel}>{label}</Text>
      </View>
    </LiquidGlassCard>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.faqItem}>
      <Text style={styles.faqQuestion}>{question}</Text>
      <Text style={styles.faqAnswer}>{answer}</Text>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.absolute.black,
    },
    scrollView: commonStyles.flexOne,
    scrollContent: {
      paddingBottom: 40,
    },
    premiumContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    premiumBadge: {
      width: 120,
      height: 120,
      borderRadius: 60,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    premiumTitle: {
      fontSize: 28,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 12,
      textAlign: 'center',
    },
    premiumSubtitle: {
      fontSize: 16,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[400],
      textAlign: 'center',
      marginBottom: 32,
      paddingHorizontal: 24,
      lineHeight: 24,
    },
    premiumButton: {
      backgroundColor: colors.brand.purple[400],
      paddingHorizontal: 48,
      paddingVertical: 16,
      borderRadius: 999,
    },
    premiumButtonText: {
      color: colors.text.primary,
      fontSize: 18,
      fontFamily: fontFamilies.body.bold,
    },
    closeButtonContainer: {
      alignSelf: 'flex-end',
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 16,
    },
    header: {
      paddingHorizontal: 24,
      marginBottom: 24,
    },
    headerTitle: {
      fontSize: 32,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 12,
      lineHeight: 40,
    },
    ethicsBox: {
      marginHorizontal: 24,
      marginBottom: 24,
    },
    ethicsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      gap: 8,
    },
    ethicsLabel: {
      fontSize: 14,
      fontFamily: fontFamilies.body.bold,
      color: colors.brand.purple[400],
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    ethicsText: {
      fontSize: 15,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[300],
      lineHeight: 22,
    },
    sectionLabel: {
      fontSize: 14,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.gray[400],
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    tierTabsContainer: {
      flexDirection: 'row',
      marginHorizontal: 24,
      marginBottom: 20,
      backgroundColor: colors.background.darkElevated,
      borderRadius: BORDER_RADIUS.md,
      padding: 4,
    },
    tierTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 10,
      gap: 6,
    },
    tierTabActive: {
      backgroundColor: colors.overlay.brand[15],
    },
    tierTabText: {
      fontSize: 15,
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.gray[400],
    },
    tierTabTextActive: {
      color: colors.text.primary,
    },
    recommendedBadgeSmall: {
      backgroundColor: colors.brand.purple[400],
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    recommendedTextSmall: {
      fontSize: 8,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      textTransform: 'uppercase',
    },
    billingPeriodContainer: {
      paddingHorizontal: 24,
      marginBottom: 24,
    },
    billingPeriodButtons: {
      flexDirection: 'row',
      gap: 8,
    },
    periodButton: {
      flex: 1,
      backgroundColor: colors.background.darkElevated,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.border.dark,
    },
    periodButtonActive: {
      borderColor: colors.brand.purple[400],
      backgroundColor: colors.overlay.brand[10],
    },
    periodButtonText: {
      fontSize: 14,
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.gray[400],
      marginBottom: 4,
    },
    periodButtonTextActive: {
      color: colors.text.primary,
    },
    periodBadge: {
      fontSize: 10,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.gray[500],
      textTransform: 'uppercase',
    },
    periodBadgeSavings: {
      fontSize: 10,
      fontFamily: fontFamilies.body.bold,
      color: colors.semantic.success,
      textTransform: 'uppercase',
    },
    periodBadgeActive: {
      color: colors.brand.purple[400],
    },
    tiersContainer: {
      paddingHorizontal: 24,
      gap: 16,
      marginBottom: 24,
    },
    tierCard: {
      backgroundColor: colors.background.darkElevated,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: colors.brand.purple[400],
      position: 'relative',
    },
    tierGradientBg: {
      padding: 20,
    },
    recommendedBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.brand.purple[400],
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.xs,
      marginTop: 6,
    },
    recommendedText: {
      fontSize: 10,
      fontFamily: fontFamilies.body.bold,
      color: colors.absolute.white,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tierHeader: {
      marginBottom: 12,
    },
    tierNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    tierName: {
      fontSize: 22,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    tierSubtitle: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[400],
    },
    tierPriceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
      marginBottom: 8,
    },
    tierPrice: {
      fontSize: 32,
      fontFamily: fontFamilies.body.bold,
      color: colors.brand.purple[400],
    },
    tierPricePeriod: {
      fontSize: 16,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[400],
    },
    savingsText: {
      fontSize: 14,
      fontFamily: fontFamilies.body.bold,
      color: colors.semantic.success,
      marginBottom: 12,
    },
    featuresContainer: {
      gap: 10,
      marginTop: 8,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    featureText: {
      fontSize: 15,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[300],
      flex: 1,
    },
    upgradeCTA: {
      marginHorizontal: 24,
      borderRadius: 999,
      overflow: 'hidden',
      marginBottom: 8,
    },
    upgradeGradient: {
      paddingVertical: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    upgradeCTAText: {
      fontSize: 16,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      textAlign: 'center',
    },
    cancelAnytime: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[400],
      textAlign: 'center',
      marginBottom: 32,
    },
    freeTiersSection: {
      marginHorizontal: 24,
      marginBottom: 32,
    },
    freeTiersSectionTitle: {
      fontSize: 16,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.gray[300],
      marginBottom: 12,
    },
    freeTierCard: {
      marginBottom: 12,
    },
    freeBadge: {
      backgroundColor: colors.overlay.brand[15],
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      marginLeft: 'auto',
    },
    freeBadgeText: {
      fontSize: 12,
      fontFamily: fontFamilies.body.semibold,
      color: colors.brand.purple[400],
      textTransform: 'uppercase',
    },
    freeTierFeatures: {
      gap: 4,
    },
    guestHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    guestTitle: {
      fontSize: 18,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    guestDescription: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[400],
      lineHeight: 20,
      marginBottom: 12,
    },
    continueGuestButton: {
      alignSelf: 'center',
      marginTop: 8,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
    continueGuestText: {
      fontSize: 15,
      fontFamily: fontFamilies.body.semibold,
      color: colors.brand.purple[400],
    },
    transparencySection: {
      paddingHorizontal: 24,
      marginBottom: 40,
    },
    sectionTitle: {
      fontSize: 22,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 8,
    },
    sectionSubtitle: {
      fontSize: 15,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[400],
      lineHeight: 22,
      marginBottom: 24,
    },
    breakdownContainer: {
      gap: 16,
    },
    breakdownItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    breakdownPercentage: {
      fontSize: 20,
      fontFamily: fontFamilies.body.bold,
      color: colors.brand.purple[400],
      minWidth: 50,
    },
    breakdownArrow: {
      marginHorizontal: 12,
    },
    breakdownLabel: {
      fontSize: 15,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[300],
      flex: 1,
    },
    faqSection: {
      paddingHorizontal: 24,
      marginBottom: 32,
    },
    faqItem: {
      marginTop: 24,
    },
    faqQuestion: {
      fontSize: 17,
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.primary,
      marginBottom: 8,
    },
    faqAnswer: {
      fontSize: 15,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[400],
      lineHeight: 22,
    },
    restoreButton: {
      alignSelf: 'center',
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginBottom: 24,
    },
    restoreText: {
      fontSize: 15,
      fontFamily: fontFamilies.body.semibold,
      color: colors.brand.purple[400],
    },
    legalText: {
      fontSize: 12,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.gray[500],
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: 32,
      marginBottom: 16,
    },
  });
