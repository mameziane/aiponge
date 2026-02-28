import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';
import { useToast } from '../ui/use-toast';
import { createMutationErrorHandler } from '../../lib/queryErrorHandler';
import { useTranslation } from '../../i18n';
import { logger } from '../../lib/logger';
import { useApiQuery } from '../system/useAppQuery';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';

type FeedbackResponse = ServiceResponse<{
  hasFeedback: boolean;
  wasHelpful?: boolean;
  feedbackId?: string;
}>;

type SubmitFeedbackResponse = ServiceResponse<{
  message?: string;
  feedbackId?: string;
}>;

export function useTrackFeedback(trackId: string | undefined, userId: string | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: feedbackData, isLoading } = useApiQuery<FeedbackResponse>({
    endpoint: trackId ? `/api/v1/app/music/feedback/${trackId}` : '',
    queryKey: queryKeys.tracks.feedback(trackId ?? ''),
    context: 'Track Feedback',
    enabled: !!trackId && !!userId,
    queryOptions: { staleTime: QUERY_STALE_TIME.medium },
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async ({ wasHelpful }: { wasHelpful: boolean }) => {
      if (!trackId) throw new Error('Track ID required');
      const result = await apiRequest('/api/v1/app/music/feedback', {
        method: 'POST',
        data: {
          trackId,
          wasHelpful,
        },
      });
      return result as SubmitFeedbackResponse;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'TRACK_FEEDBACK_SUBMITTED', trackId: trackId! });
    },
    onError: createMutationErrorHandler(
      toast,
      'Submit Feedback',
      '/api/v1/app/music/feedback',
      t('alerts.failedToSubmitFeedback') || 'Failed to submit feedback',
      t
    ),
  });

  const submitFeedback = useCallback(
    async (wasHelpful: boolean) => {
      if (!userId || !trackId) {
        logger.warn('Cannot submit feedback: missing userId or trackId');
        return;
      }

      try {
        await submitFeedbackMutation.mutateAsync({ wasHelpful });
      } catch (error) {
        logger.error('Failed to submit feedback', error, { trackId });
      }
    },
    [userId, trackId, submitFeedbackMutation]
  );

  return {
    hasFeedback: feedbackData?.data?.hasFeedback ?? false,
    wasHelpful: feedbackData?.data?.wasHelpful,
    isLoading,
    submitFeedback,
    isSubmitting: submitFeedbackMutation.isPending,
    canSubmit: !!userId && !!trackId && !feedbackData?.data?.hasFeedback,
  };
}
