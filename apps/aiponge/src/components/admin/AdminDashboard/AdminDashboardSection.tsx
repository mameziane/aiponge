import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import {
  useAdminHealthOverview,
  useAdminProductMetrics,
  useAdminReplayRate,
  type ReplayRateMetrics,
} from '@/hooks/admin';
import { SectionHeader, MetricCard, LoadingSection, ErrorSection, createSharedStyles } from './shared';
import { useTranslation } from 'react-i18next';

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function ReplayRateHero({ data, colors }: { data: ReplayRateMetrics; colors: ReturnType<typeof useThemeColors> }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const rate = data.weeklyReplayRate;
  const ratePercent = rate !== null ? (rate * 100).toFixed(1) : null;

  const getSignalColor = () => {
    if (rate === null) return colors.text.tertiary;
    if (rate >= 0.3) return colors.semantic.success;
    if (rate >= 0.15) return colors.semantic.warning;
    return colors.semantic.error;
  };

  const getSignalLabel = () => {
    if (rate === null) return t('admin.replayRate.noData');
    if (rate >= 0.3) return t('admin.replayRate.strong');
    if (rate >= 0.15) return t('admin.replayRate.promising');
    return t('admin.replayRate.needsWork');
  };

  const total = data.distribution.onePlay + data.distribution.twoPlays + data.distribution.threePlusPlays;

  return (
    <View style={styles.heroCard}>
      <View style={styles.heroHeader}>
        <View style={styles.heroTitleRow}>
          <Ionicons name="repeat" size={22} color={colors.brand.primary} />
          <Text style={styles.heroTitle}>{t('admin.replayRate.title')}</Text>
        </View>
        <Text style={styles.heroPeriod}>{t('admin.replayRate.period', { days: data.periodDays })}</Text>
      </View>

      <View style={styles.heroCenter}>
        <Text style={[styles.heroRate, { color: getSignalColor() }]}>
          {ratePercent !== null ? `${ratePercent}%` : '—'}
        </Text>
        <View style={[styles.signalBadge, { backgroundColor: getSignalColor() }]}>
          <Text style={styles.signalText}>{getSignalLabel()}</Text>
        </View>
        <Text style={styles.heroSubtext}>
          {t('admin.replayRate.subtitle', { loyal: data.loyalListeners, total: data.totalListeners })}
        </Text>
      </View>

      <View style={styles.distributionRow}>
        <View style={styles.distItem}>
          <Text style={styles.distValue}>{data.distribution.onePlay}</Text>
          <Text style={styles.distLabel}>{t('admin.replayRate.onePlay')}</Text>
          {total > 0 && (
            <Text style={styles.distPercent}>{((data.distribution.onePlay / total) * 100).toFixed(0)}%</Text>
          )}
        </View>
        <View style={[styles.distDivider, { backgroundColor: colors.border.primary }]} />
        <View style={styles.distItem}>
          <Text style={styles.distValue}>{data.distribution.twoPlays}</Text>
          <Text style={styles.distLabel}>{t('admin.replayRate.twoPlays')}</Text>
          {total > 0 && (
            <Text style={styles.distPercent}>{((data.distribution.twoPlays / total) * 100).toFixed(0)}%</Text>
          )}
        </View>
        <View style={[styles.distDivider, { backgroundColor: colors.border.primary }]} />
        <View style={styles.distItem}>
          <Text style={[styles.distValue, { color: getSignalColor() }]}>{data.distribution.threePlusPlays}</Text>
          <Text style={[styles.distLabel, { fontWeight: '600' }]}>{t('admin.replayRate.threePlus')}</Text>
          {total > 0 && (
            <Text style={[styles.distPercent, { color: getSignalColor() }]}>
              {((data.distribution.threePlusPlays / total) * 100).toFixed(0)}%
            </Text>
          )}
        </View>
      </View>

      {data.avgPlaysPerTrack !== null && (
        <View style={styles.avgRow}>
          <Ionicons name="stats-chart" size={14} color={colors.text.tertiary} />
          <Text style={styles.avgText}>
            {t('admin.replayRate.avgPlays', { avg: data.avgPlaysPerTrack.toFixed(1) })}
          </Text>
        </View>
      )}

      {data.topReplayedTracks.length > 0 && (
        <View style={styles.topTracks}>
          <Text style={styles.topTracksTitle}>{t('admin.replayRate.topReplayed')}</Text>
          {data.topReplayedTracks.slice(0, 5).map((track, index) => (
            <View key={`${track.trackId}-${index}`} style={styles.topTrackRow}>
              <Text style={styles.topTrackRank}>{index + 1}</Text>
              <Text style={styles.topTrackName} numberOfLines={1}>
                {track.trackTitle}
              </Text>
              <Text style={styles.topTrackCount}>{track.replayCount}x</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function AdminDashboardSection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const healthQuery = useAdminHealthOverview();
  const metricsQuery = useAdminProductMetrics();
  const [replayDays, setReplayDays] = useState(7);
  const replayQuery = useAdminReplayRate(replayDays);
  const { t } = useTranslation();

  const health = healthQuery.data;
  const metrics = metricsQuery.data;

  const getOverallStatus = () => {
    if (!health) return 'unknown';
    if (health.healthyServices === health.totalServices) return 'healthy';
    if (health.healthyServices === 0) return 'unhealthy';
    return 'degraded';
  };

  const overallStatus = getOverallStatus();

  return (
    <>
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.replayRate.northStar')} icon="diamond-outline" />
        {replayQuery.isLoading ? (
          <LoadingSection />
        ) : replayQuery.isError ? (
          <ErrorSection message={t('admin.replayRate.failedToLoad')} />
        ) : replayQuery.data ? (
          <>
            <View style={styles.periodSelector}>
              {[7, 14, 30].map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.periodButton, replayDays === d && styles.periodButtonActive]}
                  onPress={() => setReplayDays(d)}
                >
                  <Text style={[styles.periodText, replayDays === d && styles.periodTextActive]}>
                    {t('admin.replayRate.days', { count: d })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <ReplayRateHero data={replayQuery.data} colors={colors} />
          </>
        ) : null}
      </View>

      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.dashboard.systemStatus')} icon="pulse-outline" />
        {healthQuery.isLoading ? (
          <LoadingSection />
        ) : healthQuery.isError ? (
          <ErrorSection message={t('admin.dashboard.failedToLoadHealth')} />
        ) : health ? (
          <View style={styles.statusGrid}>
            <View
              style={[
                styles.statusIndicator,
                {
                  backgroundColor:
                    overallStatus === 'healthy'
                      ? colors.semantic.success
                      : overallStatus === 'degraded'
                        ? colors.semantic.warning
                        : colors.semantic.error,
                },
              ]}
            >
              <Ionicons
                name={
                  overallStatus === 'healthy'
                    ? 'checkmark-circle'
                    : overallStatus === 'degraded'
                      ? 'warning'
                      : 'alert-circle'
                }
                size={32}
                color={colors.text.primary}
              />
              <Text style={styles.statusText}>{overallStatus.toUpperCase()}</Text>
            </View>
            <View style={styles.statsRow}>
              <MetricCard
                label={t('admin.dashboard.totalServices')}
                value={health.totalServices ?? 0}
                status="healthy"
              />
              <MetricCard label={t('admin.dashboard.healthy')} value={health.healthyServices ?? 0} status="healthy" />
              <MetricCard
                label={t('admin.dashboard.uptime')}
                value={health.uptime ? `${Math.floor(health.uptime / 3600)}h` : 'N/A'}
              />
            </View>
          </View>
        ) : null}
      </View>

      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.dashboard.keyMetrics')} icon="analytics-outline" />
        {metricsQuery.isLoading ? (
          <LoadingSection />
        ) : metricsQuery.isError ? (
          <ErrorSection message={t('admin.dashboard.failedToLoadMetrics')} />
        ) : metrics ? (
          <View style={styles.metricsGrid}>
            <MetricCard label={t('admin.insights.totalUsers')} value={metrics.activation?.totalUsers ?? 0} />
            <MetricCard label={t('admin.dashboard.onboarded')} value={metrics.activation?.completedOnboarding ?? 0} />
            <MetricCard
              label={t('admin.insights.songsPerUserPerMonth')}
              value={metrics.engagement?.songsPerActiveUserPerMonth?.toFixed(1) ?? 'N/A'}
            />
            <MetricCard
              label={t('admin.dashboard.conversionRate')}
              value={formatPercent(metrics.monetization?.freeToPremiumConversionRate)}
            />
          </View>
        ) : null}
      </View>
    </>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    heroCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    heroHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    heroTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    heroTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    heroPeriod: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    heroCenter: {
      alignItems: 'center',
      marginBottom: 24,
    },
    heroRate: {
      fontSize: 48,
      fontWeight: '800',
      letterSpacing: -1,
    },
    signalBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      marginTop: 8,
    },
    signalText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.absolute.white,
      textTransform: 'uppercase',
    },
    heroSubtext: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 8,
      textAlign: 'center',
    },
    distributionRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 16,
      marginBottom: 12,
    },
    distItem: {
      alignItems: 'center',
      flex: 1,
    },
    distValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
    },
    distLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    distPercent: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginTop: 1,
    },
    distDivider: {
      width: 1,
      height: 36,
    },
    avgRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 12,
    },
    avgText: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    topTracks: {
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
    },
    topTracksTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 10,
    },
    topTrackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    topTrackRank: {
      width: 24,
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
    topTrackName: {
      flex: 1,
      fontSize: 13,
      color: colors.text.primary,
    },
    topTrackCount: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.brand.primary,
      marginLeft: 8,
    },
    periodSelector: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    periodButton: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    periodButtonActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    periodText: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    periodTextActive: {
      color: colors.absolute.white,
      fontWeight: '600',
    },
    statusGrid: {
      gap: 16,
    },
    statusIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 20,
      paddingHorizontal: 24,
      borderRadius: BORDER_RADIUS.md,
    },
    statusText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
  });
