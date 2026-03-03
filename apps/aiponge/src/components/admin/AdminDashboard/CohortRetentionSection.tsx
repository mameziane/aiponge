import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { useLifecycleCohorts } from '@/hooks/admin';
import { SectionHeader, LoadingSection, ErrorSection } from './shared';

function formatPercent(value: number | null | undefined): string {
  if (value == null) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '$0';
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function formatMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function CohortRetentionSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cohortsQuery = useLifecycleCohorts();

  return (
    <View style={styles.section}>
      <SectionHeader title={t('admin.insights.cohortRetention')} icon="people-outline" />

      {cohortsQuery.isLoading ? (
        <LoadingSection />
      ) : cohortsQuery.isError ? (
        <ErrorSection message={t('admin.insights.failedToLoadCohorts')} />
      ) : cohortsQuery.data && cohortsQuery.data.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.monthCol]}>{t('admin.insights.cohortMonth')}</Text>
            <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.originalSize')}</Text>
            <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.retained')}</Text>
            <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.retentionRate')}</Text>
            <Text style={[styles.headerCell, styles.numCol]}>{t('admin.insights.revenue')}</Text>
          </View>
          {cohortsQuery.data.map((cohort, i) => (
            <View key={cohort.cohortMonth} style={[styles.tableRow, i % 2 === 1 && styles.altRow]}>
              <Text style={[styles.cell, styles.monthCol, { fontWeight: '600' }]}>
                {formatMonth(cohort.cohortMonth)}
              </Text>
              <Text style={[styles.cell, styles.numCol]}>{cohort.originalSize}</Text>
              <Text style={[styles.cell, styles.numCol]}>{cohort.retainedCount}</Text>
              <Text
                style={[
                  styles.cell,
                  styles.numCol,
                  { color: (cohort.retentionRate ?? 0) >= 0.5 ? colors.semantic.success : colors.semantic.warning },
                ]}
              >
                {formatPercent(cohort.retentionRate)}
              </Text>
              <Text style={[styles.cell, styles.numCol]}>{formatCurrency(cohort.revenue)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>{t('admin.insights.noDataAvailable')}</Text>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    section: { marginTop: 16 },
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
    monthCol: { flex: 1 },
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
