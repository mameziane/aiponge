import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import { apiClient, extractErrorMessage } from '@/lib/axiosApiClient';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { logger } from '@/lib/logger';
import { useTranslation } from '@/i18n';
import { type EmotionalState, EMOTION_LABELS, logEmotionSelection } from '../../book/EmotionSlider';
import type { Entry, EntryChapter } from '@/types/profile.types';
import type { Chapter } from '../types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined | null): boolean => !!id && UUID_REGEX.test(id);

export interface UseEntryMetadataParams {
  currentEntry: Entry | null;
  isNewEntryMode: boolean;
  currentBookId?: string | null;
  onEntriesUpdate?: () => Promise<void>;
}

export interface UseEntryMetadataReturn {
  emotionalState: EmotionalState;
  selectedDate: Date;
  showDatePicker: boolean;
  chapters: Chapter[];
  selectedChapterId: string | null;
  showChapterPicker: boolean;
  isCreatingChapter: boolean;
  newChapterTitle: string;
  setShowDatePicker: (show: boolean) => void;
  setShowChapterPicker: (show: boolean) => void;
  setNewChapterTitle: (title: string) => void;
  handleDateChange: (event: unknown, date?: Date) => void;
  handleChapterSelect: (chapterId: string | null) => Promise<void>;
  handleCreateNewChapter: () => Promise<void>;
  handleEmotionalStateChange: (value: EmotionalState) => void;
  formatDisplayDate: (date: Date) => string;
  getChapterDisplayName: (chapterId: string | null) => string;
  resetMetadataForNewEntry: () => void;
}

