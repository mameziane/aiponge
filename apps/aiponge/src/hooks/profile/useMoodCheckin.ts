import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/axiosApiClient';
import { useAuthStore, selectUser } from '../../auth/store';
import { useToast } from '../ui/use-toast';
import { logger } from '../../lib/logger';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';

export interface MoodCheckin {
  id: string;
  userId: string;
  mood: string;
  emotionalIntensity: number;
  content: string | null;
  triggerTag: string | null;
  microQuestion: string | null;
  microQuestionResponse: string | null;
  patternConnectionId: string | null;
  respondedAt: string | null;
  createdAt: string;
}

type MoodCheckInResponse = ServiceResponse<{
  checkin: MoodCheckin;
  microQuestion: string;
  patternConnection: {
    connected: boolean;
    patternId?: string;
    patternName?: string;
    message?: string;
  };
}>;

type MoodCheckinsListResponse = ServiceResponse<{
  checkins: MoodCheckin[];
  count: number;
}>;

export function useMoodCheckin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useAuthStore(selectUser);

  const checkinsQuery = useQuery<MoodCheckinsListResponse>({
    queryKey: ['mood-checkins', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      return apiClient.get<MoodCheckinsListResponse>(`/api/v1/app/mood-checkins/${user.id}`);
    },
    enabled: !!user?.id,
    staleTime: QUERY_STALE_TIME.short,
  });

  const recordMutation = useMutation<
    MoodCheckInResponse,
    Error,
    { mood: string; emotionalIntensity: number; content?: string; triggerTag?: string }
  >({
    mutationFn: async input => {
      if (!user?.id) throw new Error('User not authenticated');
      return apiClient.post<MoodCheckInResponse>('/api/v1/app/profile/mood-checkin', {
        userId: user.id,
        ...input,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mood-checkins', user?.id] });
    },
    onError: error => {
      logger.error('Mood check-in failed', { error: error.message });
      toast({ title: 'Error', description: 'Could not record your mood.', variant: 'destructive' });
    },
  });

  const respondMutation = useMutation<unknown, Error, { checkinId: string; microQuestionResponse: string }>({
    mutationFn: async ({ checkinId, microQuestionResponse }) => {
      return apiClient.patch(`/api/v1/app/mood-checkins/${checkinId}/respond`, { microQuestionResponse });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mood-checkins', user?.id] });
    },
    onError: error => {
      logger.error('Mood micro-question response failed', { error: error.message });
    },
  });

  return {
    checkins: checkinsQuery.data?.data?.checkins || [],
    isLoading: checkinsQuery.isLoading,
    recordMood: recordMutation.mutate,
    isRecording: recordMutation.isPending,
    lastResult: recordMutation.data?.data || null,
    respondToMicroQuestion: respondMutation.mutate,
    isResponding: respondMutation.isPending,
    refetch: checkinsQuery.refetch,
  };
}
