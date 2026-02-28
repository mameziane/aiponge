import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';
import { Keyboard, TextInput } from 'react-native';
import { logger } from '@/lib/logger';
import type { Entry } from '@/types/profile.types';
import type { EntryNavigatorProps } from '../types';

export interface UseEntryCursorParams {
  entries: Entry[];
  totalEntriesCount?: number;
  selectionMode?: boolean;
  selectedEntryId?: string;
  onEntrySelect?: (entry: Entry) => void;
  onCurrentEntryChange?: (entry: Entry | null) => void;
  navigateToEntryId?: string | null;
  onNavigatedToEntry?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => Promise<void>;
  onBeforeNavigate?: () => Promise<void>;
  onLoadMoreError?: (error: unknown) => void;
  currentBookId?: string | null;
}

export interface UseEntryCursorReturn {
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  isNewEntryMode: boolean;
  setIsNewEntryMode: (mode: boolean) => void;
  currentEntry: Entry | null;
  totalEntries: number;
  isCurrentEntrySelected: boolean;
  isKeyboardVisible: boolean;
  keyboardHeight: number;
  textInputRef: RefObject<TextInput | null>;
  navigateToFirst: () => Promise<void>;
  navigateToPrev: () => Promise<void>;
  navigateToNext: () => Promise<void>;
  navigateToLast: () => Promise<void>;
  handleNewEntryMode: () => void;
  dismissKeyboard: () => Promise<void>;
}

