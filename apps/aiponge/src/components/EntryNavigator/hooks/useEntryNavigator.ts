import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useToast } from '@/hooks/ui/use-toast';
import * as ImagePicker from 'expo-image-picker';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient, extractErrorMessage } from '@/lib/axiosApiClient';
import { ProfileService } from '@/hooks/profile/ProfileService';
import { useAuthStore } from '@/auth/store';
import { useTranslation } from '@/i18n';
import { logger } from '@/lib/logger';
import { useEntryCursor } from './useEntryCursor';
import { useEntryEditor } from './useEntryEditor';
import { useEntryMetadata } from './useEntryMetadata';
import { RiskAssessmentService, type RiskLevel } from '@/safety/riskAssessment';
import type { Entry, EntryImage } from '@/types/profile.types';
import type { EntryNavigatorProps, UseEntryNavigatorReturn } from '../types';

const MAX_IMAGES = 4;

export function useEntryNavigator({
  entries,
  onEntriesUpdate,
  totalEntriesCount,
  selectionMode = false,
  selectedEntryId,
  onEntrySelect,
  onCurrentEntryChange,
  onContentChange,
  newEntryTrigger = 0,
  replaceContentTrigger = null,
  onEntryCreated,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  navigateToEntryId,
  onNavigatedToEntry,
  currentBookId,
  disableNewEntryCreation = false,
}: EntryNavigatorProps): UseEntryNavigatorReturn {
  const { t } = useTranslation();
  const { toast } = useToast();
  const userId = useAuthStore(state => state.user?.id);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingImageUris, setPendingImageUris] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [localImages, setLocalImages] = useState<EntryImage[]>([]);
  const currentEntryIdRef = useRef<string | null>(null);
  const [detectedRiskLevel, setDetectedRiskLevel] = useState<RiskLevel>('none');
  const [showSafetyRedirect, setShowSafetyRedirect] = useState(false);

  const cursor = useEntryCursor({
    entries,
    totalEntriesCount,
    selectionMode,
    selectedEntryId,
    onEntrySelect,
    onCurrentEntryChange,
    navigateToEntryId,
    onNavigatedToEntry,
    hasMore,
    isLoadingMore,
    onLoadMore,
    onBeforeNavigate: async () => {
      await editor.savePendingChanges();
      setPendingImageUris([]);
    },
    onLoadMoreError: () => {
      toast({
        title: t('common.error'),
        description: t('components.entryNavigator.loadMoreFailed', 'Failed to load more entries'),
        variant: 'destructive',
      });
    },
    currentBookId,
  });

  const editor = useEntryEditor({
    currentEntry: cursor.currentEntry,
    isNewEntryMode: cursor.isNewEntryMode,
    replaceContentTrigger,
    onContentChange,
  });

  const metadata = useEntryMetadata({
    currentEntry: cursor.currentEntry,
    isNewEntryMode: cursor.isNewEntryMode,
    currentBookId,
    onEntriesUpdate,
  });

  useEffect(() => {
    // Guard: don't trigger new entry mode when creation is disabled (e.g., chapter view active)
    if (newEntryTrigger > 0 && !disableNewEntryCreation) {
      cursor.setIsNewEntryMode(true);
      editor.setEditedContent('');
      editor.resetEditorForEntry(null);
      metadata.resetMetadataForNewEntry();
      cursor.setCurrentIndex(0);
      setPendingImageUris([]);
      // Reset risk state when starting a new entry
      setDetectedRiskLevel('none');
      setShowSafetyRedirect(false);
    }
  }, [newEntryTrigger, disableNewEntryCreation]);

  // Sync local images with current entry when entry changes
  useEffect(() => {
    const currentEntryId = cursor.currentEntry?.id || null;
    if (currentEntryId !== currentEntryIdRef.current) {
      currentEntryIdRef.current = currentEntryId;
      setLocalImages(cursor.currentEntry?.illustrations || []);
    }
  }, [cursor.currentEntry?.id, cursor.currentEntry?.illustrations]);

  const savedImagesCount = localImages.length;
  const totalImageCount = savedImagesCount + pendingImageUris.length;

  const handlePickImage = useCallback(async () => {
    if (totalImageCount >= MAX_IMAGES) {
      Alert.alert(t('common.error'), t('create.maxImagesReached', { max: MAX_IMAGES }), [{ text: t('common.ok') }]);
      return;
    }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.permissionRequired'), t('create.photoPermissionRequired'), [{ text: t('common.ok') }]);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const selectedUri = result.assets[0].uri;
        logger.debug('Image selected for entry', { uri: selectedUri, totalImages: totalImageCount });
        if (cursor.isNewEntryMode) {
          setPendingImageUris(prev => [...prev, selectedUri]);
          return;
        }
        if (cursor.currentEntry && userId) {
          try {
            setIsUploadingImage(true);
            setPendingImageUris(prev => [...prev, selectedUri]);
            logger.debug('Starting image upload for entry', { entryId: cursor.currentEntry.id });
            const uploadResult = await ProfileService.uploadEntryImage(selectedUri, userId);
            logger.debug('Upload result', {
              success: uploadResult.success,
              hasData: !!uploadResult.data,
              error: uploadResult.error,
            });
            if (uploadResult.success && uploadResult.data) {
              logger.debug('Adding image to entry', {
                entryId: cursor.currentEntry.id,
                imageUrl: uploadResult.data.url,
              });
              const addResult = await apiClient.post<
                ServiceResponse<{ image?: EntryImage; data?: { image?: EntryImage } }>
              >(`/api/v1/app/entries/${cursor.currentEntry.id}/illustrations`, { url: uploadResult.data.url });
              logger.debug('Add image result', {
                success: addResult?.success,
                hasImage: !!addResult?.data?.image,
                data: JSON.stringify(addResult?.data),
              });

              // Handle both response formats: direct data.image or nested data.data.image (legacy)
              const resultData = addResult?.data as { image?: EntryImage; data?: { image?: EntryImage } } | undefined;
              const newImage = resultData?.image || resultData?.data?.image;

              if (addResult?.success && newImage) {
                setLocalImages(prev => [...prev, newImage]);
                setPendingImageUris(prev => prev.filter(uri => uri !== selectedUri));
                logger.debug('Image added successfully', { imageId: newImage.id });
              } else {
                logger.error('Add image failed - unexpected response structure', {
                  addResult: JSON.stringify(addResult),
                });
                throw new Error('Failed to add image to entry');
              }
            } else {
              throw new Error((uploadResult as { error?: string }).error || 'Upload failed');
            }
          } catch (error) {
            logger.error('Failed to add image to existing entry', error);
            Alert.alert(t('common.error'), t('create.failedToUploadImage'));
            setPendingImageUris(prev => prev.filter(uri => uri !== selectedUri));
          } finally {
            setIsUploadingImage(false);
          }
        }
      }
    } catch (error) {
      logger.error('Error picking image', error);
      Alert.alert(t('common.error'), t('create.failedToPickImage'));
    }
  }, [t, cursor.isNewEntryMode, cursor.currentEntry, userId, onEntriesUpdate, totalImageCount]);

  const handleRemoveImage = useCallback(
    async (imageId?: string, pendingIndex?: number) => {
      if (pendingIndex !== undefined) {
        setPendingImageUris(prev => prev.filter((_, i) => i !== pendingIndex));
        return;
      }
      if (imageId && cursor.currentEntry) {
        try {
          const result = await apiClient.delete<ServiceResponse<{ success: boolean }>>(
            `/api/v1/app/entries/${cursor.currentEntry.id}/illustrations/${imageId}`
          );
          if (result?.success) {
            // Update local images state instead of refreshing all entries
            setLocalImages(prev => prev.filter(img => img.id !== imageId));
          } else {
            Alert.alert(t('common.error'), t('create.failedToRemoveImage'));
          }
        } catch (error) {
          logger.error('Failed to remove image from entry', error);
          Alert.alert(t('common.error'), t('create.failedToRemoveImage'));
        }
        return;
      }
    },
    [cursor.currentEntry, onEntriesUpdate, t]
  );

  const handleCreateEntry = useCallback(async () => {
    // Guard: don't allow creation when disabled (e.g., chapter view active)
    if (disableNewEntryCreation) {
      logger.warn('Entry creation blocked - disableNewEntryCreation is true');
      return;
    }
    if (!editor.editedContent.trim()) {
      Alert.alert(t('common.error'), t('create.enterEntryContent'));
      return;
    }

    // Perform risk assessment before saving
    const riskResult = await RiskAssessmentService.assessRisk(editor.editedContent, userId);
    setDetectedRiskLevel(riskResult.level);

    // Show safety resources for high/critical risk
    if (riskResult.level === 'critical' || riskResult.level === 'high') {
      setShowSafetyRedirect(true);
      logger.info('[EntryNavigator] High risk content detected, showing safety resources', {
        level: riskResult.level,
        userId,
      });
    }

    try {
      let firstImageUrl: string | null = null;
      if (pendingImageUris.length > 0 && userId) {
        setIsUploadingImage(true);
        const uploadResult = await ProfileService.uploadEntryImage(pendingImageUris[0], userId);
        if (uploadResult.success && uploadResult.data) {
          firstImageUrl = uploadResult.data.url;
        } else {
          Alert.alert(t('common.error'), t('create.failedToUploadImage'));
          setIsUploadingImage(false);
          return;
        }
      }
      let dateToUse: Date;
      try {
        if (metadata.selectedDate instanceof Date && !isNaN(metadata.selectedDate.getTime())) {
          dateToUse = metadata.selectedDate;
        } else if (typeof metadata.selectedDate === 'string') {
          dateToUse = new Date(metadata.selectedDate);
        } else {
          dateToUse = new Date();
        }
        if (isNaN(dateToUse.getTime())) {
          dateToUse = new Date();
        }
      } catch {
        dateToUse = new Date();
      }
      const result = await apiClient.post<ServiceResponse<{ id: string }>>('/api/v1/app/entries', {
        content: editor.editedContent.trim(),
        type: 'reflection',
        userDate: dateToUse.toISOString(),
        chapterId: metadata.selectedChapterId,
        artworkUrl: firstImageUrl,
      });
      if (result?.success && result?.data) {
        const newEntryId = result.data.id;
        if (pendingImageUris.length > 1 && userId) {
          for (let i = 1; i < pendingImageUris.length; i++) {
            try {
              const uploadResult = await ProfileService.uploadEntryImage(pendingImageUris[i], userId);
              if (uploadResult.success && uploadResult.data) {
                await apiClient.post<ServiceResponse<{ image?: EntryImage }>>(
                  `/api/v1/app/entries/${newEntryId}/illustrations`,
                  { url: uploadResult.data.url }
                );
              }
            } catch (imgError) {
              logger.error('Failed to upload additional image', { index: i, error: imgError });
            }
          }
        }
        cursor.setIsNewEntryMode(false);
        setPendingImageUris([]);
        await onEntriesUpdate?.();
        onEntryCreated?.();
      } else {
        const errorMsg = result ? extractErrorMessage(result) : t('create.failedToCreateEntry');
        Alert.alert(t('common.error'), errorMsg);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('create.failedToCreateEntry');
      logger.error('Create entry error', error);
      Alert.alert(t('common.error'), errorMessage);
    } finally {
      setIsUploadingImage(false);
    }
  }, [
    editor.editedContent,
    metadata.selectedDate,
    metadata.selectedChapterId,
    pendingImageUris,
    userId,
    onEntriesUpdate,
    onEntryCreated,
    t,
    cursor,
    disableNewEntryCreation,
  ]);

  const handleDeleteEntry = useCallback(() => {
    if (!cursor.currentEntry) return;
    Alert.alert(t('components.EntryNavigator.deleteTitle'), t('components.EntryNavigator.deleteConfirmation'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            setIsDeleting(true);
            const result = await apiClient.delete<ServiceResponse<{ success: boolean }>>(
              `/api/v1/app/entries/${cursor.currentEntry!.id}`
            );
            if (result.success) {
              await onEntriesUpdate?.();
            } else {
              throw new Error(extractErrorMessage(result) || t('components.EntryNavigator.deleteFailed'));
            }
          } catch (error) {
            Alert.alert(t('common.error'), t('components.EntryNavigator.deleteFailed'));
            logger.error('Delete entry error', error);
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  }, [cursor.currentEntry, onEntriesUpdate, t]);

  const handleNewEntryMode = useCallback(() => {
    // Guard: don't allow new entry mode when creation is disabled
    if (disableNewEntryCreation) {
      logger.warn('New entry mode blocked - disableNewEntryCreation is true');
      return;
    }
    cursor.setIsNewEntryMode(true);
    editor.setEditedContent('');
    editor.resetEditorForEntry(null);
    metadata.resetMetadataForNewEntry();
    setPendingImageUris([]);
  }, [cursor, editor, metadata, disableNewEntryCreation]);

  return {
    currentIndex: cursor.currentIndex,
    isNewEntryMode: cursor.isNewEntryMode,
    editedContent: editor.editedContent,
    isSaving: editor.isSaving,
    isDeleting,
    emotionalState: metadata.emotionalState,
    selectedDate: metadata.selectedDate,
    showDatePicker: metadata.showDatePicker,
    chapters: metadata.chapters,
    selectedChapterId: metadata.selectedChapterId,
    showChapterPicker: metadata.showChapterPicker,
    isCreatingChapter: metadata.isCreatingChapter,
    newChapterTitle: metadata.newChapterTitle,
    isKeyboardVisible: cursor.isKeyboardVisible,
    keyboardHeight: cursor.keyboardHeight,
    currentEntry: cursor.currentEntry,
    totalEntries: cursor.totalEntries,
    isCurrentEntrySelected: cursor.isCurrentEntrySelected,
    hasUnsavedChanges: editor.hasUnsavedChanges,
    isListening: editor.isListening,
    interimTranscript: editor.interimTranscript,
    speechSupported: editor.speechSupported,
    textInputRef: cursor.textInputRef,
    pendingImageUris,
    totalImageCount,
    isUploadingImage,
    localImages,
    setShowDatePicker: metadata.setShowDatePicker,
    setShowChapterPicker: metadata.setShowChapterPicker,
    setNewChapterTitle: metadata.setNewChapterTitle,
    navigateToFirst: cursor.navigateToFirst,
    navigateToPrev: cursor.navigateToPrev,
    navigateToNext: cursor.navigateToNext,
    navigateToLast: cursor.navigateToLast,
    handleContentChange: editor.handleContentChange,
    handleDateChange: metadata.handleDateChange,
    handleChapterSelect: metadata.handleChapterSelect,
    handleCreateNewChapter: metadata.handleCreateNewChapter,
    handleEmotionalStateChange: metadata.handleEmotionalStateChange,
    handleVoiceInput: editor.handleVoiceInput,
    handleCreateEntry,
    handleDeleteEntry,
    handleNewEntryMode,
    handlePickImage,
    handleRemoveImage,
    savePendingChanges: editor.savePendingChanges,
    dismissKeyboard: cursor.dismissKeyboard,
    formatDisplayDate: metadata.formatDisplayDate,
    getChapterDisplayName: metadata.getChapterDisplayName,
    detectedRiskLevel,
    showSafetyRedirect,
    dismissSafetyRedirect: useCallback(() => setShowSafetyRedirect(false), []),
  };
}
