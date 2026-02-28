import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/axiosApiClient';
import { useAuthStore, selectUser } from '../../auth/store';
import { useToast } from '../ui/use-toast';
import { logger } from '../../lib/logger';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';

export interface ReflectionTurn {
  id: string;
  reflectionId: string;
  turnNumber: number;
  question: string;
  response: string | null;
  microInsight: string | null;
  therapeuticFramework: string | null;
  respondedAt: string | null;
  createdAt: string;
}

type DialogueResponse = ServiceResponse<{
  reflection: { id: string; challengeQuestion: string; isBreakthrough: boolean | null };
  turns: ReflectionTurn[];
  latestTurn: ReflectionTurn;
  nextQuestion: ReflectionTurn | null;
  isBreakthrough: boolean;
  synthesis: string | null;
}>;

type ThreadResponse = ServiceResponse<{
  reflection: {
    id: string;
    userId: string;
    challengeQuestion: string;
    userResponse: string | null;
    isBreakthrough: boolean | null;
    createdAt: string;
  };
  turns: ReflectionTurn[];
}>;

export function useReflectionDialogue(reflectionId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useAuthStore(selectUser);

  const threadQuery = useQuery<ThreadResponse>({
    queryKey: ['reflections', 'thread', reflectionId],
    queryFn: async () => {
      if (!reflectionId || !user?.id) throw new Error('Missing data');
      const response = await apiClient.get<ThreadResponse>(
        `/api/v1/app/reflections/${reflectionId}/thread?userId=${user.id}`
      );
      return response;
    },
    enabled: !!reflectionId && !!user?.id,
    staleTime: QUERY_STALE_TIME.short,
  });

  const continueMutation = useMutation<DialogueResponse, Error, { userResponse: string }>({
    mutationFn: async ({ userResponse }) => {
      if (!reflectionId || !user?.id) throw new Error('Missing data');
      const response = await apiClient.post<DialogueResponse>(`/api/v1/app/reflections/${reflectionId}/continue`, {
        userId: user.id,
        userResponse,
      });
      return response;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['reflections', 'thread', reflectionId] });
      queryClient.invalidateQueries({ queryKey: ['reflections'] });
      if (data?.data?.isBreakthrough) {
        toast({ title: 'Breakthrough!', description: 'You had a moment of deeper understanding.' });
      }
    },
    onError: error => {
      logger.error('Continue dialogue failed', { error: error.message });
      toast({ title: 'Error', description: 'Could not continue the dialogue.', variant: 'destructive' });
    },
  });

  return {
    reflection: threadQuery.data?.data?.reflection || null,
    turns: threadQuery.data?.data?.turns || [],
    isLoading: threadQuery.isLoading,
    isError: threadQuery.isError,
    continueDialogue: continueMutation.mutate,
    isContinuing: continueMutation.isPending,
    latestResult: continueMutation.data?.data || null,
    refetch: threadQuery.refetch,
  };
}
