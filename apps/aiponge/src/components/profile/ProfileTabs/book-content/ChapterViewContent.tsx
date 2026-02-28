import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/i18n';
import { useThemeColors } from '@/theme';
import { createProfileEditorStyles } from '@/styles/profileEditor.styles';
import type { Entry, EntryChapter, Book } from '@/types/profile.types';
import { LiquidGlassView } from '../../../ui/LiquidGlassView';
import { BookContentEntryCard } from './BookContentEntryCard';

interface ChapterViewContentProps {
  sortedChapters: EntryChapter[];
  groupedEntries: Record<string, Entry[]>;
  collapsedChapters: Set<string>;
  editingChapterId: string | null;
  editChapterTitle: string;
  creatingChapter: boolean;
  newChapterTitle: string;
  creatingEntryInChapterId: string | null;
  newEntryContent: string;
  savingNewEntry: boolean;
  selectedEntryId: string | null;
  editingEntryId: string | null;
  editedEntryContent: string;
  savingEntry: boolean;
  saveFailedForEntry: string | null;
  deletingEntryId: string | null;
  entryIdsWithSongs?: Set<string>;
  books: Book[];
  canDelete: boolean;
  onToggleCollapse: (chapterId: string) => void;
  onEditChapterStart: (chapterId: string, title: string) => void;
  onEditChapterTitleChange: (title: string) => void;
  onEditChapterSave: (id: string) => void;
  onDeleteChapter: (id: string, title: string) => void;
  onMoveChapter: (chapter: EntryChapter) => void;
  onCreateChapter: () => void;
  onCancelCreateChapter: () => void;
  onNewChapterTitleChange: (title: string) => void;
  onStartNewEntry: (chapterId: string) => void;
  onCancelNewEntry: () => void;
  onNewEntryContentChange: (content: string) => void;
  onSaveNewEntry: () => void;
  onEntryTap: (entry: Entry) => void;
  onEntryLongPress: (entry: Entry) => void;
  onEntryContentChange: (text: string) => void;
  onEntryBlurSave: () => void;
  onEntryDelete: (entry: Entry) => void;
  onCreateSong: (entry: Entry) => void;
  onClearSaveError: (entryId: string) => void;
}

