/**
 * Creations Container
 *
 * Independent render boundary that owns draft-track and track-completion hooks.
 * When draft track polling updates or a track generation completes, only this
 * subtree re-renders — the rest of DiscoverScreen is untouched.
 *
 * Hooks moved here from DiscoverScreen:
 * - useDraftTrack()
 * - useTrackCompletionHandler()
 */

import { memo } from 'react';
import { useDraftTrack } from '../../playlists/DraftTrackCard';
import { useTrackCompletionHandler } from '../../../hooks/music/useTrackCompletionHandler';
import { YourCreationsSection } from '../YourCreationsSection';
import type { ExploreTrack, UserCreation } from '../types';

interface CreationsContainerProps {
  yourCreations: UserCreation[];
  currentTrackId?: string;
  isPlaying: boolean;
  onTrackPress: (track: ExploreTrack | UserCreation) => void;
  onTrackLongPress: (track: ExploreTrack | UserCreation) => void;
  refetch: () => Promise<unknown>;
  onAutoPlayReady: (trackId: string, seekPosition: number) => void;
}

export const CreationsContainer = memo(function CreationsContainer({
  yourCreations,
  currentTrackId,
  isPlaying,
  onTrackPress,
  onTrackLongPress,
  refetch,
  onAutoPlayReady,
}: CreationsContainerProps) {
  // Check for active track generations (draft tracks)
  const { draftTracks, hasDraftTrack, isPendingGeneration } = useDraftTrack();

  // Handle track completion events (refetch + auto-play trigger)
  const { isRefetchingAfterCompletion } = useTrackCompletionHandler({
    refetch,
    onAutoPlayReady,
  });

  return (
    <YourCreationsSection
      yourCreations={yourCreations}
      draftTracks={draftTracks}
      hasDraftTrack={hasDraftTrack}
      isPendingGeneration={isPendingGeneration}
      isRefetchingAfterCompletion={isRefetchingAfterCompletion}
      currentTrackId={currentTrackId}
      isPlaying={isPlaying}
      onTrackPress={onTrackPress}
      onTrackLongPress={onTrackLongPress}
    />
  );
});
