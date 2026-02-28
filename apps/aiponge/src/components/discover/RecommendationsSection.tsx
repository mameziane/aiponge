import { memo, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { SectionHeader } from '../shared/SectionHeader';
import { HorizontalCarousel } from '../shared/HorizontalCarousel';
import { LargeTrackCard } from '../music/LargeTrackCard';
import { spacing } from '../../theme/spacing';
import type { TrackCallbacks, ExploreTrack, UserCreation } from './types';

interface RecommendationsSectionProps extends TrackCallbacks {
  recommendations: ExploreTrack[];
}

export const RecommendationsSection = memo(function RecommendationsSection({
  recommendations,
  onTrackPress,
  onTrackLongPress,
  onToggleFavorite,
  onShowLyrics,
  isLiked,
  canLike,
  currentTrackId,
  isPlaying,
}: RecommendationsSectionProps) {
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
          displayName={track.displayName || ''}
          artworkUrl={track.artworkUrl}
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
      );
    },
    [onTrackPress, onTrackLongPress, onToggleFavorite, onShowLyrics, isLiked, canLike, currentTrackId, isPlaying]
  );

  const keyExtractor = useCallback((track: ExploreTrack) => track?.id || '', []);

  if (recommendations.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader
          title={t('explore.recommendedForYou')}
          subtitle={t('explore.basedOnListening')}
          testID="recommendations-header"
        />
      </View>
      <HorizontalCarousel
        data={recommendations.slice(0, 15)}
        extraData={extraData}
        renderItem={renderTrackItem}
        keyExtractor={keyExtractor}
        testID="recommendations-carousel"
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
