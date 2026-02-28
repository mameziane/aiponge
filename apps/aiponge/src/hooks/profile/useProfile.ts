/**
 * useProfile Hook
 * Centralized React Query hook for profile data fetching
 *
 * OPTIMIZATION: First checks if profile is available in the composite /api/app/init cache
 * to avoid duplicate API calls. Falls back to dedicated /api/app/profile endpoint only
 * when init data is not available or stale.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, selectUserId } from '../../auth/store';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import type { ProfileData } from '../../types/profile.types';
import { APP_INIT_QUERY_KEY } from '../system/useAppInit';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import { invalidateOnEvent } from '../../lib/cacheManager';
import type { ServiceResponse } from '@aiponge/shared-contracts';

interface ProfileApiResponse {
  email: string;
  profile: ProfileData['profile'];
  preferences?: {
    notifications?: boolean;
    visibility?: string;
    theme?: string;
    musicPreferences?: string;
    musicGenre?: string;
    musicInstruments?: string[];
    languagePreference?: string;
    currentMood?: string;
    vocalGender?: 'f' | 'm' | null;
  };
  stats: ProfileData['stats'];
}

/** @deprecated Use ServiceResponse<ProfileApiResponse | null> directly */
export type ProfileResponse = ServiceResponse<ProfileApiResponse | null>;

const PROFILE_QUERY_KEY = '/api/v1/app/profile';

export function useProfile() {
  const userId = useAuthStore(selectUserId);
  const queryClient = useQueryClient();

  const query = useQuery<ProfileResponse>({
    queryKey: [PROFILE_QUERY_KEY, userId],
    queryFn: async (): Promise<ProfileResponse> => {
      // OPTIMIZATION: Check if profile is available in composite init cache
      // This prevents duplicate /api/app/profile calls when init already has the data
      const initData = queryClient.getQueryData<{ data?: { profile?: Record<string, unknown> } }>([
        APP_INIT_QUERY_KEY,
        userId,
      ]);
      // Type guard: ensure init data has valid profile structure with required fields
      const initProfile = initData?.data?.profile;
      if (initProfile && typeof initProfile === 'object' && 'email' in initProfile && 'profile' in initProfile) {
        logger.debug('[useProfile] Using cached profile from /api/app/init');
        return {
          success: true,
          data: initProfile as unknown as ProfileApiResponse,
        };
      }

      // Fallback: fetch dedicated profile endpoint
      try {
        // Backend returns { success, data } envelope - extract the inner data
        const apiResponse = await apiClient.get<{ success: boolean; data: ProfileApiResponse }>(PROFILE_QUERY_KEY);

        return {
          success: true,
          data: apiResponse?.data || null,
        };
      } catch (error) {
        logger.error('Failed to fetch profile', error);
        return {
          success: false,
          data: null,
        };
      }
    },
    enabled: !!userId,
    staleTime: QUERY_STALE_TIME.long,
    refetchOnMount: false, // Don't refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch on focus
  });

  const invalidateProfile = () => {
    // Use centralized cache invalidation for profile
    invalidateOnEvent(queryClient, { type: 'PROFILE_UPDATED' });
  };

  return {
    ...query,
    profileData: query.data?.data || null,
    invalidateProfile,
  };
}

export { PROFILE_QUERY_KEY };
