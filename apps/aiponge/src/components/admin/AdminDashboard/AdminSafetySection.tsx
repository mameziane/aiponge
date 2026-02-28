import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/axiosApiClient';
import { useIsAdmin } from '@/hooks/admin';
import { queryKeys } from '@/lib/queryKeys';
import { ADMIN_QUERY } from '@/constants/appConfig';
import { SectionHeader, MetricCard, LoadingSection, ErrorSection, StatusBadge, createSharedStyles } from './shared';

type SafetySubTab = 'risk' | 'compliance';

interface RiskFlag {
  id: string;
  userId: string;
  severity: 'low' | 'medium' | 'high' | 'crisis';
  type: string;
  description: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

interface RiskStats {
  total24h: number;
  total7d: number;
  total30d: number;
  bySeverity: {
    low: number;
    medium: number;
    high: number;
    crisis: number;
  };
  resourceReferrals: number;
  escalationEvents: number;
}

interface ComplianceStats {
  deletionRequests: {
    pending: number;
    completed: number;
    total: number;
  };
  exportRequests: {
    pending: number;
    completed: number;
    total: number;
  };
  consentStatus: {
    marketing: number;
    analytics: number;
    personalization: number;
  };
  totalUsersWithConsent: number;
}

function useRiskStats() {
  const isAdmin = useIsAdmin();
  return useQuery({
    queryKey: queryKeys.admin.safetyRiskStats(),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: RiskStats }>('/api/v1/admin/safety/risk-stats');
      return response.data;
    },
    enabled: isAdmin,
    staleTime: ADMIN_QUERY.staleTime.slow,
    refetchInterval: 60000,
  });
}

function useRecentRiskFlags() {
  const isAdmin = useIsAdmin();
  return useQuery({
    queryKey: queryKeys.admin.safetyRiskFlags(),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: RiskFlag[] }>(
        '/api/v1/admin/safety/risk-flags?limit=20'
      );
      return response.data;
    },
    enabled: isAdmin,
    staleTime: ADMIN_QUERY.staleTime.slow,
    refetchInterval: 60000,
  });
}

function useComplianceStats() {
  const isAdmin = useIsAdmin();
  return useQuery({
    queryKey: queryKeys.admin.safetyCompliance(),
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: ComplianceStats }>(
        '/api/v1/admin/safety/compliance-stats'
      );
      return response.data;
    },
    enabled: isAdmin,
    staleTime: ADMIN_QUERY.staleTime.background,
    refetchInterval: 120000,
  });
}

