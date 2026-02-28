/**
 * useProfileMetrics Hook
 * Aggregates user profile statistics for the dashboard display
 * Combines data from multiple sources: profile and music library
 */

import { useQuery } from '@tanstack/react-query';
import { useAuthStore, selectUserId } from '../../auth/store';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { useProfile } from '../profile/useProfile';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';

export interface ProfileMetrics {
  songsGenerated: number;
  bookEntries: number;
  listeningMinutes: number;
  currentStreak: number;
  longestStreak: number;
  insightsGenerated: number;
  wellnessScore?: number;
  wellnessGrade?: string;
  topThemes: string[];
  activityByDay: { [date: string]: { listened: number; created: number; written: number } };
}

type LibraryStatsResponse = ServiceResponse<{
  totalTracks: number;
  totalListeningMinutes: number;
  topGenres: string[];
}>;

type ThemeAnalysisResponse = ServiceResponse<{
  themes: Array<{ theme: string; count: number }>;
}>;

const METRICS_QUERY_KEY = '/api/v1/app/profile/metrics';

export function useProfileMetrics() {
  const userId = useAuthStore(selectUserId);
  const { profileData, isLoading: profileLoading } = useProfile();

  const metricsQuery = useQuery<ProfileMetrics>({
    queryKey: [METRICS_QUERY_KEY, userId],
    queryFn: async (): Promise<ProfileMetrics> => {
      const profileStats = profileData?.stats || {
        totalInsights: 0,
        totalReflections: 0,
        totalEntries: 0,
      };

      let libraryStats = {
        totalTracks: 0,
        totalListeningMinutes: 0,
        topGenres: [] as string[],
      };

      let topThemes: string[] = [];
      let activityByDay: ProfileMetrics['activityByDay'] = {};

      try {
        const libraryResponse = await apiClient.get<LibraryStatsResponse>('/api/v1/app/library/stats');
        if (libraryResponse?.data) {
          libraryStats = libraryResponse.data as typeof libraryStats;
        }
      } catch (error) {
        logger.debug('Library stats not available, using defaults');
      }

      try {
        const themesResponse = await apiClient.get<ThemeAnalysisResponse>('/api/v1/app/insights/themes');
        if (themesResponse?.data?.themes) {
          topThemes = themesResponse.data.themes.slice(0, 5).map((t: { theme: string }) => t.theme);
        }
      } catch (error) {
        logger.debug('Theme analysis not available, using defaults');
      }

      try {
        const activityResponse = await apiClient.get<ServiceResponse<ProfileMetrics['activityByDay']>>(
          '/api/v1/app/profile/activity?days=90'
        );
        if (activityResponse?.data) {
          activityByDay = activityResponse.data;
        }
      } catch (error) {
        logger.debug('Activity data not available, using defaults');
      }

      return {
        songsGenerated: libraryStats.totalTracks,
        bookEntries: profileStats.totalEntries,
        listeningMinutes: libraryStats.totalListeningMinutes,
        currentStreak: 0,
        longestStreak: 0,
        insightsGenerated: profileStats.totalInsights,
        topThemes,
        activityByDay,
      };
    },
    enabled: !!userId && !profileLoading,
    staleTime: QUERY_STALE_TIME.long,
    refetchOnMount: false,
  });

  return {
    metrics: metricsQuery.data || null,
    isLoading: metricsQuery.isLoading || profileLoading,
    isError: metricsQuery.isError,
    refetch: metricsQuery.refetch,
  };
}
