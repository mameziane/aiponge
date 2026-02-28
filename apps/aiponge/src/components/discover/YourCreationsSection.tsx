import { memo, useCallback, useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '../../i18n';
import { SectionHeader } from '../shared/SectionHeader';
import { HorizontalCarousel } from '../shared/HorizontalCarousel';
import { UserCreationCard } from '../shared/UserCreationCard';
import { DraftTrackCard } from '../playlists/DraftTrackCard';
import { spacing } from '../../theme/spacing';
import type { UserCreation, TrackGenerationProgress } from './types';

interface YourCreationsSectionProps {
  yourCreations: UserCreation[];
  draftTracks: TrackGenerationProgress[];
  hasDraftTrack: boolean;
  isPendingGeneration: boolean;
  isRefetchingAfterCompletion: boolean;
  currentTrackId?: string;
  isPlaying: boolean;
  onTrackPress: (track: UserCreation) => void;
  onTrackLongPress: (track: UserCreation) => void;
}

export const YourCreationsSection = memo(function YourCreationsSection({
  yourCreations,
  draftTracks,
  hasDraftTrack,
  isPendingGeneration,
  isRefetchingAfterCompletion,
  currentTrackId,
  isPlaying,
  onTrackPress,
  onTrackLongPress,
}: YourCreationsSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const extraData = useMemo(() => ({ currentTrackId, isPlaying }), [currentTrackId, isPlaying]);

  const renderCreationItem = useCallback(
    (creation: UserCreation) => {
      if (!creation?.id) return <></>;
      return (
        <UserCreationCard
          key={creation.id}
          id={creation.id}
          title={creation.title}
          artworkUrl={creation.artworkUrl}
          createdAt={creation.createdAt}
          duration={creation.duration}
          isPlaying={currentTrackId === creation.id && isPlaying}
          onPress={() => onTrackPress(creation)}
          onLongPress={() => onTrackLongPress(creation)}
        />
      );
    },
    [onTrackPress, onTrackLongPress, currentTrackId, isPlaying]
  );

  const keyExtractor = useCallback((creation: UserCreation) => creation?.id || '', []);

  const handleSeeAll = useCallback(() => router.push('/private-music-library'), [router]);

  if (yourCreations.length === 0 && !hasDraftTrack && !isRefetchingAfterCompletion) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader
          title={t('explore.yourCreations')}
          subtitle={
            hasDraftTrack
              ? t('tracks.generatingTrack', { defaultValue: 'Creating your song...' })
              : t('explore.songsYouMade')
          }
          onSeeAllPress={handleSeeAll}
          testID="your-creations-header"
        />
      </View>
      {hasDraftTrack && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.draftTracksScrollContent}
          style={styles.draftTracksContainer}
        >
          {draftTracks.length > 0 ? (
            draftTracks.map(draft => (
              <DraftTrackCard key={draft.id} generation={draft} testID={`draft-track-card-${draft.id}`} />
            ))
          ) : isPendingGeneration ? (
            <DraftTrackCard
              key="pending-generation"
              generation={{
                id: 'pending',
                userId: '',
                status: 'queued',
                phase: 'queued',
                percentComplete: 0,
              }}
              testID="draft-track-card-pending"
            />
          ) : null}
        </ScrollView>
      )}
      {yourCreations.length > 0 && (
        <HorizontalCarousel
          data={yourCreations}
          extraData={extraData}
          renderItem={renderCreationItem}
          keyExtractor={keyExtractor}
          testID="your-creations-carousel"
        />
      )}
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
  draftTracksContainer: {
    marginBottom: spacing.elementMargin,
  },
  draftTracksScrollContent: {
    paddingHorizontal: spacing.screenHorizontal,
  },
});
