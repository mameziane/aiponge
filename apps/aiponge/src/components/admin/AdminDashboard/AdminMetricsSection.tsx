/**
 * Admin Metrics Section
 * Product metrics dashboard showing activation, engagement, monetization, and feature usage
 */

import { useMemo, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { useAdminProductMetrics, type ProductMetrics } from '@/hooks/admin';
import { SectionHeader, LoadingSection, ErrorSection, createSharedStyles } from './shared';

interface MetricTileProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

function MetricTile({ label, value, subtitle, trend, trendValue }: MetricTileProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const getTrendColor = () => {
    if (trend === 'up') return colors.semantic.success;
    if (trend === 'down') return colors.semantic.error;
    return colors.text.tertiary;
  };

  const getTrendIcon = () => {
    if (trend === 'up') return 'trending-up';
    if (trend === 'down') return 'trending-down';
    return 'remove';
  };

  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricTileLabel}>{label}</Text>
      <Text style={styles.metricTileValue}>{value}</Text>
      {subtitle && <Text style={styles.metricTileSubtitle}>{subtitle}</Text>}
      {trend && trendValue && (
        <View style={styles.trendRow}>
          <Ionicons name={getTrendIcon()} size={14} color={getTrendColor()} />
          <Text style={[styles.trendText, { color: getTrendColor() }]}>{trendValue}</Text>
        </View>
      )}
    </View>
  );
}

interface MetricCategoryCardProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}

function MetricCategoryCard({ title, icon, children }: MetricCategoryCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.categoryCard}>
      <View style={styles.categoryHeader}>
        <Ionicons name={icon} size={20} color={colors.brand.primary} />
        <Text style={styles.categoryTitle}>{title}</Text>
      </View>
      <View style={styles.categoryContent}>{children}</View>
    </View>
  );
}

function formatPercentage(value: number | undefined | null): string {
  if (value === undefined || value === null) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return 'N/A';
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(1);
}

