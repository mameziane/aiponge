import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { useLifecycleRevenue, useLifecycleChurn } from '@/hooks/admin';
import { SectionHeader, LoadingSection, ErrorSection } from './shared';

function formatCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function TierLabel({ tier }: { tier: string }) {
  const colors = useThemeColors();
  const tierColors: Record<string, string> = {
    personal: colors.brand.primary,
    practice: colors.semantic.warning,
    studio: colors.semantic.success,
  };
  return (
    <Text style={{ color: tierColors[tier] || colors.text.primary, fontWeight: '600', fontSize: 14 }}>{tier}</Text>
  );
}

export function RevenueBreakdownSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const revenueQuery = useLifecycleRevenue();
  const churnQuery = useLifecycleChurn();

  return (
    <>
      {/* Revenue by Tier */}
      <View style={styles.section}>
        <SectionHeader title={t('admin.insights.revenueByTier')} icon="cash-outline" />

        {revenueQuery.isLoading ? (
          <LoadingSection />
        ) : revenueQuery.isError ? (
          <ErrorSection message={t('admin.insights.failedToLoadRevenue')} />
        ) : revenueQuery.data && revenueQuery.data.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.tierCol]}>Tier</Text>
              <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.grossRevenue')}</Text>
              <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.netRevenue')}</Text>
              <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.paidUsers')}</Text>
            </View>
            {revenueQuery.data.map((row, i) => (
              <View key={`${row.tier}-${row.period}`} style={[styles.tableRow, i % 2 === 1 && styles.altRow]}>
                <View style={styles.tierCol}>
                  <TierLabel tier={row.tier} />
                </View>
                <Text style={[styles.cell, styles.numCol]}>{formatCurrency(row.grossRevenue)}</Text>
                <Text style={[styles.cell, styles.numCol]}>{formatCurrency(row.netRevenue)}</Text>
                <Text style={[styles.cell, styles.numCol]}>{row.userCount}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>{t('admin.insights.noDataAvailable')}</Text>
        )}
      </View>

      {/* Churn by Tier */}
      <View style={styles.section}>
        <SectionHeader title={t('admin.insights.churnByTier')} icon="trending-down-outline" />

        {churnQuery.isLoading ? (
          <LoadingSection />
        ) : churnQuery.isError ? (
          <ErrorSection message={t('admin.insights.failedToLoadRevenue')} />
        ) : churnQuery.data && churnQuery.data.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.tierCol]}>Tier</Text>
              <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.startingUsers')}</Text>
              <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.churned')}</Text>
              <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.churnRate')}</Text>
            </View>
            {churnQuery.data.map((row, i) => (
              <View key={`${row.tier}-${row.period}`} style={[styles.tableRow, i % 2 === 1 && styles.altRow]}>
                <View style={styles.tierCol}>
                  <TierLabel tier={row.tier} />
                </View>
                <Text style={[styles.cell, styles.numCol]}>{row.startingUsers}</Text>
                <Text style={[styles.cell, styles.numCol, { color: colors.semantic.error }]}>{row.churned}</Text>
                <Text style={[styles.cell, styles.numCol]}>{formatPercent(row.churnRate)}</Text>
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
    section: { marginBottom: 16 },
    card: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      overflow: 'hidden',
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
      fontSize: 12,
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
    tierCol: { flex: 1.2 },
    numCol: { flex: 1, textAlign: 'right' },
    cell: {
      color: colors.text.primary,
      fontSize: 14,
    },
    emptyText: {
      color: colors.text.tertiary,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 16,
    },
  });
