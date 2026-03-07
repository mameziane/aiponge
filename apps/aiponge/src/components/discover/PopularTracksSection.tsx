import { memo, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { SectionHeader } from '../shared/SectionHeader';
import { HorizontalCarousel } from '../shared/HorizontalCarousel';
import { LargeTrackCard } from '../music/LargeTrackCard';
import { spacing } from '../../theme/spacing';
import type { TrackCallbacks, ExploreTrack, UserCreation } from './types';

interface PopularTracksSectionProps extends TrackCallbacks {
  popularTracks: ExploreTrack[];
}

export const PopularTracksSection = memo(function PopularTracksSection({
  popularTracks,
  onTrackPress,
  onTrackLongPress,
  onToggleFavorite,
  onShowLyrics,
  isLiked,
  canLike,
  currentTrackId,
  isPlaying,
}: PopularTracksSectionProps) {
  const { t } = useTranslation();
  const extraData = useMemo(() => ({ currentTrackId, isPlaying }), [currentTrackId, isPlaying]);

  const renderTrackItem = useCallback(
    (track: ExploreTrack) => {
      if (!track?.id) return <></>;
      return (
        <LargeTrackCard
          key={track.id}
          id={track.id}
          title={track.title}
          displayName={track.displayName || t('explore.unknownCreator')}
          artworkUrl={track.artworkUrl}
          audioUrl={track.audioUrl}
          duration={track.duration}
          playCount={track.playCount}
          isPlaying={currentTrackId === track.id && isPlaying}
          isFavorite={isLiked(track.id)}
          lyricsId={'lyricsId' in track ? (track as UserCreation).lyricsId : undefined}
          createdAt={track.createdAt}
          onPress={() => onTrackPress(track)}
          onLongPress={() => onTrackLongPress(track)}
          onToggleFavorite={canLike ? () => onToggleFavorite?.(track.id) : undefined}
          onShowLyrics={
            'lyricsId' in track && (track as UserCreation).lyricsId
              ? () => onShowLyrics({ title: track.title, lyricsId: (track as UserCreation).lyricsId })
              : undefined
          }
        />
      );
    },
    [onTrackPress, onTrackLongPress, onToggleFavorite, onShowLyrics, isLiked, canLike, currentTrackId, isPlaying, t]
  );

  const keyExtractor = useCallback((track: ExploreTrack) => track?.id || '', []);

  if (popularTracks.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader
          title={t('explore.popularTracks')}
          subtitle={t('explore.popular')}
          testID="popular-tracks-header"
        />
      </View>
      <HorizontalCarousel
        data={popularTracks}
        extraData={extraData}
        renderItem={renderTrackItem}
        keyExtractor={keyExtractor}
        testID="popular-tracks-carousel"
      />
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