export const ChapterViewContent: React.FC<ChapterViewContentProps> = ({
  sortedChapters,
  groupedEntries,
  collapsedChapters,
  editingChapterId,
  editChapterTitle,
  creatingChapter,
  newChapterTitle,
  creatingEntryInChapterId,
  newEntryContent,
  savingNewEntry,
  selectedEntryId,
  editingEntryId,
  editedEntryContent,
  savingEntry,
  saveFailedForEntry,
  deletingEntryId,
  entryIdsWithSongs,
  books,
  canDelete,
  onToggleCollapse,
  onEditChapterStart,
  onEditChapterTitleChange,
  onEditChapterSave,
  onDeleteChapter,
  onMoveChapter,
  onCreateChapter,
  onCancelCreateChapter,
  onNewChapterTitleChange,
  onStartNewEntry,
  onCancelNewEntry,
  onNewEntryContentChange,
  onSaveNewEntry,
  onEntryTap,
  onEntryLongPress,
  onEntryContentChange,
  onEntryBlurSave,
  onEntryDelete,
  onCreateSong,
  onClearSaveError,
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = React.useMemo(() => createProfileEditorStyles(colors), [colors]);

  const selectedEntry = selectedEntryId
    ? (Object.values(groupedEntries)
        .flat()
        .find(e => e.id === selectedEntryId) ?? null)
    : null;

  return (
    <>
      {creatingChapter && (
        <LiquidGlassView intensity="medium" style={{ marginBottom: 16, padding: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder={t('profile.chapterPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              value={newChapterTitle}
              onChangeText={onNewChapterTitleChange}
              autoFocus
              testID="input-chapter-title"
            />
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={onCancelCreateChapter}
              testID="button-cancel-chapter"
            >
              <Ionicons name="close" size={16} color={colors.text.secondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={onCreateChapter}
              testID="button-save-chapter"
            >
              <Ionicons name="checkmark" size={16} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </LiquidGlassView>
      )}

      <View style={styles.tocContainer}>
        {sortedChapters.map((chapter, index) => {
          const isLocked = chapter.isLocked === true;
          return (
            <View key={chapter.id} style={[styles.tocChapter, isLocked && { opacity: 0.6 }]}>
              <TouchableOpacity
                style={styles.tocChapterHeader}
                onPress={() => !isLocked && onToggleCollapse(chapter.id)}
                disabled={isLocked}
                testID={`chapter-header-${chapter.id}`}
              >
                <View style={styles.tocChapterLeft}>
                  <View style={{ position: 'relative' }}>
                    <Text style={[styles.tocChapterNumber, isLocked && { opacity: 0.5 }]}>{index + 1}</Text>
                    {isLocked && (
                      <Ionicons
                        name="lock-closed"
                        size={12}
                        color={colors.brand.primary}
                        style={{ position: 'absolute', top: -4, right: -6 }}
                      />
                    )}
                  </View>
                  <View style={styles.tocChapterTitleContainer}>
                    {editingChapterId === chapter.id && !isLocked ? (
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        value={editChapterTitle}
                        onChangeText={onEditChapterTitleChange}
                        onBlur={() => onEditChapterSave(chapter.id)}
                        onSubmitEditing={() => onEditChapterSave(chapter.id)}
                        autoFocus
                        testID={`input-edit-chapter-${chapter.id}`}
                      />
                    ) : (
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onLongPress={() => {
                          if (!isLocked) {
                            onEditChapterStart(chapter.id, chapter.title);
                          }
                        }}
                        disabled={isLocked}
                        testID={`chapter-title-${chapter.id}`}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.tocChapterTitle, isLocked && { color: colors.text.tertiary }]}>
                            {chapter.title}
                          </Text>
                          {isLocked && (
                            <Text style={{ fontSize: 11, color: colors.brand.primary, fontStyle: 'italic' }}>
                              {t('bookContent.lockedChapter')}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    )}
                    {!isLocked && (
                      <Text style={styles.tocEntryCount}>
                        {groupedEntries[chapter.id]?.length || 0} {t('bookContent.entries')}
                      </Text>
                    )}
                    {isLocked && (
                      <Text style={[styles.tocEntryCount, { color: colors.text.tertiary }]}>
                        {t('bookContent.createFirstSongToUnlock')}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.tocChapterActions}>
                  {!isLocked && books.length > 1 && (
                    <TouchableOpacity
                      onPress={() => onMoveChapter(chapter)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      testID={`button-move-chapter-${chapter.id}`}
                    >
                      <Ionicons name="arrow-redo-outline" size={16} color={colors.text.tertiary} />
                    </TouchableOpacity>
                  )}
                  {!isLocked && canDelete && (
                    <TouchableOpacity
                      onPress={() => onDeleteChapter(chapter.id, chapter.title)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      testID={`button-delete-chapter-${chapter.id}`}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.text.tertiary} />
                    </TouchableOpacity>
                  )}
                  {isLocked ? (
                    <Ionicons name="lock-closed" size={18} color={colors.brand.primary} />
                  ) : (
                    <Ionicons
                      name={collapsedChapters.has(chapter.id) ? 'chevron-forward' : 'chevron-down'}
                      size={18}
                      color={colors.text.secondary}
                    />
                  )}
                </View>
              </TouchableOpacity>

              {!isLocked && !collapsedChapters.has(chapter.id) && (
                <View style={styles.tocEntriesList}>
                  {(groupedEntries[chapter.id] || []).map((entry, idx) => (
                    <BookContentEntryCard
                      key={`${entry.id}-${idx}`}
                      entry={entry}
                      isSelected={entry.id === selectedEntry?.id}
                      isEditing={editingEntryId === entry.id}
                      hasSong={entryIdsWithSongs?.has(entry.id) ?? false}
                      editedContent={editedEntryContent}
                      savingEntry={savingEntry}
                      saveFailedForEntry={saveFailedForEntry}
                      deletingEntryId={deletingEntryId}
                      canDelete={canDelete}
                      onTap={onEntryTap}
                      onLongPress={onEntryLongPress}
                      onContentChange={onEntryContentChange}
                      onBlurSave={onEntryBlurSave}
                      onDelete={onEntryDelete}
                      onCreateSong={onCreateSong}
                      onClearSaveError={onClearSaveError}
                    />
                  ))}
                  {creatingEntryInChapterId === chapter.id ? (
                    <View style={styles.newEntryInputContainer}>
                      <TextInput
                        style={styles.newEntryInput}
                        value={newEntryContent}
                        onChangeText={onNewEntryContentChange}
                        placeholder={t('create.newEntryPlaceholder')}
                        placeholderTextColor={colors.text.tertiary}
                        multiline
                        autoFocus
                        testID={`input-new-entry-chapter-${chapter.id}`}
                      />
                      <View style={styles.newEntryActions}>
                        <TouchableOpacity
                          style={styles.newEntryCancelButton}
                          onPress={onCancelNewEntry}
                          disabled={savingNewEntry}
                          testID={`button-cancel-new-entry-${chapter.id}`}
                        >
                          <Text style={styles.newEntryCancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.newEntrySaveButton,
                            (!newEntryContent.trim() || savingNewEntry) && { opacity: 0.5 },
                          ]}
                          onPress={onSaveNewEntry}
                          disabled={!newEntryContent.trim() || savingNewEntry}
                          testID={`button-save-new-entry-${chapter.id}`}
                        >
                          {savingNewEntry ? (
                            <ActivityIndicator size="small" color={colors.background.primary} />
                          ) : (
                            <Text style={styles.newEntrySaveText}>{t('common.save')}</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.newEntryButton}
                      onPress={() => onStartNewEntry(chapter.id)}
                      testID={`button-new-entry-chapter-${chapter.id}`}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={colors.brand.primary} />
                      <Text style={styles.newEntryButtonText}>{t('navigation.newEntry')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {groupedEntries.noChapter && groupedEntries.noChapter.length > 0 && (
          <View style={styles.tocChapter}>
            <TouchableOpacity
              style={styles.tocChapterHeader}
              onPress={() => onToggleCollapse('noChapter')}
              testID="chapter-header-noChapter"
            >
              <View style={styles.tocChapterLeft}>
                <Text style={[styles.tocChapterNumber, { opacity: 0.5 }]}>—</Text>
                <View style={styles.tocChapterTitleContainer}>
                  <Text style={[styles.tocChapterTitle, { fontStyle: 'italic' }]}>
                    {t('components.profileTabs.noChapter')}
                  </Text>
                  <Text style={styles.tocEntryCount}>
                    {groupedEntries.noChapter.length} {t('bookContent.entries')}
                  </Text>
                </View>
              </View>
              <View style={styles.tocChapterActions}>
                <Ionicons
                  name={collapsedChapters.has('noChapter') ? 'chevron-forward' : 'chevron-down'}
                  size={18}
                  color={colors.text.secondary}
                />
              </View>
            </TouchableOpacity>

            {!collapsedChapters.has('noChapter') && (
              <View style={styles.tocEntriesList}>
                {groupedEntries.noChapter.map((entry, idx) => (
                  <BookContentEntryCard
                    key={`${entry.id}-${idx}`}
                    entry={entry}
                    isSelected={entry.id === selectedEntry?.id}
                    isEditing={editingEntryId === entry.id}
                    hasSong={entryIdsWithSongs?.has(entry.id) ?? false}
                    editedContent={editedEntryContent}
                    savingEntry={savingEntry}
                    saveFailedForEntry={saveFailedForEntry}
                    deletingEntryId={deletingEntryId}
                    canDelete={canDelete}
                    onTap={onEntryTap}
                    onLongPress={onEntryLongPress}
                    onContentChange={onEntryContentChange}
                    onBlurSave={onEntryBlurSave}
                    onDelete={onEntryDelete}
                    onCreateSong={onCreateSong}
                    onClearSaveError={onClearSaveError}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </>
  );
};
