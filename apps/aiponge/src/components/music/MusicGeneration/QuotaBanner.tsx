import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { spacing } from '@/theme/spacing';
import { useTranslation } from '@/i18n';
import { deriveTierBehavior, type TierId } from '@/constants/tierDisplayConfig';

interface QuotaBannerProps {
  songsUsed: number;
  songsLimit: number;
  currentTier: TierId;
  onUpgrade?: () => void;
}

export function QuotaBanner({ songsUsed, songsLimit, currentTier, onUpgrade }: QuotaBannerProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const songsRemaining = Math.max(0, songsLimit - songsUsed);
  const usagePercent = songsLimit > 0 ? Math.min((songsUsed / songsLimit) * 100, 100) : 0;
  const isLimitReached = songsRemaining === 0;
  const isLowQuota = songsRemaining <= 2 && songsRemaining > 0;

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      router.push('/paywall');
    }
  };

  return (
    <View style={styles.quotaBanner} testID="quota-banner">
      <View style={styles.quotaBannerContent}>
        <View style={styles.quotaBannerLeft}>
          <Ionicons
            name={isLimitReached ? 'alert-circle' : 'musical-notes'}
            size={20}
            color={isLimitReached ? colors.semantic.error : colors.brand.primary}
          />
          <View style={styles.quotaBannerTextContainer}>
            <Text style={styles.quotaBannerTitle}>{t('subscription.generationQuota.title')}</Text>
            <Text
              style={[
                styles.quotaBannerValue,
                isLimitReached && styles.quotaBannerValueError,
                isLowQuota && styles.quotaBannerValueWarning,
              ]}
            >
              {t('subscription.generationQuota.remaining', { remaining: songsRemaining, total: songsLimit })}
            </Text>
          </View>
        </View>

        <View style={styles.quotaProgressContainer}>
          <View style={styles.quotaProgressBar}>
            <View
              style={[
                styles.quotaProgressFill,
                { width: `${usagePercent}%` },
                isLimitReached && styles.quotaProgressFillError,
                isLowQuota && styles.quotaProgressFillWarning,
              ]}
            />
          </View>
        </View>
      </View>

      {deriveTierBehavior(currentTier).showUpgradePromptOnLowQuota && (isLimitReached || isLowQuota) && (
        <TouchableOpacity style={styles.quotaUpgradeButton} onPress={handleUpgrade} testID="button-quota-upgrade">
          <Text style={styles.quotaUpgradeText}>{t('subscription.generationQuota.upgradePrompt')}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.brand.primary} />
        </TouchableOpacity>
      )}

      {isLimitReached && deriveTierBehavior(currentTier).showResetDateOnLimitReached && (
        <Text style={styles.quotaResetText}>{t('subscription.generationQuota.resetsOn', { date: 'next month' })}</Text>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    quotaBanner: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginHorizontal: spacing.screenHorizontal,
      marginTop: spacing.edgeInset,
      marginBottom: spacing.sectionGap,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    quotaBannerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    quotaBannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    quotaBannerTextContainer: {
      marginLeft: 12,
      flex: 1,
    },
    quotaBannerTitle: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 2,
    },
    quotaBannerValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    quotaBannerValueError: {
      color: colors.semantic.error,
    },
    quotaBannerValueWarning: {
      color: colors.semantic.warning,
    },
    quotaProgressContainer: {
      width: 80,
      marginLeft: 12,
    },
    quotaProgressBar: {
      height: 6,
      backgroundColor: colors.border.primary,
      borderRadius: 3,
      overflow: 'hidden',
    },
    quotaProgressFill: {
      height: '100%',
      backgroundColor: colors.brand.primary,
      borderRadius: 3,
    },
    quotaProgressFillError: {
      backgroundColor: colors.semantic.error,
    },
    quotaProgressFillWarning: {
      backgroundColor: colors.semantic.warning,
    },
    quotaUpgradeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
      paddingVertical: 10,
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    quotaUpgradeText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.brand.primary,
      marginRight: 6,
    },
    quotaResetText: {
      fontSize: 12,
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: 8,
    },
  });

export default QuotaBanner;
