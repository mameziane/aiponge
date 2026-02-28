/**
 * Usage Tracking Hook
 * Tracks subscription limits and provides server-side feature gating
 *
 * ARCHITECTURE: All feature gating decisions are made by the backend
 * The frontend only displays the results
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscriptionData } from '../../contexts/SubscriptionContext';
import { useAuthState } from '../auth/useAuthState';
import { apiRequest } from '../../lib/axiosApiClient';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { logger } from '../../lib/logger';
import type { TierId, ServiceResponse } from '@aiponge/shared-contracts';

interface UsageLimits {
  songs: { current: number; limit: number };
  lyrics: { current: number; limit: number };
  insights: { current: number; limit: number };
}

interface FeatureCheck {
  allowed: boolean;
  reason?: string;
  shouldUpgrade?: boolean;
  tier?: TierId;
  isPaidTier?: boolean;
  usage?: {
    current: number;
    limit: number;
    remaining: number;
  };
}

type UsageApiResponse = ServiceResponse<{
  usage: UsageLimits;
}>;

interface EligibilityApiResponse {
  success: boolean;
  allowed: boolean;
  tier: TierId;
  isPaidTier: boolean;
  usage: {
    current: number;
    limit: number;
    remaining: number;
  };
  resetAt?: string;
  reason?: string;
  shouldUpgrade: boolean;
  upgradeMessage?: string;
}

const FIVE_MINUTES = 5 * 60 * 1000;

async function fetchUsageLimits(): Promise<UsageLimits | null> {
  const data = (await apiRequest('/api/v1/app/subscriptions/usage')) as UsageApiResponse;
  if (data.success && data.data) {
    return data.data.usage;
  }
  return null;
}

export function useUsageTracking() {
  const { isPaidTier } = useSubscriptionData();
  const { userId, isAuthenticated } = useAuthState();
  const queryClient = useQueryClient();

  const { data: usage, isLoading: loading } = useQuery({
    queryKey: queryKeys.subscription.usage(),
    queryFn: fetchUsageLimits,
    enabled: !!isAuthenticated && !!userId && !isPaidTier,
    staleTime: FIVE_MINUTES,
    gcTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      const typedError = error as { statusCode?: number };
      if (typedError?.statusCode === 401 || typedError?.statusCode === 419) return false;
      return failureCount < 2;
    },
  });

  const checkFeature = useCallback(
    async (type: 'songs' | 'lyrics' | 'insights'): Promise<FeatureCheck> => {
      if (isPaidTier) {
        return { allowed: true, isPaidTier: true };
      }

      if (!isAuthenticated || !userId) {
        return { allowed: true };
      }

      try {
        const data = (await apiRequest('/api/v1/app/subscriptions/check-eligibility', {
          method: 'POST',
          data: { featureType: type },
          headers: { 'Content-Type': 'application/json' },
        })) as EligibilityApiResponse;

        return {
          allowed: data.allowed,
          reason: data.reason,
          shouldUpgrade: data.shouldUpgrade,
          tier: data.tier,
          isPaidTier: data.isPaidTier,
          usage: data.usage,
        };
      } catch (error: unknown) {
        const typedError = error as { statusCode?: number; response?: { data?: EligibilityApiResponse } };

        if (typedError?.statusCode === 403 && typedError.response?.data) {
          const data = typedError.response.data;
          return {
            allowed: false,
            reason: data.reason,
            shouldUpgrade: data.shouldUpgrade,
            tier: data.tier,
            isPaidTier: data.isPaidTier,
            usage: data.usage,
          };
        }

        if (typedError?.statusCode !== 401 && typedError?.statusCode !== 419) {
          logger.error('Failed to check feature eligibility', error);
        }

        return { allowed: true };
      }
    },
    [isPaidTier, userId, isAuthenticated]
  );

  const checkFeatureSync = useCallback(
    (type: 'songs' | 'lyrics' | 'insights'): FeatureCheck => {
      if (isPaidTier) {
        return { allowed: true, isPaidTier: true };
      }

      if (!usage) {
        return { allowed: true };
      }

      const limit = usage[type];
      if (!limit) {
        return { allowed: true };
      }
      const remaining = limit.limit - limit.current;

      return {
        allowed: remaining > 0,
        usage: {
          current: limit.current,
          limit: limit.limit,
          remaining: Math.max(0, remaining),
        },
        shouldUpgrade: remaining <= 0,
      };
    },
    [isPaidTier, usage]
  );

  const incrementUsage = useCallback(
    async (type: 'songs' | 'lyrics' | 'insights') => {
      if (!isAuthenticated || !userId || isPaidTier) return;

      try {
        await apiRequest('/api/v1/app/subscriptions/increment-usage', {
          method: 'POST',
          data: { type },
          headers: { 'Content-Type': 'application/json' },
        });

        invalidateOnEvent(queryClient, { type: 'SUBSCRIPTION_USAGE_UPDATED' });
      } catch (error: unknown) {
        const typedError = error as { statusCode?: number };
        if (typedError?.statusCode !== 401 && typedError?.statusCode !== 419) {
          logger.error('Failed to increment usage', error);
        }
      }
    },
    [userId, isPaidTier, isAuthenticated, queryClient]
  );

  const refreshUsage = useCallback(() => {
    invalidateOnEvent(queryClient, { type: 'SUBSCRIPTION_USAGE_UPDATED' });
  }, [queryClient]);

  return {
    usage: usage ?? null,
    loading,
    isPaidTier,
    checkFeature,
    checkFeatureSync,
    incrementUsage,
    refreshUsage,
  };
}
