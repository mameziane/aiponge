import { useState, useEffect, useCallback, useRef, type MutableRefObject } from 'react';
import { Alert } from 'react-native';
import { apiClient, extractErrorMessage } from '@/lib/axiosApiClient';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { logger } from '@/lib/logger';
import { useSpeechRecognition } from '@/hooks/ui/useSpeechRecognition';
import { useTranslation } from '@/i18n';
import { stripFormattingTags } from '../../book/richTextParser';
import type { Entry } from '@/types/profile.types';

export interface UseEntryEditorParams {
  currentEntry: Entry | null;
  isNewEntryMode: boolean;
  replaceContentTrigger?: { content: string; timestamp: number } | null;
  onContentChange?: (content: string) => void;
}

export interface UseEntryEditorReturn {
  editedContent: string;
  setEditedContent: (content: string) => void;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  lastSavedContent: string;
  isListening: boolean;
  interimTranscript: string;
  speechSupported: boolean;
  isEditingRef: MutableRefObject<boolean>;
  currentContentRef: MutableRefObject<string>;
  handleContentChange: (content: string) => void;
  handleVoiceInput: () => Promise<void>;
  savePendingChanges: () => Promise<void>;
  resetEditorForEntry: (entry: Entry | null) => void;
}

export function useEntryEditor({
  currentEntry,
  isNewEntryMode,
  replaceContentTrigger,
  onContentChange,
}: UseEntryEditorParams): UseEntryEditorReturn {
  const { t, i18n } = useTranslation();
  const [editedContent, setEditedContent] = useState(stripFormattingTags(currentEntry?.content ?? ''));
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState(stripFormattingTags(currentEntry?.content ?? ''));

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const isEditingRef = useRef<boolean>(false);
  const currentContentRef = useRef<string>('');
  const saveIdRef = useRef<number>(0);
  const saveInProgressRef = useRef<boolean>(false);
  const pendingSavesRef = useRef<Map<string, string>>(new Map());

  const {
    isListening,
    transcript,
    interimTranscript,
    error: speechError,
    isSupported: speechSupported,
    startListening,
    stopListening,
    clearTranscript,
    clearError: clearSpeechError,
  } = useSpeechRecognition({
    lang: i18n.language,
    interimResults: true,
    continuous: false,
  });

  const hasUnsavedChanges =
    !isNewEntryMode &&
    currentEntry &&
    (editedContent || '').trim() !== '' &&
    (editedContent || '').trim() !== (lastSavedContent || '').trim();

  useEffect(() => {
    onContentChange?.(editedContent);
  }, [editedContent, onContentChange]);

  useEffect(() => {
    if (replaceContentTrigger && replaceContentTrigger.content) {
      setEditedContent(replaceContentTrigger.content);
      isEditingRef.current = true;
    }
  }, [replaceContentTrigger]);

  useEffect(() => {
    if (transcript && transcript.trim()) {
      setEditedContent(prev => {
        const newContent = prev.trim() ? `${prev} ${transcript}` : transcript;
        isEditingRef.current = true;
        return newContent;
      });
      clearTranscript();
    }
  }, [transcript, clearTranscript]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (currentEntry && !isNewEntryMode) {
      const content = stripFormattingTags(currentEntry.content ?? '');
      if (!isEditingRef.current) {
        setEditedContent(content);
        setLastSavedContent(content);
      }
      lastSavedContentRef.current = content;
    }
  }, [currentEntry, isNewEntryMode]);

  const executeSave = async (entryId: string, content: string) => {
    try {
      saveInProgressRef.current = true;
      setIsSaving(true);
      const result = await apiClient.patch<ServiceResponse<{ success: boolean }>>(`/api/v1/app/entries/${entryId}`, {
        content,
      });
      if (result.success) {
        lastSavedContentRef.current = content;
        setLastSavedContent(content);
      } else {
        throw new Error(extractErrorMessage(result));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('components.entryNavigator.autoSaveFailed'));
      logger.error('Auto-save entry error', error);
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
      while (pendingSavesRef.current.size > 0) {
        const [[pendingEntryId, pendingContent]] = Array.from(pendingSavesRef.current.entries());
        pendingSavesRef.current.delete(pendingEntryId);
        if (pendingEntryId === entryId && pendingContent === lastSavedContentRef.current) {
          continue;
        }
        await executeSave(pendingEntryId, pendingContent);
        break;
      }
    }
  };

  const autoSaveEntry = async (content: string, saveId: number) => {
    const trimmedContent = content.trim();
    if (saveId !== saveIdRef.current) return;
    if (!currentEntry || !trimmedContent || trimmedContent === lastSavedContentRef.current) return;
    if (saveInProgressRef.current) {
      pendingSavesRef.current.set(currentEntry.id, trimmedContent);
      return;
    }
    await executeSave(currentEntry.id, trimmedContent);
  };

  const savePendingChanges = useCallback(async () => {
    if (!currentEntry || isNewEntryMode) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const trimmedContent = currentContentRef.current.trim();
    if (trimmedContent && trimmedContent !== lastSavedContentRef.current) {
      saveIdRef.current += 1;
      if (saveInProgressRef.current) {
        pendingSavesRef.current.set(currentEntry.id, trimmedContent);
        return;
      }
      await executeSave(currentEntry.id, trimmedContent);
    }
  }, [currentEntry, isNewEntryMode]);

  const handleContentChange = useCallback(
    (content: string) => {
      setEditedContent(content);
      currentContentRef.current = content;
      isEditingRef.current = true;
      if (isNewEntryMode) return;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      saveIdRef.current += 1;
      const thisSaveId = saveIdRef.current;
      autoSaveTimerRef.current = setTimeout(async () => {
        await autoSaveEntry(content, thisSaveId);
        if (currentContentRef.current.trim() === content.trim()) {
          isEditingRef.current = false;
        }
      }, 800);
    },
    [isNewEntryMode]
  );

  const handleVoiceInput = useCallback(async () => {
    if (isListening) {
      stopListening();
    } else {
      const success = await startListening(i18n.language);
      if (!success && speechError) {
        Alert.alert(t('create.voiceInputError'), speechError, [{ text: t('common.ok'), onPress: clearSpeechError }]);
      }
    }
  }, [isListening, startListening, stopListening, i18n.language, speechError, clearSpeechError, t]);

  const resetEditorForEntry = useCallback((entry: Entry | null) => {
    isEditingRef.current = false;
    if (entry) {
      const content = stripFormattingTags(entry.content ?? '');
      setEditedContent(content);
      setLastSavedContent(content);
      lastSavedContentRef.current = content;
      currentContentRef.current = content;
    } else {
      setEditedContent('');
      setLastSavedContent('');
      lastSavedContentRef.current = '';
      currentContentRef.current = '';
    }
  }, []);

  return {
    editedContent,
    setEditedContent,
    isSaving,
    hasUnsavedChanges: !!hasUnsavedChanges,
    lastSavedContent,
    isListening,
    interimTranscript,
    speechSupported,
    isEditingRef,
    currentContentRef,
    handleContentChange,
    handleVoiceInput,
    savePendingChanges,
    resetEditorForEntry,
  };
}
