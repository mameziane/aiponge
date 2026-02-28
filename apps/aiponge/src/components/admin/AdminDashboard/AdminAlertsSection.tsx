import { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { SectionHeader } from './shared';
import { useAdminResilienceStats, type ServiceResilienceStats, type ResilienceAlert } from '@/hooks/admin';

function SeverityIcon({ severity }: { severity: 'ok' | 'warning' | 'critical' }) {
  const colors = useThemeColors();
  switch (severity) {
    case 'critical':
      return <Ionicons name="alert-circle" size={20} color={colors.semantic.error} />;
    case 'warning':
      return <Ionicons name="warning" size={20} color={colors.semantic.warning} />;
    default:
      return <Ionicons name="checkmark-circle" size={20} color={colors.semantic.success} />;
  }
}

function OverallStatusBanner({
  status,
  hasAlerts,
  timestamp,
}: {
  status: 'ok' | 'warning' | 'critical';
  hasAlerts: boolean;
  timestamp: string;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const statusConfig = {
    ok: {
      bg: colors.semantic.successLight,
      border: colors.semantic.success,
      label: t('admin.alerts.statusOk'),
      icon: 'checkmark-circle' as const,
    },
    warning: {
      bg: colors.semantic.warningLight,
      border: colors.semantic.warning,
      label: t('admin.alerts.statusWarning'),
      icon: 'warning' as const,
    },
    critical: {
      bg: colors.semantic.errorLight,
      border: colors.semantic.error,
      label: t('admin.alerts.statusCritical'),
      icon: 'alert-circle' as const,
    },
  };

  const config = statusConfig[status];

  return (
    <View style={[styles.statusBanner, { backgroundColor: config.bg, borderLeftColor: config.border }]}>
      <Ionicons name={config.icon} size={24} color={config.border} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.statusBannerTitle, { color: config.border }]}>{config.label}</Text>
        <Text style={styles.statusBannerTime}>
          {t('admin.alerts.lastChecked')}: {new Date(timestamp).toLocaleTimeString()}
        </Text>
      </View>
    </View>
  );
}

