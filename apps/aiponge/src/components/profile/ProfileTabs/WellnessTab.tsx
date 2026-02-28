import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from '@/i18n';
import { createProfileEditorStyles } from '@/styles/profileEditor.styles';
import { useThemeColors, type ColorScheme } from '@/theme';
import { apiClient } from '@/lib/axiosApiClient';
import { logger } from '@/lib/logger';
import { useSubscriptionData } from '@/contexts/SubscriptionContext';

interface WellnessDimension {
  name: string;
  score: number;
  trend: 'improving' | 'stable' | 'declining';
  confidence: number;
  contributors: Array<{ factor: string; impact: number; description: string }>;
  recommendations: string[];
}

interface WellnessData {
  success: boolean;
  userId: string;
  overallScore: number;
  grade: 'excellent' | 'good' | 'fair' | 'needs_attention' | 'critical';
  metrics: {
    emotional: WellnessDimension;
    cognitive: WellnessDimension;
    behavioral: WellnessDimension;
    social: WellnessDimension;
    physical: WellnessDimension;
    spiritual: WellnessDimension;
  };
  trends: Array<{
    period: string;
    overallScore: number;
    dimensionScores: Record<string, number>;
    significantChanges: string[];
  }>;
  insights: Array<{
    type: string;
    message: string;
    priority: 'high' | 'medium' | 'low';
    dimension?: string;
  }>;
  summary: {
    strengths: string[];
    areasForGrowth: string[];
    overallNarrative: string;
  };
  comparison: {
    previousPeriod: { overallScore: number; change: number };
    baseline: { overallScore: number; percentile: number };
  };
  alerts: Array<{
    type: string;
    severity: 'warning' | 'info';
    message: string;
  }>;
  confidence: {
    overall: number;
    dataPoints: number;
    lastUpdated: string;
  };
  calculatedAt: string;
}

interface WellnessTabProps {
  userId: string;
}

const DIMENSION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  emotional: 'heart-outline',
  cognitive: 'bulb-outline',
  behavioral: 'body-outline',
  social: 'people-outline',
  physical: 'fitness-outline',
  spiritual: 'leaf-outline',
};

const TREND_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  improving: 'trending-up',
  stable: 'remove',
  declining: 'trending-down',
};

