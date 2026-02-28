import { useState, useMemo } from 'react';
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
      if (currentTrack?.id === trackId) {
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

  const handleDeleteTrack = async (trackId: string) => {
    try {
      await deleteMutation.mutateAsync(trackId);
    } catch (error) {
      // Error already handled in onError
    }
  };

  // Navigate to next track
  const handleNextTrack = () => {
    const nextTrack = getNextTrack(tracks, currentTrack, shuffleEnabled, repeatMode);
    if (nextTrack) {
      handlePlayTrack(nextTrack);
    }
  };

  // Navigate to previous track
  const handlePreviousTrack = () => {
    const prevTrack = getPreviousTrack(tracks, currentTrack, shuffleEnabled, repeatMode);
    if (prevTrack) {
      handlePlayTrack(prevTrack);
    }
  };

  // Toggle play/pause
  const handleTogglePlayPause = () => {
    if (!currentTrack && tracks.length > 0) {
      // No track playing, start from first track
      handlePlayTrack(tracks[0]);
    } else if (currentTrack) {
      // Toggle current track play/pause
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    }
  };

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
