import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/axiosApiClient';
import { useAuthStore, selectUser } from '../../auth/store';
import { useToast } from '../ui/use-toast';
import { logger } from '../../lib/logger';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';

type ReactionType = 'resonates' | 'partially' | 'not_me' | 'curious';

interface PatternReaction {
  id: string;
  userId: string;
  patternId: string;
  reaction: string;
  explanation: string | null;
  createdAt: string;
}

type ReactResponse = ServiceResponse<{
  reaction: PatternReaction;
  followUpAction: {
    type: string;
    message: string;
    data?: Record<string, unknown>;
  };
}>;

type EvidenceResponse = ServiceResponse<{
  pattern: Record<string, unknown>;
  reactions: PatternReaction[];
  evidenceEntries: Array<Record<string, unknown>>;
  explorationPrompt: string | null;
}>;

export function usePatternReactions(patternId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useAuthStore(selectUser);

  const evidenceQuery = useQuery<EvidenceResponse>({
    queryKey: ['patterns', 'evidence', patternId],
    queryFn: async () => {
      if (!patternId) throw new Error('Missing patternId');
      const response = await apiClient.get<EvidenceResponse>(`/api/v1/app/patterns/${patternId}/evidence`);
      return response;
    },
    enabled: !!patternId && !!user?.id,
    staleTime: QUERY_STALE_TIME.medium,
  });

  const reactMutation = useMutation<ReactResponse, Error, { reaction: ReactionType; explanation?: string }>({
    mutationFn: async ({ reaction, explanation }) => {
      if (!patternId) throw new Error('Missing patternId');
      const response = await apiClient.post<ReactResponse>(`/api/v1/app/patterns/${patternId}/react`, {
        reaction,
        explanation,
      });
      return response;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      queryClient.invalidateQueries({ queryKey: ['patterns', 'evidence', patternId] });
      const msg = data?.data?.followUpAction?.message;
      if (msg) {
        toast({ title: 'Pattern Explored', description: msg });
      }
    },
    onError: error => {
      logger.error('Pattern reaction failed', { error: error.message });
      toast({ title: 'Error', description: 'Could not record your reaction.', variant: 'destructive' });
    },
  });

  return {
    evidence: evidenceQuery.data?.data || null,
    isLoadingEvidence: evidenceQuery.isLoading,
    react: reactMutation.mutate,
    isReacting: reactMutation.isPending,
    followUpAction: reactMutation.data?.data?.followUpAction || null,
    refetchEvidence: evidenceQuery.refetch,
  };
}
