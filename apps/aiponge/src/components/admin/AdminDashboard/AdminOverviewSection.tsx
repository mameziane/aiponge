/**
 * Admin Overview Section
 * Quick health summary, monitoring toggle, active issues, and recent errors
 */

import { useState, useMemo } from 'react';
import { View, Text, Switch, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import {
  useAdminHealthOverview,
  useAdminMonitoringConfig,
  useAdminMonitoringHealthSummary,
  useAdminMonitoringIssues,
  useAdminRecentErrors,
  useToggleMonitoringScheduler,
  type MonitoringIssue,
  type StoredError,
  type RecentErrorsData,
} from '@/hooks/admin';
import {
  SectionHeader,
  MetricCard,
  LoadingSection,
  ErrorSection,
  ErrorLogCard,
  getTimeAgo,
  createSharedStyles,
} from './shared';

export function AdminOverviewSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const healthQuery = useAdminHealthOverview();
  const monitoringConfigQuery = useAdminMonitoringConfig();
  const recentErrorsQuery = useAdminRecentErrors({ limit: 10 });

  const handleErrorPress = (error: StoredError) => {
    setSelectedErrorId(selectedErrorId === error.correlationId ? null : error.correlationId);
  };
  const healthSummaryQuery = useAdminMonitoringHealthSummary();
  const monitoringIssuesQuery = useAdminMonitoringIssues();
  const toggleSchedulerMutation = useToggleMonitoringScheduler();

  const handleToggleScheduler = (enabled: boolean) => {
    toggleSchedulerMutation.mutate(enabled);
  };

  return (
    <>
      {/* System Health Overview */}
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.overview.systemHealth')} icon="pulse-outline" />
        {healthQuery.isLoading ? (
          <LoadingSection />
        ) : healthQuery.isError ? (
          <ErrorSection message={t('admin.overview.failedToLoadHealth')} />
        ) : healthQuery.data ? (
          <>
            <View style={sharedStyles.metricsRow}>
              <MetricCard label={t('admin.overview.totalServices')} value={healthQuery.data.totalServices} />
              <MetricCard label={t('admin.overview.active')} value={healthQuery.data.activeServices} />
            </View>
            <View style={sharedStyles.metricsRow}>
              <MetricCard
                label={t('admin.overview.healthy')}
                value={healthQuery.data.healthyServices}
                status={healthQuery.data.healthyServices === healthQuery.data.totalServices ? 'healthy' : 'unhealthy'}
                subtitle={
                  healthQuery.data.healthyServices < healthQuery.data.totalServices
                    ? `${healthQuery.data.totalServices - healthQuery.data.healthyServices} service(s) down`
                    : undefined
                }
              />
              {healthQuery.data.uptime !== undefined ? (
                <MetricCard
                  label={t('admin.overview.uptime')}
                  value={`${Math.floor((healthQuery.data.uptime || 0) / 3600)}h ${Math.floor(((healthQuery.data.uptime || 0) % 3600) / 60)}m`}
                />
              ) : (
                <MetricCard label={t('admin.overview.uptime')} value="N/A" />
              )}
            </View>
          </>
        ) : null}
      </View>

      {/* Health Monitoring */}
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.overview.healthMonitoring')} icon="medkit-outline" />
        {monitoringConfigQuery.isLoading ? (
          <LoadingSection />
        ) : monitoringConfigQuery.isError ? (
          <ErrorSection message={t('admin.overview.failedToLoadMonitoring')} />
        ) : (
          <>
            <View style={sharedStyles.monitoringToggleCard}>
              <View style={sharedStyles.monitoringToggleRow}>
                <View style={sharedStyles.monitoringToggleInfo}>
                  <Text style={sharedStyles.monitoringToggleLabel}>{t('admin.overview.healthScheduler')}</Text>
                  <Text style={sharedStyles.monitoringToggleDescription}>
                    {monitoringConfigQuery.data?.schedulerRunning
                      ? `Active - checking every ${monitoringConfigQuery.data?.intervalSeconds || 30}s`
                      : 'Disabled - not running health checks'}
                  </Text>
                </View>
                <Switch
                  value={monitoringConfigQuery.data?.schedulerEnabled || false}
                  onValueChange={handleToggleScheduler}
                  disabled={toggleSchedulerMutation.isPending}
                  trackColor={{ false: colors.text.gray[400], true: colors.brand.primary }}
                  thumbColor={colors.text.primary}
                  testID="switch-monitoring-scheduler"
                />
              </View>
              {toggleSchedulerMutation.isPending && (
                <View style={sharedStyles.monitoringTogglePending}>
                  <ActivityIndicator size="small" color={colors.brand.primary} />
                  <Text style={sharedStyles.monitoringTogglePendingText}>{t('admin.overview.updating')}</Text>
                </View>
              )}
            </View>

            {healthSummaryQuery.data && (
              <View style={sharedStyles.healthSummaryCard}>
                <View style={sharedStyles.healthSummaryRow}>
                  <View style={sharedStyles.healthSummaryItem}>
                    <Text style={[sharedStyles.healthSummaryValue, { color: colors.semantic.success }]}>
                      {healthSummaryQuery.data.healthyChecks}
                    </Text>
                    <Text style={sharedStyles.healthSummaryLabel}>{t('admin.overview.healthy')}</Text>
                  </View>
                  <View style={sharedStyles.healthSummaryItem}>
                    <Text style={[sharedStyles.healthSummaryValue, { color: colors.semantic.warning }]}>
                      {healthSummaryQuery.data.unhealthyChecks}
                    </Text>
                    <Text style={sharedStyles.healthSummaryLabel}>{t('admin.overview.unhealthy')}</Text>
                  </View>
                  <View style={sharedStyles.healthSummaryItem}>
                    <Text style={sharedStyles.healthSummaryValue}>{healthSummaryQuery.data.unknownChecks}</Text>
                    <Text style={sharedStyles.healthSummaryLabel}>{t('admin.overview.unknown')}</Text>
                  </View>
                </View>
                {(healthSummaryQuery.data.criticalIssues > 0 || healthSummaryQuery.data.warningIssues > 0) && (
                  <View style={sharedStyles.issueHighlightRow}>
                    {healthSummaryQuery.data.criticalIssues > 0 && (
                      <View style={[sharedStyles.issueHighlightBadge, { backgroundColor: colors.semantic.errorLight }]}>
                        <Ionicons name="alert-circle" size={14} color={colors.semantic.error} />
                        <Text style={[sharedStyles.issueHighlightText, { color: colors.semantic.error }]}>
                          {healthSummaryQuery.data.criticalIssues} Critical
                        </Text>
                      </View>
                    )}
                    {healthSummaryQuery.data.warningIssues > 0 && (
                      <View
                        style={[sharedStyles.issueHighlightBadge, { backgroundColor: colors.semantic.warningLight }]}
                      >
                        <Ionicons name="warning" size={14} color={colors.semantic.warning} />
                        <Text style={[sharedStyles.issueHighlightText, { color: colors.semantic.warning }]}>
                          {healthSummaryQuery.data.warningIssues} Warning
                        </Text>
                      </View>
                    )}
                  </View>
                )}
                {healthSummaryQuery.data.lastCheckTime && (
                  <Text style={sharedStyles.healthSummaryTimestamp}>
                    Last check: {new Date(healthSummaryQuery.data.lastCheckTime).toLocaleTimeString()}
                  </Text>
                )}
              </View>
            )}

            {monitoringIssuesQuery.data && monitoringIssuesQuery.data.length > 0 && (
              <View style={sharedStyles.issuesContainer}>
                <Text style={sharedStyles.issuesTitle}>{t('admin.overview.activeIssues')}</Text>
                {monitoringIssuesQuery.data.slice(0, 5).map((issue: MonitoringIssue) => (
                  <View
                    key={issue.id}
                    style={[
                      sharedStyles.issueCard,
                      issue.severity === 'critical' && { borderLeftColor: colors.semantic.error },
                      issue.severity === 'warning' && { borderLeftColor: colors.semantic.warning },
                      issue.severity === 'info' && { borderLeftColor: colors.brand.primary },
                    ]}
                    testID={`card-issue-${issue.id}`}
                  >
                    <View style={sharedStyles.issueHeader}>
                      <Ionicons
                        name={
                          issue.severity === 'critical'
                            ? 'alert-circle'
                            : issue.severity === 'warning'
                              ? 'warning'
                              : 'information-circle'
                        }
                        size={16}
                        color={
                          issue.severity === 'critical'
                            ? colors.semantic.error
                            : issue.severity === 'warning'
                              ? colors.semantic.warning
                              : colors.brand.primary
                        }
                      />
                      <Text style={sharedStyles.issueSource}>{issue.source}</Text>
                      <Text style={sharedStyles.issueTime}>{getTimeAgo(new Date(issue.timestamp))}</Text>
                    </View>
                    <Text style={sharedStyles.issueMessage} numberOfLines={2}>
                      {issue.message}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      {/* Recent Errors Section */}
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.overview.recentErrors')} icon="bug-outline" />
        {recentErrorsQuery.isLoading ? (
          <LoadingSection />
        ) : recentErrorsQuery.isError ? (
          <ErrorSection message={t('admin.overview.failedToLoadErrors')} />
        ) : recentErrorsQuery.data ? (
          <>
            <View style={sharedStyles.errorStatsRow}>
              <View style={sharedStyles.errorStatItem}>
                <Text style={sharedStyles.errorStatValue}>{recentErrorsQuery.data.stats.lastHour}</Text>
                <Text style={sharedStyles.errorStatLabel}>{t('admin.overview.lastHour')}</Text>
              </View>
              <View style={sharedStyles.errorStatItem}>
                <Text style={sharedStyles.errorStatValue}>{recentErrorsQuery.data.stats.last24Hours}</Text>
                <Text style={sharedStyles.errorStatLabel}>{t('admin.overview.last24h')}</Text>
              </View>
              <View style={sharedStyles.errorStatItem}>
                <Text style={sharedStyles.errorStatValue}>{recentErrorsQuery.data.stats.totalErrors}</Text>
                <Text style={sharedStyles.errorStatLabel}>{t('admin.overview.total')}</Text>
              </View>
            </View>
            {recentErrorsQuery.data.errors.length > 0 ? (
              recentErrorsQuery.data.errors.map((error: StoredError) => (
                <View key={error.id}>
                  <ErrorLogCard error={error} onPress={() => handleErrorPress(error)} />
                  {selectedErrorId === error.correlationId && (
                    <View style={sharedStyles.errorDetailPanel}>
                      <Text style={sharedStyles.errorDetailTitle}>{t('admin.overview.errorDetails')}</Text>
                      <View style={sharedStyles.errorDetailRow}>
                        <Text style={sharedStyles.errorDetailLabel}>{t('admin.overview.correlationId')}</Text>
                        <Text style={sharedStyles.errorDetailValue} selectable>
                          {error.correlationId}
                        </Text>
                      </View>
                      <View style={sharedStyles.errorDetailRow}>
                        <Text style={sharedStyles.errorDetailLabel}>{t('admin.overview.timestamp')}</Text>
                        <Text style={sharedStyles.errorDetailValue}>{new Date(error.timestamp).toLocaleString()}</Text>
                      </View>
                      <View style={sharedStyles.errorDetailRow}>
                        <Text style={sharedStyles.errorDetailLabel}>{t('admin.overview.service')}</Text>
                        <Text style={sharedStyles.errorDetailValue}>{error.service || 'Unknown'}</Text>
                      </View>
                      {error.userId && (
                        <View style={sharedStyles.errorDetailRow}>
                          <Text style={sharedStyles.errorDetailLabel}>{t('admin.overview.userId')}</Text>
                          <Text style={sharedStyles.errorDetailValue}>{error.userId}</Text>
                        </View>
                      )}
                      {error.stack && (
                        <View style={sharedStyles.errorStackContainer}>
                          <Text style={sharedStyles.errorDetailLabel}>{t('admin.overview.stackTrace')}</Text>
                          <ScrollView horizontal style={sharedStyles.errorStackScroll}>
                            <Text style={sharedStyles.errorStackText} selectable>
                              {error.stack}
                            </Text>
                          </ScrollView>
                        </View>
                      )}
                      <Text style={sharedStyles.errorDetailHint}>
                        Tap the correlation ID above to copy it for log search
                      </Text>
                    </View>
                  )}
                </View>
              ))
            ) : (
              <View style={sharedStyles.noErrorsContainer}>
                <Ionicons name="checkmark-circle" size={32} color={colors.semantic.success} />
                <Text style={sharedStyles.noErrorsText}>{t('admin.overview.noRecentErrors')}</Text>
              </View>
            )}
          </>
        ) : null}
      </View>
    </>
  );
}
