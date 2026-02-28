import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { spacing } from '@/theme/spacing';
import { useTranslation } from '@/i18n';
import { LoadingState } from '../../shared';
import { CollapsibleLanguageSelector } from '../../shared/CollapsibleLanguageSelector';
import { useBooksUnified, useChaptersUnified } from '@/hooks/book/useUnifiedLibrary';

import { apiRequest } from '@/lib/axiosApiClient';
import { logger } from '@/lib/logger';
import { useAsyncStorageState } from '@/hooks/ui/useAsyncStorageState';
import {
  UnifiedSongPreferences,
  type ControlledMusicPreferences as MusicPreferences,
} from '../../shared/UnifiedSongPreferences';
import type { Book, EntryChapter, Entry } from '@/types/profile.types';
import { useMusicPreferences } from '@/hooks/music/useMusicPreferences';
import { usePreferencesOverride } from '@/hooks/music/usePreferencesOverride';
import { useAuthStore, selectUserId } from '@/auth/store';

export interface BatchAlbumGenerationParams {
  bookId?: string;
  bookTitle?: string;
  bookType?: string;
  bookDescription?: string;
  chapters: Array<{
    chapter: EntryChapter;
    entries: Entry[];
    selectedEntryIds: string[];
  }>;
  targetLanguages: string[];
  preferences: MusicPreferences;
  styleWeight: number;
  negativeTags: string;
}

interface ChapterSnapshot {
  chapter: EntryChapter;
  entries?: Entry[];
  entryCount: number;
}

interface ChapterSelection {
  chapter: EntryChapter;
  entries: Entry[];
  selectedEntryIds: Set<string>;
  isExpanded: boolean;
  isLoading: boolean;
}

const MAX_TOTAL_TRACKS_PER_BATCH = 100;
const MAX_CHAPTERS_PER_BATCH = 10;

interface BatchAlbumCreationModalProps {
  visible: boolean;
  onClose: () => void;
  isLibrarian?: boolean;
  creditCostPerSong?: number | null;
  currentBalance?: number;
  creditsLoading?: boolean;
  onGenerateBatch?: (params: BatchAlbumGenerationParams) => void;
  isGeneratingBatch?: boolean;
  preSelectedBook?: Book | null;
}

