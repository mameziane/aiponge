import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/axiosApiClient';
import { useAuthStore, selectUser } from '../../auth/store';
import { useToast } from '../ui/use-toast';
import { logger } from '../../lib/logger';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';

export interface PersonalNarrative {
  id: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  narrative: string;
  dataPointsUsed: number;
  breakthroughsReferenced: string[] | null;
  forwardPrompt: string | null;
  userReflection: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

type NarrativeResponse = ServiceResponse<{
  narrative: PersonalNarrative;
  isNew: boolean;
  dataPointsSummary: {
    reflections: number;
    moodCheckins: number;
    patterns: number;
    total: number;
  };
}>;

type NarrativeHistoryResponse = ServiceResponse<{
  narratives: PersonalNarrative[];
  count: number;
}>;

export function usePersonalNarrative() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useAuthStore(selectUser);

  const latestQuery = useQuery<NarrativeResponse>({
    queryKey: ['narratives', 'latest', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      return apiClient.get<NarrativeResponse>(`/api/v1/app/profile/narrative/${user.id}`);
    },
    enabled: !!user?.id,
    staleTime: QUERY_STALE_TIME.long,
  });

  const historyQuery = useQuery<NarrativeHistoryResponse>({
    queryKey: ['narratives', 'history', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      return apiClient.get<NarrativeHistoryResponse>(`/api/v1/app/narratives/${user.id}`);
    },
    enabled: !!user?.id,
    staleTime: QUERY_STALE_TIME.long,
  });

  const respondMutation = useMutation<unknown, Error, { narrativeId: string; userReflection: string }>({
    mutationFn: async ({ narrativeId, userReflection }) => {
      if (!user?.id) throw new Error('User not authenticated');
      return apiClient.post(`/api/v1/app/narratives/${narrativeId}/respond`, {
        userId: user.id,
        userReflection,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['narratives'] });
      toast({ title: 'Reflection saved', description: 'Your thoughts have been recorded.' });
    },
    onError: error => {
      logger.error('Narrative response failed', { error: error.message });
      toast({ title: 'Error', description: 'Could not save your reflection.', variant: 'destructive' });
    },
  });

  return {
    narrative: latestQuery.data?.data?.narrative || null,
    isNew: latestQuery.data?.data?.isNew || false,
    dataPointsSummary: latestQuery.data?.data?.dataPointsSummary || null,
    history: historyQuery.data?.data?.narratives || [],
    isLoading: latestQuery.isLoading,
    isLoadingHistory: historyQuery.isLoading,
    respondToNarrative: respondMutation.mutate,
    isResponding: respondMutation.isPending,
    refetch: latestQuery.refetch,
  };
}
