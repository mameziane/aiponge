import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { useLifecycleFunnel, useLifecycleAcquisition } from '@/hooks/admin';
import { SectionHeader, LoadingSection, ErrorSection } from './shared';

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function prettifyStep(step: string): string {
  return step.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function GrowthFunnelSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const funnelQuery = useLifecycleFunnel();
  const acquisitionQuery = useLifecycleAcquisition();

  const maxUsers = useMemo(() => {
    if (!funnelQuery.data || funnelQuery.data.length === 0) return 1;
    return Math.max(...funnelQuery.data.map(r => r.users), 1);
  }, [funnelQuery.data]);

  return (
    <>
      {/* Conversion Funnel */}
      <View style={styles.section}>
        <SectionHeader title={t('admin.insights.conversionFunnel')} icon="funnel-outline" />

        {funnelQuery.isLoading ? (
          <LoadingSection />
        ) : funnelQuery.isError ? (
          <ErrorSection message={t('admin.insights.failedToLoadFunnel')} />
        ) : funnelQuery.data && funnelQuery.data.length > 0 ? (
          <View style={styles.card}>
            {funnelQuery.data.map((step, i) => {
              const barWidth = Math.max((step.users / maxUsers) * 100, 5);
              return (
                <View key={step.step} style={styles.funnelRow}>
                  <View style={styles.funnelLabelRow}>
                    <Text style={styles.funnelStep}>{prettifyStep(step.step)}</Text>
                    <Text style={styles.funnelUsers}>{step.users} users</Text>
                  </View>
                  <View style={styles.barContainer}>
                    <View
                      style={[
                        styles.bar,
                        {
                          width: `${barWidth}%`,
                          backgroundColor:
                            i === 0
                              ? colors.brand.primary
                              : `${colors.brand.primary}${Math.max(40, 100 - i * 20).toString(16)}`,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.funnelStats}>
                    <Text style={styles.funnelConversion}>{formatPercent(step.conversionRate)}</Text>
                    {step.dropoffRate > 0 && (
                      <Text style={[styles.funnelDropoff, { color: colors.semantic.error }]}>
                        -{formatPercent(step.dropoffRate)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>{t('admin.insights.noDataAvailable')}</Text>
        )}
      </View>

      {/* Acquisition Channels */}
      <View style={styles.section}>
        <SectionHeader title={t('admin.insights.acquisitionChannels')} icon="megaphone-outline" />

        {acquisitionQuery.isLoading ? (
          <LoadingSection />
        ) : acquisitionQuery.isError ? (
          <ErrorSection message={t('admin.insights.failedToLoadAcquisition')} />
        ) : acquisitionQuery.data && acquisitionQuery.data.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.sourceCol]}>{t('admin.insights.source')}</Text>
              <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.totalUsers')}</Text>
              <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.paidUsers')}</Text>
              <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.revenue')}</Text>
              <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.avgDaysToConvert')}</Text>
            </View>
            {acquisitionQuery.data.map((row, i) => (
              <View key={row.source} style={[styles.tableRow, i % 2 === 1 && styles.altRow]}>
                <Text style={[styles.cell, styles.sourceCol, { fontWeight: '600' }]}>{prettifyStep(row.source)}</Text>
                <Text style={[styles.cell, styles.numCol]}>{row.users}</Text>
                <Text style={[styles.cell, styles.numCol]}>{row.paidUsers}</Text>
                <Text style={[styles.cell, styles.numCol]}>{formatCurrency(row.revenue)}</Text>
                <Text style={[styles.cell, styles.numCol]}>
                  {row.avgTimeToConvertDays != null ? `${row.avgTimeToConvertDays.toFixed(0)}d` : '-'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>{t('admin.insights.noDataAvailable')}</Text>
        )}
      </View>
    </>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    section: { marginTop: 16 },
    card: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
    },
    funnelRow: {
      marginBottom: 12,
    },
    funnelLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    funnelStep: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    funnelUsers: {
      color: colors.text.secondary,
      fontSize: 13,
    },
    barContainer: {
      height: 8,
      backgroundColor: `${colors.text.secondary}20`,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 2,
    },
    bar: {
      height: '100%',
      borderRadius: 4,
    },
    funnelStats: {
      flexDirection: 'row',
      gap: 8,
    },
    funnelConversion: {
      color: colors.semantic.success,
      fontSize: 12,
    },
    funnelDropoff: {
      fontSize: 12,
    },
    tableHeader: {
      flexDirection: 'row',
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
      marginBottom: 4,
    },
    headerCell: {
      color: colors.text.secondary,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    altRow: {
      backgroundColor: `${colors.background.secondary}40`,
      borderRadius: 4,
    },
    sourceCol: { flex: 1.2 },
    numCol: { flex: 0.8, textAlign: 'right' },
    cell: {
      color: colors.text.primary,
      fontSize: 13,
    },
    emptyText: {
      color: colors.text.tertiary,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 16,
    },
  });
