import { memo, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, Text, Platform, TextInput, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { EmotionSlider } from '../book/EmotionSlider';
import { useThemeColors } from '@/theme';
import { createStyles, createCompactPickerStyles } from './styles';
import { useEntryNavigator } from './hooks/useEntryNavigator';
import { EntryNavigation } from './EntryNavigation';
import { EntryInput } from './EntryInput';
import { EntryActions } from './EntryActions';
import { SafetyRedirect } from '../shared/SafetyRedirect';
import { useTranslation } from '@/i18n';
import type { EntryNavigatorProps } from './types';

export type { EntryNavigatorProps } from './types';

const EntryNavigatorComponent = (props: EntryNavigatorProps) => {
  const {
    isLoading = false,
    hasMore = false,
    isLoadingMore = false,
    showDateChapterRow = true,
    showEmotionSlider = true,
  } = props;

  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const compactPickerStyles = useMemo(() => createCompactPickerStyles(colors), [colors]);
  const hook = useEntryNavigator(props);
  const { t } = useTranslation();

  const handleDateButtonPress = () => {
    if (hook.isKeyboardVisible) hook.dismissKeyboard();
    hook.setShowDatePicker(true);
  };

  const handleChapterButtonPress = () => {
    if (!hook.showChapterPicker && hook.isKeyboardVisible) {
      hook.dismissKeyboard();
    }
    hook.setShowChapterPicker(!hook.showChapterPicker);
  };

  const dateChapterButtons = showDateChapterRow ? (
    <View style={compactPickerStyles.buttonsRow}>
      <TouchableOpacity
        style={compactPickerStyles.pickerButton}
        onPress={handleDateButtonPress}
        disabled={isLoading}
        testID="button-entry-date"
      >
        <Ionicons name="calendar-outline" size={18} color={colors.text.secondary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={compactPickerStyles.pickerButton}
        onPress={handleChapterButtonPress}
        disabled={isLoading}
        testID="button-entry-chapter"
      >
        <Ionicons name="book-outline" size={18} color={colors.text.secondary} />
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.container}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      scrollEnabled={false}
    >
      {hook.showSafetyRedirect && (
        <SafetyRedirect riskLevel={hook.detectedRiskLevel} onDismiss={hook.dismissSafetyRedirect} showResources />
      )}

      <EntryNavigation
        currentIndex={hook.currentIndex}
        totalEntries={hook.totalEntries}
        entriesLength={props.entries.length}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onFirst={hook.navigateToFirst}
        onPrev={hook.navigateToPrev}
        onNext={hook.navigateToNext}
        onLast={hook.navigateToLast}
      />

      <EntryInput
        textInputRef={hook.textInputRef}
        editedContent={hook.editedContent}
        interimTranscript={hook.interimTranscript}
        isNewEntryMode={hook.isNewEntryMode}
        isLoading={isLoading}
        isListening={hook.isListening}
        isCurrentEntrySelected={hook.isCurrentEntrySelected}
        speechSupported={hook.speechSupported}
        pendingImageUris={hook.pendingImageUris}
        currentEntryImages={hook.isNewEntryMode ? [] : hook.localImages}
        isUploadingImage={hook.isUploadingImage}
        onContentChange={hook.handleContentChange}
        onVoiceInput={hook.handleVoiceInput}
        onRemoveImage={hook.handleRemoveImage}
        onPickImage={hook.handlePickImage}
        onImageLongPress={props.onImageLongPress}
      />

      <EntryActions
        isNewEntryMode={hook.isNewEntryMode}
        currentEntry={hook.currentEntry}
        editedContent={hook.editedContent}
        isSaving={hook.isSaving}
        isDeleting={hook.isDeleting}
        hasUnsavedChanges={hook.hasUnsavedChanges}
        onDelete={hook.handleDeleteEntry}
        onCreateEntry={hook.handleCreateEntry}
        onSaveChanges={hook.savePendingChanges}
        onNewEntryMode={hook.handleNewEntryMode}
        middleActionContent={dateChapterButtons}
        canDelete={props.canDelete}
      />

      {hook.showDatePicker && (
        <View style={styles.datePickerContainer}>
          <DateTimePicker
            value={hook.selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={hook.handleDateChange}
            themeVariant="dark"
            testID="date-picker-entry"
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.datePickerDoneButton}
              onPress={() => hook.setShowDatePicker(false)}
              testID="button-date-picker-done"
            >
              <Text style={styles.datePickerDoneText}>{t('common.done')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {hook.showChapterPicker && (
        <View style={styles.chapterPickerContainer}>
          <TouchableOpacity
            style={[styles.chapterOption, !hook.selectedChapterId && styles.chapterOptionSelected]}
            onPress={() => hook.handleChapterSelect(null)}
            testID="button-chapter-none"
          >
            <Ionicons
              name={!hook.selectedChapterId ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={!hook.selectedChapterId ? colors.brand.primary : colors.text.tertiary}
            />
            <Text style={[styles.chapterOptionText, !hook.selectedChapterId && styles.chapterOptionTextSelected]}>
              {t('components.entryNavigator.noChapter')}
            </Text>
          </TouchableOpacity>

          {hook.chapters.map(chapter => (
            <TouchableOpacity
              key={chapter.id}
              style={[styles.chapterOption, hook.selectedChapterId === chapter.id && styles.chapterOptionSelected]}
              onPress={() => hook.handleChapterSelect(chapter.id)}
              testID={`button-chapter-${chapter.id}`}
            >
              <Ionicons
                name={hook.selectedChapterId === chapter.id ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={hook.selectedChapterId === chapter.id ? colors.brand.primary : colors.text.tertiary}
              />
              <Text
                style={[
                  styles.chapterOptionText,
                  hook.selectedChapterId === chapter.id && styles.chapterOptionTextSelected,
                ]}
                numberOfLines={1}
              >
                {chapter.title}
              </Text>
            </TouchableOpacity>
          ))}

          <View style={styles.newChapterSection}>
            <View style={styles.newChapterInputRow}>
              <TextInput
                style={styles.newChapterInput}
                value={hook.newChapterTitle}
                onChangeText={hook.setNewChapterTitle}
                placeholder={t('components.entryNavigator.newChapterPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                testID="input-new-chapter-title"
              />
              <TouchableOpacity
                style={[
                  styles.newChapterButton,
                  (!hook.newChapterTitle.trim() || hook.isCreatingChapter) && styles.newChapterButtonDisabled,
                ]}
                onPress={hook.handleCreateNewChapter}
                disabled={!hook.newChapterTitle.trim() || hook.isCreatingChapter}
                testID="button-create-chapter"
              >
                {hook.isCreatingChapter ? (
                  <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                  <Ionicons name="add" size={20} color={colors.text.primary} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showEmotionSlider && hook.editedContent.trim().length > 0 && (
        <View style={styles.emotionSliderContainer}>
          <EmotionSlider
            value={hook.emotionalState}
            onChange={hook.handleEmotionalStateChange}
            entryId={hook.currentEntry?.id}
            disabled={hook.isSaving}
          />
        </View>
      )}
    </ScrollView>
  );
};

export const EntryNavigator = memo(EntryNavigatorComponent);
