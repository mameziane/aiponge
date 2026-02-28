import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from '@/i18n';
import { EntriesListSkeleton } from '../../shared/SkeletonLoaders';
import { useThemeColors } from '@/theme';
import { createProfileEditorStyles } from '@/styles/profileEditor.styles';
import type { Entry, EntryChapter } from '@/types/profile.types';
import { useChaptersUnified } from '@/hooks/book/useUnifiedLibrary';
import { ChapterModalContext } from '../../../../app/(user)/_layout';
import { apiClient, extractErrorMessage } from '@/lib/axiosApiClient';
import { TIER_IDS, type ServiceResponse } from '@aiponge/shared-contracts';
import { logger } from '@/lib/logger';
import { EntryNavigator } from '../../EntryNavigator';
import { LiquidGlassView } from '../../ui/LiquidGlassView';
import { LiquidGlassButton } from '../../ui/LiquidGlassButton';
import { useSubscriptionData } from '@/contexts/SubscriptionContext';
import { RichText } from '../../shared/RichText';

import { ChapterAssignmentModal, MoveChapterModal, ChapterViewContent, type ChapterControlsRef, type BookContentTabProps, type ViewMode } from './book-content';

export type { ChapterControlsRef } from './book-content';

export const BookContentTab: React.FC<BookContentTabProps> = ({
  entriesLoading,
  entriesLoaded,
  entries,
  onEntriesUpdate,
  refreshTrigger = 0,
  totalEntriesCount,
  onLoadMore,
  hasMore,
  isLoadingMore,
  currentEntry,
  setCurrentEntry,
  generatingInsight = false,
  generatedInsight,
  generateInsightFromEntry,
  clearGeneratedInsight,
  selectedSearchResultId,
  onClearSelectedSearchResult,
  entryIdsWithSongs,
  onChapterControlsReady,
  currentBookId,
  books = [],
  booksLoading = false,
  onChapterMoved,
  headerControls,
  initialExpandChapters = false,
  onImageLongPress,
  canDelete = true,
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = React.useMemo(() => createProfileEditorStyles(colors), [colors]);
  const { currentTier } = useSubscriptionData();
  const isGuest = currentTier === TIER_IDS.GUEST;
  const [viewMode, setViewMode] = React.useState<ViewMode>('chapters');
  const viewModeRef = React.useRef<ViewMode>(viewMode);
  React.useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);
  const [reverseChronology, setReverseChronology] = React.useState(false);
  const [selectedEntryId, setSelectedEntryId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [creatingChapter, setCreatingChapter] = React.useState(false);
  const [newChapterTitle, setNewChapterTitle] = React.useState('');
  const [editingChapterId, setEditingChapterId] = React.useState<string | null>(null);
  const [editChapterTitle, setEditChapterTitle] = React.useState('');
  const [collapsedChapters, setCollapsedChapters] = React.useState<Set<string>>(new Set());
  const [assignmentModalVisible, setAssignmentModalVisible] = React.useState(false);
  const [entryToAssign, setEntryToAssign] = React.useState<Entry | null>(null);
  const [assigning, setAssigning] = React.useState(false);
  const [moveChapterModalVisible, setMoveChapterModalVisible] = React.useState(false);
  const [chapterToMove, setChapterToMove] = React.useState<EntryChapter | null>(null);
  const [movingChapter, setMovingChapter] = React.useState(false);
  const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
  const [editedEntryContent, setEditedEntryContent] = React.useState('');
  const [savingEntry, setSavingEntry] = React.useState(false);
  const [saveFailedForEntry, setSaveFailedForEntry] = React.useState<string | null>(null);
  const saveInProgressRef = React.useRef(false);
  const viewModeTransitionRef = React.useRef(false);
  const [currentContent, setCurrentContent] = React.useState('');
  const [replaceContentTrigger, setReplaceContentTrigger] = React.useState<{
    content: string;
    timestamp: number;
  } | null>(null);
  const [deletingEntryId, setDeletingEntryId] = React.useState<string | null>(null);
  const [creatingEntryInChapterId, setCreatingEntryInChapterId] = React.useState<string | null>(null);
  const [newEntryContent, setNewEntryContent] = React.useState('');
  const [savingNewEntry, setSavingNewEntry] = React.useState(false);

  const {
    chapterModalTrigger,
    entryCreationTrigger,
    songCreationTrigger,
    bookCreationTrigger,
    setBookViewMode,
    setSelectionContext,
    setSelectedEntryId: setContextSelectedEntryId,
  } = React.useContext(ChapterModalContext);

  React.useEffect(() => {
    setBookViewMode(viewMode);
  }, [viewMode, setBookViewMode]);

  const editingEntryIdRef = React.useRef(editingEntryId);
  editingEntryIdRef.current = editingEntryId;

  const handleViewModeChange = React.useCallback((newMode: ViewMode) => {
    if (newMode === viewModeRef.current) return;
    viewModeTransitionRef.current = true;
    if (editingEntryIdRef.current) {
      setEditingEntryId(null);
      setEditedEntryContent('');
      setSaveFailedForEntry(null);
    }
    viewModeRef.current = newMode;
    setViewMode(newMode);
    setTimeout(() => {
      viewModeTransitionRef.current = false;
    }, 200);
  }, []);

  const handleCurrentEntryChange = React.useCallback(
    (entry: unknown) => {
      if (setCurrentEntry) setCurrentEntry(entry as Entry | null);
      if (clearGeneratedInsight) clearGeneratedInsight();
      setReplaceContentTrigger(null);
    },
    [setCurrentEntry, clearGeneratedInsight]
  );

  const handleContentChange = React.useCallback((content: string) => {
    setCurrentContent(content);
  }, []);

  const handleReplaceWithInsight = React.useCallback(() => {
    if (generatedInsight) {
      setReplaceContentTrigger({ content: generatedInsight, timestamp: Date.now() });
      if (clearGeneratedInsight) clearGeneratedInsight();
    }
  }, [generatedInsight, clearGeneratedInsight]);

  const hasContent = currentContent.trim().length > 0;

  const {
    chapters,
    loading: chaptersLoading,
    error: chapterError,
    loadedBookId,
    loadChapters,
    createChapter,
    updateChapter,
    deleteChapter,
    assignEntries,
  } = useChaptersUnified(currentBookId || undefined);

  const chaptersMatchCurrentBook = currentBookId ? loadedBookId === currentBookId : loadedBookId === undefined;

  React.useEffect(() => {
    if (refreshTrigger > 0) loadChapters(true);
  }, [refreshTrigger, loadChapters]);

  const lastChapterTriggerRef = React.useRef(0);
  const lastSongTriggerRef = React.useRef(0);

  React.useEffect(() => {
    if (chapterModalTrigger > lastChapterTriggerRef.current) {
      lastChapterTriggerRef.current = chapterModalTrigger;
      setCreatingChapter(true);
    }
  }, [chapterModalTrigger]);

  const { selectedEntryId: contextEntryId } = React.useContext(ChapterModalContext);

  React.useEffect(() => {
    if (songCreationTrigger > lastSongTriggerRef.current) {
      lastSongTriggerRef.current = songCreationTrigger;
      const entryId = editingEntryId || selectedEntryId || contextEntryId;
      if (entryId) {
        const entry = entries.find(e => e.id === entryId);
        const bookTitle = books.find(b => b.id === currentBookId)?.title || '';
        router.push({
          pathname: '/(user)/create' as const,
          params: {
            sourceEntryId: entryId,
            sourceText: entry?.content || '',
            sourceReference: '',
            sourceBookTitle: bookTitle,
          },
        });
      }
    }
  }, [songCreationTrigger, editingEntryId, selectedEntryId, contextEntryId, entries, books, currentBookId]);

  const [navigateToEntryId, setNavigateToEntryId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (selectedSearchResultId && entries.length > 0) {
      const entryExists = entries.some(t => t.id === selectedSearchResultId);
      if (entryExists) {
        handleViewModeChange('entries');
        setNavigateToEntryId(selectedSearchResultId);
        setSelectedEntryId(selectedSearchResultId);
      }
    }
  }, [selectedSearchResultId, entries, handleViewModeChange]);

  const handleNavigatedToEntry = React.useCallback(() => {
    setNavigateToEntryId(null);
    setSelectedEntryId(null);
    if (onClearSelectedSearchResult) onClearSelectedSearchResult();
  }, [onClearSelectedSearchResult]);

  const groupedEntries = React.useMemo(() => {
    const grouped: { [key: string]: Entry[] } = { noChapter: [] };
    const hasBookFilter = !!currentBookId;
    if (!chaptersMatchCurrentBook) return grouped;
    chapters.forEach(chapter => {
      grouped[chapter.id] = [];
    });
    entries.forEach(entry => {
      if (entry.chapterId && grouped[entry.chapterId]) {
        grouped[entry.chapterId].push(entry);
      } else if (!entry.chapterId && !hasBookFilter) {
        grouped.noChapter.push(entry);
      }
    });
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => {
        if (reverseChronology) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    });
    return grouped;
  }, [entries, chapters, reverseChronology, currentBookId, chaptersMatchCurrentBook]);

  const sortedChapters = React.useMemo(() => {
    if (!chaptersMatchCurrentBook) return [];
    const uniqueChaptersMap = new Map();
    chapters.forEach(chapter => {
      uniqueChaptersMap.set(chapter.id, chapter);
    });
    return Array.from(uniqueChaptersMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [chapters, chaptersMatchCurrentBook]);

  const firstExpandedChapterId = React.useMemo(() => {
    for (const chapter of sortedChapters) {
      if (!collapsedChapters.has(chapter.id)) return chapter.id;
    }
    return null;
  }, [sortedChapters, collapsedChapters]);

  React.useEffect(() => {
    if (booksLoading) return;
    if (books.length === 0) {
      setSelectionContext('no-books');
      setContextSelectedEntryId(null);
      return;
    }
    if (editingEntryId || selectedEntryId) {
      setSelectionContext('entry');
      setContextSelectedEntryId(editingEntryId || selectedEntryId);
      return;
    }
    if (firstExpandedChapterId) {
      setSelectionContext('chapter');
      setContextSelectedEntryId(null);
      return;
    }
    setSelectionContext('book');
    setContextSelectedEntryId(null);
  }, [
    booksLoading,
    books.length,
    editingEntryId,
    selectedEntryId,
    firstExpandedChapterId,
    setSelectionContext,
    setContextSelectedEntryId,
  ]);

  React.useEffect(() => {
    return () => {
      setSelectionContext('book');
      setContextSelectedEntryId(null);
    };
  }, [setSelectionContext, setContextSelectedEntryId]);

  const sortedChaptersRef = React.useRef(sortedChapters);
  const groupedEntriesRef = React.useRef(groupedEntries);
  sortedChaptersRef.current = sortedChapters;
  groupedEntriesRef.current = groupedEntries;

  const expandAll = React.useCallback(() => setCollapsedChapters(new Set()), []);

  const initialExpandAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (initialExpandChapters && !initialExpandAppliedRef.current) {
      initialExpandAppliedRef.current = true;
      handleViewModeChange('chapters');
      setCollapsedChapters(new Set());
    }
  }, [initialExpandChapters, handleViewModeChange]);

  const collapseAll = React.useCallback(() => {
    const allChapterIds = new Set<string>();
    sortedChaptersRef.current.forEach(ch => allChapterIds.add(ch.id));
    if (groupedEntriesRef.current.noChapter?.length > 0) allChapterIds.add('noChapter');
    setCollapsedChapters(allChapterIds);
  }, []);
  const toggleSortOrder = React.useCallback(() => setReverseChronology(prev => !prev), []);

  const isChapterView = viewMode === 'chapters';

  React.useEffect(() => {
    if (onChapterControlsReady) {
      onChapterControlsReady({ expandAll, collapseAll, toggleSortOrder, isChapterView, isReversed: reverseChronology });
    }
  }, [onChapterControlsReady, expandAll, collapseAll, toggleSortOrder, isChapterView, reverseChronology]);

  const sortedEntries = React.useMemo(() => {
    if (!chaptersMatchCurrentBook) return [];
    const chapterOrderMap = new Map<string, number>();
    const accessibleChapterIds = new Set<string>();
    chapters.forEach(c => {
      chapterOrderMap.set(c.id, c.sortOrder);
      if (!isGuest || !c.isLocked) accessibleChapterIds.add(c.id);
    });
    const hasBookFilter = !!currentBookId;
    const filteredEntries = entries.filter(entry => {
      if (!entry.chapterId) return !hasBookFilter;
      return accessibleChapterIds.has(entry.chapterId);
    });
    return filteredEntries.sort((a, b) => {
      const aChapterOrder = a.chapterId ? (chapterOrderMap.get(a.chapterId) ?? 999) : 999;
      const bChapterOrder = b.chapterId ? (chapterOrderMap.get(b.chapterId) ?? 999) : 999;
      if (aChapterOrder !== bChapterOrder) return aChapterOrder - bChapterOrder;
      if (reverseChronology) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [entries, chapters, reverseChronology, currentBookId, chaptersMatchCurrentBook, isGuest]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onEntriesUpdate();
    await loadChapters(true, currentBookId || undefined);
    setRefreshing(false);
  };

  const handleCreateChapter = async () => {
    const trimmedTitle = newChapterTitle.trim();
    if (!trimmedTitle) {
      Alert.alert(t('bookContent.error'), t('bookContent.enterChapterTitle'));
      return;
    }
    const chapter = await createChapter(trimmedTitle, chapters.length, currentBookId || undefined);
    if (chapter) {
      setNewChapterTitle('');
      setCreatingChapter(false);
    } else {
      Alert.alert(t('common.error'), chapterError || t('profile.chapterCreateError'));
    }
  };

  const handleUpdateChapter = async (id: string) => {
    const trimmedTitle = editChapterTitle.trim();
    if (!trimmedTitle) {
      Alert.alert(t('common.error'), t('profile.chapterTitleEmpty'));
      return;
    }
    const originalChapter = chapters.find(ch => ch.id === id);
    if (originalChapter && originalChapter.title === trimmedTitle) {
      setEditingChapterId(null);
      setEditChapterTitle('');
      return;
    }
    const success = await updateChapter(id, { title: trimmedTitle });
    if (success) {
      setEditingChapterId(null);
      setEditChapterTitle('');
    } else {
      Alert.alert(t('common.error'), chapterError || t('profile.chapterUpdateError'));
    }
  };

  const handleDeleteChapter = async (id: string, title: string) => {
    Alert.alert(t('profile.deleteChapter'), t('profile.deleteChapterConfirmation', { title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const success = await deleteChapter(id);
          if (success) await handleRefresh();
          else Alert.alert(t('common.error'), t('profile.chapterDeleteError'));
        },
      },
    ]);
  };

  const toggleChapterCollapse = (chapterId: string) => {
    setCollapsedChapters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chapterId)) newSet.delete(chapterId);
      else newSet.add(chapterId);
      return newSet;
    });
  };

  const handleAssignToChapter = async (chapterId: string | null) => {
    if (!entryToAssign) return;
    setAssigning(true);
    const success = await assignEntries([entryToAssign.id], chapterId);
    if (success) {
      setAssignmentModalVisible(false);
      setEntryToAssign(null);
      await handleRefresh();
    } else {
      Alert.alert(t('bookContent.error'), t('bookContent.entryAssignFailed'));
    }
    setAssigning(false);
  };

  const handleMoveChapterToBook = async (targetBookId: string) => {
    if (!chapterToMove) return;
    setMovingChapter(true);
    const success = await updateChapter(chapterToMove.id, { bookId: targetBookId });
    if (success) {
      setMoveChapterModalVisible(false);
      setChapterToMove(null);
      if (onChapterMoved) await onChapterMoved();
      await handleRefresh();
    } else {
      Alert.alert(t('common.error'), chapterError || t('bookContent.chapterMoveFailed'));
    }
    setMovingChapter(false);
  };

  const handleDeleteEntry = async (entry: Entry) => {
    Alert.alert(t('bookContent.deleteEntry'), t('bookContent.deleteEntryConfirmation'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setDeletingEntryId(entry.id);
          try {
            const result = await apiClient.delete<ServiceResponse<{ success: boolean }>>(
              `/api/v1/app/entries/${entry.id}`
            );
            if (result.success) await onEntriesUpdate();
            else Alert.alert(t('bookContent.error'), t('bookContent.deleteEntryFailed'));
          } catch (error) {
            logger.error('Delete entry error', error);
            Alert.alert(t('bookContent.error'), t('bookContent.deleteEntryFailed'));
          } finally {
            setDeletingEntryId(null);
          }
        },
      },
    ]);
  };

  const startEditingEntry = async (entry: Entry) => {
    if (editingEntryId && editingEntryId !== entry.id) await saveEntryEdit();
    setEditingEntryId(entry.id);
    setEditedEntryContent(entry.content);
    setSelectedEntryId(entry.id);
  };

  const saveEntryEdit = async (options?: { allowRetry?: boolean }): Promise<boolean> => {
    if (!editingEntryId || savingEntry || saveInProgressRef.current || viewModeTransitionRef.current) return false;
    if (saveFailedForEntry === editingEntryId && !options?.allowRetry) return false;
    const trimmedContent = editedEntryContent.trim();
    const originalEntry = entries.find(t => t.id === editingEntryId);
    const entryIdToSave = editingEntryId;
    if (!trimmedContent) {
      setEditingEntryId(null);
      setEditedEntryContent('');
      setSaveFailedForEntry(null);
      return true;
    }
    if (originalEntry && trimmedContent === originalEntry.content) {
      setEditingEntryId(null);
      setEditedEntryContent('');
      setSaveFailedForEntry(null);
      return true;
    }
    saveInProgressRef.current = true;
    setSavingEntry(true);
    try {
      const result = await apiClient.patch<ServiceResponse<Entry>>(`/api/v1/app/entries/${entryIdToSave}`, {
        content: trimmedContent,
      });
      if (result.success) {
        await onEntriesUpdate();
        setEditingEntryId(null);
        setEditedEntryContent('');
        setSaveFailedForEntry(null);
        return true;
      } else {
        throw new Error(extractErrorMessage(result));
      }
    } catch (error) {
      setSaveFailedForEntry(entryIdToSave);
      Alert.alert(t('bookContent.saveFailed'), t('bookContent.saveFailedMessage'), [{ text: t('common.ok') }]);
      logger.error('Save entry error', error);
      return false;
    } finally {
      saveInProgressRef.current = false;
      setSavingEntry(false);
    }
  };

  const cancelEntryEdit = () => {
    setEditingEntryId(null);
    setEditedEntryContent('');
    setSaveFailedForEntry(null);
  };

  const handleEntryTap = async (entry: Entry) => {
    if (savingEntry) return;
    if (editingEntryId && editingEntryId !== entry.id) {
      if (saveFailedForEntry === editingEntryId) {
        cancelEntryEdit();
        setSelectedEntryId(entry.id);
        return;
      }
      const saveSucceeded = await saveEntryEdit();
      if (saveSucceeded) setSelectedEntryId(entry.id);
      return;
    }
    if (editingEntryId === entry.id) return;
    if (selectedEntryId === entry.id) await startEditingEntry(entry);
    else setSelectedEntryId(entry.id);
  };

  const handleCreateSongFromEntry = React.useCallback(
    (entry: Entry) => {
      const bookTitle = books.find(b => b.id === currentBookId)?.title || '';
      router.push({
        pathname: '/(user)/create' as const,
        params: {
          sourceEntryId: entry.id,
          sourceText: entry.content || '',
          sourceReference: '',
          sourceBookTitle: bookTitle,
        },
      });
    },
    [books, currentBookId]
  );

  const handleSaveNewEntry = async () => {
    if (!newEntryContent.trim() || !creatingEntryInChapterId || savingNewEntry) return;
    setSavingNewEntry(true);
    try {
      const result = await apiClient.post<ServiceResponse<{ id: string }>>('/api/v1/app/entries', {
        content: newEntryContent.trim(),
        type: 'general',
        userDate: new Date().toISOString(),
        chapterId: creatingEntryInChapterId,
      });
      if (result.success) {
        setCreatingEntryInChapterId(null);
        setNewEntryContent('');
        await onEntriesUpdate();
      } else {
        Alert.alert(t('common.error'), t('create.failedToCreateEntry'));
      }
    } catch (error) {
      logger.error('[BookContentTab] Failed to create entry in chapter', error);
      Alert.alert(t('common.error'), t('create.failedToCreateEntry'));
    } finally {
      setSavingNewEntry(false);
    }
  };

  const showSkeleton = (entriesLoading && entries.length === 0) || (chaptersLoading && chapters.length === 0);
  const showEmptyState =
    entriesLoaded && !entriesLoading && !chaptersLoading && entries.length === 0 && chapters.length === 0;

  return (
    <View style={styles.tabContent}>
      {showSkeleton ? (
        <EntriesListSkeleton count={3} />
      ) : showEmptyState ? (
        <>
          {headerControls && <View style={{ marginBottom: 16 }}>{headerControls}</View>}
          {creatingChapter && (
            <LiquidGlassView intensity="medium" style={{ marginBottom: 16, padding: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={t('profile.chapterPlaceholder')}
                  placeholderTextColor={colors.text.tertiary}
                  value={newChapterTitle}
                  onChangeText={setNewChapterTitle}
                  autoFocus
                  testID="input-chapter-title-empty"
                />
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary]}
                  onPress={() => {
                    setCreatingChapter(false);
                    setNewChapterTitle('');
                  }}
                  testID="button-cancel-chapter-empty"
                >
                  <Ionicons name="close" size={16} color={colors.text.secondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.buttonPrimary]}
                  onPress={handleCreateChapter}
                  testID="button-save-chapter-empty"
                >
                  <Ionicons name="checkmark" size={16} color={colors.text.primary} />
                </TouchableOpacity>
              </View>
            </LiquidGlassView>
          )}
          <LiquidGlassView intensity="medium" style={{ marginBottom: 16, padding: 16 }}>
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="book-outline" size={80} color={colors.brand.primary} testID="icon-empty-book" />
              <Text style={[styles.cardTitle, { marginTop: 12, textAlign: 'center' }]}>
                {t('bookContent.emptyTitle')}
              </Text>
              <Text style={[styles.settingDescription, { marginTop: 8, textAlign: 'center' }]}>
                {t('bookContent.emptySubtitle')}
              </Text>
            </View>
          </LiquidGlassView>
        </>
      ) : (
        <>
          <LiquidGlassView intensity="medium" style={{ marginBottom: 16, padding: 12 }}>
            {headerControls && <View style={{ marginBottom: 12 }}>{headerControls}</View>}
            <View style={{ flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 4 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  backgroundColor: viewMode === 'chapters' ? colors.brand.primary : 'transparent',
                  alignItems: 'center',
                }}
                onPress={() => handleViewModeChange('chapters')}
                testID="button-view-chapters"
              >
                <Text
                  style={{
                    color: viewMode === 'chapters' ? colors.text.primary : colors.text.secondary,
                    fontWeight: viewMode === 'chapters' ? '600' : '400',
                    fontSize: 14,
                  }}
                >
                  {t('bookContent.chapterView')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  backgroundColor: viewMode === 'entries' ? colors.brand.primary : 'transparent',
                  alignItems: 'center',
                }}
                onPress={() => handleViewModeChange('entries')}
                testID="button-view-entries"
              >
                <Text
                  style={{
                    color: viewMode === 'entries' ? colors.text.primary : colors.text.secondary,
                    fontWeight: viewMode === 'entries' ? '600' : '400',
                    fontSize: 14,
                  }}
                >
                  {t('bookContent.entriesView')}
                </Text>
              </TouchableOpacity>
            </View>
          </LiquidGlassView>

          {viewMode === 'entries' && (
            <>
              <LiquidGlassView intensity="medium" style={{ marginBottom: 16, padding: 16 }}>
                <EntryNavigator
                  entries={sortedEntries}
                  onEntriesUpdate={onEntriesUpdate}
                  isLoading={entriesLoading}
                  totalEntriesCount={sortedEntries.length}
                  onCurrentEntryChange={handleCurrentEntryChange}
                  onContentChange={handleContentChange}
                  newEntryTrigger={entryCreationTrigger}
                  replaceContentTrigger={replaceContentTrigger}
                  onLoadMore={onLoadMore}
                  hasMore={hasMore}
                  isLoadingMore={isLoadingMore}
                  navigateToEntryId={navigateToEntryId}
                  onNavigatedToEntry={handleNavigatedToEntry}
                  currentBookId={currentBookId}
                  disableNewEntryCreation={viewMode !== 'entries'}
                  onImageLongPress={onImageLongPress}
                  canDelete={canDelete}
                />
              </LiquidGlassView>

              {hasContent && generateInsightFromEntry && (
                <LiquidGlassView intensity="medium" style={{ marginBottom: 16, padding: 16 }}>
                  <LiquidGlassButton
                    intensity="strong"
                    style={{ width: '100%', opacity: generatingInsight ? 0.7 : 1 }}
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
                  </LiquidGlassButton>
                </LiquidGlassView>
              )}

              {generatedInsight && (
                <LiquidGlassView intensity="strong" style={{ marginTop: 12, marginBottom: 16, padding: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Ionicons name="sparkles" size={18} color={colors.brand.primary} />
                    <Text style={[styles.cardTitle, { marginLeft: 8 }]}>{t('reflect.generatedInsight')}</Text>
                  </View>
                  <View style={{ marginBottom: 16 }}>
                    <RichText content={generatedInsight} fontSize={14} lineHeight={20} />
                  </View>
                  <LiquidGlassButton
                    intensity="medium"
                    style={{ width: '100%' }}
                    onPress={handleReplaceWithInsight}
                    testID="button-replace-with-insight"
                  >
                    <Ionicons name="swap-horizontal" size={16} color={colors.brand.primary} />
                    <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
                      {t('reflect.replaceWithInsight')}
                    </Text>
                  </LiquidGlassButton>
                </LiquidGlassView>
              )}
            </>
          )}

          {viewMode === 'chapters' && (
            <ChapterViewContent
              sortedChapters={sortedChapters}
              groupedEntries={groupedEntries}
              collapsedChapters={collapsedChapters}
              editingChapterId={editingChapterId}
              editChapterTitle={editChapterTitle}
              creatingChapter={creatingChapter}
              newChapterTitle={newChapterTitle}
              creatingEntryInChapterId={creatingEntryInChapterId}
              newEntryContent={newEntryContent}
              savingNewEntry={savingNewEntry}
              selectedEntryId={selectedEntryId}
              editingEntryId={editingEntryId}
              editedEntryContent={editedEntryContent}
              savingEntry={savingEntry}
              saveFailedForEntry={saveFailedForEntry}
              deletingEntryId={deletingEntryId}
              entryIdsWithSongs={entryIdsWithSongs}
              books={books}
              canDelete={canDelete}
              onToggleCollapse={toggleChapterCollapse}
              onEditChapterStart={(id, title) => {
                setEditingChapterId(id);
                setEditChapterTitle(title);
              }}
              onEditChapterTitleChange={setEditChapterTitle}
              onEditChapterSave={handleUpdateChapter}
              onDeleteChapter={handleDeleteChapter}
              onMoveChapter={chapter => {
                setChapterToMove(chapter);
                setMoveChapterModalVisible(true);
              }}
              onCreateChapter={handleCreateChapter}
              onCancelCreateChapter={() => {
                setCreatingChapter(false);
                setNewChapterTitle('');
              }}
              onNewChapterTitleChange={setNewChapterTitle}
              onStartNewEntry={chapterId => {
                setCreatingEntryInChapterId(chapterId);
                setNewEntryContent('');
              }}
              onCancelNewEntry={() => {
                setCreatingEntryInChapterId(null);
                setNewEntryContent('');
              }}
              onNewEntryContentChange={setNewEntryContent}
              onSaveNewEntry={handleSaveNewEntry}
              onEntryTap={handleEntryTap}
              onEntryLongPress={entry => {
                setEntryToAssign(entry);
                setAssignmentModalVisible(true);
              }}
              onEntryContentChange={setEditedEntryContent}
              onEntryBlurSave={() => void saveEntryEdit()}
              onEntryDelete={handleDeleteEntry}
              onCreateSong={handleCreateSongFromEntry}
              onClearSaveError={() => setSaveFailedForEntry(null)}
            />
          )}

          <ChapterAssignmentModal
            visible={assignmentModalVisible}
            entryToAssign={entryToAssign}
            sortedChapters={sortedChapters}
            assigning={assigning}
            onAssign={handleAssignToChapter}
            onClose={() => {
              setAssignmentModalVisible(false);
              setEntryToAssign(null);
            }}
          />

          <MoveChapterModal
            visible={moveChapterModalVisible}
            chapterToMove={chapterToMove}
            books={books}
            currentBookId={currentBookId}
            moving={movingChapter}
            onMove={handleMoveChapterToBook}
            onClose={() => {
              setMoveChapterModalVisible(false);
              setChapterToMove(null);
            }}
          />
        </>
      )}
    </View>
  );
};
