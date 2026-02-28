import { useAuthStore, selectUserId } from '../../auth/store';
import { useApiQuery } from '../system/useAppQuery';
import { queryKeys } from '../../lib/queryKeys';
import type { SmartPlaylistsResponse, SmartPlaylistTracksResponse } from '../../types/playlist.types';

export function useSmartPlaylists() {
  const userId = useAuthStore(selectUserId);

  const {
    data: response,
    isLoading,
    isError,
    refetch,
  } = useApiQuery<SmartPlaylistsResponse>({
    endpoint: userId ? `/api/v1/app/playlists/smart/${userId}` : '',
    queryKey: queryKeys.playlists.smartByUser(userId),
    context: 'Smart Playlists',
    enabled: !!userId,
    fallbackData: { success: true, data: { playlists: [], total: 0, definitions: [] } },
    silentError: true,
  });

  const smartPlaylists = response?.data?.playlists ?? [];
  const definitions = response?.data?.definitions ?? [];
  const total = response?.data?.total ?? 0;

  return {
    smartPlaylists,
    definitions,
    total,
    isLoading,
    isError,
    refetch,
  };
}

export function useSmartPlaylistTracks(smartKey: string | null) {
  const userId = useAuthStore(selectUserId);

  const {
    data: response,
    isLoading,
    isError,
    refetch,
  } = useApiQuery<SmartPlaylistTracksResponse>({
    endpoint: userId && smartKey ? `/api/v1/app/playlists/smart/${userId}/${smartKey}/tracks` : '',
    queryKey: queryKeys.playlists.smartTracks(userId, smartKey ?? undefined),
    context: 'Smart Playlist Tracks',
    enabled: !!userId && !!smartKey,
    fallbackData: { success: true, data: { tracks: [], total: 0 } },
    silentError: true,
  });

  const tracks = response?.data?.tracks ?? [];
  const total = response?.data?.total ?? 0;

  return {
    tracks,
    total,
    isLoading,
    isError,
    refetch,
  };
}
