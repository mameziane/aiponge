import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { useTranslation } from '../../../i18n';
import { LiquidGlassCard } from '../../../components/ui';

interface MusicPlayerCardProps {
  generatedLyrics: string | null;
  generatedTrack: {
    id: string;
    title?: string | null;
    audioUrl?: string;
    artworkUrl?: string | null;
    lyricsId?: string;
    hasSyncedLyrics?: boolean;
  } | null;
  isGeneratingSong: boolean;
  songGenerationProgress: number;
  currentTrackId: string | undefined;
  isPlaying: boolean;
  onPlay: (track: {
    id: string;
    audioUrl?: string;
    title?: string | null;
    artworkUrl?: string | null;
    lyricsId?: string;
    hasSyncedLyrics?: boolean;
  }) => void;
}

export function MusicPlayerCard({
  generatedLyrics,
  generatedTrack,
  isGeneratingSong,
  songGenerationProgress,
  currentTrackId,
  isPlaying,
  onPlay,
}: MusicPlayerCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  if (!generatedLyrics || !generatedTrack) return null;

  const showProgress = songGenerationProgress > 0 && songGenerationProgress < 100;
  const isTrackPlaying = generatedTrack.id && currentTrackId === generatedTrack.id && isPlaying;

  return (
    <View style={styles.container}>
      <LiquidGlassCard intensity="medium" padding={12}>
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isTrackPlaying && styles.trackTitleActive]}>
            {generatedTrack.title || t('create.generatedSong')}
          </Text>
          <Text style={styles.trackArtist}>{t('create.aiGenerated')}</Text>
          {isGeneratingSong || showProgress ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.brand.primary} />
              <Text style={styles.loadingText}>{t('create.generatingSong')}</Text>
            </View>
          ) : generatedTrack.audioUrl ? (
            <TouchableOpacity
              style={[styles.playButton, isTrackPlaying && styles.playButtonActive]}
              onPress={() => onPlay(generatedTrack)}
              testID="button-play"
            >
              <Ionicons
                name={isTrackPlaying ? 'pause' : 'play'}
                size={20}
                color={colors.text.primary}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.playButtonText}>{isTrackPlaying ? t('create.pause') : t('create.play')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.brand.primary} />
              <Text style={styles.loadingText}>{t('create.preparingAudio')}</Text>
            </View>
          )}
        </View>
      </LiquidGlassCard>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: spacing.screenHorizontal,
      paddingVertical: 2,
      backgroundColor: colors.background.primary,
    },
    trackInfo: {
      alignItems: 'center',
    },
    trackTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    trackTitleActive: {
      color: colors.brand.primary,
    },
    trackArtist: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 16,
    },
    playButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.sm,
    },
    playButtonActive: {
      backgroundColor: colors.brand.primary + '80',
    },
    playButtonText: {
      color: colors.text.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    loadingText: {
      marginLeft: 8,
      fontSize: 14,
      color: colors.brand.primary,
    },
  });
