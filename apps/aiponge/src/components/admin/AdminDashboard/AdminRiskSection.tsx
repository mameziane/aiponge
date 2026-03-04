import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useThemeColors, BORDER_RADIUS, type ColorScheme } from '@/theme';
import { apiClient } from '@/lib/axiosApiClient';
import { useIsAdmin } from '@/hooks/admin';
import { ADMIN_QUERY } from '@/constants/appConfig';
import { SectionHeader, MetricCard, LoadingSection, sharedStyles } from './shared';

interface RiskFlag {
  id: string;
  userId: string;
  severity: 'low' | 'medium' | 'high' | 'crisis';
  type: string;
  description: string;
  createdAt: string;
  resolved: boolean;
}

interface RiskStats {
  total24h: number;
  total7d: number;
  total30d: number;
  bySeverity: { low: number; medium: number; high: number; crisis: number };
  resourceReferrals: number;
  escalationEvents: number;
}

function useRiskStats() {
  const isAdmin = useIsAdmin();
  return useQuery({
    queryKey: ['/api/v1/admin/safety/risk-stats'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: RiskStats }>('/api/v1/admin/safety/risk-stats');
      return response.data;
    },
    enabled: isAdmin,
    staleTime: ADMIN_QUERY.staleTime.slow,
  });
}

function useRecentRiskFlags() {
  const isAdmin = useIsAdmin();
  return useQuery({
    queryKey: ['/api/v1/admin/safety/risk-flags'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: RiskFlag[] }>(
        '/api/v1/admin/safety/risk-flags?limit=20'
      );
      return response.data;
    },
    enabled: isAdmin,
    staleTime: ADMIN_QUERY.staleTime.slow,
  });
}

export function AdminRiskSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statsQuery = useRiskStats();
  const flagsQuery = useRecentRiskFlags();
  const stats = statsQuery.data;
  const flags = flagsQuery.data;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'crisis':
        return colors.semantic.error;
      case 'high':
        return colors.semantic.warning;
      case 'medium':
        return colors.semantic.mediumFg;
      case 'low':
        return colors.semantic.success;
      default:
        return colors.text.tertiary;
    }
  };

  const getSeverityBgColor = (severity: string) => {
    switch (severity) {
      case 'crisis':
        return colors.semantic.errorLight;
      case 'high':
        return colors.semantic.warningLight;
      case 'medium':
        return colors.semantic.mediumBg;
      case 'low':
        return colors.semantic.successLight;
      default:
        return colors.background.secondary;
    }
  };

  return (
    <>
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.governance.riskOverview')} icon="shield-outline" />
        {statsQuery.isLoading ? (
          <LoadingSection />
        ) : statsQuery.isError ? (
          <View style={styles.apiNotReady}>
            <Ionicons name="information-circle-outline" size={24} color={colors.brand.primary} />
            <Text style={styles.apiNotReadyTitle}>{t('admin.governance.safetyApiNotConfigured')}</Text>
            <Text style={styles.apiNotReadyText}>{t('admin.governance.safetyApiNotConfiguredDesc')}</Text>
          </View>
        ) : stats ? (
          <>
            <View style={styles.summaryCardsRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.semantic.crisis }]}>
                <Ionicons name="warning" size={24} color={colors.semantic.crisisDark} />
                <Text style={[styles.summaryValue, { color: colors.text.dark }]}>{stats.bySeverity?.crisis ?? 0}</Text>
                <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>{t('admin.governance.crisis')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.semantic.high }]}>
                <Ionicons name="alert-circle" size={24} color={colors.semantic.highDark} />
                <Text style={[styles.summaryValue, { color: colors.text.dark }]}>{stats.bySeverity?.high ?? 0}</Text>
                <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>{t('admin.governance.high')}</Text>
              </View>
            </View>
            <View style={styles.summaryCardsRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.semantic.medium }]}>
                <Ionicons name="alert" size={24} color={colors.semantic.mediumDark} />
                <Text style={[styles.summaryValue, { color: colors.text.dark }]}>{stats.bySeverity?.medium ?? 0}</Text>
                <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>{t('admin.governance.medium')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.semantic.low }]}>
                <Ionicons name="checkmark-circle" size={24} color={colors.semantic.lowDark} />
                <Text style={[styles.summaryValue, { color: colors.text.dark }]}>{stats.bySeverity?.low ?? 0}</Text>
                <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>{t('admin.governance.low')}</Text>
              </View>
            </View>
            <View style={styles.timelineStatsRow}>
              <MetricCard label={t('admin.governance.last24h')} value={stats.total24h ?? 0} />
              <MetricCard label={t('admin.governance.last7d')} value={stats.total7d ?? 0} />
              <MetricCard label={t('admin.governance.last30d')} value={stats.total30d ?? 0} />
            </View>
          </>
        ) : null}
      </View>

      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.governance.recentRiskFlags')} icon="flag-outline" />
        {flagsQuery.isLoading ? (
          <LoadingSection />
        ) : flagsQuery.isError || !flags || flags.length === 0 ? (
          <View style={styles.emptyFlags}>
            <Ionicons name="checkmark-circle" size={32} color={colors.semantic.success} />
            <Text style={styles.emptyFlagsText}>{t('admin.governance.noActiveRiskFlags')}</Text>
          </View>
        ) : (
          <View style={styles.flagsList}>
            {flags.map(flag => (
              <View key={flag.id} style={styles.flagCard}>
                <View style={styles.flagHeader}>
                  <View style={[styles.severityBadge, { backgroundColor: getSeverityBgColor(flag.severity) }]}>
                    <Text style={[styles.severityText, { color: getSeverityColor(flag.severity) }]}>
                      {flag.severity.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.flagType}>{flag.type}</Text>
                  {flag.resolved && (
                    <View style={styles.resolvedBadge}>
                      <Ionicons name="checkmark" size={12} color={colors.semantic.success} />
                      <Text style={styles.resolvedText}>{t('admin.governance.resolved')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.flagDescription} numberOfLines={2}>
                  {flag.description}
                </Text>
                <Text style={styles.flagTimestamp}>{new Date(flag.createdAt).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    apiNotReady: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      gap: 8,
    },
    apiNotReadyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    apiNotReadyText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    summaryCardsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 12,
    },
    summaryCard: {
      flex: 1,
      alignItems: 'center',
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      gap: 8,
    },
    summaryValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
    },
    summaryLabel: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    timelineStatsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    emptyFlags: {
      alignItems: 'center',
      padding: 32,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      gap: 8,
    },
    emptyFlagsText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    flagsList: {
      gap: 12,
    },
    flagCard: {
      backgroundColor: colors.background.secondary,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      gap: 8,
    },
    flagHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    severityBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.xs,
    },
    severityText: {
      fontSize: 10,
      fontWeight: '700',
    },
    flagType: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    resolvedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.semantic.successLight,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.xs,
    },
    resolvedText: {
      fontSize: 10,
      color: colors.semantic.success,
      fontWeight: '600',
    },
    flagDescription: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    flagTimestamp: {
      fontSize: 11,
      color: colors.text.tertiary,
    },
  });
