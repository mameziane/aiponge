/**
 * ReflectScreen - Reflect Tab
 * Insights, wellness, schedule, and self-discovery
 *
 * Tabs:
 * - Summary
 * - Insights
 * - Wellness
 * - Your Story
 * - Schedule
 *
 * Personal Info and Privacy tabs moved to ProfileScreen
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useSearch } from '../../stores';
import { logger } from '../../lib/logger';
import { WellnessTab } from '../../components/profile/ProfileTabs/WellnessTab';
import { ProfileEntriesTab } from '../../components/profile/ProfileTabs/ProfileEntriesTab';
import {
  PatternInsightsTab,
  SummaryCard,
  EmotionalSection,
  PatternEmptyState,
  patternInsightsStyles,
} from '../../components/book/PatternInsightsTab';
import { usePatterns } from '../../hooks/profile/usePatterns';
import { TabBar, type TabConfig } from '../../components/shared/TabBar';
import { commonStyles, BORDER_RADIUS, useThemeColors, type ColorScheme } from '../../theme';
import { LoadingState } from '../../components/shared';
import { createProfileEditorStyles } from '../../styles/profileEditor.styles';
import { useAuthStore, selectUser } from '../../auth/store';
import { useProfile } from '../../hooks/profile/useProfile';
import { useEntriesUnified } from '../../hooks/book/useUnifiedLibrary';
import { useInsightGeneration } from '../../hooks/book/useInsightGeneration';
import { ActivityCalendarTab } from '../../components/book';
import { ReflectionDialogueSheet } from '../../components/profile/ReflectionDialogueSheet';
import { MoodCheckInSheet } from '../../components/profile/MoodCheckInSheet';
import { PatternReactionCard } from '../../components/profile/PatternReactionCard';
import { YourStoryTab } from '../../components/profile/YourStoryTab';
import type { Entry } from '../../types/profile.types';

export const ReflectScreen: React.FC = () => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProfileEditorStyles(colors), [colors]);
  const reflectStyles = useMemo(() => createReflectStyles(colors), [colors]);
  const params = useLocalSearchParams<{ tab?: string }>();

  const user = useAuthStore(selectUser);
  const userId = user?.id;

  const { isLoading, invalidateProfile } = useProfile();

  const {
    entries,
    total: totalEntriesCount,
    hasMore,
    isLoading: entriesLoading,
    isFetchingNextPage,
    fetchNextPage,
    refetchEntries,
  } = useEntriesUnified(20);

  const { generatedInsight, generatingInsight, generateInsightFromEntry, clearGeneratedInsight, setEntryContent } =
    useInsightGeneration();

  const [currentEntry, setCurrentEntry] = useState<Entry | null>(null);

  const {
    patterns,
    insights,
    isLoading: patternsLoading,
    isError: patternsError,
    analyzePatterns,
    isAnalyzing,
    refresh: refreshPatterns,
  } = usePatterns();

  const initialTab = params.tab || 'summary';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [refreshing, setRefreshing] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [showDialogue, setShowDialogue] = useState(false);
  const [dialogueReflectionId, setDialogueReflectionId] = useState<string | null>(null);
  const [showMoodCheckin, setShowMoodCheckin] = useState(false);

  const { isSearchActive, registerSearch, unregisterSearch } = useSearch();

  useFocusEffect(
    useCallback(() => {
      registerSearch({
        placeholder: t('search.entriesPlaceholder'),
        enabled: true,
        onSearch: query => setLocalSearchQuery(query),
        onClear: () => setLocalSearchQuery(''),
      });

      return () => {
        unregisterSearch();
      };
    }, [registerSearch, unregisterSearch, t])
  );

  const filteredEntries = useMemo(() => {
    if (!localSearchQuery.trim()) return [];
    const query = localSearchQuery.toLowerCase().trim();
    return entries.filter((entry: Entry) => {
      const contentMatch = entry.content?.toLowerCase().includes(query);
      const tagsMatch = entry.tags?.some((tag: string) => tag.toLowerCase().includes(query));
      const moodMatch = entry.moodContext?.toLowerCase().includes(query);
      return contentMatch || tagsMatch || moodMatch;
    });
  }, [entries, localSearchQuery]);

  const showSearchResults = isSearchActive && localSearchQuery.trim().length > 0;

  const REFLECT_TABS: TabConfig[] = useMemo(
    () => [
      { id: 'summary', label: t('profile.summary'), icon: 'stats-chart-outline' },
      { id: 'insights', label: t('profile.insights'), icon: 'bar-chart-outline' },
      { id: 'wellness', label: t('profile.wellness'), icon: 'heart-outline' },
      { id: 'story', label: 'Your Story', icon: 'book-outline' },
      { id: 'schedule', label: t('profile.schedule'), icon: 'calendar-outline' },
    ],
    [t]
  );

  const handleTabChange = useCallback((tab: string) => {
    const validTabs = ['summary', 'insights', 'wellness', 'story', 'schedule'];
    setActiveTab(validTabs.includes(tab) ? tab : 'summary');
  }, []);

  const openDialogue = useCallback((reflectionId: string) => {
    setDialogueReflectionId(reflectionId);
    setShowDialogue(true);
  }, []);

  const closeDialogue = useCallback(() => {
    setShowDialogue(false);
    setDialogueReflectionId(null);
  }, []);

  const handleCurrentEntryChange = useCallback(
    (entry: Entry | null) => {
      setCurrentEntry(entry);
      if (entry?.content) {
        setEntryContent(entry.content, entry.id);
      } else {
        setEntryContent('', null);
      }
      clearGeneratedInsight();
    },
    [setEntryContent, clearGeneratedInsight]
  );

  const handleEntriesUpdate = useCallback(async () => {
    await refetchEntries();
  }, [refetchEntries]);

  const handleLoadMore = useCallback(async () => {
    await fetchNextPage();
  }, [fetchNextPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    logger.debug('Pull-to-refresh triggered', { activeTab });

    try {
      invalidateProfile();
      if (activeTab === 'insights') {
        await refetchEntries();
      }
    } catch (error) {
      logger.error('Pull-to-refresh failed', error);
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, invalidateProfile, refetchEntries]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (!entriesLoading && totalEntriesCount === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Ionicons name="bulb-outline" size={64} color={colors.text.tertiary} />
        <Text
          style={{ color: colors.text.primary, fontSize: 20, fontWeight: '600', marginTop: 16, textAlign: 'center' }}
        >
          {t('navigation.reflectDisabledTitle')}
        </Text>
        <Text style={{ color: colors.text.secondary, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
          {t('navigation.reflectDisabledMessage')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand.primary}
            colors={[colors.brand.primary]}
            progressBackgroundColor={colors.background.darkCard}
          />
        }
      >
        <View style={styles.tabContainer}>
          <TabBar tabs={REFLECT_TABS} activeTab={activeTab} onTabChange={handleTabChange} testIDPrefix="reflect-tab" />

          {showSearchResults ? (
            <View style={reflectStyles.searchResultsContainer}>
              <Text style={reflectStyles.searchResultsTitle}>
                {t('search.results', { count: filteredEntries.length })}
              </Text>
              {filteredEntries.length === 0 ? (
                <View style={reflectStyles.noResultsContainer}>
                  <Ionicons name="search" size={48} color={colors.text.tertiary} />
                  <Text style={reflectStyles.noResultsText}>{t('search.noResults')}</Text>
                  <Text style={reflectStyles.noResultsHint}>{t('search.tryDifferentTerms')}</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredEntries}
                  keyExtractor={item => item.id}
                  renderItem={({ item: entry }) => (
                    <Pressable
                      style={({ pressed }) => [
                        reflectStyles.searchResultItem,
                        pressed && reflectStyles.searchResultItemPressed,
                      ]}
                      onPress={() => {
                        handleCurrentEntryChange(entry);
                        setActiveTab('insights');
                        setLocalSearchQuery('');
                      }}
                      testID={`search-result-${entry.id}`}
                    >
                      <View style={reflectStyles.searchResultContent}>
                        <Text style={reflectStyles.searchResultDate}>
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </Text>
                        <Text style={reflectStyles.searchResultText} numberOfLines={2}>
                          {(entry.content || '').substring(0, 80)}...
                        </Text>
                        {entry.tags && entry.tags.length > 0 && (
                          <View style={reflectStyles.tagsContainer}>
                            {entry.tags.slice(0, 3).map((tag: string, index: number) => (
                              <View key={index} style={reflectStyles.tagBadge}>
                                <Text style={reflectStyles.tagText}>{tag}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                    </Pressable>
                  )}
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  removeClippedSubviews={true}
                  testID="reflect-search-results"
                />
              )}
            </View>
          ) : (
            <>
              {activeTab === 'summary' && (
                <View style={{ padding: 16 }}>
                  {patternsLoading ? (
                    <LoadingState fullScreen={false} message={t('components.patternInsights.loading')} />
                  ) : patternsError ? (
                    <View style={{ alignItems: 'center', padding: 32 }}>
                      <Ionicons name="alert-circle" size={48} color={colors.semantic.error} />
                      <Text style={{ color: colors.semantic.error, fontSize: 16, marginTop: 12 }}>
                        {t('components.patternInsights.loadFailed')}
                      </Text>
                      <TouchableOpacity
                        style={[patternInsightsStyles(colors).refreshButton, { marginTop: 16, paddingHorizontal: 24 }]}
                        onPress={() => refreshPatterns()}
                        testID="button-retry-summary"
                      >
                        <Ionicons name="refresh" size={18} color={colors.text.primary} />
                        <Text style={patternInsightsStyles(colors).refreshButtonText}>
                          {t('components.patternInsights.retry')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : insights && insights.summary.totalPatterns > 0 ? (
                    <>
                      <SummaryCard insights={insights} />
                      <EmotionalSection insights={insights} />

                      {patterns.length > 0 && (
                        <View style={{ marginTop: 20 }}>
                          <Text
                            style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary, marginBottom: 12 }}
                          >
                            Explore Your Patterns
                          </Text>
                          {patterns.slice(0, 5).map(pattern => (
                            <PatternReactionCard
                              key={pattern.id}
                              pattern={{
                                id: pattern.id,
                                patternName: pattern.patternName,
                                description: pattern.description,
                                strength: pattern.strength,
                                trend: pattern.trend,
                                patternType: pattern.patternType,
                                relatedThemes: pattern.relatedThemes,
                              }}
                            />
                          ))}
                        </View>
                      )}

                      <TouchableOpacity
                        style={patternInsightsStyles(colors).refreshButton}
                        onPress={() => analyzePatterns()}
                        disabled={isAnalyzing}
                        testID="button-refresh-analysis"
                      >
                        {isAnalyzing ? (
                          <ActivityIndicator size="small" color={colors.text.primary} />
                        ) : (
                          <>
                            <Ionicons name="refresh" size={18} color={colors.text.primary} />
                            <Text style={patternInsightsStyles(colors).refreshButtonText}>
                              {t('components.patternInsights.refreshAnalysis')}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <PatternEmptyState onAnalyze={() => analyzePatterns()} isAnalyzing={isAnalyzing} />
                  )}
                </View>
              )}

              {activeTab === 'insights' && (
                <>
                  <ProfileEntriesTab
                    entriesLoading={entriesLoading}
                    entries={entries}
                    currentEntry={currentEntry}
                    generatingInsight={generatingInsight}
                    generatedInsight={generatedInsight}
                    handleEntriesUpdate={handleEntriesUpdate}
                    setCurrentEntry={handleCurrentEntryChange}
                    generateInsightFromEntry={generateInsightFromEntry}
                    clearGeneratedInsight={clearGeneratedInsight}
                    totalEntriesCount={totalEntriesCount}
                    onLoadMore={handleLoadMore}
                    hasMore={hasMore}
                    isLoadingMore={isFetchingNextPage}
                    onContentChange={setEntryContent}
                  />

                  {currentEntry && (
                    <TouchableOpacity
                      style={reflectStyles.dialogueButton}
                      onPress={() => openDialogue(currentEntry.id)}
                      testID="start-dialogue"
                    >
                      <Ionicons name="chatbubbles-outline" size={20} color={colors.brand.primary} />
                      <Text style={reflectStyles.dialogueButtonText}>Reflect Deeper</Text>
                    </TouchableOpacity>
                  )}

                  <View style={{ marginTop: 24 }}>
                    <PatternInsightsTab
                      insights={insights}
                      isLoading={patternsLoading}
                      isError={patternsError}
                      analyzePatterns={() => analyzePatterns()}
                      isAnalyzing={isAnalyzing}
                      refresh={refreshPatterns}
                    />
                  </View>
                </>
              )}

              {activeTab === 'wellness' && userId && <WellnessTab userId={userId} />}

              {activeTab === 'story' && <YourStoryTab />}

              {activeTab === 'schedule' && <ActivityCalendarTab />}
            </>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={reflectStyles.moodFab}
        onPress={() => setShowMoodCheckin(true)}
        testID="mood-checkin-fab"
      >
        <Ionicons name="heart-circle" size={28} color="#fff" />
      </TouchableOpacity>

      {showDialogue && dialogueReflectionId && (
        <ReflectionDialogueSheet reflectionId={dialogueReflectionId} onClose={closeDialogue} visible={showDialogue} />
      )}

      <MoodCheckInSheet visible={showMoodCheckin} onClose={() => setShowMoodCheckin(false)} />
    </View>
  );
};

const createReflectStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    searchResultsContainer: {
      padding: 16,
    },
    searchResultsTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 16,
    },
    noResultsContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
    },
    noResultsText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 16,
    },
    noResultsHint: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 4,
    },
    searchResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 8,
    },
    searchResultItemPressed: {
      opacity: 0.7,
    },
    searchResultContent: {
      flex: 1,
      marginRight: 8,
    },
    searchResultDate: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginBottom: 4,
    },
    searchResultText: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },
    tagsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 6,
      gap: 4,
    },
    tagBadge: {
      backgroundColor: colors.background.subtle,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    tagText: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    dialogueButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.background.darkCard,
      borderWidth: 1,
      borderColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 12,
      marginHorizontal: 16,
      marginTop: 12,
    },
    dialogueButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    moodFab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      zIndex: 10,
    },
  });
