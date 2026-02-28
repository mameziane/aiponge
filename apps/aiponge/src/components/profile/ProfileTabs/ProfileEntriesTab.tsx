import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/i18n';
import { EntryNavigator } from '../../EntryNavigator';
import { EntriesListSkeleton } from '../../shared/SkeletonLoaders';
import { useThemeColors, type ColorScheme } from '@/theme';
import { createProfileEditorStyles } from '@/styles/profileEditor.styles';
import type { Entry, Insight } from '@/types/profile.types';
import { ChapterModalContext } from '../../../../app/(user)/_layout';
import { useEntryInsights } from '@/hooks/book/useEntryInsights';

interface ProfileEntriesTabProps {
  entriesLoading: boolean;
  entries: Entry[];
  currentEntry: Entry | null;
  generatingInsight: boolean;
  generatedInsight: string | null;
  handleEntriesUpdate: () => Promise<void>;
  setCurrentEntry: (entry: Entry | null) => void;
  generateInsightFromEntry: () => Promise<string | null>;
  clearGeneratedInsight: () => void;
  totalEntriesCount?: number;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onContentChange?: (content: string) => void;
}

export const ProfileEntriesTab: React.FC<ProfileEntriesTabProps> = ({
  entriesLoading,
  entries,
  currentEntry,
  generatingInsight,
  generatedInsight,
  handleEntriesUpdate,
  setCurrentEntry,
  generateInsightFromEntry,
  clearGeneratedInsight,
  totalEntriesCount,
  onLoadMore,
  hasMore,
  isLoadingMore,
  onContentChange: parentOnContentChange,
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = React.useMemo(() => createProfileEditorStyles(colors), [colors]);
  const insightStyles = React.useMemo(() => createInsightStyles(colors), [colors]);
  const { entryCreationTrigger } = React.useContext(ChapterModalContext);
  const [replaceContentTrigger, setReplaceContentTrigger] = React.useState<{
    content: string;
    timestamp: number;
  } | null>(null);
  const [currentContent, setCurrentContent] = React.useState('');

  const { insights: storedInsights, isLoading: insightsLoading } = useEntryInsights(currentEntry?.id);

  const handleCurrentEntryChange = React.useCallback(
    (entry: unknown) => {
      setCurrentEntry(entry as Entry | null);
      clearGeneratedInsight();
      setReplaceContentTrigger(null);
    },
    [setCurrentEntry, clearGeneratedInsight]
  );

  const handleContentChange = React.useCallback(
    (content: string) => {
      setCurrentContent(content);
      parentOnContentChange?.(content);
    },
    [parentOnContentChange]
  );

  const handleReplaceWithInsight = React.useCallback(
    (insightContent: string) => {
      setReplaceContentTrigger({ content: insightContent, timestamp: Date.now() });
      if (insightContent === generatedInsight) {
        clearGeneratedInsight();
      }
    },
    [generatedInsight, clearGeneratedInsight]
  );

  const hasContent = currentContent.trim().length > 0;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.tabContent}>
      {entriesLoading && entries.length === 0 ? (
        <EntriesListSkeleton count={3} />
      ) : (
        <>
          <EntryNavigator
            entries={entries}
            onEntriesUpdate={handleEntriesUpdate}
            isLoading={false}
            totalEntriesCount={totalEntriesCount}
            onCurrentEntryChange={handleCurrentEntryChange}
            onContentChange={handleContentChange}
            newEntryTrigger={entryCreationTrigger}
            replaceContentTrigger={replaceContentTrigger}
            onLoadMore={onLoadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
          />

          {hasContent && (
            <View style={styles.card}>
              <View style={styles.cardContent}>
                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.buttonPrimary,
                    styles.fullWidthButton,
                    { opacity: generatingInsight ? 0.7 : 1 },
                  ]}
                  onPress={generateInsightFromEntry}
                  disabled={generatingInsight}
                  testID="button-generate-insight"
                >
                  {generatingInsight ? (
                    <ActivityIndicator size="small" color={colors.text.primary} />
                  ) : (
                    <Ionicons name="sparkles" size={16} color={colors.text.primary} />
                  )}
                  <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
                    {generatingInsight ? t('reflect.generatingInsight') : t('reflect.generateInsight')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {generatedInsight && (
            <View style={[styles.card, { marginTop: 12, borderColor: colors.brand.primary, borderWidth: 1 }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="sparkles" size={18} color={colors.brand.primary} />
                <Text style={[styles.cardTitle, { marginLeft: 8 }]}>{t('reflect.generatedInsight')}</Text>
                <View style={insightStyles.newBadge}>
                  <Text style={insightStyles.newBadgeText}>{t('common.new')}</Text>
                </View>
              </View>
              <View style={styles.cardContent}>
                <Text style={[styles.entryContent, { marginBottom: 16 }]}>{generatedInsight}</Text>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary, styles.fullWidthButton]}
                  onPress={() => handleReplaceWithInsight(generatedInsight)}
                  testID="button-replace-with-insight"
                >
                  <Ionicons name="swap-horizontal" size={16} color={colors.brand.primary} />
                  <Text style={[styles.buttonText, styles.buttonTextSecondary]}>{t('reflect.replaceWithInsight')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {currentEntry && (
            <View style={insightStyles.storedInsightsSection}>
              <View style={insightStyles.sectionHeader}>
                <Ionicons name="bulb-outline" size={20} color={colors.text.primary} />
                <Text style={insightStyles.sectionTitle}>{t('reflect.previousInsights')}</Text>
                {insightsLoading && (
                  <ActivityIndicator size="small" color={colors.brand.primary} style={{ marginLeft: 8 }} />
                )}
              </View>

              {storedInsights.length === 0 && !insightsLoading ? (
                <View style={insightStyles.emptyState}>
                  <Text style={insightStyles.emptyStateText}>{t('reflect.noInsightsYet')}</Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={insightStyles.insightsScrollContent}
                >
                  {storedInsights.map((insight: Insight) => (
                    <View key={insight.id} style={insightStyles.insightCard} testID={`card-insight-${insight.id}`}>
                      <View style={insightStyles.insightHeader}>
                        <Ionicons name="sparkles" size={14} color={colors.brand.primary} />
                        <Text style={insightStyles.insightDate}>{formatDate(insight.createdAt)}</Text>
                      </View>
                      <Text style={insightStyles.insightContent} numberOfLines={4}>
                        {insight.content}
                      </Text>
                      <TouchableOpacity
                        style={insightStyles.useInsightButton}
                        onPress={() => handleReplaceWithInsight(insight.content)}
                        testID={`button-use-insight-${insight.id}`}
                      >
                        <Ionicons name="arrow-redo" size={14} color={colors.brand.primary} />
                        <Text style={insightStyles.useInsightText}>{t('reflect.useInsight')}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const createInsightStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    storedInsightsSection: {
      marginTop: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginLeft: 8,
    },
    emptyState: {
      backgroundColor: colors.background.secondary,
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
    },
    emptyStateText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    insightsScrollContent: {
      paddingHorizontal: 4,
      gap: 12,
    },
    insightCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: 12,
      padding: 14,
      width: 260,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    insightHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    insightDate: {
      fontSize: 12,
      color: colors.text.secondary,
      marginLeft: 6,
    },
    insightContent: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
      marginBottom: 12,
    },
    useInsightButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    useInsightText: {
      fontSize: 13,
      color: colors.brand.primary,
      fontWeight: '500',
    },
    newBadge: {
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      marginLeft: 'auto',
    },
    newBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.primary,
    },
  });
