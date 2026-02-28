import { memo, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/theme';
import { useTranslation } from '@/i18n';
import { createStyles } from './styles';
import type { Chapter } from './types';

interface EntryChapterPickerProps {
  chapters: Chapter[];
  selectedChapterId: string | null;
  showChapterPicker: boolean;
  isLoading: boolean;
  isCreatingChapter: boolean;
  newChapterTitle: string;
  isKeyboardVisible: boolean;
  getChapterDisplayName: (chapterId: string | null) => string;
  onTogglePicker: () => void;
  onChapterSelect: (chapterId: string | null) => Promise<void>;
  onCreateChapter: () => Promise<void>;
  onNewChapterTitleChange: (title: string) => void;
  dismissKeyboard: () => void;
}

export const EntryChapterPicker = memo(function EntryChapterPicker({
  chapters,
  selectedChapterId,
  showChapterPicker,
  isLoading,
  isCreatingChapter,
  newChapterTitle,
  isKeyboardVisible,
  getChapterDisplayName,
  onTogglePicker,
  onChapterSelect,
  onCreateChapter,
  onNewChapterTitleChange,
  dismissKeyboard,
}: EntryChapterPickerProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleToggle = () => {
    if (!showChapterPicker && isKeyboardVisible) {
      dismissKeyboard();
    }
    onTogglePicker();
  };

  return (
    <View style={styles.chapterPickerWrapper}>
      <View style={styles.chapterPickerRow}>
        <TouchableOpacity
          style={styles.chapterButton}
          onPress={handleToggle}
          disabled={isLoading}
          testID="button-entry-chapter"
        >
          <Ionicons name="book-outline" size={18} color={colors.text.secondary} />
          <Text style={styles.chapterText} numberOfLines={1}>
            {getChapterDisplayName(selectedChapterId)}
          </Text>
          <Ionicons name={showChapterPicker ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {showChapterPicker && (
        <View style={styles.chapterPickerContainer}>
          <TouchableOpacity
            style={[styles.chapterOption, !selectedChapterId && styles.chapterOptionSelected]}
            onPress={() => onChapterSelect(null)}
            testID="button-chapter-none"
          >
            <Ionicons
              name={!selectedChapterId ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={!selectedChapterId ? colors.brand.primary : colors.text.tertiary}
            />
            <Text style={[styles.chapterOptionText, !selectedChapterId && styles.chapterOptionTextSelected]}>
              {t('components.entryNavigator.noChapter')}
            </Text>
          </TouchableOpacity>

          {chapters.map(chapter => (
            <TouchableOpacity
              key={chapter.id}
              style={[styles.chapterOption, selectedChapterId === chapter.id && styles.chapterOptionSelected]}
              onPress={() => onChapterSelect(chapter.id)}
              testID={`button-chapter-${chapter.id}`}
            >
              <Ionicons
                name={selectedChapterId === chapter.id ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={selectedChapterId === chapter.id ? colors.brand.primary : colors.text.tertiary}
              />
              <Text
                style={[styles.chapterOptionText, selectedChapterId === chapter.id && styles.chapterOptionTextSelected]}
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
                value={newChapterTitle}
                onChangeText={onNewChapterTitleChange}
                placeholder={t('components.entryNavigator.newChapterPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                testID="input-new-chapter-title"
              />
              <TouchableOpacity
                style={[
                  styles.newChapterButton,
                  (!newChapterTitle.trim() || isCreatingChapter) && styles.newChapterButtonDisabled,
                ]}
                onPress={onCreateChapter}
                disabled={!newChapterTitle.trim() || isCreatingChapter}
                testID="button-create-chapter"
              >
                {isCreatingChapter ? (
                  <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                  <Ionicons name="add" size={20} color={colors.text.primary} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
});
