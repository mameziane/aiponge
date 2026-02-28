import type { ContentVisibility, ServiceResponse } from '@aiponge/shared-contracts';
import { useAuthStore, selectUserId } from '../../auth/store';
import { useApiQuery } from '../system/useAppQuery';
import { queryKeys } from '../../lib/queryKeys';

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

  const playlists = playlistsResponse?.data?.playlists ?? [];
  const total = playlistsResponse?.data?.total ?? 0;

  return {
    playlists,
    total,
    isLoadingPlaylists,
    isPlaylistsError,
  };
}
