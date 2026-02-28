import { useState, useCallback, useMemo } from 'react';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../../lib/axiosApiClient';
import { queryKeys } from '../../../lib/queryKeys';
import { invalidateOnEvent } from '../../../lib/cacheManager';
import { buildPlaybackTrack, buildPlaybackTracks } from '../../../utils/trackUtils';
import { useTrackPlayback, type PlayableTrack } from '../../../hooks/music/useTrackPlayback';
import { useTrackOptionsScreen } from '../../../hooks/music/useTrackOptions';
import { useFavorites } from '../../../hooks/playlists/useFavorites';
import type { TrackForMenu } from '../../../components/music/TrackOptionsMenu';
import { logger } from '../../../lib/logger';

export interface TrackManagementOptions {
  userId: string | undefined;
  entryTracks: Array<{
    id: string;
    title?: string | null;
    displayName?: string | null;
    audioUrl?: string;
    artworkUrl?: string | null;
    lyricsId?: string;
    hasSyncedLyrics?: boolean;
  }>;
  currentTrackId: string | undefined;
  isPlaying: boolean;
}

export function useTrackManagement({ userId, entryTracks, currentTrackId, isPlaying }: TrackManagementOptions) {
  const queryClient = useQueryClient();
  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<TrackForMenu | null>(null);

  const { isFavorite, toggleFavorite } = useFavorites(userId || '');

  const handleShowLyricsForTrack = useCallback((track: TrackForMenu) => {
    if (track.lyricsId) {
      router.push({
        pathname: '/private-track-detail',
        params: { trackId: track.id },
      });
    }
  }, []);

  const availableTracks = useMemo(() => {
    const tracks = buildPlaybackTracks(entryTracks);
    if (tracks.length > 0) {
      logger.debug('[MusicGeneration] availableTracks updated', {
        count: tracks.length,
        sample: tracks.slice(0, 3).map(t => ({
          id: t.id.substring(0, 8),
          hasAudioUrl: !!t.audioUrl,
          hasArtworkUrl: !!t.artworkUrl,
        })),
      });
    }
    return tracks;
  }, [entryTracks]);

  const { handlePlayTrack, pause, resume } = useTrackPlayback<PlayableTrack>({
    availableTracks,
  });

  const handleTrackPlayPause = useCallback(
    (track: {
      id: string;
      title?: string | null;
      displayName?: string | null;
      audioUrl?: string;
      artworkUrl?: string | null;
    }) => {
      logger.debug('[MusicGeneration] handleTrackPlayPause called', {
        trackId: track.id.substring(0, 8),
        hasAudioUrl: !!track.audioUrl,
      });

      const playbackTrack = buildPlaybackTrack(track);
      if (!playbackTrack) {
        logger.warn('[MusicGeneration] Track has no audioUrl, skipping playback', { trackId: track.id });
        return;
      }

      const isCurrentlyPlaying = currentTrackId === track.id && isPlaying;
      if (isCurrentlyPlaying) {
        pause();
      } else if (currentTrackId === track.id) {
        resume();
      } else {
        handlePlayTrack(playbackTrack);
      }
    },
    [currentTrackId, isPlaying, pause, resume, handlePlayTrack]
  );

  const handleGeneratedTrackPlay = useCallback(
    (generatedTrack: {
      id: string;
      audioUrl?: string;
      title?: string | null;
      artworkUrl?: string | null;
      lyricsId?: string;
      hasSyncedLyrics?: boolean;
    }) => {
      if (!generatedTrack.id) return;

      const isTrackPlaying = currentTrackId === generatedTrack.id && isPlaying;
      const isTrackPaused = currentTrackId === generatedTrack.id && !isPlaying;

      if (isTrackPlaying) {
        pause();
      } else if (isTrackPaused) {
        resume();
      } else {
        const playbackTrack = buildPlaybackTrack({
          id: generatedTrack.id,
          audioUrl: generatedTrack.audioUrl,
          title: generatedTrack.title ?? undefined,
          artworkUrl: generatedTrack.artworkUrl ?? undefined,
          lyricsId: generatedTrack.lyricsId,
          hasSyncedLyrics: generatedTrack.hasSyncedLyrics,
        });
        if (playbackTrack) {
          handlePlayTrack(playbackTrack);
        }
      }
    },
    [currentTrackId, isPlaying, pause, resume, handlePlayTrack]
  );

  const deleteTrackMutation = useMutation({
    mutationFn: async (trackId: string) => {
      return await apiRequest(`/api/v1/app/library/track/${trackId}`, {
        method: 'DELETE',
      });
    },
    onMutate: async deletedTrackId => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tracks.private() });
      const previousData = queryClient.getQueryData(queryKeys.tracks.private());
      queryClient.setQueryData(
        queryKeys.tracks.private(),
        (old: { data?: { tracks?: Array<{ id: string }> } } | undefined) => {
          if (!old?.data?.tracks) return old;
          return {
            ...old,
            data: {
              ...old.data,
              tracks: old.data.tracks.filter(track => track.id !== deletedTrackId),
            },
          };
        }
      );
      return { previousData };
    },
    onSuccess: async (_data, deletedTrackId) => {
      const { applyTrackDeletionToCache } = await import('../../../auth/cacheUtils');
      applyTrackDeletionToCache(queryClient, deletedTrackId);
    },
    onError: (error, _deletedTrackId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.tracks.private(), context.previousData);
      }
      logger.error('[MusicGeneration] Failed to delete track', { error });
    },
  });

  const handleTrackUpdated = useCallback(() => {
    invalidateOnEvent(queryClient, { type: 'PRIVATE_LIBRARY_UPDATED' });
  }, [queryClient]);

  const { getMenuPropsForTrack } = useTrackOptionsScreen<TrackForMenu>('musicGeneration', {
    handleShowLyrics: handleShowLyricsForTrack,
    toggleFavorite,
    isFavorite,
    handleDeleteTrack: (trackId: string) => deleteTrackMutation.mutateAsync(trackId),
    handleTrackUpdated,
  });

  return {
    selectedTrackForMenu,
    setSelectedTrackForMenu,
    handleTrackPlayPause,
    handleGeneratedTrackPlay,
    getMenuPropsForTrack,
    pause,
    resume,
  };
}
