/**
 * Pattern Insights Tab
 * Displays emotional, temporal, and thematic patterns detected from user entries
 */

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import type { PatternInsightsData } from '../../hooks/profile/usePatterns';
import { TabBar, type TabConfig } from '../shared/TabBar';

const { width: screenWidth } = Dimensions.get('window');

type SubTab = 'emotional' | 'temporal' | 'themes';

export const PatternEmptyState: React.FC<{ onAnalyze: () => void; isAnalyzing: boolean }> = ({
  onAnalyze,
  isAnalyzing,
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="analytics-outline" size={64} color={colors.text.secondary} />
      <Text style={styles.emptyTitle}>{t('components.patternInsights.emptyTitle')}</Text>
      <Text style={styles.emptyDescription}>{t('components.patternInsights.emptyDescription')}</Text>
      <TouchableOpacity
        style={styles.analyzeButton}
        onPress={onAnalyze}
        disabled={isAnalyzing}
        testID="button-analyze-patterns"
      >
        {isAnalyzing ? (
          <ActivityIndicator size="small" color={colors.text.primary} />
        ) : (
          <>
            <Ionicons name="sparkles" size={20} color={colors.text.primary} />
            <Text style={styles.analyzeButtonText}>{t('components.patternInsights.analyzeButton')}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

export const SummaryCard: React.FC<{ insights: PatternInsightsData }> = ({ insights }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { summary } = insights;

  return (
    <View style={styles.summaryCard} testID="card-pattern-summary">
      <Text style={styles.summaryTitle}>{t('components.patternInsights.summaryTitle')}</Text>
      <View style={styles.summaryGrid}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber} testID="text-emotional-count">
            {summary.emotionalPatternCount}
          </Text>
          <Text style={styles.summaryLabel}>{t('components.patternInsights.emotional')}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber} testID="text-temporal-count">
            {summary.temporalPatternCount}
          </Text>
          <Text style={styles.summaryLabel}>{t('components.patternInsights.temporal')}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber} testID="text-thematic-count">
            {summary.thematicPatternCount}
          </Text>
          <Text style={styles.summaryLabel}>{t('components.patternInsights.thematic')}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber} testID="text-themes-count">
            {summary.totalThemesTracked}
          </Text>
          <Text style={styles.summaryLabel}>{t('components.patternInsights.themes')}</Text>
        </View>
      </View>
    </View>
  );
};

const TrendIndicator: React.FC<{ trend: string }> = ({ trend }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const iconName = trend === 'increasing' ? 'trending-up' : trend === 'decreasing' ? 'trending-down' : 'remove';
  const iconColor =
    trend === 'increasing'
      ? colors.semantic.success
      : trend === 'decreasing'
        ? colors.semantic.error
        : colors.text.secondary;

  return (
    <View style={styles.trendContainer}>
      <Ionicons name={iconName} size={16} color={iconColor} />
      <Text style={[styles.trendText, { color: iconColor }]}>{trend}</Text>
    </View>
  );
};

const StrengthBar: React.FC<{ strength: string | number }> = ({ strength }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const numStrength = typeof strength === 'string' ? parseFloat(strength) : strength;
  const percentage = Math.min(100, Math.max(0, numStrength * 100));

  return (
    <View style={styles.strengthBarContainer}>
      <View style={styles.strengthBarBackground}>
        <View style={[styles.strengthBarFill, { width: `${percentage}%` }]} />
      </View>
      <Text style={styles.strengthText}>{Math.round(percentage)}%</Text>
    </View>
  );
};

