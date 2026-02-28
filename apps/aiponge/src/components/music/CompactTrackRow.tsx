/**
 * CompactTrackRow - Compact track row for dense lists
 *
 * @description Space-efficient track row with smaller artwork (48x48 in compact mode).
 * Supports play count display. Used in recommendation lists and music home screen.
 *
 * @see TrackItem - Standard version for library lists
 * @see TrackComponents - Shared utilities (PlayingOverlay, LikeButton, etc.)
 *
 * @example
 * <CompactTrackRow
 *   id={track.id}
 *   title={track.title}
 *   displayName={track.displayName}
 *   isPlaying={isPlaying}
 *   onPress={() => playTrack(track)}
 *   variant="compact"
 * />
 */
import { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '../../theme';
import { AnimatedWaveform } from './AnimatedWaveform';
import { ArtworkImage } from './ArtworkImage';
import { TrackOptionsMenu } from './TrackOptionsMenu';
import {
  formatPlayCount,
  useTrackOptionsMenu,
  PlayingOverlay,
  LikeButton,
  MoreOptionsButton,
} from '../shared/TrackComponents';

interface CompactTrackRowProps {
  id: string;
  title: string;
  displayName: string;
  artworkUrl?: string;
  audioUrl?: string;
  duration: number;
  playCount?: number;
  isPlaying?: boolean;
  isFavorite?: boolean;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
  isUserGenerated?: boolean;
  playOnDate?: string | null;
  onPress: () => void;
  onLongPress?: () => void;
  onToggleFavorite?: () => void;
  onShowLyrics?: () => void;
  onRemoveFromLibrary?: () => void;
  onTrackUpdated?: () => void;
  showEditOption?: boolean;
  testID?: string;
  variant?: 'default' | 'compact';
}

export const CompactTrackRow = memo(function CompactTrackRow({
  id,
  title,
  displayName,
  artworkUrl,
  audioUrl,
  duration,
  playCount,
  isPlaying,
  isFavorite = false,
  lyricsId,
  hasSyncedLyrics,
  isUserGenerated,
  playOnDate,
  onPress,
  onLongPress,
  onToggleFavorite,
  onShowLyrics,
  onRemoveFromLibrary,
  onTrackUpdated,
  showEditOption = false,
  testID,
  variant = 'default',
}: CompactTrackRowProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { showOptionsMenu, closeOptionsMenu, trackForMenu, handleMorePress } = useTrackOptionsMenu({
    id,
    title,
    displayName,
    artworkUrl,
    audioUrl,
    duration,
    lyricsId,
    hasSyncedLyrics,
    isUserGenerated,
    playOnDate,
  });

  const isCompact = variant === 'compact';

  return (
    <>
      <TouchableOpacity
        style={[styles.container, isCompact && styles.containerCompact, isPlaying && styles.containerActive]}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
        testID={testID || `compact-track-${id}`}
      >
        <ArtworkImage
          uri={artworkUrl}
          size={48}
          borderRadius={4}
          testID={`artwork-${id}`}
          placeholderTestId={`artwork-placeholder-${id}`}
          wrapperStyle={
            isPlaying ? { ...styles.artworkWrapper, ...styles.artworkWrapperPlaying } : styles.artworkWrapper
          }
          fallbackIcon={<Ionicons name="musical-note" size={16} color={colors.brand.primary} />}
        >
          {isPlaying && <PlayingOverlay size="small" />}
        </ArtworkImage>

        <View style={styles.infoContainer}>
          <Text style={[styles.title, isPlaying && styles.titleActive]} numberOfLines={1}>
            {title}
          </Text>

          {isCompact ? (
            <View style={styles.compactMetaRow}>
              <Text style={styles.displayNameText} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={styles.compactActions}>
                {isPlaying && (
                  <View style={styles.compactNowPlayingIndicator}>
                    <AnimatedWaveform size="small" color={colors.brand.primary} />
                  </View>
                )}
                <MoreOptionsButton
                  onPress={handleMorePress}
                  testID={`button-more-${id}`}
                  size={16}
                  style={styles.moreButtonCompact}
                />
              </View>
            </View>
          ) : (
            <Text style={styles.displayNameText} numberOfLines={1}>
              {displayName}
            </Text>
          )}
        </View>

        {!isCompact && (
          <>
            <View style={styles.playCountContainer}>
              {playCount !== undefined && playCount > 0 ? (
                <Text style={styles.playCount} testID={`play-count-${id}`}>
                  {formatPlayCount(playCount)} {t('components.track.plays', { count: playCount })}
                </Text>
              ) : null}
            </View>

            {isPlaying && (
              <View style={styles.nowPlayingIndicator}>
                <AnimatedWaveform size="small" color={colors.brand.primary} />
              </View>
            )}

            {onToggleFavorite && (
              <LikeButton
                isLiked={isFavorite}
                onToggle={onToggleFavorite}
                testID={`button-like-${id}`}
                style={styles.likeButton}
              />
            )}

            <MoreOptionsButton onPress={handleMorePress} testID={`button-more-${id}`} style={styles.moreButton} />
          </>
        )}
      </TouchableOpacity>

      <TrackOptionsMenu
        visible={showOptionsMenu}
        onClose={closeOptionsMenu}
        track={trackForMenu}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onShowLyrics={onShowLyrics}
        onRemoveFromLibrary={onRemoveFromLibrary}
        onTrackUpdated={onTrackUpdated}
        showEditOption={showEditOption}
      />
    </>
  );
});

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: 'transparent',
    },
    containerCompact: {
      paddingHorizontal: 10,
    },
    containerActive: {
      backgroundColor: 'rgba(68, 9, 114, 0.08)',
      borderLeftWidth: 3,
      borderLeftColor: colors.brand.primary,
    },
    artworkWrapper: {
      marginRight: 12,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    artworkWrapperPlaying: {
      borderColor: colors.brand.primary,
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 6,
      elevation: 4,
    },
    nowPlayingIndicator: {
      paddingHorizontal: 8,
    },
    infoContainer: {
      flex: 1,
      marginRight: 12,
    },
    title: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text.primary,
      marginBottom: 2,
    },
    titleActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    displayNameText: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    playCountContainer: {
      minWidth: 77,
      marginRight: 12,
      justifyContent: 'center',
    },
    playCount: {
      fontSize: 12,
      color: colors.text.tertiary,
      fontWeight: '500',
      textAlign: 'right',
    },
    likeButton: {
      padding: 4,
      marginLeft: 4,
    },
    moreButton: {
      padding: 6,
      marginLeft: 4,
    },
    compactMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    compactActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    compactNowPlayingIndicator: {
      paddingHorizontal: 2,
    },
    moreButtonCompact: {
      padding: 4,
    },
  });
