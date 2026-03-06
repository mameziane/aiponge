import { memo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '../../i18n';
import { SectionHeader } from '../shared/SectionHeader';
import { CompactTrackRow } from '../music/CompactTrackRow';
import { spacing } from '../../theme/spacing';
import type { TrackCallbacks, ExploreTrack, UserCreation } from './types';

interface TopSongsSectionProps extends TrackCallbacks {
  yourTopSongs: ExploreTrack[];
}

export const TopSongsSection = memo(function TopSongsSection({
  yourTopSongs,
  onTrackPress,
  onTrackLongPress,
  onToggleFavorite,
  onShowLyrics,
  isLiked,
  canLike,
  currentTrackId,
  isPlaying,
}: TopSongsSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const handleSeeAll = useCallback(() => router.push('/private-music-library'), [router]);

  if (yourTopSongs.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader
          title={t('explore.yourTopSongs')}
          subtitle={t('explore.yourMostPlayed')}
          onSeeAllPress={handleSeeAll}
          testID="your-top-songs-header"
        />
      </View>
      {yourTopSongs.slice(0, 5).map(track => (
        <CompactTrackRow
          key={track.id}
          id={track.id}
          title={track.title}
          displayName={track.displayName || t('explore.youCreator')}
          artworkUrl={track.artworkUrl}
          audioUrl={track.audioUrl}
          duration={track.duration}
          playCount={track.playCount}
          isPlaying={currentTrackId === track.id && isPlaying}
          isFavorite={isLiked(track.id)}
          lyricsId={'lyricsId' in track ? (track as UserCreation).lyricsId : undefined}
          onPress={() => onTrackPress(track)}
          onLongPress={() => onTrackLongPress(track)}
          onToggleFavorite={canLike ? () => onToggleFavorite?.(track.id) : undefined}
          onShowLyrics={
            'lyricsId' in track && (track as UserCreation).lyricsId
              ? () => onShowLyrics({ title: track.title, lyricsId: (track as UserCreation).lyricsId })
              : undefined
          }
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    paddingHorizontal: spacing.screenHorizontal,
  },
});
