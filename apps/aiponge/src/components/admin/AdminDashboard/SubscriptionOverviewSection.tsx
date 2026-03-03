import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useLifecycleDashboardOverview } from '@/hooks/admin';
import { SectionHeader, MetricCard, LoadingSection, ErrorSection } from './shared';

function formatCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function SubscriptionOverviewSection() {
  const { t } = useTranslation();
  const overviewQuery = useLifecycleDashboardOverview();
  const data = overviewQuery.data;

  return (
    <View style={styles.section}>
      <SectionHeader title={t('admin.insights.subscriptionOverview')} icon="card-outline" />

      {overviewQuery.isLoading ? (
        <LoadingSection />
      ) : overviewQuery.isError ? (
        <ErrorSection message={t('admin.insights.failedToLoadSubscription')} />
      ) : data ? (
        <>
          <View style={styles.grid}>
            <MetricCard label={t('admin.insights.mrr')} value={formatCurrency(data.mrr)} />
            <MetricCard label={t('admin.insights.arr')} value={formatCurrency(data.arr)} />
          </View>
          <View style={styles.grid}>
            <MetricCard label={t('admin.insights.paidUsers')} value={data.paidUsers} />
            <MetricCard label={t('admin.insights.conversionRate')} value={formatPercent(data.conversionRate)} />
            <MetricCard label={t('admin.insights.arpu')} value={formatCurrency(data.arpu)} />
          </View>
          <View style={styles.grid}>
            <MetricCard label={t('admin.insights.churnRate')} value={formatPercent(data.churnRate)} />
            <MetricCard label={t('admin.insights.ltv')} value={formatCurrency(data.ltv)} />
            <MetricCard label={t('admin.insights.trialConversion')} value={formatPercent(data.trialConversionRate)} />
          </View>
          <View style={styles.grid}>
            <MetricCard label={t('admin.insights.activeToday')} value={data.activeUsersToday} />
            <MetricCard label={t('admin.insights.totalUsers')} value={data.totalUsers} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
});
