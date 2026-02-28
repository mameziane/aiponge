import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { usePersonalNarrative, type PersonalNarrative } from '../../hooks/profile/usePersonalNarrative';

export const YourStoryTab: React.FC = () => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [userReflection, setUserReflection] = useState('');
  const [showTimeline, setShowTimeline] = useState(false);

  const {
    narrative,
    isNew,
    dataPointsSummary,
    history,
    isLoading,
    isLoadingHistory,
    respondToNarrative,
    isResponding,
    refetch,
  } = usePersonalNarrative();

  const handleRespond = () => {
    if (!narrative || !userReflection.trim()) return;
    respondToNarrative({ narrativeId: narrative.id, userReflection: userReflection.trim() });
    setUserReflection('');
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
        <Text style={styles.loadingText}>Generating your story...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {narrative ? (
        <>
          <View style={styles.narrativeCard}>
            <View style={styles.narrativeHeader}>
              <Ionicons name="book-outline" size={22} color={colors.brand.primary} />
              <Text style={styles.narrativeTitle}>Your Story</Text>
              {isNew && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>New</Text>
                </View>
              )}
            </View>

            <Text style={styles.periodText}>
              {new Date(narrative.periodStart).toLocaleDateString()} -{' '}
              {new Date(narrative.periodEnd).toLocaleDateString()}
            </Text>

            <Text style={styles.narrativeText}>{narrative.narrative}</Text>

            {dataPointsSummary && dataPointsSummary.total > 0 && (
              <View style={styles.dataPointsRow}>
                {dataPointsSummary.reflections > 0 && (
                  <View style={styles.dataPoint}>
                    <Ionicons name="chatbubble-outline" size={14} color={colors.text.secondary} />
                    <Text style={styles.dataPointText}>{dataPointsSummary.reflections} reflections</Text>
                  </View>
                )}
                {dataPointsSummary.moodCheckins > 0 && (
                  <View style={styles.dataPoint}>
                    <Ionicons name="heart-outline" size={14} color={colors.text.secondary} />
                    <Text style={styles.dataPointText}>{dataPointsSummary.moodCheckins} check-ins</Text>
                  </View>
                )}
                {dataPointsSummary.patterns > 0 && (
                  <View style={styles.dataPoint}>
                    <Ionicons name="git-network-outline" size={14} color={colors.text.secondary} />
                    <Text style={styles.dataPointText}>{dataPointsSummary.patterns} patterns</Text>
                  </View>
                )}
              </View>
            )}

            {narrative.breakthroughsReferenced && narrative.breakthroughsReferenced.length > 0 && (
              <View style={styles.breakthroughBadge}>
                <Ionicons name="flash" size={16} color={colors.semantic.warning} />
                <Text style={styles.breakthroughCount}>
                  {narrative.breakthroughsReferenced.length} breakthrough
                  {narrative.breakthroughsReferenced.length > 1 ? 's' : ''} this week
                </Text>
              </View>
            )}
          </View>

          {narrative.forwardPrompt && (
            <View style={styles.forwardPromptCard}>
              <Ionicons name="arrow-forward-circle-outline" size={20} color={colors.brand.primary} />
              <Text style={styles.forwardPromptText}>{narrative.forwardPrompt}</Text>
            </View>
          )}

          {!narrative.userReflection ? (
            <View style={styles.reflectionSection}>
              <Text style={styles.reflectionLabel}>Your Thoughts</Text>
              <TextInput
                style={styles.reflectionInput}
                placeholder="How does this narrative resonate with you?"
                placeholderTextColor={colors.text.tertiary}
                value={userReflection}
                onChangeText={setUserReflection}
                multiline
                maxLength={1000}
                testID="narrative-reflection-input"
              />
              <TouchableOpacity
                style={[styles.respondButton, (!userReflection.trim() || isResponding) && styles.respondButtonDisabled]}
                onPress={handleRespond}
                disabled={!userReflection.trim() || isResponding}
                testID="submit-narrative-reflection"
              >
                {isResponding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.respondButtonText}>Share Your Reflection</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.savedReflection}>
              <Ionicons name="checkmark-circle" size={18} color={colors.semantic.success} />
              <Text style={styles.savedReflectionText}>{narrative.userReflection}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.timelineToggle}
            onPress={() => setShowTimeline(!showTimeline)}
            testID="toggle-timeline"
          >
            <Ionicons name={showTimeline ? 'chevron-up' : 'time-outline'} size={18} color={colors.text.secondary} />
            <Text style={styles.timelineToggleText}>{showTimeline ? 'Hide Timeline' : 'View Past Stories'}</Text>
          </TouchableOpacity>

          {showTimeline && (
            <View style={styles.timelineSection}>
              {isLoadingHistory ? (
                <ActivityIndicator size="small" color={colors.brand.primary} />
              ) : history.length > 1 ? (
                history.slice(1).map((item: PersonalNarrative, index: number) => (
                  <View key={item.id} style={styles.timelineItem}>
                    <View style={styles.timelineDot} />
                    {index < history.length - 2 && <View style={styles.timelineLine} />}
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineDate}>
                        {new Date(item.periodStart).toLocaleDateString()} -{' '}
                        {new Date(item.periodEnd).toLocaleDateString()}
                      </Text>
                      <Text style={styles.timelineNarrative} numberOfLines={3}>
                        {item.narrative}
                      </Text>
                      <Text style={styles.timelineDataPoints}>{item.dataPointsUsed} data points</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.noHistory}>No past stories yet. Keep reflecting!</Text>
              )}
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="book-outline" size={64} color={colors.text.tertiary} />
          <Text style={styles.emptyTitle}>Your Story Awaits</Text>
          <Text style={styles.emptyDescription}>
            Start reflecting and checking in with your moods. After a week of activity, your personal narrative will be
            generated here.
          </Text>
          <TouchableOpacity style={styles.refreshButton} onPress={() => refetch()} testID="refresh-narrative">
            <Ionicons name="refresh" size={18} color={colors.text.primary} />
            <Text style={styles.refreshButtonText}>Check for Story</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      padding: 16,
    },
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
    },
    loadingText: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 12,
    },
    narrativeCard: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      padding: 20,
    },
    narrativeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    narrativeTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
      flex: 1,
    },
    newBadge: {
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    newBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#fff',
    },
    periodText: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginBottom: 12,
    },
    narrativeText: {
      fontSize: 15,
      color: colors.text.primary,
      lineHeight: 24,
    },
    dataPointsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.background.subtle,
    },
    dataPoint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    dataPointText: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    breakthroughBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: `${colors.semantic.warning}20`,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.md,
      marginTop: 12,
      alignSelf: 'flex-start',
    },
    breakthroughCount: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.semantic.warning,
    },
    forwardPromptCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: `${colors.brand.primary}15`,
      padding: 16,
      borderRadius: BORDER_RADIUS.lg,
      marginTop: 16,
    },
    forwardPromptText: {
      flex: 1,
      fontSize: 15,
      color: colors.text.primary,
      lineHeight: 22,
      fontStyle: 'italic',
    },
    reflectionSection: {
      marginTop: 16,
    },
    reflectionLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 8,
    },
    reflectionInput: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text.primary,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    respondButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 12,
    },
    respondButtonDisabled: {
      opacity: 0.5,
    },
    respondButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
    },
    savedReflection: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: colors.background.darkCard,
      padding: 14,
      borderRadius: BORDER_RADIUS.lg,
      marginTop: 16,
    },
    savedReflectionText: {
      flex: 1,
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },
    timelineToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 20,
      paddingVertical: 8,
    },
    timelineToggleText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    timelineSection: {
      marginTop: 12,
      paddingLeft: 8,
    },
    timelineItem: {
      flexDirection: 'row',
      position: 'relative',
      marginBottom: 16,
    },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.brand.primary,
      marginTop: 6,
      marginRight: 12,
    },
    timelineLine: {
      position: 'absolute',
      left: 4,
      top: 20,
      bottom: -12,
      width: 2,
      backgroundColor: colors.background.subtle,
    },
    timelineContent: {
      flex: 1,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
    },
    timelineDate: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginBottom: 4,
    },
    timelineNarrative: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },
    timelineDataPoints: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 6,
    },
    noHistory: {
      fontSize: 14,
      color: colors.text.tertiary,
      textAlign: 'center',
      paddingVertical: 20,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 16,
    },
    emptyDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
      paddingHorizontal: 20,
    },
    refreshButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.background.darkCard,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.lg,
      marginTop: 20,
    },
    refreshButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.primary,
    },
  });
