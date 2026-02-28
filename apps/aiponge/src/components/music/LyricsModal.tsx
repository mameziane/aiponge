import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';
import { logError, getTranslatedFriendlyMessage } from '../../utils/errorSerialization';
import { useThemeColors, BORDER_RADIUS, type ColorScheme } from '../../theme';
import { fontFamilies } from '../../theme/typography';
import { SyncedLyricsDisplay } from './SyncedLyricsDisplay';
import { KaraokeLyricsDisplay } from './KaraokeLyricsDisplay';
import { useTranslation } from '../../i18n';
import { BaseModal, LoadingState } from '../shared';

interface LyricsModalProps {
  visible: boolean;
  onClose: () => void;
  lyricsId?: string;
  trackTitle?: string;
}

interface SyncedWord {
  word: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

interface SyncedLine {
  startTime: number;
  endTime: number;
  text: string;
  type?: 'line' | 'section' | 'backing' | 'instrumental';
  words?: SyncedWord[];
}

function hasWordLevelData(syncedLines?: SyncedLine[]): boolean {
  if (!syncedLines || syncedLines.length === 0) return false;
  return syncedLines.some(line => line.words && line.words.length > 0);
}

interface LyricsData {
  id: string;
  content: string;
  syncedLines?: SyncedLine[];
  title?: string;
  style?: string;
  mood?: string;
  themes?: string[];
}

function filterSectionHeaders(content: string): string {
  return content
    .split('\n')
    .map(line => line.replace(/\[.*?\]/g, '').trim())
    .filter(line => line.length > 0)
    .join('\n');
}

export function LyricsModal({ visible, onClose, lyricsId, trackTitle }: LyricsModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    data: lyrics,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['/api/v1/app/lyrics', lyricsId],
    queryFn: async () => {
      const response = await apiRequest<{ data: LyricsData }>(`/api/v1/app/lyrics/id/${lyricsId}`);
      if (response?.data) {
        return response.data;
      }
      throw new Error(t('components.lyricsModal.lyricsNotFound'));
    },
    enabled: visible && !!lyricsId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const error = useMemo(() => {
    if (!queryError) return null;
    const serialized = logError(queryError, 'Fetch Lyrics', lyricsId);
    return getTranslatedFriendlyMessage(serialized, t);
  }, [queryError, lyricsId, t]);

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={lyrics?.title || trackTitle || 'Lyrics'}
      testID="lyrics-modal"
      closeTestID="button-close-lyrics"
      headerIcon="musical-note"
      headerIconColor={colors.brand.primary}
      maxHeight="85%"
    >
      {isLoading ? (
        <LoadingState fullScreen={false} message={t('components.lyricsModal.loadingLyrics')} />
      ) : error ? (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={48} color={colors.semantic.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : lyrics ? (
        <>
          {(lyrics.style || lyrics.mood) && (
            <View style={styles.metadata}>
              {lyrics.style && (
                <View style={styles.metadataItem}>
                  <Text style={styles.metadataLabel}>{t('components.lyricsModal.style')}</Text>
                  <Text style={styles.metadataValue}>{lyrics.style}</Text>
                </View>
              )}
              {lyrics.mood && (
                <View style={styles.metadataItem}>
                  <Text style={styles.metadataLabel}>{t('components.lyricsModal.mood')}</Text>
                  <Text style={styles.metadataValue}>{lyrics.mood}</Text>
                </View>
              )}
            </View>
          )}

          {lyrics.syncedLines && lyrics.syncedLines.length > 0 ? (
            hasWordLevelData(lyrics.syncedLines) ? (
              <KaraokeLyricsDisplay
                syncedLines={lyrics.syncedLines}
                variant="modal"
                containerStyle={styles.syncedLyricsWrapper}
                showTimingBadge={true}
                timingMethod="whisper-audio-analysis"
              />
            ) : (
              <SyncedLyricsDisplay
                syncedLines={lyrics.syncedLines}
                variant="modal"
                containerStyle={styles.syncedLyricsWrapper}
              />
            )
          ) : (
            <Text style={styles.lyricsText}>{filterSectionHeaders(lyrics.content)}</Text>
          )}

          {lyrics.themes && lyrics.themes.length > 0 && (
            <View style={styles.themesContainer}>
              <Text style={styles.themesLabel}>{t('components.lyricsModal.themes')}</Text>
              <View style={styles.themesList}>
                {lyrics.themes.map((theme, index) => (
                  <View key={index} style={styles.themeTag}>
                    <Text style={styles.themeText}>{theme}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      ) : (
        <View style={styles.centerContainer}>
          <Ionicons name="document-text-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.noLyricsText}>{t('components.lyricsModal.noLyricsAvailable')}</Text>
        </View>
      )}
    </BaseModal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    centerContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    errorText: {
      color: colors.semantic.error,
      fontSize: 16,
      marginTop: 12,
      textAlign: 'center',
    },
    noLyricsText: {
      color: colors.text.tertiary,
      fontSize: 16,
      marginTop: 12,
    },
    metadata: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 20,
      gap: 16,
    },
    metadataItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metadataLabel: {
      color: colors.text.secondary,
      fontSize: 14,
      fontWeight: '500',
      marginRight: 6,
    },
    metadataValue: {
      color: colors.brand.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    lyricsText: {
      color: colors.text.primary,
      fontSize: 16,
      lineHeight: 28,
      fontFamily: fontFamilies.mono.regular,
    },
    syncedLyricsWrapper: {
      flex: 1,
      minHeight: 200,
    },
    themesContainer: {
      marginTop: 24,
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    themesLabel: {
      color: colors.text.secondary,
      fontSize: 14,
      fontWeight: '500',
      marginBottom: 12,
    },
    themesList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    themeTag: {
      backgroundColor: colors.background.subtle,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    themeText: {
      color: colors.brand.secondary,
      fontSize: 12,
      fontWeight: '500',
    },
  });
