import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import type { Insight } from '../../types/profile.types';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';
import { QUERY_STALE_TIME } from '../../constants/appConfig';

export function useEntryInsights(entryId: string | null | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.entries.insights(entryId ?? undefined),
    queryFn: async () => {
      if (!entryId) {
        return { insights: [] };
      }

      logger.debug('Fetching insights for entry', { entryId });

      const response = await apiClient.get<ServiceResponse<{ insights: Insight[] }>>(
        `/api/v1/app/insights/entry/${entryId}`
      );

      return {
        insights: response?.data?.insights || [],
      };
    },
    enabled: !!entryId,
    staleTime: QUERY_STALE_TIME.short,
  });

  const createInsightMutation = useMutation({
    mutationFn: async ({
      content,
      type = 'reflection',
      category = 'general',
    }: {
      content: string;
      type?: string;
      category?: string;
    }) => {
      if (!entryId) {
        throw new Error('Entry ID is required');
      }

      logger.debug('Creating insight for entry', { entryId, contentLength: content.length });

      const response = await apiClient.post<ServiceResponse<Insight>>('/api/v1/app/insights', {
        entryId,
        content,
        type,
        category,
      });

      return response?.data;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'INSIGHT_GENERATED', entryId: entryId! });
      logger.info('Insight created and cache invalidated', { entryId });
    },
    onError: error => {
      logger.error('Failed to create insight', error);
    },
  });

  return {
    insights: data?.insights || [],
    isLoading,
    isError,
    refetch,
    createInsight: createInsightMutation.mutateAsync,
    isCreating: createInsightMutation.isPending,
  };
}
