import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors, commonStyles, type ColorScheme } from '../../theme';
import { AdminSubTabBar } from '../../components/admin/AdminDashboard/AdminSubTabBar';
import { AdminMetricsSection } from '../../components/admin/AdminDashboard/AdminMetricsSection';
import { AdminRevenueSection } from '../../components/admin/AdminDashboard/AdminRevenueSection';
import { useAdminProductMetrics } from '../../hooks/admin';
import {
  SectionHeader,
  MetricCard,
  LoadingSection,
  ErrorSection,
  sharedStyles,
} from '../../components/admin/AdminDashboard/shared';

type SubTab = 'growth' | 'engagement' | 'revenue' | 'adoption';

const SUB_TABS = [
  { id: 'growth', label: 'admin.tabs.growth' },
  { id: 'engagement', label: 'admin.tabs.engagement' },
  { id: 'revenue', label: 'admin.tabs.revenue' },
  { id: 'adoption', label: 'admin.tabs.adoption' },
];

const VALID_TABS = SUB_TABS.map(t => t.id);

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return 'N/A';
  return value.toFixed(decimals);
}

function EngagementContent() {
  const { t } = useTranslation();
  const metricsQuery = useAdminProductMetrics();
  const metrics = metricsQuery.data;
  const engagement = metrics?.engagement;
  const summary = metrics?.summary;

  return (
    <>
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.insights.userActivity')} icon="people-outline" />
        {metricsQuery.isLoading ? (
          <LoadingSection />
        ) : metricsQuery.isError ? (
          <ErrorSection message={t('admin.insights.failedToLoadEngagement')} />
        ) : (
          <View style={staticStyles.metricsGrid}>
            <MetricCard label={t('admin.insights.active30d')} value={summary?.activeUsersLast30Days ?? 0} />
            <MetricCard label={t('admin.insights.totalUsers')} value={summary?.totalUsers ?? 0} />
            <MetricCard label={t('admin.insights.totalSongs')} value={summary?.totalSongsGenerated ?? 0} />
          </View>
        )}
      </View>

      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.insights.contentEngagement')} icon="musical-notes-outline" />
        {metricsQuery.isLoading ? (
          <LoadingSection />
        ) : metricsQuery.isError ? (
          <ErrorSection message={t('admin.insights.failedToLoadEngagement')} />
        ) : (
          <View style={staticStyles.metricsGrid}>
            <MetricCard
              label={t('admin.insights.songsPerUserPerMonth')}
              value={formatNumber(engagement?.songsPerActiveUserPerMonth)}
            />
            <MetricCard label={t('admin.insights.returnRate')} value={formatPercent(engagement?.songReturnRate)} />
            <MetricCard
              label={t('admin.insights.journalPerUserPerMonth')}
              value={formatNumber(engagement?.journalEntriesPerUserPerMonth)}
            />
          </View>
        )}
      </View>
    </>
  );
}

function AdoptionContent() {
  const { t } = useTranslation();
  const metricsQuery = useAdminProductMetrics();
  const metrics = metricsQuery.data;
  const featureUsage = metrics?.featureUsage;

  return (
    <>
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.insights.journalFeatures')} icon="book-outline" />
        {metricsQuery.isLoading ? (
          <LoadingSection />
        ) : metricsQuery.isError ? (
          <ErrorSection message={t('admin.insights.failedToLoadAdoption')} />
        ) : (
          <View style={staticStyles.metricsGrid}>
            <MetricCard
              label={t('admin.insights.multipleJournals')}
              value={formatPercent(featureUsage?.multipleJournalsRate)}
            />
            <MetricCard
              label={t('admin.insights.chaptersUsed')}
              value={formatPercent(featureUsage?.chaptersUsageRate)}
            />
          </View>
        )}
      </View>

      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.insights.musicFeatures')} icon="headset-outline" />
        {metricsQuery.isLoading ? (
          <LoadingSection />
        ) : metricsQuery.isError ? (
          <ErrorSection message={t('admin.insights.failedToLoadMusicAdoption')} />
        ) : (
          <View style={staticStyles.metricsGrid}>
            <MetricCard
              label={t('admin.insights.alarmUsage')}
              value={formatPercent(featureUsage?.trackAlarmUsageRate)}
            />
            <MetricCard
              label={t('admin.insights.downloadsPerUser')}
              value={formatNumber(featureUsage?.downloadsPerUser)}
            />
          </View>
        )}
      </View>
    </>
  );
}

export default function InsightsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<SubTab>('growth');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (params.tab && VALID_TABS.includes(params.tab)) {
      setActiveTab(params.tab as SubTab);
    }
  }, [params.tab]);

  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId as SubTab);
      router.replace(`/(admin)/insights?tab=${tabId}` as Href);
    },
    [router]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey(prev => prev + 1);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <View style={styles.container}>
      <AdminSubTabBar
        tabs={SUB_TABS.map(tab => ({ ...tab, label: t(tab.label) }))}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />
        }
      >
        {activeTab === 'growth' && <AdminMetricsSection key={`growth-${refreshKey}`} />}
        {activeTab === 'engagement' && <EngagementContent key={`engagement-${refreshKey}`} />}
        {activeTab === 'revenue' && <AdminRevenueSection key={`revenue-${refreshKey}`} />}
        {activeTab === 'adoption' && <AdoptionContent key={`adoption-${refreshKey}`} />}
      </ScrollView>
    </View>
  );
}

const staticStyles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    content: commonStyles.flexOne,
    contentContainer: {
      padding: 16,
      paddingBottom: 100,
    },
  });
