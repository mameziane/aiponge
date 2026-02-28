/**
 * useAppInit Hook
 * Composite startup hook that fetches all initial app data in a single API call
 * Reduces 6+ startup API calls to 1, significantly improving Time to Interactive
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, selectUserId } from '../../auth/store';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { QUERY_STALE_TIME } from '../../constants/appConfig';

interface InitCredits {
  balance: {
    balance: number;
    userId: string;
  } | null;
  policy: {
    costPerSong: number;
    minimumBalance: number;
    welcomeCredits: number;
  } | null;
}

interface InitProfile {
  email: string;
  profile: {
    firstName: string;
    lastName: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    timezone: string | null;
    birthDate: string | null;
    gender: string | null;
    location: string | null;
    language: string;
    isOnboarded: boolean;
  };
  preferences?: Record<string, unknown>;
  stats: {
    totalEntries: number;
    totalInsights: number;
    currentStreak: number;
    longestStreak: number;
    lastActivityAt: string | null;
  };
}

interface InitEntry {
  id: string;
  content: string;
  type: string;
  createdAt: string;
}

type InitResponse = ServiceResponse<{
  profile: InitProfile | null;
  credits: InitCredits;
  guestConversionPolicy: Record<string, unknown>;
  recentEntry: InitEntry[];
}>;

const APP_INIT_QUERY_KEY = '/api/v1/app/init';

async function fetchAppInit(): Promise<InitResponse | null> {
  try {
    const response = await apiClient.get<InitResponse>(APP_INIT_QUERY_KEY);
    return response;
  } catch (error) {
    logger.error('Failed to fetch app init data', error);
    return null;
  }
}

export function useAppInit() {
  const userId = useAuthStore(selectUserId);
  const queryClient = useQueryClient();

  const query = useQuery<InitResponse | null>({
    queryKey: [APP_INIT_QUERY_KEY, userId],
    queryFn: fetchAppInit,
    enabled: !!userId,
    staleTime: QUERY_STALE_TIME.long,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const invalidateInit = () => {
    invalidateOnEvent(queryClient, { type: 'APP_INIT_REFRESH' });
  };

  return {
    ...query,
    profile: query.data?.data?.profile || null,
    credits: query.data?.data?.credits || null,
    guestConversionPolicy: query.data?.data?.guestConversionPolicy || null,
    recentEntries: query.data?.data?.recentEntry || [],
    invalidateInit,
  };
}

export { APP_INIT_QUERY_KEY };
