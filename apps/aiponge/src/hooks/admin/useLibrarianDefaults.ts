/**
 * useLibrarianDefaults Hook
 *
 * Fetches and caches platform-wide defaults from the backend.
 * These defaults are configured by librarians and affect all users.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import type { LibrarianDefaults, LibrarianDefaultsResponse } from '../../types/librarianDefaults.types';
import { queryKeys } from '../../lib/queryKeys';

const DEFAULTS_STALE_TIME = 5 * 60 * 1000;
const DEFAULTS_GC_TIME = 30 * 60 * 1000;

export function useLibrarianDefaults() {
  const queryClient = useQueryClient();

  const query = useQuery<LibrarianDefaults>({
    queryKey: queryKeys.config.defaults,
    queryFn: async () => {
      try {
        const response = await apiRequest<LibrarianDefaultsResponse>('/api/v1/app/config/defaults');
        if (response.success && response.data) {
          return response.data;
        }
        throw new Error('Failed to fetch librarian defaults');
      } catch (error) {
        logger.error('Failed to fetch librarian defaults', { error });
        throw error;
      }
    },
    staleTime: DEFAULTS_STALE_TIME,
    gcTime: DEFAULTS_GC_TIME,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<LibrarianDefaults>) => {
      const response = await apiRequest<LibrarianDefaultsResponse>('/api/v1/librarian/config/defaults', {
        method: 'PUT',
        data: updates,
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update librarian defaults');
      }
      return response.data;
    },
    onSuccess: data => {
      queryClient.setQueryData(queryKeys.config.defaults, data);
    },
    onError: error => {
      logger.error('Failed to update librarian defaults', { error });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest<LibrarianDefaultsResponse>('/api/v1/librarian/config/defaults/reset', {
        method: 'POST',
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to reset librarian defaults');
      }
      return response.data;
    },
    onSuccess: data => {
      queryClient.setQueryData(queryKeys.config.defaults, data);
    },
    onError: error => {
      logger.error('Failed to reset librarian defaults', { error });
    },
  });

  return {
    defaults: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    updateDefaults: updateMutation.mutate,
    updateDefaultsAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,

    resetDefaults: resetMutation.mutate,
    resetDefaultsAsync: resetMutation.mutateAsync,
    isResetting: resetMutation.isPending,
  };
}

export function useMusicDefaults() {
  const { defaults, isLoading } = useLibrarianDefaults();
  return {
    musicDefaults: defaults?.musicDefaults,
    isLoading,
  };
}

export function useAvailableOptions() {
  const { defaults, isLoading } = useLibrarianDefaults();
  return {
    options: defaults?.availableOptions,
    isLoading,
  };
}

export function useContentLimits() {
  const { defaults, isLoading } = useLibrarianDefaults();
  return {
    limits: defaults?.contentLimits,
    isLoading,
  };
}

export function useUiConfiguration() {
  const { defaults, isLoading } = useLibrarianDefaults();
  return {
    config: defaults?.uiConfiguration,
    isLoading,
  };
}
