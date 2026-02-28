import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';
import { useToast } from '../ui/use-toast';
import { useTranslation } from '../../i18n';
import { logger } from '../../lib/logger';
import { useAuthStore, selectToken } from '../../auth/store';
import { STANDARD_QUERY_CONFIG } from '../../lib/queryConfig';
import { normalizeApiResponse, extractTracks, extractTotal, type TracksResponse } from '../../lib/apiResponseUtils';
import { createQueryErrorHandler } from '../../lib/queryErrorHandler';
import { getArtworkStats } from '../../utils/trackUtils';
import { queryKeys } from '../../lib/queryKeys';
import type { SharedTrack, Playlist, PlaylistsResponse } from '../../types';

export type SharedLibraryResponse = { success: boolean; data: TracksResponse<SharedTrack>; timestamp?: string };

export interface UseSharedLibraryDataParams {
  tracksQueryKey: (string | { search: string; genreFilter: string; languageFilter: string })[];
  tracksEndpoint: string;
  selectedPlaylistId: string | null;
  smartKey: string | null;
  instanceId?: number;
}

export interface UseSharedLibraryDataReturn {
  tracks: SharedTrack[];
  total: number;
  playlists: Playlist[];
  allGenres: string[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
}

export function useSharedLibraryData({
  tracksQueryKey,
  tracksEndpoint,
  selectedPlaylistId,
  smartKey,
  instanceId = 0,
}: UseSharedLibraryDataParams): UseSharedLibraryDataReturn {
  const { toast } = useToast();
  const { t } = useTranslation();
  const token = useAuthStore(selectToken);

  const {
    data: playlistsResponse,
    isLoading: isLoadingPlaylists,
    isError: isPlaylistsError,
  } = useQuery<PlaylistsResponse>({
    queryKey: queryKeys.playlists.public(),
    queryFn: async (): Promise<PlaylistsResponse> => {
      const result = (await apiRequest('/api/v1/app/playlists/public/all?limit=20')) as PlaylistsResponse;
      return result;
    },
    ...STANDARD_QUERY_CONFIG,
  });

  const {
    data: libraryResponse,
    isLoading,
    isError,
    isFetching,
  } = useQuery<SharedLibraryResponse>({
    queryKey: tracksQueryKey,
    queryFn: async (): Promise<SharedLibraryResponse> => {
      const startTime = Date.now();
      try {
        logger.debug('Library query starting', {
          instanceId,
          endpoint: tracksEndpoint,
          hasToken: !!token,
        });
        const result = (await apiRequest(tracksEndpoint)) as SharedLibraryResponse;
        logger.debug('Library query completed', {
          instanceId,
          durationMs: Date.now() - startTime,
          hasData: !!result,
        });
        return normalizeApiResponse(result) as SharedLibraryResponse;
      } catch (err) {
        createQueryErrorHandler(
          toast,
          'Shared Library Query',
          smartKey || selectedPlaylistId || '/api/v1/app/library/shared',
          t('common.loadFailed', 'Failed to Load Music Library'),
          t
        )(err);
        throw err;
      }
    },
    ...STANDARD_QUERY_CONFIG,
  });

  const tracks = useMemo(() => {
    const extractedTracks = extractTracks(libraryResponse);
    logger.debug('Tracks processed', {
      instanceId,
      tracksCount: extractedTracks.length,
      ...getArtworkStats(extractedTracks),
    });
    return extractedTracks;
  }, [libraryResponse, instanceId]);

  const total = extractTotal(libraryResponse);

  const allGenres = useMemo(() => {
    if (tracks.length === 0) return [];
    const genres = new Set<string>();
    tracks.forEach((track: SharedTrack) => {
      if (Array.isArray(track.genres)) {
        track.genres.forEach((genre: string) => {
          if (genre) genres.add(genre);
        });
      }
    });
    return Array.from(genres).filter(Boolean);
  }, [tracks]);

  const playlists =
    playlistsResponse?.data?.playlists ||
    ('playlists' in (playlistsResponse ?? {})
      ? // as unknown: backend may return unwrapped { playlists } instead of { data: { playlists } }
        (playlistsResponse as unknown as { playlists: Playlist[] }).playlists
      : []);

  return {
    tracks,
    total,
    playlists,
    allGenres,
    isLoading: isLoading || isLoadingPlaylists,
    isFetching,
    isError: isError || isPlaylistsError,
  };
}
