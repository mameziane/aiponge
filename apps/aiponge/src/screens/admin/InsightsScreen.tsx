import React from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Text, TouchableOpacity } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, commonStyles, type ColorScheme } from '../../theme';
import { TabBar } from '../../components/shared/TabBar';
import { AdminMetricsSection } from '../../components/admin/AdminDashboard/AdminMetricsSection';
import { AdminRevenueSection } from '../../components/admin/AdminDashboard/AdminRevenueSection';
import { SubscriptionOverviewSection } from '../../components/admin/AdminDashboard/SubscriptionOverviewSection';
import { RevenueBreakdownSection } from '../../components/admin/AdminDashboard/RevenueBreakdownSection';
import { CohortRetentionSection } from '../../components/admin/AdminDashboard/CohortRetentionSection';
import { GrowthFunnelSection } from '../../components/admin/AdminDashboard/GrowthFunnelSection';
import { useAdminProductMetrics } from '../../hooks/admin';
import {
  SectionHeader,
  MetricCard,
  LoadingSection,
  ErrorSection,
  sharedStyles,
} from '../../components/admin/AdminDashboard/shared';

/**
 * Per-section ErrorBoundary — isolates render crashes so a single
 * failing section doesn't take down the entire Insights screen.
 */
class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; label?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={boundaryStyles.container}>
          <Ionicons name="alert-circle-outline" size={28} color="#FF6B6B" />
          <Text style={boundaryStyles.title}>Failed to load {this.props.label || 'section'}</Text>
          <Text style={boundaryStyles.message}>{this.state.error?.message || 'Unknown error'}</Text>
          <TouchableOpacity
            style={boundaryStyles.retry}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={boundaryStyles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const boundaryStyles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  message: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  retry: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  retryText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
});

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
      <TabBar
        tabs={SUB_TABS.map(tab => ({ ...tab, label: t(tab.label) }))}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        testIDPrefix="admin-subtab"
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />
        }
      >
        {activeTab === 'growth' && (
          <View key={`growth-${refreshKey}`}>
            <SectionErrorBoundary label="Growth Metrics">
              <AdminMetricsSection />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="Growth Funnel">
              <GrowthFunnelSection />
            </SectionErrorBoundary>
          </View>
        )}
        {activeTab === 'engagement' && (
          <View key={`engagement-${refreshKey}`}>
            <SectionErrorBoundary label="Engagement">
              <EngagementContent />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="Cohort Retention">
              <CohortRetentionSection />
            </SectionErrorBoundary>
          </View>
        )}
        {activeTab === 'revenue' && (
          <View key={`revenue-${refreshKey}`}>
            <SectionErrorBoundary label="Subscriptions">
              <SubscriptionOverviewSection />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="Revenue Breakdown">
              <RevenueBreakdownSection />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="Revenue">
              <AdminRevenueSection />
            </SectionErrorBoundary>
          </View>
        )}
        {activeTab === 'adoption' && (
          <SectionErrorBoundary label="Adoption" key={`adoption-${refreshKey}`}>
            <AdoptionContent />
          </SectionErrorBoundary>
        )}
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
