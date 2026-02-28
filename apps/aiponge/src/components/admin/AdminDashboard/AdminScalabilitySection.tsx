import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { SectionHeader } from './shared';
import {
  useAdminResilienceStats,
  useAdminCircuitBreakers,
  type ServiceResilienceStats,
  type AggregatedResilienceStats,
} from '@/hooks/admin';

type ScalabilitySubTab = 'resilience' | 'capacity' | 'limits';

function SeverityIcon({ severity, size = 18 }: { severity: 'ok' | 'warning' | 'critical'; size?: number }) {
  const colors = useThemeColors();
  switch (severity) {
    case 'critical':
      return <Ionicons name="alert-circle" size={size} color={colors.semantic.error} />;
    case 'warning':
      return <Ionicons name="warning" size={size} color={colors.semantic.warning} />;
    default:
      return <Ionicons name="checkmark-circle" size={size} color={colors.semantic.success} />;
  }
}

function UtilizationBar({ value, label, detail }: { value: number; label: string; detail?: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pct = Math.min(value * 100, 100);
  const barColor = pct >= 90 ? colors.semantic.error : pct >= 75 ? colors.semantic.warning : colors.semantic.success;

  return (
    <View style={styles.utilBarContainer}>
      <View style={styles.utilBarHeader}>
        <Text style={styles.utilBarLabel}>{label}</Text>
        <Text style={[styles.utilBarPct, { color: barColor }]}>{pct.toFixed(0)}%</Text>
      </View>
      <View style={styles.utilBarTrack}>
        <View style={[styles.utilBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
      {detail && <Text style={styles.utilBarDetail}>{detail}</Text>}
    </View>
  );
}

function StatusBanner({ data }: { data: AggregatedResilienceStats }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const statusConfig = {
    ok: { bg: colors.semantic.successLight, border: colors.semantic.success },
    warning: { bg: colors.semantic.warningLight, border: colors.semantic.warning },
    critical: { bg: colors.semantic.errorLight, border: colors.semantic.error },
  };
  const config = statusConfig[data.overallStatus];
  const reachable = data.services.filter(s => s.status === 'reachable').length;

  return (
    <View style={[styles.statusBanner, { backgroundColor: config.bg, borderLeftColor: config.border }]}>
      <SeverityIcon severity={data.overallStatus} size={22} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.statusTitle, { color: config.border }]}>
          {t(`admin.scalability.status_${data.overallStatus}`)}
        </Text>
        <Text style={styles.statusMeta}>
          {reachable}/{data.services.length} {t('admin.scalability.servicesReachable')} ·{' '}
          {new Date(data.timestamp).toLocaleTimeString()}
        </Text>
      </View>
    </View>
  );
}

function ResilienceTab() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading, error } = useAdminResilienceStats();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand.primary} />
        <Text style={styles.loadingText}>{t('admin.scalability.loadingResilience')}</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.text.tertiary} />
        <Text style={styles.errorText}>{t('admin.scalability.fetchError')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <StatusBanner data={data} />

      {data.hasAlerts && (
        <View style={styles.alertsSummary}>
          <SectionHeader title={t('admin.scalability.activeAlerts')} icon="notifications-outline" />
          {data.services.flatMap(s =>
            (s.alerts || []).map((alert, i) => (
              <View
                key={`${s.service}-${i}`}
                style={[
                  styles.alertRow,
                  {
                    backgroundColor:
                      alert.severity === 'critical' ? colors.semantic.errorLight : colors.semantic.warningLight,
                  },
                ]}
              >
                <SeverityIcon severity={alert.severity} size={16} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertService}>{s.service}</Text>
                  <Text style={styles.alertMessage}>{alert.message}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {data.services.map((service, i) => (
        <ServiceResilienceCard key={i} service={service} />
      ))}
    </View>
  );
}

function ServiceResilienceCard({ service }: { service: ServiceResilienceStats }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isUnreachable = service.status === 'unreachable';
  const alerts = service.alerts || [];
  const hasCritical = alerts.some(a => a.severity === 'critical');
  const hasWarning = alerts.some(a => a.severity === 'warning');
  const severity = hasCritical ? 'critical' : hasWarning ? 'warning' : 'ok';

  return (
    <View style={[styles.card, isUnreachable && { borderColor: colors.semantic.error, borderWidth: 1, opacity: 0.7 }]}>
      <View style={styles.cardHeader}>
        <SeverityIcon severity={isUnreachable ? 'critical' : severity} size={16} />
        <Text style={styles.cardTitle}>{service.service}</Text>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isUnreachable ? colors.semantic.error : colors.semantic.success },
          ]}
        />
      </View>

      {isUnreachable && (
        <Text style={[styles.dimText, { color: colors.semantic.error }]}>
          {t('admin.scalability.unreachable')}: {service.error}
        </Text>
      )}

      {!isUnreachable && (
        <>
          {(service.circuitBreakers || []).length > 0 && (
            <View style={styles.subSection}>
              <Text style={styles.subLabel}>{t('admin.scalability.circuitBreakers')}</Text>
              {service.circuitBreakers!.map((cb, j) => (
                <View key={j} style={styles.cbRow}>
                  <Ionicons
                    name={cb.state === 'closed' ? 'radio-button-off' : cb.state === 'open' ? 'close-circle' : 'ellipse'}
                    size={13}
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
                  <Text style={styles.cbMeta}>
                    {cb.failures}F / {cb.successes}S
                  </Text>
                </View>
              ))}
            </View>
          )}

          {(service.bulkheads || []).length > 0 && (
            <View style={styles.subSection}>
              <Text style={styles.subLabel}>{t('admin.scalability.bulkheads')}</Text>
              {service.bulkheads!.map((bh, j) => (
                <View key={j} style={styles.bulkheadCard}>
                  <Text style={styles.bulkheadName}>{bh.name}</Text>
                  <UtilizationBar
                    value={bh.concurrentUtilization}
                    label={t('admin.scalability.concurrency')}
                    detail={`${bh.activeConcurrent}/${bh.maxConcurrent}`}
                  />
                  <UtilizationBar
                    value={bh.queueUtilization}
                    label={t('admin.scalability.queueDepth')}
                    detail={`${bh.activeQueue}/${bh.maxQueue}`}
                  />
                </View>
              ))}
            </View>
          )}

          {(service.circuitBreakers || []).length === 0 && (service.bulkheads || []).length === 0 && (
            <Text style={styles.dimText}>{t('admin.scalability.noData')}</Text>
          )}
        </>
      )}
    </View>
  );
}

function CapacityTab() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading } = useAdminResilienceStats();
  const cbQuery = useAdminCircuitBreakers();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }

  const totalCBs = cbQuery.data?.summary?.totalBreakers ?? 0;
  const openCBs = cbQuery.data?.summary?.openBreakers ?? 0;
  const halfOpenCBs = cbQuery.data?.summary?.halfOpenBreakers ?? 0;

  const allBulkheads = (data?.services || []).flatMap(s => s.bulkheads || []);
  const maxConcurrentTotal = allBulkheads.reduce((sum, bh) => sum + bh.maxConcurrent, 0);
  const activeConcurrentTotal = allBulkheads.reduce((sum, bh) => sum + bh.activeConcurrent, 0);
  const maxQueueTotal = allBulkheads.reduce((sum, bh) => sum + bh.maxQueue, 0);
  const activeQueueTotal = allBulkheads.reduce((sum, bh) => sum + bh.activeQueue, 0);

  return (
    <View style={styles.tabContent}>
      <SectionHeader title={t('admin.scalability.systemCapacity')} icon="resize-outline" />

      <View style={styles.metricsGrid}>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>{maxConcurrentTotal}</Text>
          <Text style={styles.metricLabel}>{t('admin.scalability.maxConcurrentSlots')}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>{activeConcurrentTotal}</Text>
          <Text style={styles.metricLabel}>{t('admin.scalability.activeNow')}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>{maxQueueTotal}</Text>
          <Text style={styles.metricLabel}>{t('admin.scalability.totalQueueSlots')}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>{activeQueueTotal}</Text>
          <Text style={styles.metricLabel}>{t('admin.scalability.inQueue')}</Text>
        </View>
      </View>

      {maxConcurrentTotal > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('admin.scalability.overallUtilization')}</Text>
          <UtilizationBar
            value={maxConcurrentTotal > 0 ? activeConcurrentTotal / maxConcurrentTotal : 0}
            label={t('admin.scalability.concurrency')}
            detail={`${activeConcurrentTotal} / ${maxConcurrentTotal} ${t('admin.scalability.slots')}`}
          />
          <UtilizationBar
            value={maxQueueTotal > 0 ? activeQueueTotal / maxQueueTotal : 0}
            label={t('admin.scalability.queueDepth')}
            detail={`${activeQueueTotal} / ${maxQueueTotal} ${t('admin.scalability.slots')}`}
          />
        </View>
      )}

      <SectionHeader title={t('admin.scalability.circuitBreakerSummary')} icon="git-network-outline" />
      <View style={styles.card}>
        <View style={styles.cbSummaryRow}>
          <View style={styles.cbSummaryItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.semantic.success} />
            <Text style={styles.cbSummaryValue}>{totalCBs - openCBs - halfOpenCBs}</Text>
            <Text style={styles.cbSummaryLabel}>{t('admin.scalability.closed')}</Text>
          </View>
          <View style={styles.cbSummaryItem}>
            <Ionicons name="ellipse" size={20} color={colors.semantic.warning} />
            <Text style={styles.cbSummaryValue}>{halfOpenCBs}</Text>
            <Text style={styles.cbSummaryLabel}>{t('admin.scalability.halfOpen')}</Text>
          </View>
          <View style={styles.cbSummaryItem}>
            <Ionicons name="close-circle" size={20} color={colors.semantic.error} />
            <Text style={styles.cbSummaryValue}>{openCBs}</Text>
            <Text style={styles.cbSummaryLabel}>{t('admin.scalability.open')}</Text>
          </View>
        </View>
        {cbQuery.data?.summary && (
          <View style={styles.cbStatsRow}>
            <Text style={styles.dimText}>
              {cbQuery.data.summary.totalSuccesses} {t('admin.scalability.successes')} ·{' '}
              {cbQuery.data.summary.totalFailures} {t('admin.scalability.failures')} ·{' '}
              {cbQuery.data.summary.totalTimeouts} {t('admin.scalability.timeouts')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function LimitsTab() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const tiers = [
    {
      name: t('admin.scalability.tierGuest'),
      icon: 'person-outline' as const,
      color: colors.text.secondary,
      limits: {
        monthlySongs: 3,
        parallelTracks: 1,
        tracksPerAlbum: 20,
        batchTracksMax: 140,
        albumRequestsPerMin: 3,
      },
    },
    {
      name: t('admin.scalability.tierStarter'),
      icon: 'person' as const,
      color: colors.brand.primary,
      limits: {
        monthlySongs: 10,
        parallelTracks: 2,
        tracksPerAlbum: 20,
        batchTracksMax: 140,
        albumRequestsPerMin: 3,
      },
    },
    {
      name: t('admin.scalability.tierPremium'),
      icon: 'star' as const,
      color: colors.semantic.warning,
      limits: {
        monthlySongs: 30,
        parallelTracks: 3,
        tracksPerAlbum: 20,
        batchTracksMax: 140,
        albumRequestsPerMin: 3,
      },
    },
  ];

  const infra = [
    { label: t('admin.scalability.bulkheadConcurrent'), value: '15' },
    { label: t('admin.scalability.bulkheadQueue'), value: '100' },
    { label: t('admin.scalability.totalInFlight'), value: '115' },
    { label: t('admin.scalability.parallelTrackLimit'), value: '3' },
    { label: t('admin.scalability.staggerDelay'), value: '2s' },
    { label: t('admin.scalability.cbVolumeThreshold'), value: '10' },
  ];

  return (
    <View style={styles.tabContent}>
      <SectionHeader title={t('admin.scalability.tierLimits')} icon="layers-outline" />
      {tiers.map((tier, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name={tier.icon} size={18} color={tier.color} />
            <Text style={[styles.cardTitle, { color: tier.color }]}>{tier.name}</Text>
          </View>
          <View style={styles.limitsGrid}>
            <LimitItem label={t('admin.scalability.monthlySongs')} value={String(tier.limits.monthlySongs)} />
            <LimitItem label={t('admin.scalability.parallelTracks')} value={String(tier.limits.parallelTracks)} />
            <LimitItem label={t('admin.scalability.tracksPerAlbum')} value={String(tier.limits.tracksPerAlbum)} />
            <LimitItem label={t('admin.scalability.albumReqPerMin')} value={String(tier.limits.albumRequestsPerMin)} />
          </View>
        </View>
      ))}

      <SectionHeader title={t('admin.scalability.infraLimits')} icon="hardware-chip-outline" />
      <View style={styles.card}>
        {infra.map((item, i) => (
          <View key={i} style={styles.infraRow}>
            <Text style={styles.infraLabel}>{item.label}</Text>
            <Text style={styles.infraValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LimitItem({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.limitItem}>
      <Text style={styles.limitValue}>{value}</Text>
      <Text style={styles.limitLabel}>{label}</Text>
    </View>
  );
}

export function AdminScalabilitySection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [subTab, setSubTab] = useState<ScalabilitySubTab>('resilience');

  const tabs: { id: ScalabilitySubTab; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { id: 'resilience', icon: 'shield-checkmark-outline', label: t('admin.scalability.resilience') },
    { id: 'capacity', icon: 'resize-outline', label: t('admin.scalability.capacity') },
    { id: 'limits', icon: 'layers-outline', label: t('admin.scalability.limits') },
  ];

  return (
    <>
      <View style={styles.subTabBar}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.subTab, subTab === tab.id && styles.subTabActive]}
            onPress={() => setSubTab(tab.id)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={subTab === tab.id ? colors.brand.primary : colors.text.secondary}
            />
            <Text style={[styles.subTabText, subTab === tab.id && styles.subTabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {subTab === 'resilience' && <ResilienceTab />}
      {subTab === 'capacity' && <CapacityTab />}
      {subTab === 'limits' && <LimitsTab />}
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
    tabContent: {
      gap: 12,
    },
    centered: {
      alignItems: 'center',
      padding: 32,
      gap: 12,
    },
    loadingText: {
      color: colors.text.secondary,
      fontSize: 14,
    },
    errorText: {
      color: colors.text.secondary,
      fontSize: 14,
      textAlign: 'center',
    },
    statusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: BORDER_RADIUS.md,
      borderLeftWidth: 4,
      gap: 12,
    },
    statusTitle: {
      fontSize: 15,
      fontWeight: '600',
    },
    statusMeta: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },
    alertsSummary: {
      gap: 8,
    },
    alertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      borderRadius: BORDER_RADIUS.sm,
      gap: 8,
    },
    alertService: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    alertMessage: {
      fontSize: 13,
      color: colors.text.primary,
      lineHeight: 18,
    },
    card: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 14,
      gap: 10,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    subSection: {
      gap: 6,
    },
    subLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    cbRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 3,
    },
    cbName: {
      fontSize: 12,
      color: colors.text.primary,
      flex: 1,
    },
    cbState: {
      fontSize: 11,
      fontWeight: '600',
      width: 70,
      textAlign: 'right',
    },
    cbMeta: {
      fontSize: 11,
      color: colors.text.tertiary,
      width: 50,
      textAlign: 'right',
    },
    bulkheadCard: {
      gap: 6,
      backgroundColor: colors.background.tertiary,
      padding: 10,
      borderRadius: BORDER_RADIUS.sm,
    },
    bulkheadName: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.primary,
    },
    dimText: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    utilBarContainer: {
      gap: 3,
    },
    utilBarHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    utilBarLabel: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    utilBarPct: {
      fontSize: 12,
      fontWeight: '600',
    },
    utilBarTrack: {
      height: 6,
      backgroundColor: colors.background.tertiary,
      borderRadius: 3,
      overflow: 'hidden',
    },
    utilBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    utilBarDetail: {
      fontSize: 11,
      color: colors.text.tertiary,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    metricBox: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 14,
      alignItems: 'center',
      gap: 4,
    },
    metricValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
    },
    metricLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    cbSummaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 8,
    },
    cbSummaryItem: {
      alignItems: 'center',
      gap: 4,
    },
    cbSummaryValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
    },
    cbSummaryLabel: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    cbStatsRow: {
      alignItems: 'center',
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    limitsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    limitItem: {
      flex: 1,
      minWidth: '40%',
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 10,
      alignItems: 'center',
      gap: 2,
    },
    limitValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.brand.primary,
    },
    limitLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    infraRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    infraLabel: {
      fontSize: 13,
      color: colors.text.secondary,
      flex: 1,
    },
    infraValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
  });