function RiskMonitoringContent() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
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
        <SectionHeader title={t('admin.safety.riskOverview')} icon="shield-outline" />
        {statsQuery.isLoading ? (
          <LoadingSection />
        ) : statsQuery.isError ? (
          <View style={styles.apiNotReady}>
            <Ionicons name="information-circle-outline" size={24} color={colors.brand.primary} />
            <Text style={styles.apiNotReadyTitle}>{t('admin.safety.safetyApiNotConfigured')}</Text>
            <Text style={styles.apiNotReadyText}>{t('admin.safety.riskMonitoringEndpoints')}</Text>
            <View style={styles.endpointsList}>
              <Text style={styles.endpointItem}>{t('admin.safety.getRiskStats')}</Text>
              <Text style={styles.endpointItem}>{t('admin.safety.getRiskFlags')}</Text>
              <Text style={styles.endpointItem}>{t('admin.safety.postResolveFlag')}</Text>
            </View>
          </View>
        ) : stats ? (
          <>
            <View style={styles.summaryCardsRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.semantic.crisis }]}>
                <Ionicons name="warning" size={24} color={colors.semantic.crisisDark} />
                <Text style={[styles.summaryValue, { color: colors.text.dark }]}>{stats.bySeverity?.crisis ?? 0}</Text>
                <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>{t('admin.safety.crisis')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.semantic.high }]}>
                <Ionicons name="alert-circle" size={24} color={colors.semantic.highDark} />
                <Text style={[styles.summaryValue, { color: colors.text.dark }]}>{stats.bySeverity?.high ?? 0}</Text>
                <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>{t('admin.safety.high')}</Text>
              </View>
            </View>
            <View style={styles.summaryCardsRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.semantic.medium }]}>
                <Ionicons name="alert" size={24} color={colors.semantic.mediumDark} />
                <Text style={[styles.summaryValue, { color: colors.text.dark }]}>{stats.bySeverity?.medium ?? 0}</Text>
                <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>{t('admin.safety.medium')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.semantic.low }]}>
                <Ionicons name="checkmark-circle" size={24} color={colors.semantic.lowDark} />
                <Text style={[styles.summaryValue, { color: colors.text.dark }]}>{stats.bySeverity?.low ?? 0}</Text>
                <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>{t('admin.safety.low')}</Text>
              </View>
            </View>

            <View style={styles.timelineStatsRow}>
              <MetricCard label={t('admin.safety.last24h')} value={stats.total24h ?? 0} />
              <MetricCard label={t('admin.safety.last7d')} value={stats.total7d ?? 0} />
            </View>
            <View style={styles.timelineStatsRow}>
              <MetricCard label={t('admin.safety.last30d')} value={stats.total30d ?? 0} />
              <View style={styles.actionStatItem}>
                <Ionicons name="link-outline" size={20} color={colors.brand.primary} />
                <Text style={styles.actionStatValue}>{stats.resourceReferrals ?? 0}</Text>
                <Text style={styles.actionStatLabel}>{t('admin.safety.referrals')}</Text>
              </View>
            </View>
            <View style={styles.timelineStatsRow}>
              <View style={styles.actionStatItem}>
                <Ionicons name="arrow-up-circle-outline" size={20} color={colors.semantic.warning} />
                <Text style={styles.actionStatValue}>{stats.escalationEvents ?? 0}</Text>
                <Text style={styles.actionStatLabel}>{t('admin.safety.escalations')}</Text>
              </View>
            </View>
          </>
        ) : null}
      </View>

      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.safety.recentRiskFlags')} icon="flag-outline" />
        {flagsQuery.isLoading ? (
          <LoadingSection />
        ) : flagsQuery.isError ? (
          <View style={styles.emptyFlags}>
            <Ionicons name="checkmark-circle" size={32} color={colors.semantic.success} />
            <Text style={styles.emptyFlagsText}>{t('admin.safety.noRecentRiskFlags')}</Text>
          </View>
        ) : flags && flags.length > 0 ? (
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
                      <Text style={styles.resolvedText}>{t('admin.safety.resolved')}</Text>
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
        ) : (
          <View style={styles.emptyFlags}>
            <Ionicons name="checkmark-circle" size={32} color={colors.semantic.success} />
            <Text style={styles.emptyFlagsText}>{t('admin.safety.noActiveRiskFlags')}</Text>
          </View>
        )}
      </View>
    </>
  );
}

