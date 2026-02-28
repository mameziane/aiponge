import { View, ScrollView, StyleSheet, RefreshControl, Text, TextInput } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, commonStyles, BORDER_RADIUS, type ColorScheme } from '../../theme';
import { AdminSubTabBar } from '../../components/admin/AdminDashboard/AdminSubTabBar';
import { apiClient } from '../../lib/axiosApiClient';
import { useIsAdmin } from '../../hooks/admin';
import { ADMIN_QUERY } from '../../constants/appConfig';
import { SectionHeader, MetricCard, LoadingSection, sharedStyles } from '../../components/admin/AdminDashboard/shared';

type SubTab = 'risk' | 'compliance' | 'users' | 'support';

const SUB_TABS = [
  { id: 'risk', label: 'admin.tabs.risk' },
  { id: 'compliance', label: 'admin.tabs.compliance' },
  { id: 'users', label: 'admin.tabs.users' },
  { id: 'support', label: 'admin.tabs.support' },
];

const VALID_TABS = SUB_TABS.map(t => t.id);

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

interface ComplianceStats {
  deletionRequests: { pending: number; completed: number; total: number };
  exportRequests: { pending: number; completed: number; total: number };
  consentStatus: { marketing: number; analytics: number; personalization: number };
  totalUsersWithConsent: number;
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

function useComplianceStats() {
  const isAdmin = useIsAdmin();
  return useQuery({
    queryKey: ['/api/v1/admin/safety/compliance-stats'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: ComplianceStats }>(
        '/api/v1/admin/safety/compliance-stats'
      );
      return response.data;
    },
    enabled: isAdmin,
    staleTime: ADMIN_QUERY.staleTime.background,
  });
}

function RiskContent() {
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

function ComplianceContent() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statsQuery = useComplianceStats();
  const stats = statsQuery.data;

  return (
    <>
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.governance.dataRequestsGdpr')} icon="document-text-outline" />
        {statsQuery.isLoading ? (
          <LoadingSection />
        ) : statsQuery.isError ? (
          <View style={styles.apiNotReady}>
            <Ionicons name="information-circle-outline" size={24} color={colors.brand.primary} />
            <Text style={styles.apiNotReadyTitle}>{t('admin.governance.complianceApiNotConfigured')}</Text>
            <Text style={styles.apiNotReadyText}>{t('admin.governance.complianceApiNotConfiguredDesc')}</Text>
          </View>
        ) : stats ? (
          <>
            <View style={styles.requestCards}>
              <View style={styles.requestCard}>
                <View style={styles.requestCardHeader}>
                  <Ionicons name="trash-outline" size={20} color={colors.semantic.error} />
                  <Text style={styles.requestCardTitle}>{t('admin.governance.deletionRequests')}</Text>
                </View>
                <View style={styles.requestStats}>
                  <View style={styles.requestStatItem}>
                    <Text style={[styles.requestStatValue, { color: colors.semantic.warning }]}>
                      {stats.deletionRequests?.pending ?? 0}
                    </Text>
                    <Text style={styles.requestStatLabel}>{t('admin.governance.pending')}</Text>
                  </View>
                  <View style={styles.requestStatItem}>
                    <Text style={[styles.requestStatValue, { color: colors.semantic.success }]}>
                      {stats.deletionRequests?.completed ?? 0}
                    </Text>
                    <Text style={styles.requestStatLabel}>{t('admin.governance.completed')}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.requestCard}>
                <View style={styles.requestCardHeader}>
                  <Ionicons name="download-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.requestCardTitle}>{t('admin.governance.exportRequests')}</Text>
                </View>
                <View style={styles.requestStats}>
                  <View style={styles.requestStatItem}>
                    <Text style={[styles.requestStatValue, { color: colors.semantic.warning }]}>
                      {stats.exportRequests?.pending ?? 0}
                    </Text>
                    <Text style={styles.requestStatLabel}>{t('admin.governance.pending')}</Text>
                  </View>
                  <View style={styles.requestStatItem}>
                    <Text style={[styles.requestStatValue, { color: colors.semantic.success }]}>
                      {stats.exportRequests?.completed ?? 0}
                    </Text>
                    <Text style={styles.requestStatLabel}>{t('admin.governance.completed')}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={sharedStyles.section}>
              <SectionHeader title={t('admin.governance.consentStatus')} icon="shield-checkmark-outline" />
              <View style={styles.consentStats}>
                <MetricCard label={t('admin.governance.marketing')} value={stats.consentStatus?.marketing ?? 0} />
                <MetricCard label={t('admin.governance.analytics')} value={stats.consentStatus?.analytics ?? 0} />
                <MetricCard
                  label={t('admin.governance.personalization')}
                  value={stats.consentStatus?.personalization ?? 0}
                />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </>
  );
}

function UsersContent() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <View style={sharedStyles.section}>
      <SectionHeader title={t('admin.governance.userLookup')} icon="search-outline" />
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.text.tertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('admin.governance.searchPlaceholder')}
          placeholderTextColor={colors.text.tertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      <View style={styles.comingSoon}>
        <Ionicons name="construct-outline" size={48} color={colors.text.tertiary} />
        <Text style={styles.comingSoonTitle}>{t('admin.comingSoon')}</Text>
        <Text style={styles.comingSoonText}>{t('admin.governance.comingSoonUserLookup')}</Text>
        <View style={styles.plannedFeatures}>
          <Text style={styles.featureItem}>{`• ${t('admin.governance.plannedUserFeatures.viewProfile')}`}</Text>
          <Text style={styles.featureItem}>{`• ${t('admin.governance.plannedUserFeatures.activityHistory')}`}</Text>
          <Text style={styles.featureItem}>{`• ${t('admin.governance.plannedUserFeatures.generatedSongs')}`}</Text>
          <Text style={styles.featureItem}>{`• ${t('admin.governance.plannedUserFeatures.supportTickets')}`}</Text>
        </View>
      </View>
    </View>
  );
}

