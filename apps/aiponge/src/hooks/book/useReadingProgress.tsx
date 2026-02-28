import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useAuthStore, selectToken } from '../../auth/store';
import { apiRequest } from '../../lib/axiosApiClient';
import { QUERY_STALE_TIME } from '../../constants/appConfig';

const DEBOUNCE_MS = 1500;

export interface ReadingProgress {
  lastChapterId: string | null;
  lastEntryId: string | null;
  currentPageIndex: number;
  fontSize: 'xs' | 's' | 'm' | 'l' | 'xl';
  lastAccessedAt: string | null;
}

interface UpdateProgressParams {
  lastChapterId?: string | null;
  lastEntryId?: string | null;
  currentPageIndex?: number;
  fontSize?: 'xs' | 's' | 'm' | 'l' | 'xl';
}

export function useReadingProgress(bookId: string) {
  const token = useAuthStore(selectToken);
  const queryClient = useQueryClient();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingParams = useRef<UpdateProgressParams | null>(null);

  const query = useQuery({
    queryKey: ['reading-progress', bookId],
    queryFn: async (): Promise<ReadingProgress> => {
      const defaults: ReadingProgress = {
        lastChapterId: null,
        lastEntryId: null,
        currentPageIndex: 0,
        fontSize: 'm',
        lastAccessedAt: null,
      };

      if (!token) return defaults;

      try {
        const result = await apiRequest<{ success: boolean; data: ReadingProgress; error?: string }>(
          `/api/v1/app/library/${bookId}/progress`
        );
        const data = result as unknown as { success: boolean; data: ReadingProgress; error?: string };
        if (!data.success) throw new Error(data.error);
        return data.data;
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 404) {
          return defaults;
        }
        throw err;
      }
    },
    meta: { silentError: true },
    enabled: !!bookId && !!token,
    staleTime: QUERY_STALE_TIME.long,
    retry: 1,
  });

  const updateMutation = useMutation({
    mutationFn: async (params: UpdateProgressParams): Promise<ReadingProgress | null> => {
      if (!token) throw new Error('Authentication required');

      try {
        const result = await apiRequest<{ success: boolean; data: ReadingProgress; error?: string }>(
          `/api/v1/app/library/${bookId}/progress`,
          { method: 'PATCH', data: params }
        );
        const data = result as unknown as { success: boolean; data: ReadingProgress; error?: string };
        if (!data.success) throw new Error(data.error);
        return data.data;
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    meta: { silentError: true },
    onSuccess: data => {
      if (data) {
        queryClient.setQueryData(['reading-progress', bookId], data);
      }
    },
    retry: (failureCount, error) => {
      if (isAxiosError(error) && error.response?.status === 404) return false;
      return failureCount < 1;
    },
  });

  const debouncedUpdate = useCallback(
    (params: UpdateProgressParams) => {
      pendingParams.current = { ...pendingParams.current, ...params };

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        if (pendingParams.current) {
          updateMutation.mutate(pendingParams.current);
          pendingParams.current = null;
        }
      }, DEBOUNCE_MS);
    },
    [updateMutation]
  );

  return {
    progress: query.data,
    isLoading: query.isLoading,
    updateProgress: debouncedUpdate,
    updateProgressAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
