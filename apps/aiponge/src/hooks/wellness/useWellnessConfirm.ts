/**
 * Wellness Confirm Hook
 * Mutation for POST /api/app/wellness/confirm
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';

interface ConfirmRequest {
  sessionId: string;
  previewTrackId: string;
}

interface ConfirmResponse {
  sessionId: string;
  previewTrack: {
    id: string;
    status: string;
    visibility: string;
  };
  bookRequestId: string;
  albumRequestId: string | null;
  recipientNotified: boolean;
}

export function useWellnessConfirm() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (request: ConfirmRequest) => {
      const response = await apiRequest<ConfirmResponse>('/api/v1/app/wellness/confirm', {
        method: 'POST',
        data: request,
      });
      return response;
    },
    onSuccess: () => {
      // Invalidate relevant caches — new content will appear in library
      queryClient.invalidateQueries({ queryKey: ['/api/v1/app/library/private'] });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/app/music'] });
    },
  });

  return {
    confirm: mutation.mutate,
    confirmAsync: mutation.mutateAsync,
    data: mutation.data,
    isPending: mutation.isPending,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
  };
}
