import { View, ScrollView, StyleSheet, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { useThemeColors, commonStyles, BORDER_RADIUS, type ColorScheme } from '../../theme';
import { fontFamilies } from '../../theme/typography';
import { useTranslation } from '../../i18n';
import {
  BatchAlbumCreationModal,
  type BatchAlbumGenerationParams,
} from '../../components/music/MusicGeneration/BatchAlbumCreationModal';
import { LiquidGlassCard } from '../../components/ui';
import { LoadingState } from '../../components/shared/LoadingState';
import { LibrarianSubTabBar } from '../../components/admin/LibrarianDashboard/LibrarianSubTabBar';
import { LibrarianPlaylistsSection } from '../../components/admin/LibrarianDashboard/LibrarianPlaylistsSection';
import { useCredits } from '../../hooks/commerce/useCredits';
import { useAlbumGenerationStore } from '../../stores';
import { apiRequest } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { useToast } from '../../hooks/ui/use-toast';
import { DraftAlbumCard, useDraftAlbumShared } from '../../components/playlists/DraftAlbumCard';
import type { Entry, Book } from '../../types/profile.types';
import { useBooksUnified } from '../../hooks/book/useUnifiedLibrary';

const DELAY_BETWEEN_SUBMISSIONS_MS = 15000;
const MAX_TRACKS_PER_ALBUM = 20;

type StudioSubTab = 'generate' | 'playlists';

interface LibrarianMusicScreenProps {
  externalCreateTrigger?: number;
  isLibrarian?: boolean;
}

export default function LibrarianMusicScreen({
  externalCreateTrigger,
  isLibrarian: isLibrarianProp = true,
}: LibrarianMusicScreenProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeTab, setActiveTab] = useState<StudioSubTab>('generate');

  const { balance, loading: creditsLoading, policy } = useCredits();
  const { startGeneration } = useAlbumGenerationStore();
  const { draftAlbums, hasDraftAlbum } = useDraftAlbumShared();
  const { books, loading: booksLoading } = useBooksUnified({});

  const subTabs = useMemo(
    () => [
      { id: 'generate', label: t('librarian.studio.subtabs.generate') || 'Generate' },
      { id: 'playlists', label: t('librarian.studio.subtabs.playlists') || 'Playlists' },
    ],
    [t]
  );

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId as StudioSubTab);
  }, []);

  useEffect(() => {
    if (externalCreateTrigger && externalCreateTrigger > 0 && books.length > 0) {
      setActiveTab('generate');
      handleSelectBook(books[0]);
    }
  }, [externalCreateTrigger, books]);

  const handleSelectBook = useCallback((book: Book) => {
    setSelectedBook(book);
    setShowBatchModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowBatchModal(false);
    setSelectedBook(null);
  }, []);

  const handleGenerateBatch = useCallback(
    async (params: BatchAlbumGenerationParams) => {
      const languageCount = params.targetLanguages.length;
      const totalEntriesCount = params.chapters.reduce((sum, ch) => sum + ch.entries.length, 0);
      const creditCostPerSong = policy?.musicGeneration?.costPerSong;
      if (!creditCostPerSong) {
        throw new Error('Credit policy not loaded — cannot determine cost per song');
      }
      const totalCreditsNeeded = totalEntriesCount * languageCount * creditCostPerSong;

      let entryOrder = 0;
      const orderedEntries = params.chapters.flatMap(chapterData =>
        chapterData.entries
          .filter((entry: Entry) => entry.content && entry.content.trim().length > 0)
          .map((entry: Entry) => {
            entryOrder++;
            return {
              entryId: entry.id,
              content: entry.content,
              order: entryOrder,
            };
          })
      );

      if (orderedEntries.length === 0) {
        toast({
          title: t('create.allEntriesEmpty'),
          description: t('create.allEntriesEmptyDescription'),
          variant: 'destructive',
        });
        return;
      }

      const entryChunks: (typeof orderedEntries)[] = [];
      for (let i = 0; i < orderedEntries.length; i += MAX_TRACKS_PER_ALBUM) {
        entryChunks.push(orderedEntries.slice(i, i + MAX_TRACKS_PER_ALBUM));
      }

      const totalAlbums = languageCount * entryChunks.length;

      logger.info('Librarian batch generation starting', {
        totalEntriesCount,
        languageCount,
        totalCreditsNeeded,
        currentBalance: balance?.currentBalance,
        chaptersCount: params.chapters.length,
        totalAlbums,
        chunksPerLanguage: entryChunks.length,
      });

      setShowBatchModal(false);
      setSelectedBook(null);
      setIsGeneratingBatch(true);
      setBatchProgress({ current: 0, total: totalAlbums });

      let successCount = 0;
      let albumIndex = 0;
      const multipleLanguages = params.targetLanguages.length > 1;
      const multipleChunks = entryChunks.length > 1;

      for (let langIdx = 0; langIdx < params.targetLanguages.length; langIdx++) {
        const targetLang = params.targetLanguages[langIdx];
        const langSuffix = multipleLanguages ? ` [${targetLang.toUpperCase()}]` : '';

        for (let chunkIdx = 0; chunkIdx < entryChunks.length; chunkIdx++) {
          albumIndex++;
          setBatchProgress({ current: albumIndex, total: totalAlbums });
          const chunk = entryChunks[chunkIdx];
          const partSuffix = multipleChunks ? ` (${chunkIdx + 1}/${entryChunks.length})` : '';

          try {
            logger.debug('Generating album for book', {
              bookId: params.bookId,
              bookTitle: params.bookTitle,
              targetLang,
              entriesCount: chunk.length,
              chunkIndex: chunkIdx,
              totalChunks: entryChunks.length,
            });

            const response = await apiRequest('/api/v1/app/music/generate-album-async', {
              method: 'POST',
              timeout: 180000,
              data: {
                bookId: params.bookId,
                bookTitle: params.bookTitle + partSuffix + langSuffix,
                bookType: params.bookType || null,
                bookDescription: params.bookDescription || null,
                entries: chunk,
                quality: 'standard',
                style: Array.isArray(params.preferences.musicStyles)
                  ? params.preferences.musicStyles.length > 0
                    ? params.preferences.musicStyles.join(', ')
                    : null
                  : params.preferences.musicStyles?.trim() || null,
                genre: params.preferences.genre?.trim() || null,
                mood: params.preferences.mood?.trim() || null,
                language: targetLang,
                culturalLanguages:
                  params.preferences.culturalLanguages?.length > 0 ? params.preferences.culturalLanguages : null,
                instrumentType:
                  params.preferences.instruments?.length > 0 ? params.preferences.instruments.join(', ') : null,
                negativeTags: params.negativeTags?.trim() || null,
                vocalGender:
                  params.preferences.vocalGender === 'f' || params.preferences.vocalGender === 'm'
                    ? params.preferences.vocalGender
                    : null,
                styleWeight: params.styleWeight,
                targetLanguages: [targetLang],
              },
            });

            const result = response as {
              success?: boolean;
              data?: {
                albumRequestId?: string;
                albumId?: string;
                albumTitle?: string;
              };
              albumRequestId?: string;
              albumId?: string;
              albumTitle?: string;
            };

            const data = result?.data || result;
            const albumRequestId = data?.albumRequestId;
            const albumId = data?.albumId;
            const albumTitle = data?.albumTitle;

            if (albumRequestId) {
              startGeneration(albumRequestId, { albumId, albumTitle, visibility: CONTENT_VISIBILITY.SHARED });
              successCount++;
              logger.info('Album generation started', {
                albumRequestId,
                albumId,
                albumTitle,
                targetLang,
                bookTitle: params.bookTitle,
                part: chunkIdx + 1,
                totalParts: entryChunks.length,
              });
            }

            if (albumIndex < totalAlbums) {
              await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SUBMISSIONS_MS));
            }
          } catch (error) {
            logger.error('Batch album generation error', {
              bookId: params.bookId,
              bookTitle: params.bookTitle,
              targetLang,
              chunkIndex: chunkIdx,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      setIsGeneratingBatch(false);
      setBatchProgress(null);

      if (successCount === 0) {
        toast({
          title: t('librarian.music.batchFailed'),
          description: t('librarian.music.batchFailedDesc'),
          variant: 'destructive',
        });
      }
    },
    [balance?.currentBalance, policy?.musicGeneration?.costPerSong, startGeneration, t, toast]
  );

  return (
    <View style={styles.container}>
      <LibrarianSubTabBar tabs={subTabs} activeTab={activeTab} onTabChange={handleTabChange} />

      {activeTab === 'playlists' ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <LibrarianPlaylistsSection />
        </ScrollView>
      ) : (
        <>
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {isGeneratingBatch && batchProgress && (
              <LiquidGlassCard intensity="medium" padding={16}>
                <View style={styles.progressContainer}>
                  <ActivityIndicator size="small" color={colors.brand.primary} />
                  <Text style={styles.progressText}>
                    {t('librarian.music.generatingProgress', {
                      current: batchProgress.current,
                      total: batchProgress.total,
                    })}
                  </Text>
                </View>
              </LiquidGlassCard>
            )}

            {hasDraftAlbum && (
              <LiquidGlassCard intensity="medium" padding={16}>
                <View style={styles.draftHeader}>
                  <Ionicons name="sync-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.draftTitle}>{t('librarian.music.generatingAlbums') || 'Generating Albums'}</Text>
                </View>
                <View style={styles.draftGrid}>
                  {draftAlbums.map(draft => (
                    <DraftAlbumCard
                      key={draft.id}
                      generation={draft}
                      testID={`librarian-draft-album-${draft.id}`}
                      flexible
                    />
                  ))}
                </View>
              </LiquidGlassCard>
            )}

            <View style={styles.bookListSection}>
              <Text style={styles.bookListTitle}>{t('create.selectJournal')}</Text>
              <Text style={styles.bookListSubtitle}>{t('create.batchAlbumDescription')}</Text>
              {booksLoading ? (
                <LoadingState fullScreen={false} />
              ) : books.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="book-outline" size={48} color={colors.text.tertiary} />
                  <Text style={styles.emptyText}>{t('create.noJournalsFound')}</Text>
                </View>
              ) : (
                books.map((book: Book) => (
                  <TouchableOpacity key={book.id} style={styles.bookItem} onPress={() => handleSelectBook(book)}>
                    <View style={styles.bookItemContent}>
                      <Ionicons name="book-outline" size={22} color={colors.brand.primary} />
                      <View style={styles.bookItemText}>
                        <Text style={styles.bookItemTitle}>{book.title}</Text>
                        {book.description && (
                          <Text style={styles.bookItemSubtitle} numberOfLines={1}>
                            {book.description}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>

          <BatchAlbumCreationModal
            visible={showBatchModal}
            onClose={handleCloseModal}
            isLibrarian={isLibrarianProp}
            currentBalance={balance?.currentBalance ?? 0}
            creditsLoading={creditsLoading}
            creditCostPerSong={policy?.musicGeneration?.costPerSong ?? null}
            onGenerateBatch={handleGenerateBatch}
            isGeneratingBatch={isGeneratingBatch}
            preSelectedBook={selectedBook}
          />
        </>
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
    content: commonStyles.flexOne,
    contentContainer: {
      padding: 16,
      paddingBottom: 100,
      gap: 16,
    },
    progressContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    progressText: {
      fontSize: 14,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.primary,
    },
    draftHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    draftTitle: {
      fontSize: 16,
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.primary,
    },
    draftGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    emptyContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingTop: 40,
      gap: 12,
    },
    emptyText: {
      fontSize: 15,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    bookListSection: {
      gap: 8,
    },
    bookListTitle: {
      fontSize: 18,
      fontWeight: '700',
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.primary,
    },
    bookListSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 8,
    },
    bookItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
    },
    bookItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    bookItemText: {
      flex: 1,
    },
    bookItemTitle: {
      fontSize: 16,
      fontWeight: '600',
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.primary,
    },
    bookItemSubtitle: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 2,
    },
  });
