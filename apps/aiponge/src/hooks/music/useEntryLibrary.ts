/**
 * Entry Library Hook
 * Manages the entries list with auto-refetch on screen focus
 * and provides entry deletion functionality.
 */

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { apiRequest } from '../../lib/axiosApiClient';
import { useAuthState } from '../auth/useAuthState';
import { useEntriesSimple } from '../book/useUnifiedLibrary';
import { useToast } from '../ui/use-toast';
import { useTranslation } from '../../i18n';
import { wrapErrorHandler } from '../system/useAppQuery';
import { invalidateOnEvent } from '../../lib/cacheManager';
import type { Entry } from '../../types/profile.types';

export type { Entry };

export function useEntryLibrary() {
  const { isGuest } = useAuthState();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // ✅ UNIFIED: Use shared entries hook as single source of truth
  // This fixes the 1/50 vs 1/20 count discrepancy between screens
  const {
    entries,
    total: totalEntries,
    isLoading: isLoadingEntries,
    refetch: refetchEntries,
    invalidateEntries,
  } = useEntriesSimple();

  // Auto-refetch entries when screen gains focus (e.g., navigating from Profile screen)
  // Skipped for guests — they have no personal entries, avoiding a wasted network call
  useFocusEffect(
    React.useCallback(() => {
      if (!isGuest) refetchEntries();
    }, [refetchEntries, isGuest])
  );

  // Delete entry mutation - uses unified cache invalidation
  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await apiRequest(`/api/v1/app/entries/${entryId}`, {
        method: 'DELETE',
      });
      return response;
    },
    onSuccess: () => {
      // ✅ UNIFIED: Invalidate shared entries cache for all screens
      invalidateEntries();
      // Also invalidate profile to refresh totalEntries in stats
      invalidateOnEvent(queryClient, { type: 'PROFILE_UPDATED' });
    },
    onError: wrapErrorHandler(toast, t, 'Delete Entry', undefined, {
      customTitle: t('hooks.musicGeneration.deleteFailed'),
    }),
  });

  return {
    entries,
    totalEntries,
    isLoadingEntries,
    refetchEntries,
    invalidateEntries,
    deleteEntry: deleteEntryMutation.mutate,
    isDeletingEntry: deleteEntryMutation.isPending,
  };
}
