import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient, extractErrorMessage } from '../../lib/axiosApiClient';
import { useAuthStore, selectUserId } from '../../auth/store';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { logger } from '../../lib/logger';

interface CreditBalance {
  currentBalance: number;
  totalSpent: number;
  remaining: number;
}

interface CreditPolicy {
  musicGeneration: {
    costPerSong: number;
    description: string;
  };
  minimumBalance: {
    required: number;
    description: string;
  };
}

interface ValidationResult {
  hasCredits: boolean;
  currentBalance: number;
  required: number;
  shortfall?: number;
}

const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

async function fetchCreditPolicy(): Promise<CreditPolicy | null> {
  const response = await apiClient.get<ServiceResponse<CreditPolicy>>('/api/v1/app/credits/policy');
  if (response.success && response.data) {
    return response.data;
  }
  logger.error('Failed to load credit policy', { response });
  throw new Error(extractErrorMessage(response) || 'Failed to load credit policy');
}

async function fetchCreditBalance(): Promise<CreditBalance | null> {
  const response = await apiClient.get<ServiceResponse<CreditBalance>>('/api/v1/app/credits/balance');
  if (response.success && response.data) {
    return response.data;
  }
  throw new Error(extractErrorMessage(response));
}

export function useCredits() {
  const userId = useAuthStore(selectUserId);
  const queryClient = useQueryClient();

  const { data: policy, error: policyError } = useQuery({
    queryKey: queryKeys.credits.policy(),
    queryFn: fetchCreditPolicy,
    enabled: !!userId,
    staleTime: THIRTY_MINUTES,
    gcTime: THIRTY_MINUTES,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const {
    data: balance,
    isLoading: loading,
    error: balanceError,
  } = useQuery({
    queryKey: queryKeys.credits.balance(),
    queryFn: fetchCreditBalance,
    enabled: !!userId,
    staleTime: FIVE_MINUTES,
    gcTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const validateCreditsForOperation = useCallback(
    async (amount?: number): Promise<ValidationResult> => {
      if (!userId) {
        throw new Error('User must be authenticated');
      }

      if (!amount && !policy?.musicGeneration.costPerSong) {
        throw new Error('Credit policy not loaded — cannot determine cost');
      }

      const requiredAmount = amount || policy!.musicGeneration.costPerSong;

      const response = await apiClient.post<ServiceResponse<ValidationResult>>('/api/v1/app/credits/validate', {
        amount: requiredAmount,
      });

      if (response.success && response.data) {
        return response.data;
      }

      throw new Error(extractErrorMessage(response));
    },
    [userId, policy]
  );

  const refreshBalance = useCallback(() => {
    invalidateOnEvent(queryClient, { type: 'CREDITS_CHANGED' });
  }, [queryClient]);

  return {
    balance: balance ?? null,
    policy: policy ?? null,
    loading,
    error:
      balanceError || policyError
        ? balanceError instanceof Error
          ? balanceError.message
          : policyError instanceof Error
            ? policyError.message
            : 'Failed to load credits'
        : null,
    validateCreditsForOperation,
    refreshBalance,
    creditCostPerSong: policy?.musicGeneration.costPerSong ?? null,
  };
}
