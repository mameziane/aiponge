import { useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiRequest } from '../../lib/axiosApiClient';
import { normalizeTracks } from '../../lib/apiConfig';
import { STANDARD_QUERY_CONFIG } from '../../lib/queryConfig';
import { shouldBypassExploreCache } from '../../auth/cacheUtils';
import { queryKeys } from '../../lib/queryKeys';

export interface ExploreTrack {
  id: string;
  title: string;
  artworkUrl?: string;
  audioUrl?: string;
  duration: number;
  playCount?: number;
  displayName?: string;
  isUserCreation?: boolean;
  sourceType?: string;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
}

export interface UserCreation extends ExploreTrack {
  createdAt: string;
  lyricsId?: string;
  metadata?: Record<string, unknown>;
  audioUrl?: string;
}

export interface ExplorePlaylist {
  id: string;
  title: string;
  description?: string;
  artworkUrl?: string;
  totalTracks: number;
  totalDuration: number;
  category?: string;
  mood?: string;
  genre?: string;
}

export interface ChartTrack extends ExploreTrack {
  rank: number;
  likeCount?: number;
}

export interface WorkInProgress {
  id: string;
  title: string;
  artworkUrl?: string;
  duration: number;
  status: 'draft' | 'processing' | 'pending';
  sourceType?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  hasSyncedLyrics?: boolean;
}

export interface ExploreData {
  recentlyPlayed: ExploreTrack[];
  yourCreations: UserCreation[];
  yourTopSongs: ExploreTrack[];
  featuredPlaylists: ExplorePlaylist[];
  popularTracks: ExploreTrack[];
  topCharts: ChartTrack[];
  recommendations: ExploreTrack[];
  worksInProgress: WorkInProgress[];
}

// Module-level stable empty arrays — prevents new references on every render
const EMPTY_TRACKS: ExploreTrack[] = [];
const EMPTY_CREATIONS: UserCreation[] = [];
const EMPTY_PLAYLISTS: ExplorePlaylist[] = [];
const EMPTY_CHARTS: ChartTrack[] = [];
const EMPTY_WIP: WorkInProgress[] = [];

export function useExploreData() {
  const {
    data: exploreResponse,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<ServiceResponse<ExploreData>>({
    queryKey: queryKeys.tracks.explore(),
    queryFn: async () => {
      // Check if we need to bypass API Gateway cache (e.g., after profile name change)
      const bypassCache = shouldBypassExploreCache();
      const response = await apiRequest('/api/v1/app/library/explore', {
        method: 'GET',
        // Add cache bypass header and skip axios cache when needed (after profile updates)
        ...(bypassCache && {
          headers: { 'x-cache-revalidate': 'true' },
        }),
      });

      const envelope = response as ServiceResponse<Partial<ExploreData>>;
      const data = envelope.data || {};

      return {
        success: true,
        data: {
          ...data,
          recentlyPlayed: data.recentlyPlayed ? normalizeTracks(data.recentlyPlayed) : [],
          yourCreations: data.yourCreations ? normalizeTracks(data.yourCreations) : [],
          yourTopSongs: data.yourTopSongs ? normalizeTracks(data.yourTopSongs) : [],
          featuredPlaylists: data.featuredPlaylists || [],
          popularTracks: data.popularTracks ? normalizeTracks(data.popularTracks) : [],
          topCharts: data.topCharts ? normalizeTracks(data.topCharts) : [],
          recommendations: data.recommendations ? normalizeTracks(data.recommendations) : [],
          worksInProgress: data.worksInProgress ? normalizeTracks(data.worksInProgress) : [],
        },
      } as ServiceResponse<ExploreData>;
    },
    ...STANDARD_QUERY_CONFIG,
    staleTime: 60 * 1000, // Consider explore data stale after 1 minute
    refetchOnMount: 'always', // Refetch in background, but show cached data immediately
    placeholderData: keepPreviousData, // Keep showing previous data during refetch to prevent empty state flash
  });

  const exploreData = exploreResponse?.data;

  // Stable references: use module-level constants instead of inline `|| []`
  const recentlyPlayed = exploreData?.recentlyPlayed ?? EMPTY_TRACKS;
  const yourCreations = exploreData?.yourCreations ?? EMPTY_CREATIONS;
  const yourTopSongs = exploreData?.yourTopSongs ?? EMPTY_TRACKS;
  const popularTracks = exploreData?.popularTracks ?? EMPTY_TRACKS;
  const topCharts = exploreData?.topCharts ?? EMPTY_CHARTS;
  const recommendations = exploreData?.recommendations ?? EMPTY_TRACKS;
  const worksInProgress = exploreData?.worksInProgress ?? EMPTY_WIP;
  const featuredPlaylists = exploreData?.featuredPlaylists ?? EMPTY_PLAYLISTS;

  // Helper function to format duration
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Check if user created music recently (within 7 days)
  const hasRecentCreations = useMemo(
    () =>
      yourCreations.some(creation => {
        const createdDate = new Date(creation.createdAt);
        const daysSinceCreation = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCreation <= 7;
      }),
    [yourCreations]
  );

  const hasNoContent =
    !isLoading &&
    !isFetching &&
    recentlyPlayed.length === 0 &&
    yourCreations.length === 0 &&
    popularTracks.length === 0;

  return useMemo(
    () => ({
      recentlyPlayed,
      yourCreations,
      yourTopSongs,
      featuredPlaylists,
      popularTracks,
      topCharts,
      recommendations,
      worksInProgress,
      isLoading,
      isError,
      error,
      formatDuration,
      hasRecentCreations,
      refetch,
      hasNoContent,
    }),
    [
      recentlyPlayed,
      yourCreations,
      yourTopSongs,
      featuredPlaylists,
      popularTracks,
      topCharts,
      recommendations,
      worksInProgress,
      isLoading,
      isError,
      error,
      hasRecentCreations,
      refetch,
      hasNoContent,
    ]
  );
}
