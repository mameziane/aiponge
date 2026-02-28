import { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { ArtworkImage } from './ArtworkImage';
import { TrackOptionsMenu } from './TrackOptionsMenu';
import {
  formatPlayCount,
  useTrackOptionsMenu,
  PlayingOverlay,
  LikeButton,
  MoreOptionsButton,
} from '../shared/TrackComponents';

interface LargeTrackCardProps {
  id: string;
  title: string;
  displayName: string;
  artworkUrl?: string;
  audioUrl?: string;
  duration?: number;
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
}

export const LargeTrackCard = memo(function LargeTrackCard({
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
}: LargeTrackCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  return (
    <>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
        testID={testID || `large-track-card-${id}`}
      >
        <ArtworkImage
          uri={artworkUrl}
          size={160}
          borderRadius={8}
          testID={`artwork-${id}`}
          placeholderTestId={`artwork-placeholder-${id}`}
          wrapperStyle={
            isPlaying ? { ...styles.artworkWrapper, ...styles.artworkWrapperPlaying } : styles.artworkWrapper
          }
        >
          {isPlaying && <PlayingOverlay size="medium" backgroundColor="rgba(68, 9, 114, 0.85)" />}

          {playCount !== undefined && playCount > 0 && !isPlaying && (
            <View style={styles.playCountBadge}>
              <Ionicons name="play" size={10} color={colors.text.tertiary} />
              <Text style={styles.playCountText}>{formatPlayCount(playCount)}</Text>
            </View>
          )}

          <MoreOptionsButton
            onPress={handleMorePress}
            testID={`button-more-${id}`}
            color={colors.absolute.white}
            style={styles.moreButton}
          />

          {onToggleFavorite && (
            <LikeButton
              isLiked={isFavorite}
              onToggle={onToggleFavorite}
              testID={`button-like-${id}`}
              style={styles.likeButton}
              unlikedColor="white"
            />
          )}
        </ArtworkImage>

        <View style={styles.infoContainer}>
          <Text style={[styles.title, isPlaying && styles.titleActive]} numberOfLines={2}>
            {title}
          </Text>

          <Text style={styles.displayNameText} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
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
      width: 160,
      marginRight: 16,
    },
    artworkWrapper: {
      marginBottom: 12,
      borderWidth: 0,
    },
    artworkWrapperPlaying: {
      borderWidth: 2,
      borderColor: colors.brand.primary,
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
      elevation: 8,
    },
    playCountBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.md,
    },
    playCountText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
    likeButton: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      padding: 6,
      borderRadius: BORDER_RADIUS.lg,
    },
    moreButton: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      padding: 6,
      borderRadius: BORDER_RADIUS.lg,
    },
    infoContainer: {
      gap: 4,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      lineHeight: 18,
    },
    titleActive: {
      color: colors.brand.primary,
    },
    displayNameText: {
      fontSize: 13,
      color: colors.text.secondary,
    },
  });