function BulkheadBar({ label, utilization }: { label: string; utilization: number }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pct = Math.min(utilization * 100, 100);
  const barColor = pct >= 90 ? colors.semantic.error : pct >= 75 ? colors.semantic.warning : colors.semantic.success;

  return (
    <View style={styles.bulkheadBarContainer}>
      <View style={styles.bulkheadBarHeader}>
        <Text style={styles.bulkheadBarLabel}>{label}</Text>
        <Text style={[styles.bulkheadBarPct, { color: barColor }]}>{pct.toFixed(0)}%</Text>
      </View>
      <View style={styles.bulkheadBarTrack}>
        <View style={[styles.bulkheadBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

function ServiceCard({ service }: { service: ServiceResilienceStats }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isUnreachable = service.status === 'unreachable';
  const alerts = service.alerts || [];
  const hasCritical = alerts.some(a => a.severity === 'critical');
  const hasWarning = alerts.some(a => a.severity === 'warning');
  const serviceSeverity = hasCritical ? 'critical' : hasWarning ? 'warning' : 'ok';

  return (
    <View style={[styles.serviceCard, isUnreachable && styles.serviceCardUnreachable]}>
      <View style={styles.serviceCardHeader}>
        <SeverityIcon severity={isUnreachable ? 'critical' : serviceSeverity} />
        <Text style={styles.serviceCardName}>{service.service}</Text>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isUnreachable ? colors.semantic.error : colors.semantic.success },
          ]}
        />
      </View>

      {isUnreachable && (
        <Text style={[styles.alertMessage, { color: colors.semantic.error }]}>
          {t('admin.alerts.serviceUnreachable')}: {service.error}
        </Text>
      )}

      {!isUnreachable && (
        <>
          {(service.circuitBreakers || []).length > 0 && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>{t('admin.alerts.circuitBreakers')}</Text>
              {service.circuitBreakers!.map((cb, i) => (
                <View key={i} style={styles.cbRow}>
                  <Ionicons
                    name={cb.state === 'closed' ? 'radio-button-off' : cb.state === 'open' ? 'close-circle' : 'ellipse'}
                    size={14}
                    color={
                      cb.state === 'closed'
                        ? colors.semantic.success
                        : cb.state === 'open'
                          ? colors.semantic.error
                          : colors.semantic.warning
                    }
                  />
                  <Text style={styles.cbName} numberOfLines={1}>
                    {cb.name}
                  </Text>
                  <Text
                    style={[
                      styles.cbState,
                      {
                        color:
                          cb.state === 'closed'
                            ? colors.semantic.success
                            : cb.state === 'open'
                              ? colors.semantic.error
                              : colors.semantic.warning,
                      },
                    ]}
                  >
                    {cb.state.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {(service.bulkheads || []).length > 0 && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>{t('admin.alerts.bulkheads')}</Text>
              {service.bulkheads!.map((bh, i) => (
                <View key={i} style={styles.bulkheadItem}>
                  <Text style={styles.bulkheadName}>{bh.name}</Text>
                  <BulkheadBar label={t('admin.alerts.concurrent')} utilization={bh.concurrentUtilization} />
                  <BulkheadBar label={t('admin.alerts.queue')} utilization={bh.queueUtilization} />
                  <Text style={styles.bulkheadDetail}>
                    {bh.activeConcurrent}/{bh.maxConcurrent} {t('admin.alerts.active')} | {bh.activeQueue}/{bh.maxQueue}{' '}
                    {t('admin.alerts.queued')}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {alerts.length > 0 && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>{t('admin.alerts.activeAlerts')}</Text>
              {alerts.map((alert, i) => (
                <View
                  key={i}
                  style={[
                    styles.alertRow,
                    {
                      backgroundColor:
                        alert.severity === 'critical' ? colors.semantic.errorLight : colors.semantic.warningLight,
                    },
                  ]}
                >
                  <SeverityIcon severity={alert.severity} />
                  <Text style={styles.alertText} numberOfLines={2}>
                    {alert.message}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {alerts.length === 0 &&
            (service.circuitBreakers || []).length === 0 &&
            (service.bulkheads || []).length === 0 && (
              <Text style={styles.noDataText}>{t('admin.alerts.noResilienceData')}</Text>
            )}
        </>
      )}
    </View>
  );
}

export function AdminAlertsSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading, error } = useAdminResilienceStats();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.brand.primary} />
        <Text style={styles.loadingText}>{t('admin.alerts.loading')}</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.text.tertiary} />
        <Text style={styles.errorText}>{t('admin.alerts.fetchError')}</Text>
      </View>
    );
  }

  return (
    <View>
      <SectionHeader title={t('admin.alerts.resilienceMonitoring')} icon="shield-checkmark-outline" />
      <OverallStatusBanner status={data.overallStatus} hasAlerts={data.hasAlerts} timestamp={data.timestamp} />

      <View style={styles.servicesList}>
        {data.services.map((service, i) => (
          <ServiceCard key={i} service={service} />
        ))}
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    loadingContainer: {
      alignItems: 'center',
      padding: 32,
      gap: 12,
    },
    loadingText: {
      color: colors.text.secondary,
      fontSize: 14,
    },
    errorContainer: {
      alignItems: 'center',
      padding: 32,
      gap: 12,
    },
    errorText: {
      color: colors.text.secondary,
      fontSize: 14,
      textAlign: 'center',
    },
    statusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      borderLeftWidth: 4,
      gap: 12,
      marginBottom: 16,
    },
    statusBannerTitle: {
      fontSize: 16,
      fontWeight: '600',
    },
    statusBannerTime: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },
    servicesList: {
      gap: 12,
    },
    serviceCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      gap: 12,
    },
    serviceCardUnreachable: {
      borderWidth: 1,
      borderColor: colors.semantic.error,
      opacity: 0.8,
    },
    serviceCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    serviceCardName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    alertMessage: {
      fontSize: 13,
      lineHeight: 18,
    },
    subsection: {
      gap: 8,
    },
    subsectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    cbRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
    },
    cbName: {
      fontSize: 13,
      color: colors.text.primary,
      flex: 1,
    },
    cbState: {
      fontSize: 12,
      fontWeight: '600',
    },
    bulkheadItem: {
      gap: 6,
    },
    bulkheadName: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.primary,
    },
    bulkheadBarContainer: {
      gap: 4,
    },
    bulkheadBarHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    bulkheadBarLabel: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    bulkheadBarPct: {
      fontSize: 12,
      fontWeight: '600',
    },
    bulkheadBarTrack: {
      height: 6,
      backgroundColor: colors.background.tertiary,
      borderRadius: 3,
      overflow: 'hidden',
    },
    bulkheadBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    bulkheadDetail: {
      fontSize: 11,
      color: colors.text.tertiary,
    },
    alertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      borderRadius: BORDER_RADIUS.sm,
      gap: 8,
    },
    alertText: {
      fontSize: 13,
      color: colors.text.primary,
      flex: 1,
      lineHeight: 18,
    },
    noDataText: {
      fontSize: 13,
      color: colors.text.tertiary,
      fontStyle: 'italic',
    },
  });
