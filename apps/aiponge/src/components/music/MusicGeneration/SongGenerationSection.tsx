import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EntryNavigator } from '../../EntryNavigator';
import type { Entry, LibBook } from '@/types/profile.types';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { spacing } from '@/theme/spacing';
import { useTranslation } from '@/i18n';

interface SongGenerationSectionProps {
  entries: Entry[];
  totalEntries: number;
  selectedEntry: string | null;
  selectedEntryId: string | null;
  currentEntryContent: string;
  isLoadingEntries: boolean;
  onEntrySelect: (entry: Entry) => void;
  onEntriesUpdate: () => Promise<void>;
  onContentChange: (content: string) => void;
  onCurrentEntryChange: (entry: Entry | null) => void;
  onEntryCreated: () => void;
  onGenerateSong: () => void;
  canGenerate: boolean;
  insufficientCredits: boolean;
  creditCost?: number;
  currentBalance?: number;
  creditsLoading?: boolean;
  onGetMoreCredits: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  navigateToEntryId?: string | null;
  onNavigatedToEntry?: () => void;
  onImageLongPress?: (imageUri: string) => void;
  // Book selector
  books?: LibBook[];
  selectedBookId?: string | null;
  onBookSelect?: (bookId: string | null) => void;
}

export function SongGenerationSection({
  entries,
  totalEntries,
  selectedEntry,
  selectedEntryId,
  currentEntryContent,
  isLoadingEntries,
  onEntrySelect,
  onEntriesUpdate,
  onContentChange,
  onCurrentEntryChange,
  onEntryCreated,
  onGenerateSong,
  canGenerate,
  insufficientCredits,
  creditCost = 15,
  currentBalance = 0,
  creditsLoading = false,
  onGetMoreCredits,
  expanded,
  onToggleExpand,
  navigateToEntryId,
  onNavigatedToEntry,
  onImageLongPress,
  books,
  selectedBookId,
  onBookSelect,
}: SongGenerationSectionProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const [showBookPicker, setShowBookPicker] = useState(false);

  const hasContent = currentEntryContent.trim().length > 0;
  const hasBooks = books && books.length > 0;
  const selectedBook = useMemo(
    () => (selectedBookId && books ? books.find(b => b.id === selectedBookId) : null),
    [selectedBookId, books]
  );

  const handleBookSelect = (bookId: string | null) => {
    onBookSelect?.(bookId);
    setShowBookPicker(false);
  };

  return (
    <View style={styles.preferencesContainer}>
      <TouchableOpacity
        style={styles.preferencesHeader}
        onPress={onToggleExpand}
        testID="button-toggle-song-generation"
      >
        <View style={styles.preferencesHeaderLeft}>
          <Text style={styles.preferencesTitle}>{t('create.songGeneration')}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text.secondary} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.preferencesContent}>
          {/* Your Entry Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Ionicons name="create" size={16} color={colors.brand.primary} />
              <Text style={styles.subsectionTitle}>{t('create.yourEntry')}</Text>
            </View>
            <Text style={styles.preferencesHint}>{t('create.entrySelectionHint')}</Text>

            {/* Book Selector */}
            {hasBooks && onBookSelect && (
              <View style={styles.bookSelectorContainer}>
                <Pressable
                  style={styles.bookSelectorButton}
                  onPress={() => setShowBookPicker(prev => !prev)}
                  testID="button-select-book"
                >
                  <Ionicons name="book-outline" size={18} color={colors.brand.primary} />
                  <Text style={styles.bookSelectorText} numberOfLines={1}>
                    {selectedBook ? selectedBook.title : t('create.allBooks')}
                  </Text>
                  <Ionicons
                    name={showBookPicker ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.text.tertiary}
                  />
                </Pressable>

                {showBookPicker && (
                  <View style={styles.bookPickerList}>
                    <ScrollView style={styles.bookPickerScroll} nestedScrollEnabled>
                      {/* All Books option */}
                      <Pressable
                        style={[styles.bookPickerItem, !selectedBookId && styles.bookPickerItemSelected]}
                        onPress={() => handleBookSelect(null)}
                        testID="button-book-all"
                      >
                        <Ionicons name="library-outline" size={18} color={colors.text.secondary} />
                        <Text
                          style={[styles.bookPickerItemText, !selectedBookId && styles.bookPickerItemTextSelected]}
                          numberOfLines={1}
                        >
                          {t('create.allBooks')}
                        </Text>
                        {!selectedBookId && <Ionicons name="checkmark" size={18} color={colors.brand.primary} />}
                      </Pressable>

                      {/* Individual books */}
                      {books!.map(book => (
                        <Pressable
                          key={book.id}
                          style={[styles.bookPickerItem, selectedBookId === book.id && styles.bookPickerItemSelected]}
                          onPress={() => handleBookSelect(book.id)}
                          testID={`button-book-${book.id}`}
                        >
                          <Ionicons name="book" size={18} color={colors.brand.primary} />
                          <View style={styles.bookPickerItemInfo}>
                            <Text
                              style={[
                                styles.bookPickerItemText,
                                selectedBookId === book.id && styles.bookPickerItemTextSelected,
                              ]}
                              numberOfLines={1}
                            >
                              {book.title}
                            </Text>
                            {book.entryCount != null && book.entryCount > 0 && (
                              <Text style={styles.bookPickerItemSubtext}>
                                {book.entryCount} {book.entryCount === 1 ? 'entry' : 'entries'}
                              </Text>
                            )}
                          </View>
                          {selectedBookId === book.id && (
                            <Ionicons name="checkmark" size={18} color={colors.brand.primary} />
                          )}
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* Entry Navigator - Create new or select/edit existing entries */}
            <View style={styles.entryNavigatorContainer}>
              <EntryNavigator
                entries={entries || []}
                totalEntriesCount={totalEntries}
                isLoading={isLoadingEntries}
                selectionMode={true}
                selectedEntryId={selectedEntryId ?? undefined}
                onEntrySelect={onEntrySelect}
                onEntriesUpdate={onEntriesUpdate}
                onContentChange={onContentChange}
                onCurrentEntryChange={onCurrentEntryChange}
                onEntryCreated={onEntryCreated}
                showDateChapterRow={false}
                showEmotionSlider={false}
                middleActionContent={undefined}
                navigateToEntryId={navigateToEntryId}
                onNavigatedToEntry={onNavigatedToEntry}
                onImageLongPress={onImageLongPress}
              />
            </View>

            {/* Insufficient credits warning */}
            {selectedEntry && hasContent && insufficientCredits && (
              <View style={styles.insufficientCreditsWarning}>
                <Ionicons name="warning" size={20} color={colors.semantic.warning} />
                <Text style={styles.warningText}>
                  {t('create.insufficientCreditsMessage', { cost: creditCost })}{' '}
                  {t('create.currentBalance', { balance: currentBalance })}{' '}
                  <Text style={styles.warningLink} onPress={onGetMoreCredits}>
                    {t('create.getMoreSongs')}
                  </Text>
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    preferencesContainer: {
      marginHorizontal: spacing.screenHorizontal,
      marginTop: 8,
      marginBottom: 8,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.primary,
      overflow: 'hidden',
    },
    preferencesHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.elementPadding,
      paddingVertical: 10,
    },
    preferencesHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    preferencesTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    preferencesContent: {
      paddingHorizontal: spacing.componentGap,
      paddingBottom: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    sectionContainer: {
      marginBottom: 4,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    subsectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginLeft: 6,
    },
    preferencesHint: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 8,
      lineHeight: 18,
    },
    // Book selector
    bookSelectorContainer: {
      marginBottom: 8,
    },
    bookSelectorButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    bookSelectorText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.primary,
    },
    bookPickerList: {
      marginTop: 4,
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.primary,
      overflow: 'hidden',
    },
    bookPickerScroll: {
      maxHeight: 200,
    },
    bookPickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.muted,
    },
    bookPickerItemSelected: {
      backgroundColor: colors.background.secondary,
    },
    bookPickerItemInfo: {
      flex: 1,
    },
    bookPickerItemText: {
      fontSize: 14,
      color: colors.text.primary,
    },
    bookPickerItemTextSelected: {
      fontWeight: '600',
    },
    bookPickerItemSubtext: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    // Entry navigator
    entryNavigatorContainer: {
      marginBottom: 4,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: spacing.componentGap,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    characterCountContainer: {
      position: 'absolute',
      bottom: 12,
      right: spacing.elementPadding,
      backgroundColor: colors.background.primary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    characterCount: {
      fontSize: 12,
      color: colors.text.tertiary,
      fontWeight: '500',
    },
    insufficientCreditsWarning: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.semantic.warningLight,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      marginBottom: 12,
      gap: 8,
    },
    warningText: {
      flex: 1,
      fontSize: 14,
      color: colors.semantic.warning,
      lineHeight: 20,
    },
    warningLink: {
      textDecorationLine: 'underline',
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullWidthButton: {
      width: '100%',
      marginTop: 12,
    },
    disabledButton: {
      backgroundColor: colors.state.disabled,
      opacity: 0.6,
    },
    primaryButtonText: {
      color: colors.absolute.white,
      fontSize: 16,
      fontWeight: '600',
    },
    queueInfoText: {
      marginTop: 8,
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: 8,
      paddingHorizontal: 16,
      gap: 6,
    },
    generateButtonDisabled: {
      opacity: 0.4,
    },
    generateButtonText: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: '600',
    },
  });

export default SongGenerationSection;