function ComplianceContent() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const statsQuery = useComplianceStats();
  const stats = statsQuery.data;

  return (
    <>
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.safety.dataRequests')} icon="document-text-outline" />
        {statsQuery.isLoading ? (
          <LoadingSection />
        ) : statsQuery.isError ? (
          <View style={styles.apiNotReady}>
            <Ionicons name="information-circle-outline" size={24} color={colors.brand.primary} />
            <Text style={styles.apiNotReadyTitle}>{t('admin.safety.complianceApiNotConfigured')}</Text>
            <Text style={styles.apiNotReadyText}>{t('admin.safety.gdprEndpoints')}</Text>
            <View style={styles.endpointsList}>
              <Text style={styles.endpointItem}>{t('admin.safety.getComplianceStats')}</Text>
              <Text style={styles.endpointItem}>{t('admin.safety.getDeletionRequests')}</Text>
              <Text style={styles.endpointItem}>{t('admin.safety.getExportRequests')}</Text>
              <Text style={styles.endpointItem}>{t('admin.safety.getAuditLog')}</Text>
            </View>
          </View>
        ) : stats ? (
          <>
            <View style={styles.requestCards}>
              <View style={styles.requestCard}>
                <View style={styles.requestCardHeader}>
                  <Ionicons name="trash-outline" size={20} color={colors.semantic.error} />
                  <Text style={styles.requestCardTitle}>{t('admin.safety.deletionRequests')}</Text>
                </View>
                <View style={styles.requestStats}>
                  <View style={styles.requestStatItem}>
                    <Text style={[styles.requestStatValue, { color: colors.semantic.warning }]}>
                      {stats.deletionRequests?.pending ?? 0}
                    </Text>
                    <Text style={styles.requestStatLabel}>{t('admin.safety.pending')}</Text>
                  </View>
                  <View style={styles.requestStatItem}>
                    <Text style={[styles.requestStatValue, { color: colors.semantic.success }]}>
                      {stats.deletionRequests?.completed ?? 0}
                    </Text>
                    <Text style={styles.requestStatLabel}>{t('admin.safety.completed')}</Text>
                  </View>
                  <View style={styles.requestStatItem}>
                    <Text style={styles.requestStatValue}>{stats.deletionRequests?.total ?? 0}</Text>
                    <Text style={styles.requestStatLabel}>{t('admin.safety.total')}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.requestCard}>
                <View style={styles.requestCardHeader}>
                  <Ionicons name="download-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.requestCardTitle}>{t('admin.safety.exportRequests')}</Text>
                </View>
                <View style={styles.requestStats}>
                  <View style={styles.requestStatItem}>
                    <Text style={[styles.requestStatValue, { color: colors.semantic.warning }]}>
                      {stats.exportRequests?.pending ?? 0}
                    </Text>
                    <Text style={styles.requestStatLabel}>{t('admin.safety.pending')}</Text>
                  </View>
                  <View style={styles.requestStatItem}>
                    <Text style={[styles.requestStatValue, { color: colors.semantic.success }]}>
                      {stats.exportRequests?.completed ?? 0}
                    </Text>
                    <Text style={styles.requestStatLabel}>{t('admin.safety.completed')}</Text>
                  </View>
                  <View style={styles.requestStatItem}>
                    <Text style={styles.requestStatValue}>{stats.exportRequests?.total ?? 0}</Text>
                    <Text style={styles.requestStatLabel}>{t('admin.safety.total')}</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        ) : null}
      </View>

      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.safety.consentStatus')} icon="checkbox-outline" />
        {statsQuery.isLoading ? (
          <LoadingSection />
        ) : stats ? (
          <View style={styles.consentSection}>
            <View style={styles.consentItem}>
              <View style={styles.consentInfo}>
                <Text style={styles.consentLabel}>{t('admin.safety.marketingCommunications')}</Text>
                <Text style={styles.consentValue}>{stats.consentStatus?.marketing ?? 0} users</Text>
              </View>
              <View style={styles.consentBar}>
                <View
                  style={[
                    styles.consentBarFill,
                    {
                      width: `${stats.totalUsersWithConsent > 0 ? ((stats.consentStatus?.marketing ?? 0) / stats.totalUsersWithConsent) * 100 : 0}%`,
                      backgroundColor: colors.brand.primary,
                    },
                  ]}
                />
              </View>
            </View>
            <View style={styles.consentItem}>
              <View style={styles.consentInfo}>
                <Text style={styles.consentLabel}>{t('admin.safety.analytics')}</Text>
                <Text style={styles.consentValue}>{stats.consentStatus?.analytics ?? 0} users</Text>
              </View>
              <View style={styles.consentBar}>
                <View
                  style={[
                    styles.consentBarFill,
                    {
                      width: `${stats.totalUsersWithConsent > 0 ? ((stats.consentStatus?.analytics ?? 0) / stats.totalUsersWithConsent) * 100 : 0}%`,
                      backgroundColor: colors.semantic.success,
                    },
                  ]}
                />
              </View>
            </View>
            <View style={styles.consentItem}>
              <View style={styles.consentInfo}>
                <Text style={styles.consentLabel}>{t('admin.safety.personalization')}</Text>
                <Text style={styles.consentValue}>{stats.consentStatus?.personalization ?? 0} users</Text>
              </View>
              <View style={styles.consentBar}>
                <View
                  style={[
                    styles.consentBarFill,
                    {
                      width: `${stats.totalUsersWithConsent > 0 ? ((stats.consentStatus?.personalization ?? 0) / stats.totalUsersWithConsent) * 100 : 0}%`,
                      backgroundColor: colors.semantic.warning,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.safety.auditLog')} icon="list-outline" />
        <View style={styles.comingSoon}>
          <Ionicons name="construct-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.comingSoonTitle}>{t('admin.comingSoon')}</Text>
          <Text style={styles.comingSoonText}>{t('admin.safety.auditLogDescription')}</Text>
          <View style={styles.plannedFeatures}>
            <Text style={styles.featureItem}>• Admin action history</Text>
            <Text style={styles.featureItem}>• Data access logging</Text>
            <Text style={styles.featureItem}>• Security event tracking</Text>
            <Text style={styles.featureItem}>• Export audit reports</Text>
          </View>
        </View>
      </View>
    </>
  );
}

export function AdminSafetySection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [subTab, setSubTab] = useState<SafetySubTab>('risk');

  return (
    <>
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'risk' && styles.subTabActive]}
          onPress={() => setSubTab('risk')}
        >
          <Ionicons
            name="shield-outline"
            size={16}
            color={subTab === 'risk' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'risk' && styles.subTabTextActive]}>
            {t('admin.safety.riskMonitoring')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'compliance' && styles.subTabActive]}
          onPress={() => setSubTab('compliance')}
        >
          <Ionicons
            name="lock-closed-outline"
            size={16}
            color={subTab === 'compliance' ? colors.brand.primary : colors.text.secondary}
          />
          <Text style={[styles.subTabText, subTab === 'compliance' && styles.subTabTextActive]}>
            {t('admin.safety.compliance')}
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === 'risk' && <RiskMonitoringContent />}
      {subTab === 'compliance' && <ComplianceContent />}
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
    summaryCardsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    summaryCard: {
      flex: 1,
      alignItems: 'center',
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      gap: 4,
    },
    summaryValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.dark,
    },
    summaryLabel: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: '500',
    },
    timelineStatsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 8,
    },
    actionStatItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
    },
    actionStatValue: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    actionStatLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      flex: 1,
    },
    flagsList: {
      gap: 12,
    },
    flagCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
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
      paddingHorizontal: 6,
      paddingVertical: 2,
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
    emptyFlags: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      gap: 8,
    },
    emptyFlagsText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    apiNotReady: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      gap: 12,
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
      lineHeight: 20,
    },
    endpointsList: {
      marginTop: 8,
      alignSelf: 'stretch',
      backgroundColor: colors.background.tertiary,
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      gap: 6,
    },
    endpointItem: {
      fontSize: 12,
      color: colors.text.tertiary,
      fontFamily: 'monospace',
    },
    requestCards: {
      gap: 12,
    },
    requestCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 16,
      gap: 12,
    },
    requestCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    requestCardTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    requestStats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    requestStatItem: {
      alignItems: 'center',
      gap: 4,
    },
    requestStatValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
    },
    requestStatLabel: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    consentSection: {
      gap: 16,
    },
    consentItem: {
      gap: 8,
    },
    consentInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    consentLabel: {
      fontSize: 14,
      color: colors.text.primary,
      fontWeight: '500',
    },
    consentValue: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    consentBar: {
      height: 8,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.xs,
      overflow: 'hidden',
    },
    consentBarFill: {
      height: '100%',
      borderRadius: BORDER_RADIUS.xs,
    },
    comingSoon: {
      alignItems: 'center',
      padding: 32,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      gap: 12,
    },
    comingSoonTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    comingSoonText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    plannedFeatures: {
      marginTop: 16,
      alignSelf: 'stretch',
      backgroundColor: colors.background.tertiary,
      padding: 16,
      borderRadius: BORDER_RADIUS.sm,
      gap: 8,
    },
    featureItem: {
      fontSize: 13,
      color: colors.text.secondary,
    },
  });
