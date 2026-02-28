import { memo, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../../i18n';
import { SectionHeader } from '../shared/SectionHeader';
import { HorizontalCarousel } from '../shared/HorizontalCarousel';
import { LargeTrackCard } from '../music/LargeTrackCard';
import { spacing } from '../../theme/spacing';
import type { TrackCallbacks, ExploreTrack, UserCreation } from './types';

interface RecentlyPlayedSectionProps extends TrackCallbacks {
  recentlyPlayed: ExploreTrack[];
}

export const RecentlyPlayedSection = memo(function RecentlyPlayedSection({
  recentlyPlayed,
  onTrackPress,
  onTrackLongPress,
  onToggleFavorite,
  onShowLyrics,
  isLiked,
  canLike,
  currentTrackId,
  isPlaying,
}: RecentlyPlayedSectionProps) {
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

  if (recentlyPlayed.length === 0) return null;

  return (
    <View style={styles.heroSection}>
      <LinearGradient colors={['rgba(162, 128, 188, 0.3)', 'transparent']} style={styles.heroGradient}>
        <View style={styles.sectionHeader}>
          <SectionHeader
            title={t('explore.recentlyPlayed')}
            subtitle={t('explore.pickUpWhereYouLeftOff')}
            testID="recently-played-header"
          />
        </View>
        <HorizontalCarousel
          data={recentlyPlayed.slice(0, 10)}
          extraData={extraData}
          renderItem={renderTrackItem}
          keyExtractor={keyExtractor}
          testID="recently-played-carousel"
        />
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  heroSection: {
    marginTop: 8,
  },
  heroGradient: {
    paddingVertical: 16,
  },
  sectionHeader: {
    paddingHorizontal: spacing.screenHorizontal,
  },
});
