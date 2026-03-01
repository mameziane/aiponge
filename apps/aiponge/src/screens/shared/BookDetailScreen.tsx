import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  type TextStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useThemeColors, type ColorScheme, commonStyles, Z_INDEX, BORDER_RADIUS } from '../../theme';
import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingState } from '../../components/shared/LoadingState';
import { normalizeMediaUrl } from '../../lib/apiConfig';
import { parseContentBlocks, type BlockWithMeta } from '../../components/book/richTextParser';
import { CloneBookModal } from '../../components/book';
import type { BookCardData } from '../../components/book/BookCard';
import {
  useBookDisplay,
  useManageBook,
  useChapterEntries,
  useMyLibrary,
  useLibraryMutations,
  useBookPDF,
  type BookDisplay,
  type BookDisplayEntry,
  type BookDisplayChapter,
} from '../../hooks/book';
import { useBookCoverPolling } from '../../hooks/book/useBookCoverPolling';
import { apiRequest } from '../../lib/axiosApiClient';
import { useToast } from '../../hooks/ui/use-toast';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { useAuthStore, selectUser, selectToken } from '../../auth/store';
import { useTranslation } from '../../i18n';
import { useMediaPicker } from '../../hooks/ui/useMediaPicker';
import { ProfileService } from '../../hooks/profile/ProfileService';

const defaultCoverIcon = require('../../../assets/icon.png');

const FormattedEntryText = memo(function FormattedEntryText({ text, colors }: { text: string; colors: ColorScheme }) {
  const blocks = useMemo(() => parseContentBlocks(text), [text]);

  const renderBoldText = (plainText: string, boldRanges: BlockWithMeta['boldRanges'], baseStyle: TextStyle) => {
    if (!boldRanges.length) return <Text style={baseStyle}>{plainText}</Text>;
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;
    boldRanges.forEach((range, i) => {
      if (range.start > lastEnd) {
        parts.push(
          <Text key={`t${i}`} style={baseStyle}>
            {plainText.slice(lastEnd, range.start)}
          </Text>
        );
      }
      parts.push(
        <Text key={`b${i}`} style={[baseStyle, { fontWeight: '700' }]}>
          {plainText.slice(range.start, range.end)}
        </Text>
      );
      lastEnd = range.end;
    });
    if (lastEnd < plainText.length) {
      parts.push(
        <Text key="end" style={baseStyle}>
          {plainText.slice(lastEnd)}
        </Text>
      );
    }
    return <Text>{parts}</Text>;
  };

  return (
    <View>
      {blocks.map((block, idx) => {
        if (block.type === 'pause') return <View key={idx} style={{ height: 16 }} />;

        const baseTextStyle = {
          fontSize: 15,
          lineHeight: 24,
          color: block.type === 'quote' ? colors.text.secondary : colors.text.primary,
          fontStyle: block.type === 'quote' ? ('italic' as const) : ('normal' as const),
        };

        if (block.type === 'quote') {
          return (
            <View key={idx} style={{ flexDirection: 'row', marginBottom: 8, paddingLeft: 12 }}>
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 2,
                  bottom: 2,
                  width: 3,
                  borderRadius: 1.5,
                  backgroundColor: colors.brand.primary,
                  opacity: 0.5,
                }}
              />
              {renderBoldText(block.plainText, block.boldRanges, baseTextStyle)}
            </View>
          );
        }

        if (block.type === 'reflection') {
          return (
            <View
              key={idx}
              style={{
                marginBottom: 8,
                paddingVertical: 8,
                paddingHorizontal: 12,
                backgroundColor: colors.brand.primary + '10',
                borderRadius: 8,
              }}
            >
              {renderBoldText(block.plainText, block.boldRanges, baseTextStyle)}
            </View>
          );
        }

        if (block.type === 'numbered') {
          return (
            <View key={idx} style={{ flexDirection: 'row', marginBottom: 6, paddingLeft: 4 }}>
              <Text style={[baseTextStyle, { color: colors.text.tertiary, fontWeight: '600', width: 24 }]}>
                {block.number}.
              </Text>
              <View style={{ flex: 1 }}>{renderBoldText(block.plainText, block.boldRanges, baseTextStyle)}</View>
            </View>
          );
        }

        return (
          <View key={idx} style={{ marginBottom: 8 }}>
            {renderBoldText(block.plainText, block.boldRanges, baseTextStyle)}
          </View>
        );
      })}
    </View>
  );
});

type BookDetailMode = 'view' | 'manage';

