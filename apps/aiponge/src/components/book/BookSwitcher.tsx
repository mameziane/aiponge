/**
 * BookSwitcher Component
 * Unified dropdown for selecting and managing books
 *
 * Simplified UX:
 * - Regular users: show quick-create options
 * - Librarians: AI generation only
 * - Single "Generate with AI" button - no mode selection cards
 * - Inline delete confirmation (tap trash → checkmark to confirm, X to cancel)
 *
 * All books are stored in the unified lib_books table with bookTypeId driving behavior.
 * Librarian management screens (BookManagementScreen) use the unified library API
 * /api/app/library/books endpoints for managing the public library collection.
 */

import { useState, useRef, useCallback, useMemo, type ComponentProps } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Book } from '../../types/profile.types';
import type { BookTemplate, CreateBookOptions } from '../../hooks/book/useUnifiedLibrary';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS, Z_INDEX } from '../../theme/constants';
import { LiquidGlassView } from '../ui/LiquidGlassView';
import { useTranslation } from '../../i18n';
import { CreateBookModal } from './CreateBookModal';
import type { GeneratedBookBlueprint } from '../../hooks/book/useBookGenerator';
import { getBookTypeConfig, BOOK_TYPE_IDS, type BookTypeId } from '../../constants/bookTypes';
import { useAuthStore, selectUserId } from '../../auth/store';

interface BookSwitcherProps {
  books: Book[];
  currentBook: Book | null;
  templates?: BookTemplate[];
  onSelectBook: (book: Book) => void;
  onCreateBook: (titleOrOptions: string | CreateBookOptions, description?: string) => Promise<{ book: Book | null }>;
  onEditBook: (id: string, updates: { title?: string; description?: string }) => Promise<boolean>;
  onDeleteBook: (id: string, options?: { reassignToBookId?: string; deleteChapters?: boolean }) => Promise<boolean>;
  onLoadTemplates?: () => Promise<void>;
  loading?: boolean;
  showCreateModal?: boolean;
  onShowCreateModal?: (show: boolean) => void;
  bookTypeId?: BookTypeId;
}

