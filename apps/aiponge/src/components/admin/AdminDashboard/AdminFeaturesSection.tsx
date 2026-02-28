import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { SectionHeader, LoadingSection, ErrorSection, createSharedStyles } from './shared';
import { useAdminProductMetrics, type ProductMetrics } from '@/hooks/admin';
import { useTranslation } from 'react-i18next';

type FeaturesSubTab = 'adoption' | 'health';

interface FeatureRow {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: number | null | undefined;
  type: 'percentage' | 'number';
}

function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(1);
}

function getHealthColor(value: number | null | undefined, colors: ReturnType<typeof useThemeColors>): string {
  if (value === null || value === undefined) return colors.text.tertiary;
  const pct = value * 100;
  if (pct >= 30) return colors.semantic.success;
  if (pct >= 10) return colors.semantic.warning;
  return colors.semantic.error;
}

function FeatureAdoptionCard({ feature, colors }: { feature: FeatureRow; colors: ReturnType<typeof useThemeColors> }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const displayValue = feature.type === 'percentage' ? formatPercentage(feature.value) : formatNumber(feature.value);
  const barWidth = feature.value !== null && feature.value !== undefined ? Math.min(feature.value * 100, 100) : 0;

  return (
    <View style={styles.featureCard}>
      <View style={styles.featureCardHeader}>
        <View style={styles.featureCardLeft}>
          <Ionicons name={feature.icon} size={18} color={colors.brand.primary} />
          <Text style={styles.featureCardName}>{feature.name}</Text>
        </View>
        <Text
          style={[
            styles.featureCardValue,
            { color: feature.type === 'percentage' ? getHealthColor(feature.value, colors) : colors.text.primary },
          ]}
        >
          {displayValue}
        </Text>
      </View>
      {feature.type === 'percentage' && (
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${barWidth}%`, backgroundColor: getHealthColor(feature.value, colors) },
            ]}
          />
        </View>
      )}
    </View>
  );
}

function AdoptionContent({ metrics, colors }: { metrics: ProductMetrics; colors: ReturnType<typeof useThemeColors> }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const { t } = useTranslation();

  const features: FeatureRow[] = [
    {
      name: t('admin.features.multipleJournals'),
      icon: 'book-outline',
      value: metrics.featureUsage?.multipleJournalsRate,
      type: 'percentage',
    },
    {
      name: t('admin.features.chapters'),
      icon: 'layers-outline',
      value: metrics.featureUsage?.chaptersUsageRate,
      type: 'percentage',
    },
    {
      name: t('admin.features.trackAlarms'),
      icon: 'alarm-outline',
      value: metrics.featureUsage?.trackAlarmUsageRate,
      type: 'percentage',
    },
    {
      name: t('admin.features.downloadsPerUser'),
      icon: 'download-outline',
      value: metrics.featureUsage?.downloadsPerUser,
      type: 'number',
    },
  ];

  const activationFeatures: FeatureRow[] = [
    {
      name: t('admin.features.onboardingCompletion'),
      icon: 'checkmark-circle-outline',
      value: metrics.activation?.onboardingCompletionRate,
      type: 'percentage',
    },
    {
      name: t('admin.features.firstSongCompletion'),
      icon: 'musical-notes-outline',
      value: metrics.activation?.firstSongCompletionRate,
      type: 'percentage',
    },
  ];

  return (
    <View>
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.features.featureAdoptionMatrix')} icon="grid-outline" />

        <View style={styles.categoryLabel}>
          <Ionicons name="rocket-outline" size={16} color={colors.brand.primary} />
          <Text style={styles.categoryLabelText}>{t('admin.features.activationFunnel')}</Text>
        </View>
        {activationFeatures.map(f => (
          <FeatureAdoptionCard key={f.name} feature={f} colors={colors} />
        ))}

        <View style={[styles.categoryLabel, { marginTop: 20 }]}>
          <Ionicons name="grid-outline" size={16} color={colors.brand.primary} />
          <Text style={styles.categoryLabelText}>{t('admin.features.featureUsage')}</Text>
        </View>
        {features.map(f => (
          <FeatureAdoptionCard key={f.name} feature={f} colors={colors} />
        ))}

        {metrics.generatedAt && (
          <Text style={styles.timestampText}>
            {t('admin.features.dataAsOf')}: {new Date(metrics.generatedAt).toLocaleString()}
          </Text>
        )}
      </View>
    </View>
  );
}

function HealthContent({ metrics, colors }: { metrics: ProductMetrics; colors: ReturnType<typeof useThemeColors> }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const { t } = useTranslation();

  const engagementHealth = [
    {
      label: t('admin.features.songsPerUser'),
      value: metrics.engagement?.songsPerActiveUserPerMonth,
      format: 'number' as const,
    },
    {
      label: t('admin.features.songReturnRate'),
      value: metrics.engagement?.songReturnRate,
      format: 'percentage' as const,
    },
    {
      label: t('admin.features.journalsPerUser'),
      value: metrics.engagement?.journalEntriesPerUserPerMonth,
      format: 'number' as const,
    },
  ];

  const monetizationHealth = [
    {
      label: t('admin.features.conversionRate'),
      value: metrics.monetization?.freeToPremiumConversionRate,
      format: 'percentage' as const,
    },
    {
      label: t('admin.features.churn30d'),
      value: metrics.monetization?.premiumChurn30Day,
      format: 'percentage' as const,
      inverted: true,
    },
    {
      label: t('admin.features.churn90d'),
      value: metrics.monetization?.premiumChurn90Day,
      format: 'percentage' as const,
      inverted: true,
    },
  ];

  return (
    <View>
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.features.featureHealth')} icon="fitness-outline" />

        <View style={styles.healthGrid}>
          <View style={styles.healthCard}>
            <View style={styles.healthCardHeader}>
              <Ionicons name="heart-outline" size={18} color={colors.brand.primary} />
              <Text style={styles.healthCardTitle}>{t('admin.features.engagementHealth')}</Text>
            </View>
            {engagementHealth.map(item => (
              <View key={item.label} style={styles.healthRow}>
                <Text style={styles.healthLabel}>{item.label}</Text>
                <Text
                  style={[
                    styles.healthValue,
                    { color: item.value != null ? colors.text.primary : colors.text.tertiary },
                  ]}
                >
                  {item.format === 'percentage' ? formatPercentage(item.value) : formatNumber(item.value)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.healthCard}>
            <View style={styles.healthCardHeader}>
              <Ionicons name="wallet-outline" size={18} color={colors.brand.primary} />
              <Text style={styles.healthCardTitle}>{t('admin.features.monetizationHealth')}</Text>
            </View>
            {monetizationHealth.map(item => (
              <View key={item.label} style={styles.healthRow}>
                <Text style={styles.healthLabel}>{item.label}</Text>
                <Text
                  style={[
                    styles.healthValue,
                    { color: item.value != null ? colors.text.primary : colors.text.tertiary },
                  ]}
                >
                  {formatPercentage(item.value)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {metrics.summary && (
          <View style={styles.summaryBar}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{metrics.summary.totalUsers}</Text>
              <Text style={styles.summaryLabel}>{t('admin.features.totalUsers')}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{metrics.summary.activeUsersLast30Days}</Text>
              <Text style={styles.summaryLabel}>{t('admin.features.active30d')}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{metrics.summary.premiumUsers}</Text>
              <Text style={styles.summaryLabel}>{t('admin.features.premium')}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{metrics.summary.totalSongsGenerated}</Text>
              <Text style={styles.summaryLabel}>{t('admin.features.songs')}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

export function AdminFeaturesSection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const [subTab, setSubTab] = useState<FeaturesSubTab>('adoption');
  const { t } = useTranslation();
  const metricsQuery = useAdminProductMetrics();

  if (metricsQuery.isLoading) {
    return (
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.features.featureAdoptionMatrix')} icon="grid-outline" />
        <LoadingSection />
      </View>
    );
  }

  if (metricsQuery.isError) {
    return (
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.features.featureAdoptionMatrix')} icon="grid-outline" />
        <ErrorSection message={t('admin.features.failedToLoad')} />
      </View>
    );
  }

  const metrics = metricsQuery.data;

  return (
    <ScrollView>
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'adoption' && styles.subTabActive]}
          onPress={() => setSubTab('adoption')}
        >
          <Ionicons
            name="grid-outline"
            size={16}
            color={subTab === 'adoption' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'adoption' && styles.subTabTextActive]}>
            {t('admin.features.adoption')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'health' && styles.subTabActive]}
          onPress={() => setSubTab('health')}
        >
          <Ionicons
            name="fitness-outline"
            size={16}
            color={subTab === 'health' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'health' && styles.subTabTextActive]}>
            {t('admin.features.health')}
          </Text>
        </TouchableOpacity>
      </View>

      {metrics && subTab === 'adoption' && <AdoptionContent metrics={metrics} colors={colors} />}
      {metrics && subTab === 'health' && <HealthContent metrics={metrics} colors={colors} />}
      {!metrics && (
        <View style={styles.noData}>
          <Ionicons name="analytics" size={48} color={colors.text.tertiary} />
          <Text style={styles.noDataText}>{t('admin.features.noData')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    subTabBar: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
      backgroundColor: colors.background.secondary,
      padding: 4,
      borderRadius: BORDER_RADIUS.sm,
    },
    subTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    subTabActive: {
      backgroundColor: colors.background.primary,
    },
    subTabText: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    subTabTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    categoryLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    categoryLabelText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    featureCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    featureCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    featureCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    featureCardName: {
      fontSize: 14,
      color: colors.text.primary,
      fontWeight: '500',
    },
    featureCardValue: {
      fontSize: 16,
      fontWeight: '700',
    },
    progressBarBg: {
      height: 4,
      backgroundColor: colors.background.tertiary,
      borderRadius: 2,
      marginTop: 10,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: 4,
      borderRadius: 2,
    },
    healthGrid: {
      gap: 12,
    },
    healthCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    healthCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
    },
    healthCardTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
    },
    healthRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    healthLabel: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    healthValue: {
      fontSize: 14,
      fontWeight: '600',
    },
    summaryBar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginTop: 16,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    summaryItem: {
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: 20,
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
      marginTop: 16,
    },
    noData: {
      alignItems: 'center',
      padding: 40,
    },
    noDataText: {
      fontSize: 14,
      color: colors.text.tertiary,
      marginTop: 12,
    },
  });