function SupportContent() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={sharedStyles.section}>
      <SectionHeader title={t('admin.governance.supportTools')} icon="help-buoy-outline" />
      <View style={styles.comingSoon}>
        <Ionicons name="construct-outline" size={48} color={colors.text.tertiary} />
        <Text style={styles.comingSoonTitle}>{t('admin.comingSoon')}</Text>
        <Text style={styles.comingSoonText}>{t('admin.governance.comingSoonSupport')}</Text>
        <View style={styles.plannedFeatures}>
          <Text style={styles.featureItem}>{`• ${t('admin.governance.plannedSupportFeatures.resetPassword')}`}</Text>
          <Text style={styles.featureItem}>{`• ${t('admin.governance.plannedSupportFeatures.clearCache')}`}</Text>
          <Text style={styles.featureItem}>{`• ${t('admin.governance.plannedSupportFeatures.regenerateSongs')}`}</Text>
          <Text style={styles.featureItem}>{`• ${t('admin.governance.plannedSupportFeatures.promoCredits')}`}</Text>
          <Text style={styles.featureItem}>{`• ${t('admin.governance.plannedSupportFeatures.suspendAccount')}`}</Text>
        </View>
      </View>
    </View>
  );
}

export default function GovernanceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<SubTab>('risk');
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
      router.replace(`/(admin)/governance?tab=${tabId}` as Href);
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
        {activeTab === 'risk' && <RiskContent key={`risk-${refreshKey}`} />}
        {activeTab === 'compliance' && <ComplianceContent key={`compliance-${refreshKey}`} />}
        {activeTab === 'users' && <UsersContent key={`users-${refreshKey}`} />}
        {activeTab === 'support' && <SupportContent key={`support-${refreshKey}`} />}
      </ScrollView>
    </View>
  );
}

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
    requestCards: {
      gap: 12,
    },
    requestCard: {
      backgroundColor: colors.background.secondary,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
    },
    requestCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    requestCardTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    requestStats: {
      flexDirection: 'row',
      gap: 16,
    },
    requestStatItem: {
      alignItems: 'center',
    },
    requestStatValue: {
      fontSize: 20,
      fontWeight: '700',
    },
    requestStatLabel: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    consentStats: {
      flexDirection: 'row',
      gap: 12,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    searchIcon: {
      marginRight: 12,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text.primary,
    },
    comingSoon: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
    },
    comingSoonTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 12,
    },
    comingSoonText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    plannedFeatures: {
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
