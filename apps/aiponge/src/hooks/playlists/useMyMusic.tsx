import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';
import { useToast } from '../ui/use-toast';
import { useTranslation } from '../../i18n';
import { logError, getTranslatedFriendlyMessage } from '../../utils/errorSerialization';
import { getRelativeTimeString } from '../../utils/timeUtils';
import { formatTrackDuration, getNextTrack, getPreviousTrack } from '../../utils/trackUtils';
import { useTrackPlayback } from '../music/useTrackPlayback';
import { usePlaybackControls } from '../music/usePlaybackControls';
import { STANDARD_QUERY_CONFIG } from '../../lib/queryConfig';
import { normalizeApiResponse, extractTracks, extractTotal, type TracksResponse } from '../../lib/apiResponseUtils';
import { createQueryErrorHandler } from '../../lib/queryErrorHandler';
import { useAuthState } from '../auth/useAuthState';
import { CONFIG } from '../../constants/appConfig';
import type { MyMusicTrack } from '../../types';

export type { MyMusicTrack };

// API response - supports both wrapped and unwrapped formats
export type MyMusicResponse = {
  success: boolean;
  data: TracksResponse<MyMusicTrack> & { source?: string };
  timestamp?: string;
};

export function useMyMusic() {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const { shuffleEnabled, repeatMode, handleToggleShuffle, handleCycleRepeat } = usePlaybackControls();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthState();

  // Load user's music library from API - either from playlist or all private tracks
  const {
    data: libraryResponse,
    isLoading,
    error,
    isError,
  } = useQuery<MyMusicResponse>({
    queryKey: selectedPlaylistId
      ? ['/api/v1/app/playlists', selectedPlaylistId, 'tracks']
      : ['/api/v1/app/library/private'],
    queryFn: async (): Promise<MyMusicResponse> => {
      const endpoint = selectedPlaylistId
        ? `/api/v1/app/playlists/${selectedPlaylistId}/tracks`
        : '/api/v1/app/library/private?limit=200';

      try {
        const result = (await apiRequest(endpoint)) as MyMusicResponse;
        return normalizeApiResponse(result) as MyMusicResponse;
      } catch (err) {
        createQueryErrorHandler(
          toast,
          'My Music Query',
          endpoint,
          t('common.loadFailed', 'Failed to Load Your Music'),
          t
        )(err);
        throw err;
      }
    },
    enabled: isAuthenticated || !!selectedPlaylistId, // Only fetch for authenticated users or when viewing a playlist
    ...STANDARD_QUERY_CONFIG,
  });

  // Extract tracks and total using shared utilities
  const tracks = useMemo(() => extractTracks(libraryResponse), [libraryResponse]);
  const total = extractTotal(libraryResponse);

  // Use shared track playback hook for unified audio management with auto-advance
  const { currentTrack, isPlaying, player, handlePlayTrack, pause, resume, clearCurrentTrack } =
    useTrackPlayback<MyMusicTrack>({
      shuffleEnabled,
      repeatMode,
      availableTracks: tracks, // Pass current track list for auto-advance
    });

  // CRITICAL: Refs for values that change frequently but are only READ inside callbacks.
  // Using refs instead of useCallback deps prevents handleNextTrack/handlePreviousTrack/
  // handleTogglePlayPause from being recreated on every PlaybackContext update (currentTrack/
  // isPlaying change) or React Query refetch (tracks change). Without this, every playback
  // state change cascades through all callbacks and their consumers, contributing to the
  // "Maximum update depth exceeded" crash — the same pattern fixed in useTrackPlayback.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Delete track mutation with optimistic updates for instant UI feedback
  const deleteMutation = useMutation({
    mutationFn: async (trackId: string) => {
      const result = await apiRequest(`/api/v1/app/library/track/${trackId}`, {
        method: 'DELETE',
      });
      return result;
    },
    onMutate: async trackId => {
      // Determine which query keys to update based on current view
      const privateLibraryKey = ['/api/v1/app/library/private'];
      const playlistKey = selectedPlaylistId ? ['/api/v1/app/playlists', selectedPlaylistId, 'tracks'] : null;

      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: privateLibraryKey });
      if (playlistKey) {
        await queryClient.cancelQueries({ queryKey: playlistKey });
      }

      // Snapshot the previous values for rollback on error
      const previousPrivateData = queryClient.getQueryData<MyMusicResponse>(privateLibraryKey);
      const previousPlaylistData = playlistKey ? queryClient.getQueryData<MyMusicResponse>(playlistKey) : null;

      queryClient.setQueryData<MyMusicResponse>(privateLibraryKey, old => {
        if (!old?.data?.tracks) return old;
        return {
          ...old,
          data: {
            ...old.data,
            tracks: old.data.tracks.filter((track: MyMusicTrack) => track.id !== trackId),
            total: old.data.total - 1,
          },
        };
      });

      if (playlistKey) {
        queryClient.setQueryData<MyMusicResponse>(playlistKey, old => {
          if (!old?.data?.tracks) return old;
          return {
            ...old,
            data: {
              ...old.data,
              tracks: old.data.tracks.filter((track: MyMusicTrack) => track.id !== trackId),
              total: old.data.total - 1,
            },
          };
        });
      }

      // Stop playback and clear state if deleted track is currently loaded
      // This prevents stale playback state from blocking future track playback
      if (currentTrackRef.current?.id === trackId) {
        clearCurrentTrack();
      }

      return { previousPrivateData, previousPlaylistData, playlistKey };
    },
    onError: (error, trackId, context) => {
      // Rollback to previous state on error
      if (context?.previousPrivateData) {
        queryClient.setQueryData(['/api/v1/app/library/private'], context.previousPrivateData);
      }
      if (context?.playlistKey && context?.previousPlaylistData) {
        queryClient.setQueryData(context.playlistKey, context.previousPlaylistData);
      }

      const serialized = logError(error, 'Delete Track', 'useMyMusic');
      toast({
        title: t('hooks.myMusic.deleteFailed'),
        description: getTranslatedFriendlyMessage(serialized, t),
        variant: 'destructive',
      });
    },
    onSuccess: async (_data, deletedTrackId, context) => {
      // Apply deletion to all library caches synchronously
      // This updates all screens immediately without race conditions
      const { applyTrackDeletionToCache } = await import('../../auth/cacheUtils');
      applyTrackDeletionToCache(queryClient, deletedTrackId, context?.playlistKey?.[1] as string);
    },
  });

  const handleDeleteTrack = useCallback(
    async (trackId: string) => {
      try {
        await deleteMutation.mutateAsync(trackId);
      } catch (error) {
        // Error already handled in onError
      }
    },
    [deleteMutation.mutateAsync]
  );

  // Navigate to next track
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tracks and currentTrack read via refs
  // to prevent callback recreation on every PlaybackContext update or data refetch
  const handleNextTrack = useCallback(() => {
    const nextTrack = getNextTrack(tracksRef.current, currentTrackRef.current, shuffleEnabled, repeatMode);
    if (nextTrack) {
      handlePlayTrack(nextTrack);
    }
  }, [shuffleEnabled, repeatMode, handlePlayTrack]);

  // Navigate to previous track
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tracks and currentTrack read via refs
  const handlePreviousTrack = useCallback(() => {
    const prevTrack = getPreviousTrack(tracksRef.current, currentTrackRef.current, shuffleEnabled, repeatMode);
    if (prevTrack) {
      handlePlayTrack(prevTrack);
    }
  }, [shuffleEnabled, repeatMode, handlePlayTrack]);

  // Toggle play/pause
  // eslint-disable-next-line react-hooks/exhaustive-deps -- currentTrack, tracks, isPlaying read via refs
  const handleTogglePlayPause = useCallback(() => {
    const curTrack = currentTrackRef.current;
    const curTracks = tracksRef.current;
    const playing = isPlayingRef.current;
    if (!curTrack && curTracks.length > 0) {
      // No track playing, start from first track
      handlePlayTrack(curTracks[0]);
    } else if (curTrack) {
      // Toggle current track play/pause
      if (playing) {
        pause();
      } else {
        resume();
      }
    }
  }, [handlePlayTrack, pause, resume]);

  return {
    // Data
    tracks,
    total,
    currentTrack,
    isPlaying,
    isLoading,
    isError,

    // Playlist state
    selectedPlaylistId,
    setSelectedPlaylistId,

    // Playback controls
    shuffleEnabled,
    repeatMode,
    handleToggleShuffle,
    handleCycleRepeat,
    handleNextTrack,
    handlePreviousTrack,
    handleTogglePlayPause,

    // Actions
    handlePlayTrack,
    handleDeleteTrack,
    formatDuration: formatTrackDuration, // Use shared utility
    getRelativeTimeString, // ✅ Export for use in UI components

    // Delete state
    isDeletingTrack: deleteMutation.isPending,

    // Computed
    hasNoTracks: tracks.length === 0,
  };
}