interface BookDetailScreenProps {
  mode?: BookDetailMode;
}

const getCategoryColors = (colors: ColorScheme): Record<string, string> => ({
  anxiety: colors.category.anxiety,
  growth: colors.category.growth,
  purpose: colors.category.purpose,
  love: colors.category.love,
  grief: colors.category.grief,
  gratitude: colors.category.gratitude,
  mindfulness: colors.category.mindfulness,
  resilience: colors.category.resilience,
});

function ManageChapterEntries({
  chapterId,
  categoryColor,
  onGenerateSong,
}: {
  chapterId: string;
  categoryColor: string;
  onGenerateSong: (entry: BookDisplayEntry) => void;
}) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { data: entries, isLoading } = useChapterEntries(chapterId, true);

  if (isLoading) {
    return <LoadingState fullScreen={false} size="small" />;
  }

  if (!entries?.length) {
    return (
      <Text style={{ color: colors.text.tertiary, fontSize: 13, paddingHorizontal: 16, paddingBottom: 12 }}>
        {t('reader.noEntries')}
      </Text>
    );
  }

  return (
    <View>
      {entries.map(entry => (
        <View
          key={entry.id}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.muted,
          }}
        >
          <FormattedEntryText text={entry.text} colors={colors} />
          {entry.reference && (
            <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 4 }}>— {entry.reference}</Text>
          )}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 8,
              backgroundColor: categoryColor,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: BORDER_RADIUS.lg,
              alignSelf: 'flex-start',
            }}
            onPress={() => onGenerateSong(entry)}
            activeOpacity={0.8}
          >
            <Ionicons name="musical-notes" size={14} color={colors.absolute.black} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.absolute.black }}>
              {t('reader.generateSong')}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

