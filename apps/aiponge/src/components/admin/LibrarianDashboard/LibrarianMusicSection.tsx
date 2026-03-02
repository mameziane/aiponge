import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { fontFamilies } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import {
  BatchAlbumCreationModal,
  type BatchAlbumGenerationParams,
} from '../../music/MusicGeneration/BatchAlbumCreationModal';
import { LiquidGlassCard } from '../../ui';
import { useCredits } from '@/hooks/commerce/useCredits';
import { useAlbumGenerationStore } from '@/stores';
import { apiRequest } from '@/lib/axiosApiClient';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/ui/use-toast';
import { DraftAlbumCard, useDraftAlbumShared } from '../../playlists/DraftAlbumCard';
import type { Entry } from '@/types/profile.types';

const DELAY_BETWEEN_SUBMISSIONS_MS = 1000;
const MAX_TRACKS_PER_ALBUM = 20;

interface LibrarianMusicSectionProps {
  externalCreateTrigger?: number;
}

export function LibrarianMusicSection({ externalCreateTrigger }: LibrarianMusicSectionProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  const { balance, loading: creditsLoading, policy } = useCredits();
  const { startGeneration } = useAlbumGenerationStore();
  const { draftAlbums, hasDraftAlbum } = useDraftAlbumShared();

  useEffect(() => {
    if (externalCreateTrigger && externalCreateTrigger > 0) {
      setShowBatchModal(true);
    }
  }, [externalCreateTrigger]);

  const handleGenerateBatch = useCallback(
    async (params: BatchAlbumGenerationParams) => {
      const languageCount = params.targetLanguages.length;
      const totalEntriesCount = params.chapters.reduce((sum, ch) => sum + ch.entries.length, 0);
      const creditCostPerSong = policy?.musicGeneration?.costPerSong;
      if (!creditCostPerSong) {
        throw new Error('Credit policy not loaded — cannot determine cost per song');
      }
      const totalCreditsNeeded = totalEntriesCount * languageCount * creditCostPerSong;
      const chapterChunks: {
        chapterData: (typeof params.chapters)[0];
        chunk: { entryId: string; content: string; order: number }[];
        chunkIdx: number;
        totalChunks: number;
      }[] = [];
      for (const chapterData of params.chapters) {
        const allEntries = chapterData.entries
          .filter((entry: Entry) => entry.content && entry.content.trim().length > 0)
          .map((entry: Entry, index: number) => ({
            entryId: entry.id,
            content: entry.content,
            order: index + 1,
          }));
        const chunks: (typeof allEntries)[] = [];
        for (let i = 0; i < allEntries.length; i += MAX_TRACKS_PER_ALBUM) {
          chunks.push(allEntries.slice(i, i + MAX_TRACKS_PER_ALBUM));
        }
        chunks.forEach((chunk, idx) => {
          chapterChunks.push({ chapterData, chunk, chunkIdx: idx, totalChunks: chunks.length });
        });
      }

      const totalAlbums = chapterChunks.length * languageCount;

      logger.info('Librarian batch generation starting', {
        totalEntriesCount,
        languageCount,
        totalCreditsNeeded,
        currentBalance: balance?.currentBalance,
        chaptersCount: params.chapters.length,
        totalAlbums,
      });

      setShowBatchModal(false);
      setIsGeneratingBatch(true);
      setBatchProgress({ current: 0, total: totalAlbums });

      let successCount = 0;
      let albumIndex = 0;
      for (const { chapterData, chunk, chunkIdx, totalChunks } of chapterChunks) {
        const partSuffix = totalChunks > 1 ? ` (${chunkIdx + 1}/${totalChunks})` : '';

        for (let langIdx = 0; langIdx < params.targetLanguages.length; langIdx++) {
          const targetLang = params.targetLanguages[langIdx];
          albumIndex++;
          setBatchProgress({ current: albumIndex, total: totalAlbums });

          try {
            logger.debug('Generating album for chapter', {
              chapterId: chapterData.chapter.id,
              chapterTitle: chapterData.chapter.title,
              targetLang,
              entriesCount: chunk.length,
              chunkIndex: chunkIdx,
              totalChunks,
            });

            const response = await apiRequest('/api/v1/app/music/generate-album-async', {
              method: 'POST',
              timeout: 180000,
              data: {
                chapterId: chapterData.chapter.id,
                chapterTitle: chapterData.chapter.title + partSuffix,
                bookId: chapterData.chapter.bookId || 'unknown',
                bookTitle: 'Book',
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
                language: params.preferences.culturalLanguages?.[0]?.trim() || null,
                languages:
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
                chapterTitle: chapterData.chapter.title,
                part: chunkIdx + 1,
                totalParts: totalChunks,
              });
            }

            if (albumIndex < totalAlbums) {
              await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SUBMISSIONS_MS));
            }
          } catch (error) {
            logger.error('Batch album generation error', {
              chapterId: chapterData.chapter.id,
              chapterTitle: chapterData.chapter.title,
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
      <LiquidGlassCard intensity="medium" padding={20}>
        <View style={styles.header}>
          <Ionicons name="musical-notes" size={24} color={colors.brand.primary} />
          <Text style={styles.title}>{t('librarian.music.title')}</Text>
        </View>
        <Text style={styles.description}>{t('librarian.music.description')}</Text>

        {isGeneratingBatch && batchProgress && (
          <View style={styles.progressContainer}>
            <ActivityIndicator size="small" color={colors.brand.primary} />
            <Text style={styles.progressText}>
              {t('librarian.music.generatingProgress', {
                current: batchProgress.current,
                total: batchProgress.total,
              })}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowBatchModal(true)}
            disabled={isGeneratingBatch}
          >
            <Ionicons name="albums-outline" size={20} color={colors.text.primary} />
            <Text style={styles.actionText}>{t('librarian.music.createAlbum')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowBatchModal(true)}
            disabled={isGeneratingBatch}
          >
            <Ionicons name="musical-note-outline" size={20} color={colors.text.primary} />
            <Text style={styles.actionText}>{t('librarian.music.createTrack')}</Text>
          </TouchableOpacity>
        </View>
      </LiquidGlassCard>

      {hasDraftAlbum && (
        <LiquidGlassCard intensity="medium" padding={16}>
          <View style={styles.draftHeader}>
            <Ionicons name="sync-outline" size={20} color={colors.brand.primary} />
            <Text style={styles.draftTitle}>{t('librarian.music.generatingAlbums') || 'Generating Albums'}</Text>
          </View>
          <View style={styles.draftGrid}>
            {draftAlbums.map(draft => (
              <DraftAlbumCard key={draft.id} generation={draft} testID={`librarian-draft-album-${draft.id}`} flexible />
            ))}
          </View>
        </LiquidGlassCard>
      )}

      <LiquidGlassCard intensity="light" padding={16} style={styles.tipsCard}>
        <View style={styles.tipHeader}>
          <Ionicons name="bulb-outline" size={18} color={colors.brand.secondary} />
          <Text style={styles.tipTitle}>{t('librarian.music.tipsTitle')}</Text>
        </View>
        <Text style={styles.tipText}>{t('librarian.music.tip1')}</Text>
        <Text style={styles.tipText}>{t('librarian.music.tip2')}</Text>
        <Text style={styles.tipText}>{t('librarian.music.tip3')}</Text>
      </LiquidGlassCard>

      <BatchAlbumCreationModal
        visible={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        isLibrarian={true}
        currentBalance={balance?.currentBalance ?? 0}
        creditsLoading={creditsLoading}
        creditCostPerSong={policy?.musicGeneration?.costPerSong ?? null}
        onGenerateBatch={handleGenerateBatch}
        isGeneratingBatch={isGeneratingBatch}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      gap: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    title: {
      fontSize: 20,
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    description: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
      marginBottom: 16,
    },
    progressContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
      padding: 12,
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.sm,
    },
    progressText: {
      fontSize: 14,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.primary,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 12,
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.sm,
    },
    actionButtonDisabled: {
      opacity: 0.5,
    },
    actionText: {
      fontSize: 12,
      fontFamily: fontFamilies.body.medium,
      color: colors.text.primary,
    },
    tipsCard: {
      marginTop: 8,
    },
    tipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    tipTitle: {
      fontSize: 14,
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.primary,
    },
    tipText: {
      fontSize: 13,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.secondary,
      marginBottom: 6,
      paddingLeft: 26,
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
  });