export function BookSwitcher({
  books,
  currentBook,
  templates,
  onSelectBook,
  onCreateBook,
  onEditBook,
  onDeleteBook,
  onLoadTemplates,
  loading,
  showCreateModal: externalShowCreateModal,
  onShowCreateModal,
  bookTypeId = BOOK_TYPE_IDS.PERSONAL,
}: BookSwitcherProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUserId = useAuthStore(selectUserId);
  const bookTypeConfig = getBookTypeConfig(bookTypeId);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<View>(null);
  const [internalShowCreateModal, setInternalShowCreateModal] = useState(false);

  const showCreateModal = externalShowCreateModal ?? internalShowCreateModal;
  const setShowCreateModal = useCallback(
    (show: boolean) => {
      if (onShowCreateModal) {
        onShowCreateModal(show);
      } else {
        setInternalShowCreateModal(show);
      }
    },
    [onShowCreateModal]
  );

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookDescription, setNewBookDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Book | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const resetEditState = useCallback(() => {
    setEditingBook(null);
    setNewBookTitle('');
    setNewBookDescription('');
    setShowEditModal(false);
  }, []);

  const handleSelectBook = (book: Book) => {
    onSelectBook(book);
    setShowDropdown(false);
  };

  const handleQuickCreate = async (templateKey?: string) => {
    const template = templateKey ? templates?.find(tp => tp.key === templateKey) : null;
    const title = template?.label || '';
    const description = template?.description;

    const { book } = await onCreateBook(title, description);

    if (book) {
      onSelectBook(book);
    }
  };

  const handleCreateFromBlueprint = async (blueprint: GeneratedBookBlueprint) => {
    const { book } = await onCreateBook({
      title: blueprint.title,
      description: blueprint.description,
      language: blueprint.language,
      category: blueprint.category,
      era: blueprint.era,
      tradition: blueprint.tradition,
      chapters: blueprint.chapters.map(ch => ({
        title: ch.title,
        description: ch.description,
        order: ch.order,
        entries: ch.entries.map(entry => ({
          prompt: entry.prompt,
          type: entry.type,
          content: entry.content,
          sources: entry.sources,
        })),
      })),
    });
    if (book) {
      onSelectBook(book);
    }
  };

  const handleEditBook = async () => {
    if (!editingBook || !newBookTitle.trim()) return;

    setIsSubmitting(true);
    const success = await onEditBook(editingBook.id, {
      title: newBookTitle.trim(),
      description: newBookDescription.trim() || undefined,
    });
    setIsSubmitting(false);

    if (success) {
      resetEditState();
    }
  };

  const handleDeleteBook = (book: Book) => {
    setPendingDelete(pendingDelete?.id === book.id ? null : book);
  };

  const confirmDeleteBook = async () => {
    if (!pendingDelete) return;

    setIsDeleting(true);
    const success = await onDeleteBook(pendingDelete.id, { deleteChapters: true });
    setIsDeleting(false);

    if (success) {
      setPendingDelete(null);
    }
  };

  const cancelDeleteBook = () => {
    setPendingDelete(null);
  };

  const openEditModal = (book: Book) => {
    setEditingBook(book);
    setNewBookTitle(book.title);
    setNewBookDescription(book.description || '');
    setShowEditModal(true);
    setShowDropdown(false);
  };

  const toggleDropdown = useCallback(() => {
    if (!showDropdown && buttonRef.current) {
      buttonRef.current.measureInWindow((x, y, width, height) => {
        const screenWidth = Dimensions.get('window').width;
        const dropdownWidth = Math.min(280, screenWidth - 32);
        setDropdownPosition({
          top: y + height + 8,
          left: Math.min(x, screenWidth - dropdownWidth - 16),
          width: dropdownWidth,
        });
        setShowDropdown(true);
      });
    } else {
      setShowDropdown(false);
    }
  }, [showDropdown]);

  return (
    <View style={styles.container}>
      <View ref={buttonRef} collapsable={false}>
        <TouchableOpacity style={styles.switcherButton} onPress={toggleDropdown} testID="button-book-switcher">
          <Text style={styles.currentBookText} numberOfLines={1}>
            {currentBook?.title || t('books.selectBook')}
          </Text>
          <Ionicons name={showDropdown ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={() => setShowDropdown(false)}>
        <Pressable style={styles.dropdownOverlay} onPress={() => setShowDropdown(false)}>
          <View
            style={[
              styles.dropdown,
              {
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
              },
            ]}
          >
            <LiquidGlassView intensity="medium" style={styles.dropdownContent}>
              <ScrollView style={styles.bookList} showsVerticalScrollIndicator={false}>
                {books.map(book => {
                  const isOwnedByUser = book.userId === currentUserId;
                  const itemTypeId = (book.typeId || BOOK_TYPE_IDS.PERSONAL) as BookTypeId;
                  const itemConfig = getBookTypeConfig(itemTypeId);
                  const isSharedBook = !isOwnedByUser;
                  return (
                    <View key={book.id} style={styles.bookItemRow}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.bookItem,
                          pressed && styles.bookItemPressed,
                          currentBook?.id === book.id && styles.bookItemActive,
                          isSharedBook && styles.bookItemBook,
                        ]}
                        onPress={() => handleSelectBook(book)}
                        testID={`book-item-${book.id}`}
                      >
                        <View style={styles.bookInfo}>
                          <View style={styles.bookTitleRow}>
                            <Ionicons
                              name={
                                (isSharedBook ? 'library-outline' : itemConfig.icon) as ComponentProps<
                                  typeof Ionicons
                                >['name']
                              }
                              size={16}
                              color={isSharedBook ? colors.social.gold : colors.text.secondary}
                              style={styles.bookIcon}
                            />
                            <Text style={[styles.bookTitle, isSharedBook && styles.bookTitleLibrary]}>
                              {book.title}
                            </Text>
                            {isSharedBook && (
                              <View style={styles.libraryBadge}>
                                <Text style={styles.libraryBadgeText}>{t('books.shared', 'Shared')}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </Pressable>

                      {isOwnedByUser && (
                        <View style={styles.bookActions}>
                          {pendingDelete?.id === book.id ? (
                            <>
                              <TouchableOpacity
                                onPress={confirmDeleteBook}
                                disabled={isDeleting}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                testID={`button-confirm-delete-${book.id}`}
                              >
                                <Ionicons name="checkmark-circle" size={18} color={colors.semantic.error} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={cancelDeleteBook}
                                disabled={isDeleting}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                testID={`button-cancel-delete-${book.id}`}
                              >
                                <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity
                                onPress={() => openEditModal(book)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                testID={`button-edit-book-${book.id}`}
                              >
                                <Ionicons name="pencil-outline" size={16} color={colors.text.tertiary} />
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => handleDeleteBook(book)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                testID={`button-delete-book-${book.id}`}
                              >
                                <Ionicons name="trash-outline" size={16} color={colors.semantic.error} />
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </LiquidGlassView>
          </View>
        </Pressable>
      </Modal>

      <CreateBookModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateFromBlueprint={handleCreateFromBlueprint}
        onQuickCreate={bookTypeConfig.canQuickCreate ? handleQuickCreate : undefined}
        templates={templates}
        onLoadTemplates={onLoadTemplates}
        bookTypeId={bookTypeId}
        canQuickCreate={bookTypeConfig.canQuickCreate}
      />

      <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={resetEditState}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t(bookTypeConfig.editTitleKey)}</Text>

            <TextInput
              style={styles.input}
              placeholder={t('books.titlePlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              value={newBookTitle}
              onChangeText={setNewBookTitle}
              autoFocus
              testID="input-edit-book-title"
            />

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('books.descriptionPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              value={newBookDescription}
              onChangeText={setNewBookDescription}
              multiline
              numberOfLines={3}
              testID="input-edit-book-description"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={resetEditState} testID="button-cancel-edit">
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                onPress={handleEditBook}
                disabled={isSubmitting || !newBookTitle.trim()}
                testID="button-confirm-edit"
              >
                <Text style={styles.submitButtonText}>{isSubmitting ? t('common.saving') : t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      position: 'relative',
      zIndex: Z_INDEX.popover,
    },
    switcherButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.brand.primary + '20',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 6,
    },
    currentBookText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      maxWidth: 120,
    },
    dropdownOverlay: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    dropdown: {
      position: 'absolute',
      minWidth: 250,
    },
    dropdownContent: {
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden',
      backgroundColor: 'rgba(30, 30, 30, 0.95)',
    },
    bookList: {
      maxHeight: 250,
    },
    bookItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    bookItem: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    bookItemPressed: {
      backgroundColor: colors.background.subtle,
    },
    bookItemActive: {
      backgroundColor: colors.brand.primary + '20',
    },
    bookInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    bookTitle: {
      fontSize: 14,
      color: colors.text.primary,
      flex: 1,
    },
    bookTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    bookIcon: {
      marginRight: 4,
    },
    bookItemBook: {
      backgroundColor: colors.social.gold + '10',
    },
    bookTitleLibrary: {
      color: colors.social.gold,
    },
    libraryBadge: {
      backgroundColor: colors.social.gold + '30',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    libraryBadgeText: {
      fontSize: 10,
      color: colors.social.gold,
      fontWeight: '600',
    },
    defaultBadge: {
      backgroundColor: colors.brand.primary + '40',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    defaultBadgeText: {
      fontSize: 10,
      color: colors.brand.primary,
      fontWeight: '600',
    },
    bookActions: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 12,
      gap: 12,
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border.muted,
    },
    createButtonText: {
      fontSize: 14,
      color: colors.brand.primary,
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 350,
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.lg,
      padding: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 16,
      textAlign: 'center',
    },
    input: {
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text.primary,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    setDefaultButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      marginBottom: 12,
    },
    setDefaultButtonText: {
      fontSize: 14,
      color: colors.brand.primary,
      fontWeight: '500',
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.subtle,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    submitButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.brand.primary,
      alignItems: 'center',
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: 14,
      color: colors.text.primary,
      fontWeight: '600',
    },
    deleteWarningText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 20,
      lineHeight: 20,
    },
    deleteOptions: {
      gap: 12,
      marginBottom: 16,
    },
    deleteOptionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 10,
      gap: 10,
    },
    moveChaptersButton: {
      backgroundColor: colors.background.subtle,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    deleteAllButton: {
      backgroundColor: colors.semantic.error + '15',
      borderWidth: 1,
      borderColor: colors.semantic.error + '30',
    },
    deleteOptionText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.primary,
      flex: 1,
    },
  });

export default BookSwitcher;