export const WellnessTab: React.FC<WellnessTabProps> = ({ userId }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const profileEditorStyles = useMemo(() => createProfileEditorStyles(colors), [colors]);
  const GRADE_COLORS: Record<string, string> = useMemo(
    () => ({
      excellent: colors.semantic.success,
      good: colors.status.good,
      fair: colors.semantic.warning,
      needs_attention: colors.status.needsAttention,
      critical: colors.semantic.error,
    }),
    [colors]
  );
  const TREND_COLORS: Record<string, string> = useMemo(
    () => ({
      improving: colors.semantic.success,
      stable: colors.text.secondary,
      declining: colors.semantic.error,
    }),
    [colors]
  );
  const { tierConfig } = useSubscriptionData();
  const [wellnessData, setWellnessData] = useState<WellnessData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);

  const canAccess = tierConfig.canAccessWellness;

  const fetchWellnessData = useCallback(async () => {
    if (!userId || !canAccess) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<WellnessData>('/api/v1/app/profile/wellness');

      if (response && typeof response.overallScore === 'number') {
        setWellnessData(response);
      } else if (response && response.success === false) {
        setError(t('wellness.fetchError'));
      } else {
        setWellnessData(null);
      }
    } catch (err) {
      logger.error('Failed to fetch wellness data', err);
      setError(t('wellness.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [userId, canAccess, t]);

  React.useEffect(() => {
    if (canAccess) {
      fetchWellnessData();
    }
  }, [canAccess, fetchWellnessData]);

  // Personal+ feature gate - placed after all hooks
  if (!canAccess) {
    return (
      <View style={styles.lockedContainer}>
        <View style={styles.lockedIconContainer}>
          <Ionicons name="lock-closed" size={48} color={colors.text.tertiary} />
        </View>
        <Text style={styles.lockedTitle}>{t('wellness.starterRequired')}</Text>
        <Text style={styles.lockedDescription}>{t('wellness.starterDescription')}</Text>
        <TouchableOpacity style={styles.upgradeButton} onPress={() => router.push('/paywall')} testID="button-upgrade">
          <Ionicons name="star" size={20} color={colors.text.primary} />
          <Text style={styles.upgradeButtonText}>{t('common.upgrade')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleDimension = (dimension: string) => {
    setExpandedDimension(expandedDimension === dimension ? null : dimension);
  };

  const getGradeLabel = (grade: string): string => {
    const gradeLabels: Record<string, string> = {
      excellent: t('wellness.gradeExcellent'),
      good: t('wellness.gradeGood'),
      fair: t('wellness.gradeFair'),
      needs_attention: t('wellness.gradeNeedsAttention'),
      critical: t('wellness.gradeCritical'),
    };
    return gradeLabels[grade] || grade;
  };

  const getDimensionLabel = (dimension: string): string => {
    const dimensionLabels: Record<string, string> = {
      emotional: t('wellness.dimensionEmotional'),
      cognitive: t('wellness.dimensionCognitive'),
      behavioral: t('wellness.dimensionBehavioral'),
      social: t('wellness.dimensionSocial'),
      physical: t('wellness.dimensionPhysical'),
      spiritual: t('wellness.dimensionSpiritual'),
    };
    return dimensionLabels[dimension] || dimension;
  };

  const getTrendLabel = (trend: string): string => {
    const trendLabels: Record<string, string> = {
      improving: t('wellness.trendImproving'),
      stable: t('wellness.trendStable'),
      declining: t('wellness.trendDeclining'),
    };
    return trendLabels[trend] || trend;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
        <Text style={styles.loadingText}>{t('wellness.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.semantic.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchWellnessData} testID="button-retry-wellness">
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!wellnessData) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="analytics-outline" size={48} color={colors.text.secondary} />
        <Text style={styles.emptyText}>{t('wellness.noData')}</Text>
        <Text style={styles.emptySubtext}>{t('wellness.noDataDescription')}</Text>
      </View>
    );
  }

  const dimensions = Object.entries(wellnessData.metrics) as [string, WellnessDimension][];

  return (
    <View style={profileEditorStyles.tabContent}>
      <View style={profileEditorStyles.card}>
        <View style={profileEditorStyles.cardHeader}>
          <Text style={profileEditorStyles.cardTitle}>{t('wellness.overallScore')}</Text>
          <TouchableOpacity onPress={() => fetchWellnessData()} testID="button-refresh-wellness">
            <Ionicons name="refresh-outline" size={20} color={colors.brand.primary} />
          </TouchableOpacity>
        </View>
        <View style={profileEditorStyles.cardContent}>
          <View style={styles.scoreContainer}>
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreValue}>{Math.round(wellnessData.overallScore)}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
            <View style={[styles.gradeBadge, { backgroundColor: GRADE_COLORS[wellnessData.grade] }]}>
              <Text style={styles.gradeText}>{getGradeLabel(wellnessData.grade)}</Text>
            </View>
          </View>

          {wellnessData.comparison && (
            <View style={styles.comparisonContainer}>
              <View style={styles.comparisonItem}>
                <Text style={styles.comparisonLabel}>{t('wellness.vsPrevious')}</Text>
                <View style={styles.comparisonValue}>
                  <Ionicons
                    name={wellnessData.comparison.previousPeriod.change >= 0 ? 'arrow-up' : 'arrow-down'}
                    size={14}
                    color={
                      wellnessData.comparison.previousPeriod.change >= 0
                        ? colors.semantic.success
                        : colors.semantic.error
                    }
                  />
                  <Text
                    style={[
                      styles.comparisonNumber,
                      {
                        color:
                          wellnessData.comparison.previousPeriod.change >= 0
                            ? colors.semantic.success
                            : colors.semantic.error,
                      },
                    ]}
                  >
                    {Math.abs(wellnessData.comparison.previousPeriod.change).toFixed(1)}%
                  </Text>
                </View>
              </View>
              <View style={styles.comparisonItem}>
                <Text style={styles.comparisonLabel}>{t('wellness.percentile')}</Text>
                <Text style={styles.comparisonNumber}>{wellnessData.comparison.baseline.percentile}%</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      <View style={profileEditorStyles.card}>
        <View style={profileEditorStyles.cardHeader}>
          <Text style={profileEditorStyles.cardTitle}>{t('wellness.dimensions')}</Text>
        </View>
        <View style={profileEditorStyles.cardContent}>
          {dimensions.map(([key, dimension]) => (
            <View key={key} style={styles.dimensionContainer}>
              <TouchableOpacity
                style={styles.dimensionHeader}
                onPress={() => toggleDimension(key)}
                testID={`dimension-${key}`}
              >
                <View style={styles.dimensionInfo}>
                  <Ionicons name={DIMENSION_ICONS[key] || 'ellipse-outline'} size={20} color={colors.brand.primary} />
                  <Text style={styles.dimensionName}>{getDimensionLabel(key)}</Text>
                </View>
                <View style={styles.dimensionScoreRow}>
                  <View style={styles.trendIndicator}>
                    <Ionicons name={TREND_ICONS[dimension.trend]} size={14} color={TREND_COLORS[dimension.trend]} />
                  </View>
                  <Text style={styles.dimensionScore}>{Math.round(dimension.score)}</Text>
                  <Ionicons
                    name={expandedDimension === key ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.text.secondary}
                  />
                </View>
              </TouchableOpacity>

              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${dimension.score}%` }]} />
              </View>

              {expandedDimension === key && (
                <View style={styles.dimensionDetails}>
                  <View style={styles.trendRow}>
                    <Text style={styles.detailLabel}>{t('wellness.trend')}:</Text>
                    <Text style={[styles.trendText, { color: TREND_COLORS[dimension.trend] }]}>
                      {getTrendLabel(dimension.trend)}
                    </Text>
                  </View>

                  {dimension.contributors.length > 0 && (
                    <View style={styles.contributorsSection}>
                      <Text style={styles.detailLabel}>{t('wellness.contributors')}:</Text>
                      {dimension.contributors.slice(0, 3).map((contributor, idx) => (
                        <View key={idx} style={styles.contributorItem}>
                          <Text style={styles.contributorFactor}>{contributor.factor}</Text>
                          <Text style={styles.contributorDescription}>{contributor.description}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {dimension.recommendations.length > 0 && (
                    <View style={styles.recommendationsSection}>
                      <Text style={styles.detailLabel}>{t('wellness.recommendations')}:</Text>
                      {dimension.recommendations.slice(0, 2).map((rec, idx) => (
                        <View key={idx} style={styles.recommendationItem}>
                          <Ionicons name="checkmark-circle-outline" size={14} color={colors.brand.primary} />
                          <Text style={styles.recommendationText}>{rec}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      {wellnessData.summary && (
        <View style={profileEditorStyles.card}>
          <View style={profileEditorStyles.cardHeader}>
            <Text style={profileEditorStyles.cardTitle}>{t('wellness.summary')}</Text>
          </View>
          <View style={profileEditorStyles.cardContent}>
            {wellnessData.summary.overallNarrative && (
              <Text style={styles.narrativeText}>{wellnessData.summary.overallNarrative}</Text>
            )}

            {wellnessData.summary.strengths.length > 0 && (
              <View style={styles.summarySection}>
                <Text style={styles.sectionTitle}>{t('wellness.strengths')}</Text>
                {wellnessData.summary.strengths.map((strength, idx) => (
                  <View key={idx} style={styles.listItem}>
                    <Ionicons name="star" size={14} color={colors.semantic.success} />
                    <Text style={styles.listItemText}>{strength}</Text>
                  </View>
                ))}
              </View>
            )}

            {wellnessData.summary.areasForGrowth.length > 0 && (
              <View style={styles.summarySection}>
                <Text style={styles.sectionTitle}>{t('wellness.areasForGrowth')}</Text>
                {wellnessData.summary.areasForGrowth.map((area, idx) => (
                  <View key={idx} style={styles.listItem}>
                    <Ionicons name="arrow-forward-circle" size={14} color={colors.semantic.warning} />
                    <Text style={styles.listItemText}>{area}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {wellnessData.insights && wellnessData.insights.length > 0 && (
        <View style={profileEditorStyles.card}>
          <View style={profileEditorStyles.cardHeader}>
            <Text style={profileEditorStyles.cardTitle}>{t('wellness.insights')}</Text>
          </View>
          <View style={profileEditorStyles.cardContent}>
            {wellnessData.insights.slice(0, 5).map((insight, idx) => (
              <View key={idx} style={[styles.insightItem, insight.priority === 'high' && styles.insightHighPriority]}>
                <Ionicons
                  name={insight.priority === 'high' ? 'alert-circle' : 'information-circle'}
                  size={16}
                  color={insight.priority === 'high' ? colors.semantic.warning : colors.brand.primary}
                />
                <Text style={styles.insightText}>{insight.message}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {wellnessData.alerts && wellnessData.alerts.length > 0 && (
        <View style={[profileEditorStyles.card, styles.alertsCard]}>
          <View style={profileEditorStyles.cardHeader}>
            <Text style={profileEditorStyles.cardTitle}>{t('wellness.alerts')}</Text>
          </View>
          <View style={profileEditorStyles.cardContent}>
            {wellnessData.alerts.map((alert, idx) => (
              <View key={idx} style={[styles.alertItem, alert.severity === 'warning' && styles.alertWarning]}>
                <Ionicons
                  name={alert.severity === 'warning' ? 'warning' : 'information-circle'}
                  size={16}
                  color={alert.severity === 'warning' ? colors.semantic.warning : colors.semantic.info}
                />
                <Text style={styles.alertText}>{alert.message}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {wellnessData.confidence && (
        <View style={styles.confidenceFooter}>
          <Text style={styles.confidenceText}>
            {t('wellness.confidenceLevel')}: {Math.round(wellnessData.confidence.overall * 100)}%
          </Text>
          <Text style={styles.confidenceText}>
            {t('wellness.basedOn')} {wellnessData.confidence.dataPoints} {t('wellness.dataPoints')}
          </Text>
        </View>
      )}
    </View>
  );
};

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    loadingText: {
      color: colors.text.secondary,
      fontSize: 14,
      marginTop: 12,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
      paddingHorizontal: 20,
    },
    errorText: {
      color: colors.semantic.error,
      fontSize: 14,
      marginTop: 12,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 24,
      paddingVertical: 10,
      backgroundColor: colors.brand.primary,
      borderRadius: 8,
    },
    retryButtonText: {
      color: colors.text.primary,
      fontWeight: '600',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
      paddingHorizontal: 20,
    },
    emptyText: {
      color: colors.text.primary,
      fontSize: 16,
      fontWeight: '600',
      marginTop: 12,
      textAlign: 'center',
    },
    emptySubtext: {
      color: colors.text.secondary,
      fontSize: 14,
      marginTop: 8,
      textAlign: 'center',
    },
    scoreContainer: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    scoreCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: colors.background.primary,
      borderWidth: 4,
      borderColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scoreValue: {
      fontSize: 36,
      fontWeight: 'bold',
      color: colors.text.primary,
    },
    scoreMax: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    gradeBadge: {
      marginTop: 12,
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 20,
    },
    gradeText: {
      color: colors.absolute.white,
      fontWeight: '600',
      fontSize: 14,
    },
    comparisonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
      marginTop: 16,
    },
    comparisonItem: {
      alignItems: 'center',
    },
    comparisonLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    comparisonValue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    comparisonNumber: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    dimensionContainer: {
      marginBottom: 16,
    },
    dimensionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    dimensionInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    dimensionName: {
      fontSize: 14,
      color: colors.text.primary,
      fontWeight: '500',
    },
    dimensionScoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    trendIndicator: {
      width: 20,
      alignItems: 'center',
    },
    dimensionScore: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.brand.primary,
      minWidth: 30,
      textAlign: 'right',
    },
    progressBarContainer: {
      height: 6,
      backgroundColor: colors.background.primary,
      borderRadius: 3,
      overflow: 'hidden',
      marginTop: 4,
    },
    progressBar: {
      height: '100%',
      backgroundColor: colors.brand.primary,
      borderRadius: 3,
    },
    dimensionDetails: {
      backgroundColor: colors.background.primary,
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
    },
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    detailLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    trendText: {
      fontSize: 12,
      fontWeight: '600',
    },
    contributorsSection: {
      marginTop: 8,
    },
    contributorItem: {
      marginTop: 6,
      paddingLeft: 8,
    },
    contributorFactor: {
      fontSize: 12,
      color: colors.text.primary,
      fontWeight: '500',
    },
    contributorDescription: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    recommendationsSection: {
      marginTop: 12,
    },
    recommendationItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 6,
    },
    recommendationText: {
      fontSize: 12,
      color: colors.text.secondary,
      flex: 1,
    },
    narrativeText: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 22,
      marginBottom: 16,
    },
    summarySection: {
      marginTop: 12,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 8,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 6,
    },
    listItemText: {
      fontSize: 13,
      color: colors.text.secondary,
      flex: 1,
    },
    insightItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.primary,
    },
    insightHighPriority: {
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      marginHorizontal: -16,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    insightText: {
      fontSize: 13,
      color: colors.text.primary,
      flex: 1,
      lineHeight: 18,
    },
    alertsCard: {
      borderColor: colors.semantic.warning,
    },
    alertItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 8,
    },
    alertWarning: {
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      marginHorizontal: -16,
      paddingHorizontal: 16,
      borderRadius: 8,
      paddingVertical: 12,
      marginVertical: 4,
    },
    alertText: {
      fontSize: 13,
      color: colors.text.primary,
      flex: 1,
    },
    confidenceFooter: {
      alignItems: 'center',
      paddingVertical: 16,
      opacity: 0.7,
    },
    confidenceText: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    lockedContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingVertical: 48,
    },
    lockedIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.background.secondary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    lockedTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 12,
    },
    lockedDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    upgradeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.brand.primary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 12,
      gap: 8,
    },
    upgradeButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
  });