export function BatchAlbumCreationModal({
  visible,
  onClose,
  isLibrarian = false,
  creditCostPerSong = null,
  currentBalance = 0,
  creditsLoading = false,
  onGenerateBatch,
  isGeneratingBatch = false,
  preSelectedBook = null,
}: BatchAlbumCreationModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t, i18n } = useTranslation();
  const [localSelectedBook, setLocalSelectedBook] = useState<Book | null>(null);

  // Unified hooks - books auto-fetch, chapters fetch when bookId changes
  const { books, loading: booksLoading } = useBooksUnified({});
  const { chapters, loading: chaptersLoading } = useChaptersUnified(localSelectedBook?.id);

  const userId = useAuthStore(selectUserId);
  const { preferences: savedPreferences, loading: savedPreferencesLoading, saveAll } = useMusicPreferences(userId);

  const {
    preferences,
    styleWeight,
    negativeTags,
    loading: preferencesLoading,
    setStyleWeight,
    setNegativeTags,
    handleMusicStylesChange,
    handleGenreChange,
    handleCulturalLanguagesChange,
    handleMoodChange,
    handleInstrumentsChange,
    handleVocalGenderChange,
  } = usePreferencesOverride(savedPreferences, savedPreferencesLoading, visible);

  const [chapterSelections, setChapterSelections] = useState<Record<string, ChapterSelection>>({});
  const [step, setStep] = useState<'book' | 'chapters'>('book');

  const { value: targetLanguages, setValue: setTargetLanguagesPersisted } = useAsyncStorageState<string[]>({
    key: 'batch_album_target_languages',
    defaultValue: [i18n.language],
  });
  const setTargetLanguages = useCallback(
    (langs: string[]) => {
      setTargetLanguagesPersisted(langs);
    },
    [setTargetLanguagesPersisted]
  );
  const [preferencesExpanded, setPreferencesExpanded] = useState(false);

  useEffect(() => {
    if (visible) {
      if (preSelectedBook) {
        setLocalSelectedBook(preSelectedBook);
        setStep('chapters');
      } else {
        setStep('book');
        setLocalSelectedBook(null);
      }
      setChapterSelections({});
      setPreferencesExpanded(false);
    }
  }, [visible, preSelectedBook]);

  const handleSelectBook = useCallback((book: Book) => {
    setLocalSelectedBook(book);
    setChapterSelections({});
    setStep('chapters');
  }, []);

  useEffect(() => {
    if (chapters.length > 0) {
      const ids = chapters.map(ch => ch.id);
      const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (duplicates.length > 0) {
        logger.warn('Duplicate chapter IDs detected', {
          duplicates,
          bookId: localSelectedBook?.id,
          totalChapters: chapters.length,
        });
      }
    }
  }, [chapters, localSelectedBook?.id]);

  useEffect(() => {
    if (chapters.length > 0 && localSelectedBook && Object.keys(chapterSelections).length === 0) {
      const selectAllChapters = async () => {
        const selections: Record<string, ChapterSelection> = {};
        for (const chapter of chapters) {
          selections[chapter.id] = {
            chapter,
            entries: [],
            selectedEntryIds: new Set(),
            isExpanded: false,
            isLoading: true,
          };
        }
        setChapterSelections(selections);

        for (const chapter of chapters) {
          try {
            const response = (await apiRequest(`/api/v1/app/chapters/snapshot/${chapter.id}`)) as {
              success: boolean;
              data: ChapterSnapshot;
            };
            // as unknown: API may return unwrapped ChapterSnapshot or wrapped { data: ChapterSnapshot }
            const snapshotData = response.data || (response as unknown as ChapterSnapshot);
            const entries = snapshotData.entries || [];
            const allEntryIds = new Set(entries.map(t => t.id));

            setChapterSelections(prev => ({
              ...prev,
              [chapter.id]: {
                chapter,
                entries,
                selectedEntryIds: allEntryIds,
                isExpanded: false,
                isLoading: false,
              },
            }));
          } catch (error) {
            logger.error('Failed to load chapter entries for preselection:', { chapterId: chapter.id, error });
            setChapterSelections(prev => {
              const next = { ...prev };
              delete next[chapter.id];
              return next;
            });
          }
        }
      };
      selectAllChapters();
    }
  }, [chapters, localSelectedBook]);

  const handleBack = useCallback(() => {
    if (step === 'chapters') {
      if (preSelectedBook) {
        onClose();
      } else {
        setStep('book');
        setLocalSelectedBook(null);
        setChapterSelections({});
      }
    }
  }, [step, preSelectedBook, onClose]);

  const toggleChapterSelection = useCallback(
    async (chapter: EntryChapter) => {
      const existing = chapterSelections[chapter.id];

      if (existing) {
        setChapterSelections(prev => {
          const next = { ...prev };
          delete next[chapter.id];
          return next;
        });
      } else {
        setChapterSelections(prev => ({
          ...prev,
          [chapter.id]: {
            chapter,
            entries: [],
            selectedEntryIds: new Set(),
            isExpanded: false,
            isLoading: true,
          },
        }));

        try {
          const response = (await apiRequest(`/api/v1/app/chapters/snapshot/${chapter.id}`)) as {
            success: boolean;
            data: ChapterSnapshot;
          };
          // as unknown: API may return unwrapped ChapterSnapshot or wrapped { data: ChapterSnapshot }
          const snapshotData = response.data || (response as unknown as ChapterSnapshot);
          const entries = snapshotData.entries || [];
          const allEntryIds = new Set(entries.map(t => t.id));

          setChapterSelections(prev => ({
            ...prev,
            [chapter.id]: {
              chapter,
              entries,
              selectedEntryIds: allEntryIds,
              isExpanded: true,
              isLoading: false,
            },
          }));
        } catch (error) {
          logger.error('Failed to load chapter entries:', { error });
          setChapterSelections(prev => {
            const next = { ...prev };
            delete next[chapter.id];
            return next;
          });
        }
      }
    },
    [chapterSelections]
  );

  const toggleChapterExpanded = useCallback((chapterId: string) => {
    setChapterSelections(prev => ({
      ...prev,
      [chapterId]: {
        ...prev[chapterId],
        isExpanded: !prev[chapterId].isExpanded,
      },
    }));
  }, []);

  const toggleEntry = useCallback((chapterId: string, entryId: string) => {
    setChapterSelections(prev => {
      const chapter = prev[chapterId];
      if (!chapter) return prev;

      const next = new Set(chapter.selectedEntryIds);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }

      if (next.size === 0) {
        const newSelections = { ...prev };
        delete newSelections[chapterId];
        return newSelections;
      }

      return {
        ...prev,
        [chapterId]: {
          ...chapter,
          selectedEntryIds: next,
        },
      };
    });
  }, []);

  const selectAllEntries = useCallback((chapterId: string) => {
    setChapterSelections(prev => {
      const chapter = prev[chapterId];
      if (!chapter) return prev;

      return {
        ...prev,
        [chapterId]: {
          ...chapter,
          selectedEntryIds: new Set(chapter.entries.map(t => t.id)),
        },
      };
    });
  }, []);

  const deselectAllEntries = useCallback((chapterId: string) => {
    setChapterSelections(prev => {
      const newSelections = { ...prev };
      delete newSelections[chapterId];
      return newSelections;
    });
  }, []);

  const persistPreferences = useCallback(async () => {
    if (!userId) return;
    try {
      await saveAll({
        musicStyles: preferences.musicStyles,
        genre: preferences.genre,
        culturalLanguages: preferences.culturalLanguages,
        mood: preferences.mood,
        instruments: preferences.instruments,
        vocalGender: preferences.vocalGender,
        styleWeight,
        negativeTags,
      });
    } catch (error) {
      logger.warn('Failed to persist song preferences from studio', { error });
    }
  }, [userId, preferences, styleWeight, negativeTags, saveAll]);

  const handleConfirm = useCallback(() => {
    const chaptersToGenerate = Object.values(chapterSelections)
      .filter(sel => sel.selectedEntryIds.size > 0)
      .map(sel => ({
        chapter: sel.chapter,
        entries: sel.entries.filter((e: Entry) => sel.selectedEntryIds.has(e.id)),
        selectedEntryIds: Array.from(sel.selectedEntryIds),
      }));

    if (chaptersToGenerate.length === 0) return;

    persistPreferences();

    if (onGenerateBatch) {
      onGenerateBatch({
        bookId: localSelectedBook?.id || 'unknown',
        bookTitle: localSelectedBook?.title || 'Book',
        bookType: localSelectedBook?.typeId || undefined,
        bookDescription: localSelectedBook?.description || undefined,
        chapters: chaptersToGenerate,
        targetLanguages,
        preferences,
        styleWeight,
        negativeTags,
      });
    }
  }, [
    chapterSelections,
    onGenerateBatch,
    targetLanguages,
    preferences,
    styleWeight,
    negativeTags,
    localSelectedBook,
    persistPreferences,
  ]);

  const selectedChapterCount = Object.keys(chapterSelections).length;
  const totalSelectedEntries = Object.values(chapterSelections).reduce(
    (sum, sel) => sum + sel.selectedEntryIds.size,
    0
  );
  const languageCount = targetLanguages.length;
  const totalTracks = totalSelectedEntries * languageCount;
  const totalCredits = creditCostPerSong !== null ? totalTracks * creditCostPerSong : null;
  const hasEnoughCredits = isLibrarian || creditsLoading || (totalCredits !== null && currentBalance >= totalCredits);

  const exceedsTotalTracksLimit = totalTracks > MAX_TOTAL_TRACKS_PER_BATCH;
  const exceedsChaptersLimit = selectedChapterCount > MAX_CHAPTERS_PER_BATCH;
  const hasValidBatchSize = !exceedsTotalTracksLimit && !exceedsChaptersLimit;

  const canGenerate =
    selectedChapterCount > 0 && totalSelectedEntries > 0 && hasEnoughCredits && hasValidBatchSize && !isGeneratingBatch;

  const renderBookSelection = () => (
    <View style={styles.content}>
      <Text style={styles.stepTitle}>{t('create.selectJournal')}</Text>
      <Text style={styles.stepSubtitle}>{t('create.batchAlbumDescription')}</Text>
      {booksLoading ? (
        <LoadingState fullScreen={false} />
      ) : books.length === 0 ? (
        <Text style={styles.emptyText}>{t('create.noJournalsFound')}</Text>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {books.map((book: Book) => (
            <TouchableOpacity
              key={book.id}
              style={[styles.listItem, localSelectedBook?.id === book.id && styles.listItemSelected]}
              onPress={() => handleSelectBook(book)}
            >
              <View style={styles.listItemContent}>
                <Text style={styles.listItemTitle}>{book.title}</Text>
                {book.description && (
                  <Text style={styles.listItemSubtitle} numberOfLines={1}>
                    {book.description}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const renderChapterSelection = () => (
    <ScrollView
      style={styles.content}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={styles.backButton} onPress={handleBack}>
        <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
        <Text style={styles.backText}>{localSelectedBook?.title}</Text>
      </TouchableOpacity>
      <Text style={styles.stepTitle}>{t('create.selectChapters')}</Text>
      <Text style={styles.stepSubtitle}>{t('create.chaptersSelectedCount', { count: selectedChapterCount })}</Text>

      {chaptersLoading ? (
        <LoadingState fullScreen={false} />
      ) : chapters.length === 0 ? (
        <Text style={styles.emptyText}>{t('create.noChaptersFound')}</Text>
      ) : (
        <View style={styles.chaptersList}>
          {chapters.map((chapter, index) => {
            const selection = chapterSelections[chapter.id];
            const isSelected = !!selection;
            const isExpanded = selection?.isExpanded ?? false;
            const isLoading = selection?.isLoading ?? false;
            const entryCount = selection?.entries.length ?? 0;
            const selectedCount = selection?.selectedEntryIds.size ?? 0;

            return (
              <View key={chapter.id || `chapter-${index}`} style={styles.chapterContainer}>
                <TouchableOpacity
                  style={[styles.chapterHeader, isSelected && styles.chapterHeaderSelected]}
                  onPress={() => toggleChapterSelection(chapter)}
                >
                  <View style={styles.chapterCheckbox}>
                    {isLoading ? (
                      <ActivityIndicator size="small" color={colors.brand.primary} />
                    ) : (
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={isSelected ? colors.brand.primary : colors.text.tertiary}
                      />
                    )}
                  </View>
                  <View style={styles.chapterInfo}>
                    <Text style={styles.chapterTitle}>{chapter.title}</Text>
                    {isSelected && !isLoading && (
                      <Text style={styles.chapterCount}>
                        {selectedCount}/{entryCount} {t('create.entries')}
                      </Text>
                    )}
                  </View>
                  {isSelected && !isLoading && (
                    <TouchableOpacity style={styles.expandButton} onPress={() => toggleChapterExpanded(chapter.id)}>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={colors.text.secondary}
                      />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                {isSelected && isExpanded && !isLoading && selection && (
                  <View style={styles.entriesContainer}>
                    <View style={styles.entriesHeader}>
                      <TouchableOpacity style={styles.selectAllButton} onPress={() => selectAllEntries(chapter.id)}>
                        <Text style={styles.selectAllText}>{t('create.selectAll')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.selectAllButton} onPress={() => deselectAllEntries(chapter.id)}>
                        <Text style={styles.deselectAllText}>{t('create.deselectAll')}</Text>
                      </TouchableOpacity>
                    </View>
                    {selection.entries.map(entry => (
                      <TouchableOpacity
                        key={entry.id}
                        style={[styles.entryItem, selection.selectedEntryIds.has(entry.id) && styles.entryItemSelected]}
                        onPress={() => toggleEntry(chapter.id, entry.id)}
                      >
                        <View style={styles.entryContent}>
                          <Text style={styles.entryText} numberOfLines={2}>
                            {entry.content}
                          </Text>
                        </View>
                        <Switch
                          value={selection.selectedEntryIds.has(entry.id)}
                          onValueChange={() => toggleEntry(chapter.id, entry.id)}
                          trackColor={{ false: colors.background.tertiary, true: colors.brand.primary }}
                          thumbColor={colors.text.primary}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {selectedChapterCount > 0 && (
        <View style={styles.preferencesSection}>
          <CollapsibleLanguageSelector selectedLanguages={targetLanguages} onLanguagesChange={setTargetLanguages} />

          <UnifiedSongPreferences
            mode="collapsed"
            controlled={true}
            controlledPreferences={preferences}
            controlledLoading={preferencesLoading}
            expanded={preferencesExpanded}
            onToggleExpand={() => setPreferencesExpanded(prev => !prev)}
            onMusicStylesChange={handleMusicStylesChange}
            onGenreChange={handleGenreChange}
            onCulturalLanguagesChange={handleCulturalLanguagesChange}
            onMoodChange={handleMoodChange}
            onInstrumentsChange={handleInstrumentsChange}
            onVocalGenderChange={handleVocalGenderChange}
            showStyleIntensity={true}
            styleWeight={styleWeight}
            onStyleWeightChange={setStyleWeight}
            showNegativeTags={true}
            negativeTags={negativeTags}
            onNegativeTagsChange={setNegativeTags}
            hideLanguageSelector={true}
          />
        </View>
      )}

      <View style={styles.generateSection}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Ionicons name="albums-outline" size={18} color={colors.text.secondary} />
            <Text style={styles.summaryLabel}>
              {languageCount} {languageCount === 1 ? t('create.album') : t('create.albums')}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Ionicons name="musical-notes-outline" size={18} color={colors.text.secondary} />
            <Text style={styles.summaryLabel}>
              {totalTracks} {totalTracks === 1 ? t('create.song') : t('create.songs')}
            </Text>
          </View>
        </View>

        <View style={styles.costSummary}>
          <Text style={styles.costLabel}>{t('create.totalCost')}</Text>
          {creditsLoading ? (
            <ActivityIndicator size="small" color={colors.text.secondary} />
          ) : (
            <Text style={[styles.costValue, !hasEnoughCredits && styles.costValueInsufficient]}>
              {totalCredits !== null ? totalCredits : '—'} {t('create.credits')}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.confirmButton, !canGenerate && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={!canGenerate}
        >
          {isGeneratingBatch ? (
            <ActivityIndicator size="small" color={colors.text.primary} />
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color={colors.text.primary} />
              <Text style={styles.confirmButtonText}>{t('create.generateAlbums', { count: languageCount })}</Text>
            </>
          )}
        </TouchableOpacity>

        {!creditsLoading && !hasEnoughCredits && selectedChapterCount > 0 && (
          <Text style={styles.insufficientCreditsText}>{t('create.insufficientCredits')}</Text>
        )}

        {exceedsTotalTracksLimit && (
          <Text style={styles.insufficientCreditsText}>
            {t('create.batchTooManyTracks', { max: MAX_TOTAL_TRACKS_PER_BATCH, current: totalTracks })}
          </Text>
        )}

        {exceedsChaptersLimit && (
          <Text style={styles.insufficientCreditsText}>
            {t('create.batchTooManyChapters', { max: MAX_CHAPTERS_PER_BATCH })}
          </Text>
        )}
      </View>
    </ScrollView>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('create.batchAlbumCreation')}</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {step === 'book' && renderBookSelection()}
        {step === 'chapters' && renderChapterSelection()}
      </View>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.screenHorizontal,
      paddingVertical: spacing.elementPadding,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    closeButton: {
      padding: 4,
    },
    content: {
      flex: 1,
      padding: spacing.screenHorizontal,
    },
    contentContainer: {
      paddingBottom: 24,
    },
    stepTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    stepSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: spacing.sectionGap,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sectionGap,
      gap: 8,
    },
    backText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    emptyText: {
      fontSize: 16,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: 24,
    },
    list: {
      flex: 1,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: spacing.elementPadding,
      marginBottom: spacing.componentGap,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    listItemSelected: {
      borderColor: colors.brand.primary,
    },
    listItemContent: {
      flex: 1,
    },
    listItemTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
    },
    listItemSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 4,
    },
    chaptersList: {
      gap: spacing.componentGap,
    },
    chapterContainer: {
      marginBottom: spacing.componentGap,
    },
    chapterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: spacing.elementPadding,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    chapterHeaderSelected: {
      borderColor: colors.brand.primary,
      backgroundColor: colors.background.tertiary,
    },
    chapterCheckbox: {
      width: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chapterInfo: {
      flex: 1,
      marginLeft: 8,
    },
    chapterTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
    },
    chapterCount: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },
    expandButton: {
      padding: 8,
    },
    entriesContainer: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      marginTop: 4,
      padding: spacing.elementPadding,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    entriesHeader: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 8,
      gap: 12,
    },
    selectAllButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    selectAllText: {
      fontSize: 12,
      color: colors.brand.primary,
      fontWeight: '500',
    },
    deselectAllText: {
      fontSize: 12,
      color: colors.text.tertiary,
      fontWeight: '500',
    },
    entryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    entryItemSelected: {
      borderColor: colors.brand.primary,
    },
    entryContent: {
      flex: 1,
      marginRight: 12,
    },
    entryText: {
      fontSize: 13,
      color: colors.text.primary,
      lineHeight: 18,
    },
    preferencesSection: {
      marginTop: spacing.componentGap,
      gap: spacing.componentGap,
    },
    generateSection: {
      marginTop: spacing.sectionGap,
      paddingTop: spacing.sectionGap,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 24,
      marginBottom: spacing.componentGap,
    },
    summaryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    summaryLabel: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    costSummary: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.componentGap,
    },
    costLabel: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    costValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    costValueInsufficient: {
      color: colors.semantic.error,
    },
    confirmButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 16,
      marginTop: spacing.componentGap,
      gap: 8,
    },
    confirmButtonDisabled: {
      backgroundColor: colors.background.tertiary,
      opacity: 0.5,
    },
    confirmButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    insufficientCreditsText: {
      fontSize: 12,
      color: colors.semantic.error,
      textAlign: 'center',
      marginTop: 8,
    },
  });
