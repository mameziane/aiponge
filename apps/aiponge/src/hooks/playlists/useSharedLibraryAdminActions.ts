import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';
import { useToast } from '../ui/use-toast';
import { useTranslation } from '../../i18n';
import { logError, getTranslatedFriendlyMessage } from '../../utils/errorSerialization';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';

export interface UseSharedLibraryAdminActionsReturn {
  handleDeleteTrack: (trackId: string) => void;
  isDeletingTrack: boolean;
}

export function useSharedLibraryAdminActions(): UseSharedLibraryAdminActionsReturn {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const deleteTrackMutation = useMutation({
    mutationFn: async (trackId: string) => {
      await apiRequest(`/api/v1/app/library/admin/shared-track/${trackId}`, {
        method: 'DELETE',
      });
    },
    onMutate: async deletedTrackId => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sharedLibrary.tracks() });
      const previousData = queryClient.getQueryData(queryKeys.sharedLibrary.tracks());
      queryClient.setQueryData(
        queryKeys.sharedLibrary.tracks(),
        (old: { data?: { tracks?: Array<{ id: string }> } } | undefined) => {
          if (!old?.data?.tracks) return old;
          return {
            ...old,
            data: {
              ...old.data,
              tracks: old.data.tracks.filter(track => track.id !== deletedTrackId),
            },
          };
        }
      );
      return { previousData };
    },
    onSuccess: async () => {
      invalidateOnEvent(queryClient, { type: 'SHARED_LIBRARY_UPDATED' });
    },
    onError: (err, _deletedTrackId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.sharedLibrary.tracks(), context.previousData);
      }
      const serialized = logError(err, 'Delete Track', 'shared-library');
      toast({
        title: t('common.error', 'Error'),
        description: getTranslatedFriendlyMessage(serialized, t),
        variant: 'destructive',
      });
    },
  });

  return {
    handleDeleteTrack: (trackId: string) => deleteTrackMutation.mutate(trackId),
    isDeletingTrack: deleteTrackMutation.isPending,
  };
}
