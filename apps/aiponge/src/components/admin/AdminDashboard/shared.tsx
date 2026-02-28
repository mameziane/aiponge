import { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import type { ServiceInfo, CircuitBreakerStats, ProviderConfiguration, StoredError } from '@/hooks/admin';
import { SectionHeader as UnifiedSectionHeader, type SectionHeaderProps } from '../../shared/SectionHeader';

// Re-export SectionHeader with compact variant as default for Admin sections
export function SectionHeader({ title, icon }: { title: string; icon: keyof typeof Ionicons.glyphMap }) {
  return <UnifiedSectionHeader title={title} icon={icon} variant="compact" />;
}

export function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function StatusBadge({
  status,
  label,
}: {
  status: 'healthy' | 'unhealthy' | 'unknown' | 'open' | 'closed' | 'half-open';
  label?: string;
}) {
  const colors = useThemeColors();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const getColors = () => {
    switch (status) {
      case 'healthy':
      case 'closed':
        return { bg: colors.semantic.successLight, text: colors.semantic.success };
      case 'unhealthy':
      case 'open':
        return { bg: colors.semantic.errorLight, text: colors.semantic.error };
      case 'half-open':
        return { bg: colors.semantic.warningLight, text: colors.semantic.warning };
      default:
        return { bg: colors.text.gray[200], text: colors.text.gray[600] };
    }
  };

  const statusColors = getColors();

  return (
    <View style={[sharedStyles.statusBadge, { backgroundColor: statusColors.bg }]}>
      <Text style={[sharedStyles.statusBadgeText, { color: statusColors.text }]}>{label || status.toUpperCase()}</Text>
    </View>
  );
}

export function MetricCard({
  label,
  value,
  subtitle,
  status,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  status?: 'healthy' | 'unhealthy' | 'unknown';
}) {
  const colors = useThemeColors();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  return (
    <View style={sharedStyles.metricCard}>
      <Text style={sharedStyles.metricLabel}>{label}</Text>
      <Text style={sharedStyles.metricValue}>{value}</Text>
      {subtitle && <Text style={sharedStyles.metricSubtitle}>{subtitle}</Text>}
      {status && <StatusBadge status={status} />}
    </View>
  );
}

export function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  const colors = useThemeColors();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  return (
    <View style={sharedStyles.statCard}>
      <View style={[sharedStyles.statIconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={sharedStyles.statLabel}>{title}</Text>
      <Text style={sharedStyles.statValue}>{value}</Text>
    </View>
  );
}

export function ServiceCard({ service }: { service: ServiceInfo }) {
  const colors = useThemeColors();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  return (
    <View style={sharedStyles.serviceCard} data-testid={`card-service-${service.name}`}>
      <View style={sharedStyles.serviceCardHeader}>
        <Text style={sharedStyles.serviceName}>{service.name}</Text>
        <StatusBadge status={service.healthy ? 'healthy' : 'unhealthy'} />
      </View>
      <View style={sharedStyles.serviceCardDetails}>
        <Text style={sharedStyles.serviceDetail}>
          Host: {service.host}:{service.port}
        </Text>
        <Text style={sharedStyles.serviceDetail}>Health Check: {service.healthCheckPath}</Text>
        {service.metadata?.version && (
          <Text style={sharedStyles.serviceDetail}>Version: {service.metadata.version}</Text>
        )}
        {service.metadata?.seedTime && (
          <Text style={sharedStyles.serviceDetail}>
            Registered: {new Date(service.metadata.seedTime).toLocaleTimeString()}
          </Text>
        )}
      </View>
    </View>
  );
}

export function CircuitBreakerCard({ breaker }: { breaker: CircuitBreakerStats }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  return (
    <View style={sharedStyles.circuitBreakerCard} data-testid={`card-breaker-${breaker.name}`}>
      <View style={sharedStyles.circuitBreakerHeader}>
        <Text style={sharedStyles.circuitBreakerName}>{breaker.name}</Text>
        <StatusBadge status={breaker.state} label={breaker.state.toUpperCase()} />
      </View>
      <View style={sharedStyles.circuitBreakerStats}>
        <View style={sharedStyles.cbStatItem}>
          <Text style={sharedStyles.cbStatValue}>{breaker.successes}</Text>
          <Text style={sharedStyles.cbStatLabel}>{t('admin.services.successes')}</Text>
        </View>
        <View style={sharedStyles.cbStatItem}>
          <Text style={[sharedStyles.cbStatValue, { color: colors.semantic.error }]}>{breaker.failures}</Text>
          <Text style={sharedStyles.cbStatLabel}>{t('admin.services.failures')}</Text>
        </View>
        <View style={sharedStyles.cbStatItem}>
          <Text style={[sharedStyles.cbStatValue, { color: colors.semantic.warning }]}>{breaker.timeouts}</Text>
          <Text style={sharedStyles.cbStatLabel}>{t('admin.services.timeouts')}</Text>
        </View>
      </View>
    </View>
  );
}

export function ProviderCard({ provider }: { provider: ProviderConfiguration }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  return (
    <View style={sharedStyles.providerCard} data-testid={`card-provider-${provider.id}`}>
      <View style={sharedStyles.providerHeader}>
        <View style={sharedStyles.providerTitleRow}>
          <Text style={sharedStyles.providerName}>{provider.providerName}</Text>
          {provider.isPrimary && (
            <View style={sharedStyles.primaryBadge}>
              <Text style={sharedStyles.primaryBadgeText}>{t('admin.services.primary')}</Text>
            </View>
          )}
        </View>
        <StatusBadge
          status={
            provider.isActive
              ? provider.healthStatus === 'unknown' || !provider.healthStatus
                ? 'healthy'
                : provider.healthStatus
              : 'unhealthy'
          }
          label={
            provider.isActive
              ? provider.healthStatus === 'unknown' || !provider.healthStatus
                ? 'ACTIVE'
                : provider.healthStatus.toUpperCase()
              : 'DISABLED'
          }
        />
      </View>
      <View style={sharedStyles.providerDetails}>
        <Text style={sharedStyles.providerDetail}>Type: {provider.providerType}</Text>
        <Text style={sharedStyles.providerDetail}>ID: {provider.providerId}</Text>
        {provider.description && (
          <Text style={sharedStyles.providerDetail} numberOfLines={2}>
            {provider.description}
          </Text>
        )}
        {provider.costPerUnit && parseFloat(provider.costPerUnit) > 0 && (
          <Text style={sharedStyles.providerDetail}>Cost: ${provider.costPerUnit}/unit</Text>
        )}
        {provider.creditCost > 0 && <Text style={sharedStyles.providerDetail}>Credits: {provider.creditCost}</Text>}
      </View>
    </View>
  );
}

export function LoadingSection() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  return (
    <View style={sharedStyles.loadingSection}>
      <ActivityIndicator size="small" color={colors.brand.primary} />
      <Text style={sharedStyles.loadingText}>{t('admin.services.loading')}</Text>
    </View>
  );
}

export function ErrorSection({ message }: { message: string }) {
  const colors = useThemeColors();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  return (
    <View style={sharedStyles.errorSection}>
      <Ionicons name="warning-outline" size={20} color={colors.semantic.error} />
      <Text style={sharedStyles.errorText}>{message}</Text>
    </View>
  );
}

export function ErrorLogCard({ error, onPress }: { error: StoredError; onPress: () => void }) {
  const colors = useThemeColors();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const statusColor =
    error.statusCode >= 500
      ? colors.semantic.error
      : error.statusCode >= 400
        ? colors.semantic.warning
        : colors.text.secondary;

  const timeAgo = getTimeAgo(new Date(error.timestamp));

  return (
    <TouchableOpacity style={sharedStyles.errorLogCard} onPress={onPress} data-testid={`card-error-${error.id}`}>
      <View style={sharedStyles.errorLogHeader}>
        <View style={sharedStyles.errorLogMethodBadge}>
          <Text style={sharedStyles.errorLogMethodText}>{error.method}</Text>
        </View>
        <Text style={[sharedStyles.errorLogStatus, { color: statusColor }]}>{error.statusCode}</Text>
        <Text style={sharedStyles.errorLogTime}>{timeAgo}</Text>
      </View>
      <Text style={sharedStyles.errorLogPath} numberOfLines={1}>
        {error.path}
      </Text>
      <Text style={sharedStyles.errorLogMessage} numberOfLines={2}>
        {error.message}
      </Text>
      <TouchableOpacity
        style={sharedStyles.correlationIdContainer}
        onPress={onPress}
        data-testid={`button-correlation-${error.correlationId}`}
      >
        <Ionicons name="link-outline" size={12} color={colors.brand.primary} />
        <Text style={sharedStyles.correlationIdText} selectable>
          {error.correlationId}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export const sharedStyles = StyleSheet.create({
  section: { marginBottom: 24 },
});

export const createSharedStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    metricCard: {
      backgroundColor: colors.background.darkCard,
      padding: 12,
      borderRadius: BORDER_RADIUS.md,
      flex: 1,
      minWidth: 0,
    },
    metricLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    metricValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
    },
    metricSubtitle: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.xs,
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    serviceCard: {
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 8,
    },
    serviceCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    serviceName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    serviceCardDetails: {
      gap: 4,
    },
    serviceDetail: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    circuitBreakerCard: {
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 8,
    },
    circuitBreakerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    circuitBreakerName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    circuitBreakerStats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    cbStatItem: {
      alignItems: 'center',
    },
    cbStatValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
    },
    cbStatLabel: {
      fontSize: 10,
      color: colors.text.secondary,
      marginTop: 2,
    },
    providerCard: {
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 8,
    },
    providerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    providerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    providerName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    primaryBadge: {
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    primaryBadgeText: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.text.primary,
    },
    providerDetails: {
      gap: 4,
    },
    providerDetail: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 12,
    },
    summaryItem: {
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
    },
    summaryLabel: {
      fontSize: 10,
      color: colors.text.secondary,
      marginTop: 2,
    },
    diagnosticsGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    diagnosticCard: {
      flex: 1,
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
    },
    diagnosticHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    diagnosticTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    diagnosticDetail: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 8,
    },
    timestampText: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      padding: 20,
    },
    loadingSection: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      gap: 8,
    },
    loadingText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    errorSection: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      gap: 8,
      backgroundColor: colors.semantic.errorLight,
      borderRadius: BORDER_RADIUS.sm,
    },
    errorText: {
      fontSize: 14,
      color: colors.semantic.error,
    },
    musicApiCreditsCard: {
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.brand.primary + '40',
    },
    musicApiCreditsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    musicApiCreditsTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    musicApiCreditsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 8,
    },
    musicApiCreditItem: {
      alignItems: 'center',
    },
    musicApiCreditValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
    },
    musicApiCreditLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    musicApiCreditsNote: {
      fontSize: 10,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: 8,
    },
    musicApiCreditsError: {
      fontSize: 12,
      color: colors.semantic.error,
      marginTop: 4,
    },
    userCreditsCard: {
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.semantic.success + '40',
    },
    userCreditsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 12,
    },
    errorLogCard: {
      backgroundColor: colors.background.darkCard,
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 8,
      borderLeftWidth: 3,
      borderLeftColor: colors.semantic.error,
    },
    errorLogHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    errorLogMethodBadge: {
      backgroundColor: colors.brand.primary + '30',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    errorLogMethodText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    errorLogStatus: {
      fontSize: 12,
      fontWeight: '600',
    },
    errorLogTime: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginLeft: 'auto',
    },
    errorLogPath: {
      fontSize: 12,
      color: colors.text.secondary,
      fontFamily: 'monospace',
      marginBottom: 4,
    },
    errorLogMessage: {
      fontSize: 13,
      color: colors.text.primary,
      marginBottom: 8,
    },
    correlationIdContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.background.primary,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.xs,
    },
    correlationIdText: {
      fontSize: 10,
      color: colors.brand.primary,
      fontFamily: 'monospace',
      flex: 1,
    },
    errorStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: colors.background.darkCard,
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 12,
    },
    errorStatItem: {
      alignItems: 'center',
    },
    errorStatValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.semantic.error,
    },
    errorStatLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    errorDetailPanel: {
      backgroundColor: colors.background.primary,
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    errorDetailTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
    },
    errorDetailRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    errorDetailLabel: {
      fontSize: 12,
      color: colors.text.tertiary,
      width: 100,
    },
    errorDetailValue: {
      fontSize: 12,
      color: colors.text.primary,
      flex: 1,
      fontFamily: 'monospace',
    },
    errorStackContainer: {
      marginTop: 8,
    },
    errorStackScroll: {
      maxHeight: 120,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.xs,
      padding: 8,
      marginTop: 4,
    },
    errorStackText: {
      fontSize: 10,
      color: colors.text.secondary,
      fontFamily: 'monospace',
    },
    errorDetailHint: {
      fontSize: 10,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: 12,
      fontStyle: 'italic',
    },
    noErrorsContainer: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.sm,
      gap: 8,
    },
    noErrorsText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    monitoringToggleCard: {
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 12,
    },
    monitoringToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    monitoringToggleInfo: {
      flex: 1,
      marginRight: 12,
    },
    monitoringToggleLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    monitoringToggleDescription: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    monitoringTogglePending: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.muted,
    },
    monitoringTogglePendingText: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    healthSummaryCard: {
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 12,
    },
    healthSummaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 12,
    },
    healthSummaryItem: {
      alignItems: 'center',
    },
    healthSummaryValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
    },
    healthSummaryLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    healthSummaryTimestamp: {
      fontSize: 10,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: 8,
    },
    issueHighlightRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
      marginBottom: 8,
    },
    issueHighlightBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
    },
    issueHighlightText: {
      fontSize: 12,
      fontWeight: '600',
    },
    issuesContainer: {
      marginTop: 4,
    },
    issuesTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 8,
    },
    issueCard: {
      backgroundColor: colors.background.darkCard,
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 8,
      borderLeftWidth: 3,
      borderLeftColor: colors.text.gray[400],
    },
    issueHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    issueSource: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    issueTime: {
      fontSize: 11,
      color: colors.text.tertiary,
    },
    issueMessage: {
      fontSize: 12,
      color: colors.text.secondary,
      marginLeft: 24,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
    },
    statIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    statLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 4,
      textAlign: 'center',
    },
    statValue: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
    },
  });