export function BookDetailScreen({ mode = 'view' }: BookDetailScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const CATEGORY_COLORS = useMemo(() => getCategoryColors(colors), [colors]);
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const user = useAuthStore(selectUser);
  const token = useAuthStore(selectToken);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [cloneModalVisible, setCloneModalVisible] = useState(false);
  const { pickMedia } = useMediaPicker({ aspect: [2, 3], quality: 0.85 });

  const isManageMode = mode === 'manage';

  const viewBookResult = useBookDisplay(isManageMode ? '' : bookId || '');
  const manageBookResult = useManageBook(bookId || '', isManageMode);

  const isLoading = isManageMode ? manageBookResult.isLoading : viewBookResult.isLoading;
  const refetchBook = isManageMode ? manageBookResult.refetch : viewBookResult.refetch;

  const currentCoverUrl = isManageMode
    ? manageBookResult.book?.coverIllustrationUrl
    : viewBookResult.book?.coverIllustrationUrl;
  const hasBookData = isManageMode ? !!manageBookResult.book : !!viewBookResult.book;
  const refetchForPoll = isManageMode ? manageBookResult.refetchBook : viewBookResult.refetch;

  useBookCoverPolling({
    hasBookData,
    currentCoverUrl,
    refetch: refetchForPoll,
  });

  const { data: libraryData } = useMyLibrary();
  const { addToLibrary, removeFromLibrary } = useLibraryMutations();

  const book = useMemo((): BookDisplay | null => {
    if (isManageMode) {
      const mb = manageBookResult.book;
      if (!mb) return null;
      return {
        id: mb.id,
        title: mb.title,
        subtitle: mb.subtitle || undefined,
        coverIllustrationUrl: mb.coverIllustrationUrl || undefined,
        author: mb.author || undefined,
        category: mb.category || 'general',
        description: mb.description || undefined,
        status: mb.status || undefined,
        chapters: manageBookResult.chapters.map(
          (ch): BookDisplayChapter => ({
            id: ch.id,
            title: ch.title,
            description: ch.description || undefined,
            sortOrder: ch.sortOrder,
            entryCount: ch.entryCount || 0,
            entries: [],
          })
        ),
      };
    }

    return viewBookResult.book;
  }, [isManageMode, manageBookResult.book, manageBookResult.chapters, viewBookResult.book]);

  const { generatePDF, printBook, isGenerating, isPrinting } = useBookPDF(book);

  const isOwner = useMemo(() => {
    if (isManageMode) return true;
    const rawBook = viewBookResult.data as { userId?: string } | undefined;
    return !!user?.id && !!rawBook?.userId && rawBook.userId === user.id;
  }, [isManageMode, viewBookResult.data, user?.id]);

  const isSaved = useMemo(() => {
    return libraryData?.some(item => item.bookId === bookId) || false;
  }, [libraryData, bookId]);

  const cloneSourceBook = useMemo((): BookCardData | null => {
    if (!book || isOwner || isManageMode) return null;
    return {
      id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      description: book.description,
      coverIllustrationUrl: book.coverIllustrationUrl,
      author: book.author,
      category: book.category,
      chapterCount: book.chapters?.length ?? 0,
      entryCount: 0,
    };
  }, [book, isOwner, isManageMode]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/v1/app/library/books/${bookId}`, {
        method: 'PATCH',
        data: { status: 'active' },
      });
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_PUBLISHED', bookId });
      refetchBook();
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('librarian.books.publishFailed') || 'Failed to publish book',
        variant: 'destructive',
      });
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchBook();
    setRefreshing(false);
  }, [refetchBook]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleToggleSave = useCallback(() => {
    if (!bookId) return;
    if (isSaved) {
      removeFromLibrary.mutate(bookId, {
        onError: error => Alert.alert('Error', error.message),
      });
    } else {
      addToLibrary.mutate(bookId, {
        onError: error => Alert.alert('Error', error.message),
      });
    }
  }, [bookId, isSaved, addToLibrary, removeFromLibrary]);

  const handleToggleChapter = useCallback((chapterId: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }, []);

  const handleGenerateSong = useCallback(
    (entry: BookDisplayEntry) => {
      const createPath = user?.role === 'librarian' ? '/(librarian)/create' : '/(user)/create';
      router.push({
        pathname: createPath,
        params: {
          sourceEntryId: entry.id,
          sourceText: entry.text,
          sourceReference: entry.reference || '',
          sourceBookTitle: book?.title || '',
        },
      } as Href);
    },
    [router, book?.title, user?.role]
  );

  const handleStartReading = useCallback(() => {
    router.push({
      pathname: '/(library)/book-reader' as const,
      params: { bookId },
    });
  }, [router, bookId]);

  const handlePublish = useCallback(() => {
    Alert.alert(
      t('librarian.books.publishConfirmTitle') || 'Publish Book',
      t('librarian.books.publishConfirmMessage') || 'This will make the book visible to all users. Continue?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: () => publishMutation.mutate() },
      ]
    );
  }, [t, publishMutation]);

  const handleChangeCover = useCallback(async () => {
    if (!bookId || !user?.id) return;
    const result = await pickMedia();
    if (!result) return;

    setIsUploadingCover(true);
    try {
      const uploadResult = await ProfileService.uploadAvatar(result.uri, user.id);
      if (!uploadResult.success || !uploadResult.data?.url) {
        toast({ title: t('common.error'), description: t('bookDetail.coverUploadFailed'), variant: 'destructive' });
        return;
      }

      await apiRequest(`/api/v1/app/library/books/${bookId}/cover`, {
        method: 'PUT',
        data: { url: uploadResult.data.url },
      });

      invalidateOnEvent(queryClient, { type: 'LIBRARY_BOOK_UPDATED', bookId: bookId! });
      await refetchBook();
    } catch {
      toast({ title: t('common.error'), description: t('bookDetail.coverUploadFailed'), variant: 'destructive' });
    } finally {
      setIsUploadingCover(false);
    }
  }, [bookId, user?.id, pickMedia, refetchBook, toast, t, queryClient]);

  const isError = isManageMode ? manageBookResult.isError : viewBookResult.isError;

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError && !book) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.viewHeader}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.errorTitle') || 'Could not load book'}
          description={t('common.networkErrorDesc') || 'Something went wrong. Tap to try again.'}
          action={{
            label: t('common.retry') || 'Retry',
            onPress: () => (isManageMode ? manageBookResult.refetch() : viewBookResult.refetch()),
          }}
        />
      </View>
    );
  }

  if (!book) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.viewHeader}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <EmptyState
          icon="book-outline"
          title={isManageMode ? t('librarian.books.bookNotFound') || 'Book not found' : t('reader.bookNotFound')}
          description={
            isManageMode
              ? t('librarian.books.bookNotFoundDesc') || 'This book may have been deleted'
              : t('reader.bookNotFoundDescription')
          }
        />
      </View>
    );
  }

  const categoryColor = CATEGORY_COLORS[book.category] || colors.brand.primary;

  return (
    <View style={styles.container}>
      {isManageMode ? (
        <View style={[styles.manageHeader, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('librarian.books.manageBook') || 'Manage Book'}
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={printBook} disabled={isPrinting || isGenerating}>
              {isPrinting ? (
                <ActivityIndicator size="small" color={colors.text.secondary} />
              ) : (
                <Ionicons name="print-outline" size={20} color={colors.text.secondary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={generatePDF} disabled={isGenerating || isPrinting}>
              {isGenerating ? (
                <ActivityIndicator size="small" color={colors.text.secondary} />
              ) : (
                <Ionicons name="document-outline" size={20} color={colors.text.secondary} />
              )}
            </TouchableOpacity>
            {book.status !== 'active' && (
              <TouchableOpacity
                onPress={handlePublish}
                style={styles.publishButton}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.absolute.white} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={16} color={colors.absolute.white} />
                    <Text style={styles.publishButtonText}>{t('librarian.books.publish') || 'Publish'}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.viewHeader}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.viewHeaderActions}>
            {cloneSourceBook && (
              <TouchableOpacity style={styles.saveButton} onPress={() => setCloneModalVisible(true)}>
                <Ionicons name="copy-outline" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.saveButton} onPress={printBook} disabled={isPrinting || isGenerating}>
              {isPrinting ? (
                <ActivityIndicator size="small" color={colors.text.primary} />
              ) : (
                <Ionicons name="print-outline" size={22} color={colors.text.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={generatePDF} disabled={isGenerating || isPrinting}>
              {isGenerating ? (
                <ActivityIndicator size="small" color={colors.text.primary} />
              ) : (
                <Ionicons name="document-outline" size={22} color={colors.text.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleToggleSave}
              disabled={addToLibrary.isPending || removeFromLibrary.isPending}
            >
              <Ionicons
                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                size={24}
                color={isSaved ? colors.brand.pink : colors.text.primary}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand.primary} />
        }
      >
        <View style={styles.coverSection}>
          {book.coverIllustrationUrl ? (
            <Image
              source={{ uri: normalizeMediaUrl(book.coverIllustrationUrl) }}
              style={styles.coverView}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
          ) : (
            <Image source={defaultCoverIcon} style={styles.coverView} contentFit="cover" cachePolicy="memory-disk" />
          )}
          <TouchableOpacity style={styles.readOverlay} onPress={handleStartReading} activeOpacity={0.8}>
            <View style={styles.readOverlayIcon}>
              <Ionicons name="book-outline" size={36} color={colors.absolute.white} />
            </View>
          </TouchableOpacity>
          {isOwner && (
            <TouchableOpacity
              style={styles.changeCoverBtn}
              onPress={handleChangeCover}
              disabled={isUploadingCover}
              activeOpacity={0.8}
            >
              {isUploadingCover ? (
                <ActivityIndicator size="small" color={colors.absolute.white} />
              ) : (
                <>
                  <Ionicons name="camera" size={16} color={colors.absolute.white} />
                  <Text style={styles.changeCoverText}>{t('bookDetail.changeCover')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.title}>{book.title}</Text>
          {book.subtitle && <Text style={styles.subtitle}>{book.subtitle}</Text>}
          <View style={styles.authorBadgeRow}>
            {book.author && <Text style={styles.author}>by {book.author}</Text>}
            <View style={styles.badgeGroup}>
              <View style={[styles.badge, { backgroundColor: categoryColor }]}>
                <Text style={styles.badgeText}>{book.category}</Text>
              </View>
              {isManageMode && book.status && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: book.status === 'active' ? colors.semantic.success : colors.text.tertiary },
                  ]}
                >
                  <Text style={styles.badgeText}>{book.status}</Text>
                </View>
              )}
            </View>
          </View>
          {book.description && <Text style={styles.description}>{book.description}</Text>}
        </View>

        <View style={styles.chaptersSection}>
          {book.chapters?.length ? (
            book.chapters
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((chapter, index) => (
                <View key={chapter.id} style={styles.chapterCard}>
                  <TouchableOpacity
                    style={styles.chapterHeader}
                    onPress={() => handleToggleChapter(chapter.id)}
                    activeOpacity={0.7}
                  >
                    {isManageMode ? (
                      <View style={styles.chapterNumberCircle}>
                        <Text style={styles.chapterNumberText}>{index + 1}</Text>
                      </View>
                    ) : (
                      <Text style={styles.chapterNumber}>{chapter.sortOrder}.</Text>
                    )}
                    <View style={styles.chapterInfo}>
                      <Text style={styles.chapterTitle}>{chapter.title}</Text>
                      {isManageMode && (
                        <Text style={styles.chapterMeta}>
                          {chapter.entryCount || 0} {t('librarian.books.entries') || 'entries'}
                        </Text>
                      )}
                    </View>
                    <Ionicons
                      name={expandedChapters.has(chapter.id) ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={colors.text.secondary}
                    />
                  </TouchableOpacity>

                  {expandedChapters.has(chapter.id) && (
                    <View style={styles.entriesContainer}>
                      {chapter.description && <Text style={styles.chapterDescription}>{chapter.description}</Text>}
                      {isManageMode ? (
                        <ManageChapterEntries
                          chapterId={chapter.id}
                          categoryColor={categoryColor}
                          onGenerateSong={handleGenerateSong}
                        />
                      ) : chapter.entries?.length ? (
                        chapter.entries
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map(entry => (
                            <View key={entry.id} style={styles.entryCard}>
                              <FormattedEntryText text={entry.text} colors={colors} />
                              {entry.reference && <Text style={styles.entryReference}>— {entry.reference}</Text>}
                              <TouchableOpacity
                                style={[styles.generateButton, { backgroundColor: categoryColor }]}
                                onPress={() => handleGenerateSong(entry)}
                                activeOpacity={0.8}
                              >
                                <Ionicons name="musical-notes" size={16} color={colors.absolute.black} />
                                <Text style={styles.generateButtonText}>{t('reader.generateSong')}</Text>
                              </TouchableOpacity>
                            </View>
                          ))
                      ) : (
                        <Text style={styles.noEntries}>{t('reader.noEntries')}</Text>
                      )}
                    </View>
                  )}
                </View>
              ))
          ) : (
            <Text style={styles.noChapters}>{t('reader.noChapters')}</Text>
          )}
        </View>
      </ScrollView>

      {cloneModalVisible && cloneSourceBook && (
        <CloneBookModal
          visible={cloneModalVisible}
          onClose={() => setCloneModalVisible(false)}
          sourceBook={cloneSourceBook}
        />
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    viewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 16,
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: Z_INDEX.dropdown,
    },
    viewHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    manageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    backButton: {
      padding: 8,
      backgroundColor: colors.overlay.black[30],
      borderRadius: 20,
    },
    saveButton: {
      padding: 8,
      backgroundColor: colors.overlay.black[30],
      borderRadius: 20,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginLeft: 12,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerIconBtn: {
      padding: 6,
      borderRadius: 8,
    },
    publishButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.semantic.success,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.sm,
    },
    publishButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 100,
    },
    coverSection: {
      height: 280,
      width: '100%',
    },
    coverView: {
      width: '100%',
      height: '100%',
    },
    readOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: Z_INDEX.base,
    },
    readOverlayIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.overlay.black[50],
      justifyContent: 'center',
      alignItems: 'center',
    },
    changeCoverBtn: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.overlay.black[60],
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      zIndex: Z_INDEX.dropdown,
    },
    changeCoverText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    infoSection: {
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 16,
      color: colors.text.secondary,
      marginBottom: 8,
    },
    authorBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 8,
    },
    author: {
      fontSize: 14,
      color: colors.brand.primary,
      flexShrink: 1,
    },
    badgeGroup: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 6,
    },
    badge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.darkCard,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.absolute.white,
      textTransform: 'capitalize',
    },
    description: {
      fontSize: 14,
      color: colors.text.secondary,
      lineHeight: 22,
    },
    chaptersSection: {
      padding: 20,
      paddingTop: 0,
    },
    chapterCard: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 6,
      overflow: 'hidden',
    },
    chapterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      gap: 12,
    },
    chapterNumber: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.brand.primary,
      marginRight: 8,
      width: 24,
    },
    chapterNumberCircle: {
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    chapterNumberText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.absolute.white,
    },
    chapterInfo: {
      flex: 1,
    },
    chapterTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
    },
    chapterMeta: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    entriesContainer: {
      padding: 16,
      paddingTop: 0,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    chapterDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    entryCard: {
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.sm,
      padding: 16,
      marginBottom: 12,
    },
    entryReference: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginBottom: 12,
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 20,
      gap: 8,
      alignSelf: 'flex-start',
    },
    generateButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.dark,
    },
    noEntries: {
      fontSize: 14,
      color: colors.text.tertiary,
      fontStyle: 'italic',
    },
    noChapters: {
      fontSize: 14,
      color: colors.text.tertiary,
      fontStyle: 'italic',
      textAlign: 'center',
      padding: 20,
    },
  });