export function useEntryMetadata({
  currentEntry,
  isNewEntryMode,
  currentBookId,
  onEntriesUpdate,
}: UseEntryMetadataParams): UseEntryMetadataReturn {
  const { t, i18n } = useTranslation();
  const [emotionalState, setEmotionalState] = useState<EmotionalState>(1);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveIdRef = useRef<number>(0);

  useEffect(() => {
    if (currentEntry?.emotionalState !== undefined) {
      setEmotionalState(currentEntry.emotionalState);
    } else {
      setEmotionalState(1);
    }
  }, [currentEntry]);

  useEffect(() => {
    if (isNewEntryMode) {
      setSelectedDate(new Date());
    } else if (currentEntry?.userDate) {
      setSelectedDate(new Date(currentEntry.userDate));
    } else if (currentEntry?.createdAt) {
      setSelectedDate(new Date(currentEntry.createdAt));
    } else {
      setSelectedDate(new Date());
    }
  }, [currentEntry, isNewEntryMode]);

  useEffect(() => {
    const fetchChapters = async () => {
      try {
        // Only use book-specific endpoint if we have a valid UUID
        const endpoint = isValidUUID(currentBookId)
          ? `/api/v1/app/library/books/${currentBookId}/chapters`
          : '/api/v1/app/library/chapters';
        const result = await apiClient.get<ServiceResponse<{ chapters?: Chapter[] } | Chapter[]>>(endpoint);
        if (result.success && result.data) {
          const chapterData = Array.isArray(result.data)
            ? result.data
            : (result.data && 'chapters' in result.data ? result.data.chapters : []) || [];
          setChapters(chapterData);
        }
      } catch (error) {
        logger.error('Failed to fetch chapters', error);
      }
    };
    fetchChapters();
  }, [currentBookId]);

  useEffect(() => {
    if (isNewEntryMode) {
      setSelectedChapterId(null);
    } else if (currentEntry) {
      setSelectedChapterId(currentEntry.chapterId || null);
    } else {
      setSelectedChapterId(null);
    }
  }, [currentEntry, isNewEntryMode]);

  const formatDisplayDate = useCallback(
    (date: Date): string => {
      return date.toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    },
    [i18n.language]
  );

  const getChapterDisplayName = useCallback(
    (chapterId: string | null): string => {
      if (!chapterId) return t('components.entryNavigator.noChapter');
      const chapter = chapters.find(c => c.id === chapterId);
      return chapter?.title || t('components.entryNavigator.noChapter');
    },
    [chapters, t]
  );

  const handleDateChange = useCallback(
    (_event: unknown, date?: Date) => {
      setShowDatePicker(Platform.OS === 'ios');
      if (date) {
        setSelectedDate(date);
        if (currentEntry && !isNewEntryMode) {
          saveIdRef.current += 1;
          const thisSaveId = saveIdRef.current;
          if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
          }
          autoSaveTimerRef.current = setTimeout(async () => {
            if (thisSaveId === saveIdRef.current) {
              try {
                setIsSaving(true);
                await apiClient.patch<ServiceResponse<{ success: boolean }>>(`/api/v1/app/entries/${currentEntry.id}`, {
                  userDate: date.toISOString(),
                });
                logger.debug('Date updated successfully', { entryId: currentEntry.id, date: date.toISOString() });
              } catch (error) {
                logger.error('Failed to update entry date', error);
              } finally {
                setIsSaving(false);
              }
            }
          }, 500);
        }
      }
    },
    [currentEntry, isNewEntryMode]
  );

  const handleChapterSelect = useCallback(
    async (chapterId: string | null) => {
      setSelectedChapterId(chapterId);
      setShowChapterPicker(false);
      if (currentEntry && !isNewEntryMode) {
        try {
          setIsSaving(true);
          await apiClient.patch<ServiceResponse<{ success: boolean }>>(`/api/v1/app/entries/${currentEntry.id}`, {
            chapterId,
          });
          logger.debug('Chapter updated successfully', { entryId: currentEntry.id, chapterId });
          await onEntriesUpdate?.();
        } catch (error) {
          logger.error('Failed to update entry chapter', error);
          Alert.alert(t('common.error'), t('components.entryNavigator.chapterUpdateFailed'));
        } finally {
          setIsSaving(false);
        }
      }
    },
    [currentEntry, isNewEntryMode, onEntriesUpdate, t]
  );

  const handleCreateNewChapter = useCallback(async () => {
    const trimmedTitle = newChapterTitle.trim();
    if (!trimmedTitle) {
      Alert.alert(t('common.error'), t('components.entryNavigator.enterChapterTitle'));
      return;
    }
    try {
      setIsCreatingChapter(true);
      const result = await apiClient.post<ServiceResponse<Chapter>>('/api/v1/app/library/chapters', {
        title: trimmedTitle,
        sortOrder: chapters.length,
        bookId: currentBookId || undefined,
      });
      if (result.success && result.data) {
        const newChapter = result.data;
        setChapters(prev => [...prev, newChapter]);
        setSelectedChapterId(newChapter.id);
        setNewChapterTitle('');
        setShowChapterPicker(false);
        if (currentEntry && !isNewEntryMode) {
          await apiClient.patch<ServiceResponse<{ success: boolean }>>(
            `/api/v1/app/library/entries/${currentEntry.id}`,
            {
              chapterId: newChapter.id,
            }
          );
          await onEntriesUpdate?.();
        }
        logger.debug('New chapter created', { chapterId: newChapter.id, title: trimmedTitle });
      } else {
        throw new Error(extractErrorMessage(result));
      }
    } catch (error) {
      logger.error('Failed to create chapter', error);
      Alert.alert(t('common.error'), t('components.entryNavigator.chapterCreateFailed'));
    } finally {
      setIsCreatingChapter(false);
    }
  }, [newChapterTitle, chapters.length, currentEntry, isNewEntryMode, onEntriesUpdate, currentBookId, t]);

  const handleEmotionalStateChange = useCallback(
    (value: EmotionalState) => {
      setEmotionalState(value);
      if (currentEntry) {
        logEmotionSelection(currentEntry.id, value);
        logger.debug('Emotional state updated', {
          entryId: currentEntry.id,
          value,
          label: EMOTION_LABELS[value],
        });
      }
    },
    [currentEntry]
  );

  const resetMetadataForNewEntry = useCallback(() => {
    setEmotionalState(1);
    setSelectedDate(new Date());
    setSelectedChapterId(null);
    setShowDatePicker(false);
    setShowChapterPicker(false);
    setNewChapterTitle('');
  }, []);

  return {
    emotionalState,
    selectedDate,
    showDatePicker,
    chapters,
    selectedChapterId,
    showChapterPicker,
    isCreatingChapter,
    newChapterTitle,
    setShowDatePicker,
    setShowChapterPicker,
    setNewChapterTitle,
    handleDateChange,
    handleChapterSelect,
    handleCreateNewChapter,
    handleEmotionalStateChange,
    formatDisplayDate,
    getChapterDisplayName,
    resetMetadataForNewEntry,
  };
}
