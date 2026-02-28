import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { AdminMetricsSection } from './AdminMetricsSection';
import { SectionHeader, createSharedStyles, StatCard } from './shared';
import { useAuthStore } from '@/auth/store';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/lib/axiosApiClient';

type AnalyticsSubTab = 'growth' | 'ai-costs';

interface ProviderUsageData {
  totalRequests: number;
  successRate: number;
  totalCost: number;
  byProvider: Record<string, { requests: number; cost: number; avgLatency: number }>;
}

interface AnalyticsSummary {
  providerUsage: ProviderUsageData;
  userActivity: {
    totalEvents: number;
    recentEvents: Array<Record<string, unknown>>;
  };
}

export function AdminAnalyticsSection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const [subTab, setSubTab] = useState<AnalyticsSubTab>('growth');
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore(state => state.token);
  const { t } = useTranslation();

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ success: boolean; data: AnalyticsSummary; error?: string }>(
        '/api/v1/admin/analytics/summary'
      );
      const data = result as unknown as { success: boolean; data: AnalyticsSummary; error?: string };
      if (data.success) {
        setAnalytics(data.data);
      } else {
        setError(data.error || 'Failed to fetch analytics');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'ai-costs') {
      fetchAnalytics();
    }
  }, [subTab]);

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(4)}`;
  };

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <>
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'growth' && styles.subTabActive]}
          onPress={() => setSubTab('growth')}
        >
          <Ionicons
            name="trending-up-outline"
            size={16}
            color={subTab === 'growth' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'growth' && styles.subTabTextActive]}>
            {t('admin.tabs.growth')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'ai-costs' && styles.subTabActive]}
          onPress={() => setSubTab('ai-costs')}
        >
          <Ionicons
            name="cash-outline"
            size={16}
            color={subTab === 'ai-costs' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'ai-costs' && styles.subTabTextActive]}>
            {t('admin.analytics.aiCosts')}
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === 'growth' && <AdminMetricsSection />}

      {subTab === 'ai-costs' && (
        <View style={sharedStyles.section}>
          <SectionHeader title={t('admin.analytics.aiProviderCosts')} icon="cash-outline" />

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.brand.primary} />
              <Text style={styles.loadingText}>{t('admin.analytics.loadingAnalytics')}</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={32} color={colors.semantic.error} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchAnalytics}>
                <Text style={styles.retryButtonText}>{t('admin.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : analytics ? (
            <>
              <View style={styles.statsRow}>
                <StatCard
                  title={t('admin.analytics.totalRequests')}
                  value={analytics.providerUsage.totalRequests.toLocaleString()}
                  icon="server-outline"
                  color={colors.brand.primary}
                />
                <StatCard
                  title={t('admin.analytics.successRate')}
                  value={`${analytics.providerUsage.successRate.toFixed(1)}%`}
                  icon="checkmark-circle-outline"
                  color={colors.semantic.success}
                />
              </View>
              <View style={styles.statsRow}>
                <StatCard
                  title={t('admin.analytics.totalCost30d')}
                  value={formatCurrency(analytics.providerUsage.totalCost)}
                  icon="wallet-outline"
                  color={colors.semantic.warning}
                />
                <StatCard
                  title={t('admin.analytics.activeProviders')}
                  value={Object.keys(analytics.providerUsage.byProvider).length.toString()}
                  icon="apps-outline"
                  color={colors.brand.secondary}
                />
              </View>

              <Text style={styles.sectionTitle}>{t('admin.analytics.providerBreakdown')}</Text>
              <ScrollView style={styles.providerList}>
                {Object.entries(analytics.providerUsage.byProvider).map(([providerId, stats]) => (
                  <View key={providerId} style={styles.providerCard}>
                    <View style={styles.providerHeader}>
                      <Ionicons name="cloud-outline" size={18} color={colors.brand.primary} />
                      <Text style={styles.providerName}>{providerId}</Text>
                    </View>
                    <View style={styles.providerStats}>
                      <View style={styles.providerStat}>
                        <Text style={styles.statLabel}>{t('admin.analytics.requests')}</Text>
                        <Text style={styles.statValue}>{stats.requests.toLocaleString()}</Text>
                      </View>
                      <View style={styles.providerStat}>
                        <Text style={styles.statLabel}>{t('admin.analytics.cost')}</Text>
                        <Text style={styles.statValue}>{formatCurrency(stats.cost)}</Text>
                      </View>
                      <View style={styles.providerStat}>
                        <Text style={styles.statLabel}>{t('admin.analytics.avgLatency')}</Text>
                        <Text style={styles.statValue}>{formatLatency(stats.avgLatency)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
                {Object.keys(analytics.providerUsage.byProvider).length === 0 && (
                  <View style={styles.emptyState}>
                    <Ionicons name="analytics-outline" size={32} color={colors.text.tertiary} />
                    <Text style={styles.emptyText}>{t('admin.analytics.noProviderData')}</Text>
                  </View>
                )}
              </ScrollView>
            </>
          ) : null}
        </View>
      )}
    </>
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
    loadingContainer: {
      alignItems: 'center',
      padding: 32,
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    errorContainer: {
      alignItems: 'center',
      padding: 32,
      gap: 12,
    },
    errorText: {
      fontSize: 14,
      color: colors.semantic.error,
      textAlign: 'center',
    },
    retryButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.brand.primary,
      borderRadius: 6,
    },
    retryButtonText: {
      color: colors.text.primary,
      fontWeight: '600',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 16,
      marginBottom: 12,
    },
    providerList: {
      maxHeight: 300,
    },
    providerCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      marginBottom: 8,
    },
    providerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    providerName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      textTransform: 'capitalize',
    },
    providerStats: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    providerStat: {
      alignItems: 'center',
      flex: 1,
    },
    statLabel: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginBottom: 4,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    emptyState: {
      alignItems: 'center',
      padding: 24,
      gap: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.text.tertiary,
    },
  });