export const EmotionalSection: React.FC<{ insights: PatternInsightsData }> = ({ insights }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { dominantMoods } = insights.emotional;

  if (!dominantMoods || dominantMoods.length === 0) {
    return (
      <View style={styles.sectionEmpty}>
        <Text style={styles.sectionEmptyText}>{t('components.patternInsights.noEmotionalPatterns')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('components.patternInsights.dominantMoods')}</Text>
      {dominantMoods.map((mood, index) => (
        <View key={index} style={styles.patternCard}>
          <View style={styles.patternHeader}>
            <View style={styles.patternTitleRow}>
              <Ionicons name="heart" size={20} color={colors.brand.primary} />
              <Text style={styles.patternName}>{mood.mood}</Text>
            </View>
            <TrendIndicator trend={mood.trend} />
          </View>
          <Text style={styles.patternDescription}>{mood.description}</Text>
          <StrengthBar strength={mood.strength} />
        </View>
      ))}
    </View>
  );
};

const TemporalSection: React.FC<{ insights: PatternInsightsData }> = ({ insights }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { peakTimes } = insights.temporal;

  if (!peakTimes || peakTimes.length === 0) {
    return (
      <View style={styles.sectionEmpty}>
        <Text style={styles.sectionEmptyText}>{t('components.patternInsights.noTemporalPatterns')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('components.patternInsights.peakReflectionTimes')}</Text>
      {peakTimes.map((time, index) => (
        <View key={index} style={styles.patternCard}>
          <View style={styles.patternHeader}>
            <View style={styles.patternTitleRow}>
              <Ionicons name="time" size={20} color={colors.brand.pink} />
              <Text style={styles.patternName}>{time.time}</Text>
            </View>
            <View style={styles.frequencyBadge}>
              <Text style={styles.frequencyText}>{time.frequency}x</Text>
            </View>
          </View>
          <Text style={styles.patternDescription}>{time.description}</Text>
        </View>
      ))}
    </View>
  );
};

const ThemesSection: React.FC<{ insights: PatternInsightsData }> = ({ insights }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { focusAreas } = insights.thematic;
  const { topThemes } = insights.themes;

  return (
    <View style={styles.section}>
      {focusAreas && focusAreas.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('components.patternInsights.focusAreas')}</Text>
          {focusAreas.map((area, index) => (
            <View key={index} style={styles.patternCard}>
              <View style={styles.patternHeader}>
                <View style={styles.patternTitleRow}>
                  <Ionicons name="bulb" size={20} color={colors.brand.cyan} />
                  <Text style={styles.patternName}>{area.theme}</Text>
                </View>
              </View>
              <Text style={styles.patternDescription}>{area.description}</Text>
              <StrengthBar strength={area.strength} />
              {area.relatedThemes && area.relatedThemes.length > 0 && (
                <View style={styles.relatedThemes}>
                  {area.relatedThemes.slice(0, 3).map((theme, i) => (
                    <View key={i} style={styles.themeBadge}>
                      <Text style={styles.themeBadgeText}>{theme}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </>
      )}

      {topThemes && topThemes.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('components.patternInsights.topThemes')}</Text>
          <View style={styles.themeCloud}>
            {topThemes.map((theme, index) => (
              <View
                key={index}
                style={[
                  styles.themeCloudItem,
                  {
                    opacity: 0.5 + (theme.frequency / (topThemes[0]?.frequency || 1)) * 0.5,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.themeCloudText,
                    {
                      fontSize: 12 + Math.min(8, theme.frequency * 2),
                    },
                  ]}
                >
                  {theme.theme}
                </Text>
                <Text style={styles.themeCloudCount}>{theme.frequency}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {(!focusAreas || focusAreas.length === 0) && (!topThemes || topThemes.length === 0) && (
        <View style={styles.sectionEmpty}>
          <Text style={styles.sectionEmptyText}>{t('components.patternInsights.noThematicPatterns')}</Text>
        </View>
      )}
    </View>
  );
};

interface PatternInsightsTabProps {
  insights: PatternInsightsData | null;
  isLoading: boolean;
  isError: boolean;
  analyzePatterns: () => void;
  isAnalyzing: boolean;
  refresh: () => void;
}

export const PatternInsightsTab: React.FC<PatternInsightsTabProps> = ({
  insights,
  isLoading,
  isError,
  analyzePatterns,
  isAnalyzing,
  refresh,
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('emotional');

  // Sub-tab configuration using shared TabBar component
  const SUB_TABS: TabConfig[] = useMemo(
    () => [
      { id: 'emotional', label: t('components.patternInsights.tabEmotional'), icon: 'heart-outline' },
      { id: 'temporal', label: t('components.patternInsights.tabTiming'), icon: 'time-outline' },
      { id: 'themes', label: t('components.patternInsights.tabThemes'), icon: 'pricetags-outline' },
    ],
    [t]
  );

  const handleSubTabChange = (tabId: string) => {
    setActiveSubTab(tabId as SubTab);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
        <Text style={styles.loadingText}>{t('components.patternInsights.loading')}</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color={colors.semantic.error} />
        <Text style={styles.errorText}>{t('components.patternInsights.loadFailed')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refresh} testID="button-retry-patterns">
          <Text style={styles.retryButtonText}>{t('components.patternInsights.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!insights || insights.summary.totalPatterns === 0) {
    return <PatternEmptyState onAnalyze={analyzePatterns} isAnalyzing={isAnalyzing} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <TabBar tabs={SUB_TABS} activeTab={activeSubTab} onTabChange={handleSubTabChange} testIDPrefix="tab" />

      {activeSubTab === 'emotional' && <EmotionalSection insights={insights} />}
      {activeSubTab === 'temporal' && <TemporalSection insights={insights} />}
      {activeSubTab === 'themes' && <ThemesSection insights={insights} />}
    </ScrollView>
  );
};

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    loadingText: {
      marginTop: 12,
      color: colors.text.secondary,
      fontSize: 14,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    errorText: {
      marginTop: 12,
      color: colors.semantic.error,
      fontSize: 16,
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 24,
      paddingVertical: 10,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
    },
    retryButtonText: {
      color: colors.text.primary,
      fontWeight: '600',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyTitle: {
      marginTop: 16,
      fontSize: 20,
      fontWeight: '600',
      color: colors.text.primary,
    },
    emptyDescription: {
      marginTop: 8,
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    analyzeButton: {
      marginTop: 24,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      gap: 8,
    },
    analyzeButtonText: {
      color: colors.text.primary,
      fontWeight: '600',
      fontSize: 16,
    },
    summaryCard: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      padding: 16,
      marginBottom: 16,
    },
    summaryTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 16,
    },
    summaryGrid: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    summaryItem: {
      alignItems: 'center',
    },
    summaryNumber: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.brand.primary,
    },
    summaryLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 4,
    },
    section: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
    },
    sectionEmpty: {
      padding: 24,
      alignItems: 'center',
    },
    sectionEmptyText: {
      color: colors.text.secondary,
      fontSize: 14,
    },
    patternCard: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 12,
    },
    patternHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    patternTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    patternName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      textTransform: 'capitalize',
    },
    patternDescription: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
      marginBottom: 12,
    },
    trendContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    trendText: {
      fontSize: 12,
      textTransform: 'capitalize',
    },
    strengthBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    strengthBarBackground: {
      flex: 1,
      height: 6,
      backgroundColor: colors.border.primary,
      borderRadius: 3,
      overflow: 'hidden',
    },
    strengthBarFill: {
      height: '100%',
      backgroundColor: colors.brand.primary,
      borderRadius: 3,
    },
    strengthText: {
      fontSize: 12,
      color: colors.text.secondary,
      minWidth: 36,
      textAlign: 'right',
    },
    frequencyBadge: {
      backgroundColor: colors.brand.primary + '30',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.md,
    },
    frequencyText: {
      color: colors.brand.primary,
      fontSize: 12,
      fontWeight: '600',
    },
    relatedThemes: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    themeBadge: {
      backgroundColor: colors.brand.accent + '30',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.sm,
    },
    themeBadgeText: {
      color: colors.brand.secondary,
      fontSize: 12,
    },
    themeCloud: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
    },
    themeCloudItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
      gap: 4,
    },
    themeCloudText: {
      color: colors.text.primary,
    },
    themeCloudCount: {
      color: colors.text.tertiary,
      fontSize: 10,
    },
    refreshButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
      paddingVertical: 12,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      gap: 8,
    },
    refreshButtonText: {
      color: colors.text.primary,
      fontSize: 14,
    },
  });

export const patternInsightsStyles = createStyles;
