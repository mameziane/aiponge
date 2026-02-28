import { normalizeMediaUrl } from '../../lib/apiConfig';
import { useApiQuery } from '../system/useAppQuery';
import { queryKeys } from '../../lib/queryKeys';
import type { ServiceResponse } from '@aiponge/shared-contracts';

export interface UserAlbum {
  id: string;
  userId: string;
  chapterId: string;
  title: string;
  description?: string;
  coverArtworkUrl?: string;
  totalTracks: number;
  totalDurationSeconds: number;
  mood?: string;
  genres?: string[];
  status: 'active' | 'archived';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

type AlbumsResponse = ServiceResponse<{
  albums: UserAlbum[];
  total: number;
}>;

type AlbumDetailResponse = ServiceResponse<{
  album: UserAlbum;
  tracks: Array<{
    id: string;
    title: string;
    displayName: string;
    audioUrl: string;
    artworkUrl?: string;
    durationSeconds: number;
    trackNumber: number;
    lyricsId?: string;
    hasSyncedLyrics?: boolean;
  }>;
}>;

export function useAlbums() {
  const { data, isLoading, isError, refetch } = useApiQuery<AlbumsResponse>({
    endpoint: '/api/v1/app/library/albums',
    queryKey: queryKeys.albums.list(),
    context: 'Albums Library',
    queryOptions: {
      staleTime: 60_000,
      refetchOnMount: false,
    },
  });

  const albums = (Array.isArray(data?.data?.albums) ? data.data.albums : []).map((album: UserAlbum) => ({
    ...album,
    coverArtworkUrl: normalizeMediaUrl(album.coverArtworkUrl),
  }));

  return {
    albums,
    total: data?.data?.total || 0,
    isLoading,
    isError,
    refetch,
  };
}

export function useAlbumDetail(albumId: string | undefined) {
  const { data, isLoading, isError, refetch } = useApiQuery<AlbumDetailResponse>({
    endpoint: albumId ? `/api/v1/app/library/albums/${albumId}` : '',
    queryKey: queryKeys.albums.detail(albumId ?? ''),
    context: 'Album Detail',
    enabled: !!albumId,
    queryOptions: {
      staleTime: 60_000,
      refetchOnMount: false,
    },
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
