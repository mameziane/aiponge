import { useMemo } from 'react';
import type { ContentVisibility, ServiceResponse } from '@aiponge/shared-contracts';
import { useAuthStore, selectUserId } from '../../auth/store';
import { useApiQuery } from '../system/useAppQuery';
import { queryKeys } from '../../lib/queryKeys';

// Module-level empty array — stable reference prevents re-renders when no playlists exist.
// Without this, `?? []` creates a new array on every render, cascading through all consumers.
const EMPTY_PLAYLISTS: MyPlaylist[] = [];

export interface MyPlaylist {
  id: string;
  name: string;
  description?: string;
  totalTracks: number;
  category?: string;
  visibility?: ContentVisibility;
  artworkUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface PlaylistsData {
  playlists: MyPlaylist[];
  total: number;
}

export function useMyMusicPlaylists() {
  const userId = useAuthStore(selectUserId);

  const {
    data: playlistsResponse,
    isLoading: isLoadingPlaylists,
    isError: isPlaylistsError,
  } = useApiQuery<ServiceResponse<PlaylistsData>>({
    endpoint: userId ? `/api/v1/app/playlists/user/${userId}` : '',
    queryKey: queryKeys.playlists.byUser(userId),
    context: 'My Playlists',
    enabled: !!userId,
    fallbackData: { success: true, data: { playlists: [], total: 0 } },
    silentError: true,
  });

  // Memoize playlists to prevent new array references on every render.
  // The raw `?? []` would create a new empty array each render, cascading through
  // all callbacks that depend on playlists (handleTrackTap, ListHeaderComponent, etc.)
  const playlists = useMemo(
    () => playlistsResponse?.data?.playlists ?? EMPTY_PLAYLISTS,
    [playlistsResponse?.data?.playlists]
  );
  const total = playlistsResponse?.data?.total ?? 0;

  return useMemo(
    () => ({
      playlists,
      total,
      isLoadingPlaylists,
      isPlaylistsError,
    }),
    [playlists, total, isLoadingPlaylists, isPlaylistsError]
  );
}
