import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePlaybackState } from '../../contexts/PlaybackContext';
import { useUnifiedPlaybackControl } from '../../hooks/music/useUnifiedPlaybackControl';
import { AudioRoutePickerCompact } from './AudioRoutePicker';
import { normalizeMediaUrl } from '../../lib/apiConfig';
import { useThemeColors, type ColorScheme } from '../../theme';

export function MiniPlayer() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const { currentTrack } = usePlaybackState();
  const { togglePlayPause, isPlaying } = useUnifiedPlaybackControl();

  if (!currentTrack) {
    return null;
  }

  const handlePlayPause = () => {
    togglePlayPause();
  };

  const handlePress = () => {
    router.push({
      pathname: '/private-track-detail',
      params: {
        trackId: currentTrack.id,
        track: JSON.stringify({
          id: currentTrack.id,
          title: currentTrack.title,
          displayName: currentTrack.displayName,
          artworkUrl: currentTrack.artworkUrl,
          audioUrl: currentTrack.audioUrl,
          duration: currentTrack.duration,
          lyricsId: currentTrack.lyricsId,
          hasSyncedLyrics: currentTrack.hasSyncedLyrics,
        }),
      },
    });
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.9} testID="mini-player">
      <View style={styles.content}>
        {currentTrack.artworkUrl ? (
          <Image
            source={{ uri: normalizeMediaUrl(currentTrack.artworkUrl) }}
            style={styles.artwork}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View style={styles.artworkPlaceholder}>
            <Ionicons name="musical-note" size={20} color={colors.text.tertiary} />
          </View>
        )}

        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {currentTrack.title || t('player.unknownTrack')}
          </Text>
          {currentTrack.displayName && (
            <Text style={styles.trackArtist} numberOfLines={1}>
              {currentTrack.displayName}
            </Text>
          )}
        </View>

        <View
          style={styles.outputIndicator}
          onStartShouldSetResponder={() => true}
          onTouchEnd={e => e.stopPropagation()}
        >
          <AudioRoutePickerCompact />
        </View>

        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayPause}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="mini-player-play-pause"
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.progressBar}>
        <View style={styles.progressFill} />
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.background.secondary,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 12,
    },
    artwork: {
      width: 44,
      height: 44,
      borderRadius: 6,
    },
    artworkPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 6,
      backgroundColor: colors.background.tertiary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    trackInfo: {
      flex: 1,
      justifyContent: 'center',
    },
    trackTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    trackArtist: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },
    outputIndicator: {
      padding: 8,
    },
    playButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    progressBar: {
      height: 2,
      backgroundColor: colors.background.tertiary,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.brand.primary,
      width: '0%',
    },
  });
