/**
 * TrackItem - Standard track row for library lists and search results
 *
 * @description Full-featured track row with 56x56 artwork, title,
 * duration, and action menu. Used in library lists, album views, and search results.
 *
 * @see CompactTrackRow - Minimal version for dense lists (recommendations, queue)
 * @see LargeTrackCard - Card layout for featured/hero sections
 * @see DraftTrackCard - For tracks in generation/draft state
 * @see TrackComponents - Shared utilities (PlayingOverlay, LikeButton, etc.)
 *
 * @example
 * <TrackItem
 *   track={track}
 *   isActive={currentTrackId === track.id}
 *   isPlaying={isPlaying && currentTrackId === track.id}
 *   onPress={() => playTrack(track)}
 *   formatDuration={formatDuration}
 * />
 */
import { memo, useMemo, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '../../theme';
import { createTrackStyles } from './TrackItem.styles';
import { AnimatedWaveform } from './AnimatedWaveform';
import { ArtworkImage } from '../shared/ArtworkImage';
import { TrackOptionsMenu } from './TrackOptionsMenu';
import { useTrackOptionsMenu, PlayingOverlay, LikeButton, MoreOptionsButton } from '../shared/TrackComponents';
import type { IconProps } from '../../types';

type SimpleIconProps = Omit<IconProps, 'name'>;

const Music = (props: SimpleIconProps) => <Ionicons name="musical-notes" {...props} />;

interface TrackItemProps {
  track: {
    id: string;
    title: string;
    displayName?: string;
    artworkUrl?: string;
    audioUrl?: string;
    duration: number;
    lyricsId?: string;
    hasSyncedLyrics?: boolean;
    isUserGenerated?: boolean;
    playOnDate?: string | null;
  };
  isActive: boolean;
  isPlaying: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onShowLyrics?: () => void;
  onToggleFavorite?: () => void;
  onRemoveFromLibrary?: () => void;
  onTrackUpdated?: () => void;
  isFavorite?: boolean;
  formatDuration: (seconds: number) => string;
  subtitleExtra?: string;
  showEditOption?: boolean;
  children?: ReactNode;
}

function TrackItemComponent({
  track,
  isActive,
  isPlaying,
  onPress,
  onLongPress,
  onShowLyrics,
  onToggleFavorite,
  onRemoveFromLibrary,
  onTrackUpdated,
  isFavorite = false,
  formatDuration,
  subtitleExtra,
  showEditOption = false,
  children,
}: TrackItemProps) {
  const colors = useThemeColors();
  const trackStyles = useMemo(() => createTrackStyles(colors), [colors]);
  const { t } = useTranslation();

  const accessibilityLabel = useMemo(() => {
    if (track.displayName && isActive) {
      return t('accessibility.trackByCurrentlyPlaying', { title: track.title, displayName: track.displayName });
    } else if (track.displayName) {
      return t('accessibility.trackBy', { title: track.title, displayName: track.displayName });
    } else if (isActive) {
      return t('accessibility.trackCurrentlyPlaying', { title: track.title });
    }
    return track.title;
  }, [track.title, track.displayName, isActive, t]);

  const { showOptionsMenu, closeOptionsMenu, trackForMenu, handleMorePress } = useTrackOptionsMenu({
    id: track.id,
    title: track.title,
    displayName: track.displayName,
    artworkUrl: track.artworkUrl,
    audioUrl: track.audioUrl,
    duration: track.duration,
    lyricsId: track.lyricsId,
    hasSyncedLyrics: track.hasSyncedLyrics,
    isUserGenerated: track.isUserGenerated,
    playOnDate: track.playOnDate,
  });

  return (
    <>
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        style={[trackStyles.trackItem, isActive && trackStyles.trackItemActive]}
        testID={`track-item-${track.id}`}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={t('accessibility.doubleTapToPlay')}
      >
        {/* Artwork with overlay play/pause button */}
        <ArtworkImage
          uri={track.artworkUrl}
          size={56}
          borderRadius={6}
          testID={`artwork-${track.id}`}
          wrapperStyle={trackStyles.artworkContainer}
          fallbackIcon={<Music size={24} color={colors.brand.primary} />}
        >
          {isActive && isPlaying && <PlayingOverlay size="small" backgroundColor="rgba(0, 0, 0, 0.4)" />}
        </ArtworkImage>

        {/* Track Info */}
        <View style={trackStyles.trackInfo}>
          <Text style={trackStyles.trackTitle}>{track.title}</Text>
          {track.displayName && (
            <Text style={trackStyles.trackSubtitle}>
              {track.displayName}
              {subtitleExtra ? ` ${subtitleExtra}` : ''}
            </Text>
          )}
        </View>

        {/* Playing Waveform Indicator */}
        {isActive && isPlaying && (
          <View style={styles.nowPlayingIndicator}>
            <AnimatedWaveform size="small" color={colors.brand.primary} />
          </View>
        )}

        {/* Favorite Button - quick access */}
        {onToggleFavorite && (
          <LikeButton
            isLiked={isFavorite}
            onToggle={onToggleFavorite}
            testID={`button-favorite-${track.id}`}
            size={22}
            style={trackStyles.favoriteButton}
          />
        )}

        {/* More Options Button - disabled when another track is playing */}
        <MoreOptionsButton
          onPress={handleMorePress}
          testID={`button-more-${track.id}`}
          size={20}
          style={styles.moreButton}
          disabled={!isActive && isPlaying}
        />

        {/* Additional content slot (e.g., for genre tags) */}
        {children}
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
}

const styles = StyleSheet.create({
  nowPlayingIndicator: {
    paddingHorizontal: 8,
  },
  moreButton: {
    padding: 8,
    marginLeft: 4,
  },
});

export const TrackItem = memo(TrackItemComponent, (prevProps, nextProps) => {
  return (
    prevProps.track.id === nextProps.track.id &&
    prevProps.track.title === nextProps.track.title &&
    prevProps.track.displayName === nextProps.track.displayName &&
    prevProps.track.artworkUrl === nextProps.track.artworkUrl &&
    prevProps.track.duration === nextProps.track.duration &&
    prevProps.track.lyricsId === nextProps.track.lyricsId &&
    prevProps.track.hasSyncedLyrics === nextProps.track.hasSyncedLyrics &&
    prevProps.track.isUserGenerated === nextProps.track.isUserGenerated &&
    prevProps.track.playOnDate === nextProps.track.playOnDate &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.subtitleExtra === nextProps.subtitleExtra &&
    prevProps.showEditOption === nextProps.showEditOption &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.onLongPress === nextProps.onLongPress &&
    prevProps.onShowLyrics === nextProps.onShowLyrics &&
    prevProps.onToggleFavorite === nextProps.onToggleFavorite &&
    prevProps.onRemoveFromLibrary === nextProps.onRemoveFromLibrary &&
    prevProps.onTrackUpdated === nextProps.onTrackUpdated &&
    prevProps.formatDuration === nextProps.formatDuration &&
    prevProps.children === nextProps.children
  );
});
