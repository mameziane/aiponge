import { useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useAdminMusicApiCredits, useAdminUserCreditsStats } from '@/hooks/admin';
import { SectionHeader, createSharedStyles } from './shared';

export function AdminRevenueSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const musicApiCreditsQuery = useAdminMusicApiCredits();
  const userCreditsStatsQuery = useAdminUserCreditsStats();

  return (
    <>
      {/* Revenue & Credits */}
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.tabs.revenue')} icon="wallet-outline" />

        {/* MusicAPI Credits Card */}
        {musicApiCreditsQuery.isLoading ? (
          <View style={sharedStyles.musicApiCreditsCard}>
            <ActivityIndicator size="small" color={colors.brand.primary} />
          </View>
        ) : musicApiCreditsQuery.isError ? (
          <View style={sharedStyles.musicApiCreditsCard}>
            <View style={sharedStyles.musicApiCreditsHeader}>
              <Ionicons name="musical-notes" size={20} color={colors.semantic.error} />
              <Text style={sharedStyles.musicApiCreditsTitle}>{t('admin.providers.musicApiCredits')}</Text>
            </View>
            <Text style={[sharedStyles.musicApiCreditsError]}>{t('admin.providers.failedToLoadCredits')}</Text>
          </View>
        ) : musicApiCreditsQuery.data ? (
          <View style={sharedStyles.musicApiCreditsCard}>
            <View style={sharedStyles.musicApiCreditsHeader}>
              <Ionicons name="musical-notes" size={20} color={colors.brand.primary} />
              <Text style={sharedStyles.musicApiCreditsTitle}>{t('admin.providers.musicApiCredits')}</Text>
            </View>
            <View style={sharedStyles.musicApiCreditsRow}>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={sharedStyles.musicApiCreditValue}>{musicApiCreditsQuery.data.credits}</Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.monthly')}</Text>
              </View>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={sharedStyles.musicApiCreditValue}>{musicApiCreditsQuery.data.extraCredits}</Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.extra')}</Text>
              </View>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={[sharedStyles.musicApiCreditValue, { color: colors.brand.primary }]}>
                  {musicApiCreditsQuery.data.totalCredits}
                </Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.total')}</Text>
              </View>
            </View>
            <Text style={sharedStyles.musicApiCreditsNote}>15 credits per song generation</Text>
          </View>
        ) : null}

        {/* User Credits Stats Card */}
        {userCreditsStatsQuery.isLoading ? (
          <View style={sharedStyles.userCreditsCard}>
            <ActivityIndicator size="small" color={colors.brand.primary} />
          </View>
        ) : userCreditsStatsQuery.isError ? (
          <View style={sharedStyles.userCreditsCard}>
            <View style={sharedStyles.musicApiCreditsHeader}>
              <Ionicons name="wallet" size={20} color={colors.semantic.error} />
              <Text style={sharedStyles.musicApiCreditsTitle}>{t('admin.revenue.userCredits')}</Text>
            </View>
            <Text style={[sharedStyles.musicApiCreditsError]}>{t('admin.revenue.failedToLoadUserCredits')}</Text>
          </View>
        ) : userCreditsStatsQuery.data ? (
          <View style={sharedStyles.userCreditsCard}>
            <View style={sharedStyles.musicApiCreditsHeader}>
              <Ionicons name="wallet" size={20} color={colors.semantic.success} />
              <Text style={sharedStyles.musicApiCreditsTitle}>{t('admin.revenue.userCredits')} (All Users)</Text>
            </View>
            <View style={sharedStyles.userCreditsRow}>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={sharedStyles.musicApiCreditValue}>{userCreditsStatsQuery.data.totalCreditsBalance}</Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.totalBalance')}</Text>
              </View>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={sharedStyles.musicApiCreditValue}>{userCreditsStatsQuery.data.totalCreditsSpent}</Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.totalSpent')}</Text>
              </View>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={[sharedStyles.musicApiCreditValue, { color: colors.brand.primary }]}>
                  {userCreditsStatsQuery.data.avgCreditsPerUser}
                </Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.avgPerUser')}</Text>
              </View>
            </View>
            <View style={sharedStyles.userCreditsRow}>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={sharedStyles.musicApiCreditValue}>{userCreditsStatsQuery.data.totalUsers}</Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.users')}</Text>
              </View>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={sharedStyles.musicApiCreditValue}>{userCreditsStatsQuery.data.totalOrders}</Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.orders')}</Text>
              </View>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={[sharedStyles.musicApiCreditValue, { color: colors.semantic.success }]}>
                  ${(userCreditsStatsQuery.data.totalOrderRevenue / 100).toFixed(2)}
                </Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.revenue')}</Text>
              </View>
            </View>
            <View style={sharedStyles.userCreditsRow}>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={sharedStyles.musicApiCreditValue}>{userCreditsStatsQuery.data.totalGiftsSent}</Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.giftsSent')}</Text>
              </View>
              <View style={sharedStyles.musicApiCreditItem}>
                <Text style={[sharedStyles.musicApiCreditValue, { color: colors.semantic.success }]}>
                  {userCreditsStatsQuery.data.totalGiftsClaimed}
                </Text>
                <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.revenue.claimed')}</Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}
