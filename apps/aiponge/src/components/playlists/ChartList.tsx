import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { AnimatedWaveform } from '../music/AnimatedWaveform';
import { ArtworkImage } from '../music/ArtworkImage';

interface ChartTrack {
  id: string;
  rank: number;
  title: string;
  displayName?: string;
  artworkUrl?: string;
  duration: number;
  playCount?: number;
}

interface ChartListProps {
  tracks: ChartTrack[];
  onTrackPress: (track: ChartTrack) => void;
  onTrackLongPress?: (track: ChartTrack) => void;
  onToggleFavorite?: (trackId: string) => void;
  isFavorite?: (trackId: string) => boolean;
  currentTrackId?: string;
  isPlaying?: boolean;
  testID?: string;
}

export function ChartList({
  tracks,
  onTrackPress,
  onTrackLongPress,
  onToggleFavorite,
  isFavorite,
  currentTrackId,
  isPlaying,
  testID,
}: ChartListProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPlayCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <View style={styles.container} testID={testID}>
      {tracks.map((track, index) => {
        const isTopThree = track.rank <= 3;
        const isCurrentTrack = currentTrackId === track.id && isPlaying;

        return (
          <TouchableOpacity
            key={track.id}
            style={[styles.trackRow, isCurrentTrack && styles.trackRowActive]}
            onPress={() => onTrackPress(track)}
            onLongPress={onTrackLongPress ? () => onTrackLongPress(track) : undefined}
            activeOpacity={0.7}
            testID={`chart-track-${track.id}`}
          >
            {/* Rank */}
            <View style={[styles.rankContainer, isTopThree && styles.rankTopThree]}>
              {isCurrentTrack ? (
                <AnimatedWaveform size="small" color={colors.brand.primary} />
              ) : (
                <Text style={[styles.rankText, isTopThree && styles.rankTextTopThree]}>{track.rank}</Text>
              )}
            </View>

            {/* Artwork */}
            <ArtworkImage
              uri={track.artworkUrl}
              size={48}
              borderRadius={4}
              testID={`artwork-${track.id}`}
              placeholderTestId={`artwork-placeholder-${track.id}`}
              wrapperStyle={
                isCurrentTrack ? { ...styles.artworkWrapper, ...styles.artworkWrapperPlaying } : styles.artworkWrapper
              }
              fallbackIcon={<Ionicons name="musical-note" size={20} color={colors.brand.primary} />}
            >
              {isCurrentTrack && (
                <View style={styles.playingOverlay}>
                  <AnimatedWaveform size="small" color={colors.absolute.white} />
                </View>
              )}
            </ArtworkImage>

            {/* Track Info */}
            <View style={styles.infoContainer}>
              <Text style={[styles.title, isCurrentTrack && styles.titleActive]} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.displayNameText} numberOfLines={1}>
                {track.displayName || 'Unknown'}
              </Text>
            </View>

            {/* Play Count - always render to maintain column alignment */}
            <View style={styles.playCountContainer}>
              {track.playCount !== undefined && track.playCount > 0 ? (
                <Text style={styles.playCount} testID={`play-count-${track.id}`}>
                  {formatPlayCount(track.playCount)} plays
                </Text>
              ) : null}
            </View>

            {/* Duration or Waveform */}
            {isCurrentTrack ? (
              <View style={styles.nowPlayingIndicator}>
                <AnimatedWaveform size="small" color={colors.brand.primary} />
              </View>
            ) : (
              <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
            )}

            {/* Like Button */}
            {onToggleFavorite && (
              <TouchableOpacity
                onPress={e => {
                  e.stopPropagation();
                  onToggleFavorite(track.id);
                }}
                style={styles.likeButton}
                testID={`button-like-${track.id}`}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isFavorite?.(track.id) ? 'heart' : 'heart-outline'}
                  size={20}
                  color={isFavorite?.(track.id) ? colors.social.like : colors.text.secondary}
                />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
    },
    trackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    trackRowActive: {
      backgroundColor: 'rgba(68, 9, 114, 0.08)',
      borderLeftWidth: 3,
      borderLeftColor: colors.brand.primary,
      paddingLeft: 13,
    },
    rankContainer: {
      width: 32,
      height: 32,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    rankTopThree: {
      backgroundColor: 'rgba(162, 128, 188, 0.2)',
      borderRadius: BORDER_RADIUS.lg,
    },
    rankText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    rankTextTopThree: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.brand.primary,
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
    playingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(68, 9, 114, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    infoContainer: {
      flex: 1,
      marginRight: 12,
    },
    title: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 3,
    },
    titleActive: {
      color: colors.brand.primary,
      fontWeight: '700',
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
    duration: {
      fontSize: 13,
      color: colors.text.tertiary,
      fontWeight: '500',
      minWidth: 40,
      textAlign: 'right',
    },
    nowPlayingIndicator: {
      minWidth: 40,
      alignItems: 'center',
    },
    likeButton: {
      padding: 4,
      marginLeft: 8,
    },
  });
