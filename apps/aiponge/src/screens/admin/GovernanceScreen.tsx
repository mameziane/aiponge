import { View, ScrollView, StyleSheet, RefreshControl, Text } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, commonStyles, BORDER_RADIUS, type ColorScheme } from '../../theme';
import { TabBar } from '../../components/shared/TabBar';
import { apiClient } from '../../lib/axiosApiClient';
import { useIsAdmin } from '../../hooks/admin';
import { ADMIN_QUERY } from '../../constants/appConfig';
import { SectionHeader, MetricCard, LoadingSection, sharedStyles } from '../../components/admin/AdminDashboard/shared';
import { AdminUsersSection } from '../../components/admin/AdminDashboard/AdminUsersSection';

type SubTab = 'compliance' | 'users';

const SUB_TABS = [
  { id: 'compliance', label: 'admin.tabs.compliance' },
  { id: 'users', label: 'admin.tabs.users' },
];

const VALID_TABS = SUB_TABS.map(t => t.id);

interface ComplianceStats {
  deletionRequests: { pending: number; completed: number; total: number };
  exportRequests: { pending: number; completed: number; total: number };
  consentStatus: { marketing: number; analytics: number; personalization: number };
  totalUsersWithConsent: number;
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

export default function GovernanceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<SubTab>('compliance');
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
        {activeTab === 'compliance' && <ComplianceContent key={`compliance-${refreshKey}`} />}
        {activeTab === 'users' && <AdminUsersSection key={`users-${refreshKey}`} />}
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
  });