export function useEntryCursor({
  entries,
  totalEntriesCount,
  selectionMode = false,
  selectedEntryId,
  onEntrySelect,
  onCurrentEntryChange,
  navigateToEntryId,
  onNavigatedToEntry,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onBeforeNavigate,
  onLoadMoreError,
  currentBookId,
}: UseEntryCursorParams): UseEntryCursorReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isNewEntryMode, setIsNewEntryMode] = useState(entries.length === 0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const textInputRef = useRef<TextInput | null>(null);
  const prevEntriesLengthRef = useRef(entries.length);
  const currentEntryIdRef = useRef<string | null>(null);
  const prevBookIdRef = useRef<string | null | undefined>(currentBookId);

  const currentEntry = entries && currentIndex < entries.length ? entries[currentIndex] : null;
  const totalEntries = totalEntriesCount !== undefined ? totalEntriesCount : entries?.length || 0;
  const isCurrentEntrySelected = selectionMode && currentEntry && currentEntry.id === selectedEntryId;

  useEffect(() => {
    onCurrentEntryChange?.(currentEntry);
  }, [currentEntry, onCurrentEntryChange]);

  useEffect(() => {
    if (navigateToEntryId && entries.length > 0) {
      const targetIndex = entries.findIndex(t => t.id === navigateToEntryId);
      if (targetIndex !== -1) {
        setCurrentIndex(targetIndex);
        setIsNewEntryMode(false);
        onNavigatedToEntry?.();
      }
    }
  }, [navigateToEntryId, entries, onNavigatedToEntry]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', e => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (prevBookIdRef.current !== currentBookId) {
      logger.debug('Book changed, resetting cursor state', {
        previousBookId: prevBookIdRef.current?.substring(0, 8),
        newBookId: currentBookId?.substring(0, 8),
      });
      setCurrentIndex(0);
      currentEntryIdRef.current = null;
      prevEntriesLengthRef.current = entries.length;
      prevBookIdRef.current = currentBookId;
      if (entries.length === 0) {
        setIsNewEntryMode(true);
      } else {
        setIsNewEntryMode(false);
      }
    }
  }, [currentBookId, entries.length]);

  useEffect(() => {
    if (selectionMode && currentEntry && onEntrySelect) {
      onEntrySelect(currentEntry);
    }
  }, [currentEntry, selectionMode, onEntrySelect]);

  useEffect(() => {
    const prevLength = prevEntriesLengthRef.current;
    const currentLength = entries.length;
    prevEntriesLengthRef.current = currentLength;

    if (prevLength === 0 && currentLength > 0 && isNewEntryMode) {
      setIsNewEntryMode(false);
    } else if (prevLength > 0 && currentLength === 0) {
      setIsNewEntryMode(true);
    }
  }, [entries.length, isNewEntryMode]);

  useEffect(() => {
    if (entries.length > 0 && currentIndex >= entries.length) {
      setCurrentIndex(entries.length - 1);
    } else if (entries.length === 0 && currentIndex !== 0) {
      setCurrentIndex(0);
    }
  }, [entries.length, currentIndex]);

  useEffect(() => {
    if (currentEntry && !isNewEntryMode) {
      currentEntryIdRef.current = currentEntry.id;
    }
  }, [currentEntry, isNewEntryMode]);

  useEffect(() => {
    if (!currentEntryIdRef.current || entries.length === 0 || isNewEntryMode) {
      return;
    }
    const storedId = currentEntryIdRef.current;
    const newIndex = entries.findIndex(t => t.id === storedId);
    if (newIndex !== -1) {
      // Always restore to the correct index when entry is found
      // This ensures position is maintained after image deletion or any refetch
      setCurrentIndex(prevIndex => {
        if (prevIndex !== newIndex) {
          logger.debug('Restoring entry position after refetch', {
            entryId: storedId.substring(0, 8),
            oldIndex: prevIndex,
            newIndex,
          });
          return newIndex;
        }
        return prevIndex;
      });
    }
  }, [entries, isNewEntryMode]);

  const dismissKeyboard = useCallback(async () => {
    Keyboard.dismiss();
    textInputRef.current?.blur();
    await onBeforeNavigate?.();
  }, [onBeforeNavigate]);

  // Reset TextInput scroll/cursor position to the beginning when navigating
  const resetTextInputPosition = useCallback(() => {
    // Use a small delay to ensure content is updated first
    setTimeout(() => {
      textInputRef.current?.setSelection?.(0, 0);
    }, 50);
  }, []);

  const navigateToFirst = useCallback(async () => {
    await onBeforeNavigate?.();
    if (isKeyboardVisible) {
      Keyboard.dismiss();
      textInputRef.current?.blur();
    }
    setCurrentIndex(0);
    setIsNewEntryMode(false);
    resetTextInputPosition();
  }, [isKeyboardVisible, onBeforeNavigate, resetTextInputPosition]);

  const navigateToLast = useCallback(async () => {
    if (entries.length > 0) {
      await onBeforeNavigate?.();
      if (isKeyboardVisible) {
        Keyboard.dismiss();
        textInputRef.current?.blur();
      }
      setCurrentIndex(entries.length - 1);
      setIsNewEntryMode(false);
      resetTextInputPosition();
    }
  }, [entries.length, isKeyboardVisible, onBeforeNavigate, resetTextInputPosition]);

  const navigateToPrev = useCallback(async () => {
    if (currentIndex > 0) {
      await onBeforeNavigate?.();
      if (isKeyboardVisible) {
        Keyboard.dismiss();
        textInputRef.current?.blur();
      }
      setCurrentIndex(currentIndex - 1);
      setIsNewEntryMode(false);
      resetTextInputPosition();
    }
  }, [currentIndex, isKeyboardVisible, onBeforeNavigate, resetTextInputPosition]);

  const navigateToNext = useCallback(async () => {
    if (currentIndex < entries.length - 1) {
      await onBeforeNavigate?.();
      if (isKeyboardVisible) {
        Keyboard.dismiss();
        textInputRef.current?.blur();
      }
      setCurrentIndex(currentIndex + 1);
      setIsNewEntryMode(false);
      resetTextInputPosition();
    } else if (currentIndex === entries.length - 1 && hasMore && !isLoadingMore) {
      await onBeforeNavigate?.();
      if (isKeyboardVisible) {
        Keyboard.dismiss();
        textInputRef.current?.blur();
      }
      try {
        await onLoadMore?.();
        setCurrentIndex(currentIndex + 1);
        resetTextInputPosition();
      } catch (error) {
        logger.error('Failed to load more entries during navigation', error);
        onLoadMoreError?.(error);
      }
    }
  }, [
    currentIndex,
    entries.length,
    hasMore,
    isLoadingMore,
    onLoadMore,
    isKeyboardVisible,
    onBeforeNavigate,
    onLoadMoreError,
    resetTextInputPosition,
  ]);

  const handleNewEntryMode = useCallback(() => {
    setIsNewEntryMode(true);
  }, []);

  return {
    currentIndex,
    setCurrentIndex,
    isNewEntryMode,
    setIsNewEntryMode,
    currentEntry,
    totalEntries,
    isCurrentEntrySelected: !!isCurrentEntrySelected,
    isKeyboardVisible,
    keyboardHeight,
    textInputRef,
    navigateToFirst,
    navigateToPrev,
    navigateToNext,
    navigateToLast,
    handleNewEntryMode,
    dismissKeyboard,
  };
}
