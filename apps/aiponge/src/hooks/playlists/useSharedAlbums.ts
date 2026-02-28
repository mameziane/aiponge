import { normalizeMediaUrl } from '../../lib/apiConfig';
import { useApiQuery } from '../system/useAppQuery';
import { useAuthStore, selectUserRole, selectRoleVerified } from '../../auth/store';
import { queryKeys } from '../../lib/queryKeys';
import { USER_ROLES, type ServiceResponse } from '@aiponge/shared-contracts';
import { QUERY_STALE_TIME } from '../../constants/appConfig';

export interface SharedAlbum {
  id: string;
  title: string;
  coverArtworkUrl?: string;
  releaseType: string;
  status: string;
  totalTracks: number;
  releaseDate?: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

interface SharedAlbumTrack {
  id: string;
  title: string;
  audioUrl: string;
  artworkUrl?: string;
  durationSeconds: number;
  trackNumber: number;
  playCount: number;
  language?: string;
  displayName: string;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
  lyricsContent?: string;
  lyricsSyncedLines?: Array<{ time: number; text: string }>;
}

export function useSharedAlbums() {
  const userRole = useAuthStore(selectUserRole);
  const roleVerified = useAuthStore(selectRoleVerified);
  // Only grant librarian privileges if role has been verified from server
  const isLibrarian = roleVerified && (userRole === USER_ROLES.LIBRARIAN || userRole === USER_ROLES.ADMIN);

  const { data, isLoading, isError, refetch } = useApiQuery<ServiceResponse<{ albums: SharedAlbum[]; total: number }>>({
    endpoint: '/api/v1/app/library/public-albums',
    queryKey: queryKeys.albums.public(),
    context: 'Public Albums Library',
    queryOptions: {
      refetchOnMount: 'always',
      staleTime: QUERY_STALE_TIME.short,
    },
  });

  const albums = (Array.isArray(data?.data?.albums) ? data.data.albums : []).map((album: SharedAlbum) => ({
    ...album,
    coverArtworkUrl: normalizeMediaUrl(album.coverArtworkUrl),
  }));

  return {
    albums,
    total: data?.data?.total || 0,
    isLoading,
    isError,
    refetch,
    isLibrarian,
  };
}

export function useSharedAlbumDetail(albumId: string | undefined) {
  const { data, isLoading, isError, refetch } = useApiQuery<
    ServiceResponse<{ album: SharedAlbum; tracks: SharedAlbumTrack[] }>
  >({
    endpoint: albumId ? `/api/v1/app/library/public-albums/${albumId}` : '',
    queryKey: queryKeys.albums.publicDetail(albumId ?? ''),
    context: 'Public Album Detail',
    enabled: !!albumId,
  });

  const album = data?.data?.album
    ? {
        ...data.data.album,
        coverArtworkUrl: normalizeMediaUrl(data.data.album.coverArtworkUrl),
      }
    : undefined;

  const tracks = (Array.isArray(data?.data?.tracks) ? data.data.tracks : []).map(track => ({
    ...track,
    audioUrl: normalizeMediaUrl(track.audioUrl) || track.audioUrl,
    artworkUrl: normalizeMediaUrl(track.artworkUrl),
  }));

  return {
    album,
    tracks,
    isLoading,
    isError,
    refetch,
  };
}