function formatDuration(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null) return 'N/A';
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function AdminMetricsSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const metricsQuery = useAdminProductMetrics();

  if (metricsQuery.isLoading) {
    return (
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.metrics.productMetrics')} icon="analytics-outline" />
        <LoadingSection />
      </View>
    );
  }

  if (metricsQuery.isError) {
    return (
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.metrics.productMetrics')} icon="analytics-outline" />
        <ErrorSection message={t('admin.metrics.failedToLoadMetrics')} />
      </View>
    );
  }

  const metrics = metricsQuery.data;

  if (!metrics) {
    return (
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.metrics.productMetrics')} icon="analytics-outline" />
        <View style={styles.noDataContainer}>
          <Ionicons name="analytics" size={48} color={colors.text.tertiary} />
          <Text style={styles.noDataText}>{t('admin.metrics.noMetricsData')}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Activation Metrics */}
      <MetricCategoryCard title={t('admin.metrics.activation')} icon="rocket-outline">
        <View style={styles.metricsGrid}>
          <MetricTile
            label={t('admin.metrics.onboardingCompletion')}
            value={formatPercentage(metrics.activation?.onboardingCompletionRate)}
            subtitle={`${metrics.activation?.completedOnboarding || 0} / ${metrics.activation?.totalUsers || 0} users`}
          />
          <MetricTile
            label={t('admin.metrics.timeToFirstSong')}
            value={formatDuration(metrics.activation?.avgTimeToFirstSongSeconds)}
            subtitle={t('admin.metrics.average')}
          />
          <MetricTile
            label={t('admin.metrics.firstSongCompletion')}
            value={formatPercentage(metrics.activation?.firstSongCompletionRate)}
            subtitle={t('admin.metrics.listenedThrough')}
          />
        </View>
      </MetricCategoryCard>

      {/* Engagement Metrics */}
      <MetricCategoryCard title={t('admin.metrics.engagement')} icon="heart-outline">
        <View style={styles.metricsGrid}>
          <MetricTile
            label={t('admin.metrics.songsPerUserMonth')}
            value={formatNumber(metrics.engagement?.songsPerActiveUserPerMonth)}
            subtitle={t('admin.metrics.activeUsers')}
          />
          <MetricTile
            label={t('admin.metrics.songReturnRate')}
            value={formatPercentage(metrics.engagement?.songReturnRate)}
            subtitle={t('admin.metrics.reListenedTracks')}
          />
          <MetricTile
            label={t('admin.metrics.journalsPerUserMonth')}
            value={formatNumber(metrics.engagement?.journalEntriesPerUserPerMonth)}
            subtitle={t('admin.metrics.entriesCreated')}
          />
        </View>
      </MetricCategoryCard>

      {/* Monetization Metrics */}
      <MetricCategoryCard title={t('admin.metrics.monetization')} icon="wallet-outline">
        <View style={styles.metricsGrid}>
          <MetricTile
            label={t('admin.metrics.freeToPremium')}
            value={formatPercentage(metrics.monetization?.freeToPremiumConversionRate)}
            subtitle={t('admin.metrics.conversionRate')}
          />
          <MetricTile
            label={t('admin.metrics.creditPackPurchases')}
            value={formatPercentage(metrics.monetization?.creditPackPurchaseRate)}
            subtitle={t('admin.metrics.ofPremiumUsers')}
          />
          <MetricTile
            label={t('admin.metrics.premiumChurn30d')}
            value={formatPercentage(metrics.monetization?.premiumChurn30Day)}
            subtitle={t('admin.metrics.firstMonth')}
          />
          <MetricTile
            label={t('admin.metrics.premiumChurn90d')}
            value={formatPercentage(metrics.monetization?.premiumChurn90Day)}
            subtitle={t('admin.metrics.after3Months')}
          />
        </View>
      </MetricCategoryCard>

      {/* Feature Usage Metrics */}
      <MetricCategoryCard title={t('admin.metrics.featureUsage')} icon="grid-outline">
        <View style={styles.metricsGrid}>
          <MetricTile
            label={t('admin.metrics.multipleJournals')}
            value={formatPercentage(metrics.featureUsage?.multipleJournalsRate)}
            subtitle={t('admin.metrics.usersWith2PlusJournals')}
          />
          <MetricTile
            label={t('admin.metrics.useChapters')}
            value={formatPercentage(metrics.featureUsage?.chaptersUsageRate)}
            subtitle={t('admin.metrics.organizeEntries')}
          />
          <MetricTile
            label={t('admin.metrics.useTrackAlarms')}
            value={formatPercentage(metrics.featureUsage?.trackAlarmUsageRate)}
            subtitle={t('admin.metrics.scheduledMusic')}
          />
          <MetricTile
            label={t('admin.metrics.downloadsPerUser')}
            value={formatNumber(metrics.featureUsage?.downloadsPerUser)}
            subtitle={t('admin.metrics.offlineUsage')}
          />
        </View>
      </MetricCategoryCard>

      {/* Summary Stats */}
      <View style={styles.summarySection}>
        <Text style={styles.summaryTitle}>{t('admin.metrics.summary')}</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{metrics.summary?.totalUsers || 0}</Text>
            <Text style={styles.summaryLabel}>{t('admin.metrics.totalUsers')}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{metrics.summary?.activeUsersLast30Days || 0}</Text>
            <Text style={styles.summaryLabel}>{t('admin.metrics.active30d')}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{metrics.summary?.premiumUsers || 0}</Text>
            <Text style={styles.summaryLabel}>{t('admin.metrics.premium')}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{metrics.summary?.totalSongsGenerated || 0}</Text>
            <Text style={styles.summaryLabel}>{t('admin.metrics.songsCreated')}</Text>
          </View>
        </View>
        {metrics.generatedAt && (
          <Text style={styles.timestampText}>Data as of: {new Date(metrics.generatedAt).toLocaleString()}</Text>
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    categoryCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    categoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      gap: 8,
    },
    categoryTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    categoryContent: {},
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    metricTile: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      minWidth: 140,
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    metricTileLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    metricTileValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
    },
    metricTileSubtitle: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: 4,
    },
    trendText: {
      fontSize: 12,
      fontWeight: '500',
    },
    noDataContainer: {
      alignItems: 'center',
      padding: 40,
    },
    noDataText: {
      fontSize: 14,
      color: colors.text.tertiary,
      marginTop: 12,
    },
    summarySection: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    summaryTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    summaryItem: {
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.brand.primary,
    },
    summaryLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    timestampText: {
      fontSize: 11,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: 12,
    },
  });
