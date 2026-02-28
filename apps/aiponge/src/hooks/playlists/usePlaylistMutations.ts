import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { apiRequest } from '../../lib/axiosApiClient';
import { useToast } from '../ui/use-toast';
import { logError, getTranslatedFriendlyMessage, serializeError } from '../../utils/errorSerialization';
import { useAuthStore, selectUserId } from '../../auth/store';
import { createMutationErrorHandler } from '../../lib/queryErrorHandler';
import { useTranslation } from '../../i18n';
import { invalidateOnEvent } from '../../lib/cacheManager';

export function usePlaylistMutations() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userId = useAuthStore(selectUserId);

  // Create playlist mutation
  const createPlaylistMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      // Note: userId is automatically injected by JWT middleware
      const result = await apiRequest('/api/v1/app/playlists', {
        method: 'POST',
        data: {
          name,
          description,
          visibility: CONTENT_VISIBILITY.PERSONAL,
        },
      });
      return result;
    },
    onSuccess: () => {
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'PLAYLIST_CREATED' });

      toast({
        title: t('alerts.playlistCreated'),
        description: t('alerts.playlistCreatedDescription'),
      });
    },
    onError: createMutationErrorHandler(
      toast,
      'Create Playlist',
      '/api/v1/playlists',
      t('alerts.failedToCreatePlaylist'),
      t
    ),
  });

  // Add track to playlist mutation
  const addTrackToPlaylistMutation = useMutation({
    mutationFn: async ({ playlistId, trackId }: { playlistId: string; trackId: string }) => {
      // Note: userId is automatically injected by JWT middleware
      const result = await apiRequest(`/api/v1/app/playlists/${playlistId}/tracks`, {
        method: 'POST',
        data: {
          trackId,
        },
      });
      return result;
    },
    onSuccess: (data, variables) => {
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'PLAYLIST_TRACK_ADDED', playlistId: variables.playlistId });

      toast({
        title: t('alerts.trackAdded'),
        description: t('alerts.trackAddedDescription'),
      });
    },
    onError: (error: unknown) => {
      // Check if it's a duplicate track error (409 Conflict)
      const errorMessage = (error as Error)?.message || '';
      const isDuplicate = errorMessage.includes('409') || errorMessage.toLowerCase().includes('already in playlist');

      if (isDuplicate) {
        // Show friendly info toast for duplicates
        toast({
          title: t('alerts.trackAlreadyAdded'),
          description: t('alerts.trackAlreadyAddedDescription'),
        });
      } else {
        // Show error toast for other failures
        const serialized = logError(error, 'Add Track to Playlist', '/api/v1/playlists/*/tracks');
        toast({
          title: t('alerts.failedToAddTrack'),
          description: getTranslatedFriendlyMessage(serialized, t),
          variant: 'destructive',
        });
      }
    },
  });

  // Remove track from playlist mutation
  const removeTrackFromPlaylistMutation = useMutation({
    mutationFn: async ({ playlistId, trackId }: { playlistId: string; trackId: string }) => {
      const result = await apiRequest(`/api/v1/app/playlists/${playlistId}/tracks/${trackId}`, {
        method: 'DELETE',
      });
      return result;
    },
    onMutate: async ({ playlistId, trackId }) => {
      const playlistTracksKey = ['/api/v1/app/playlists', playlistId, 'tracks'];
      await queryClient.cancelQueries({ queryKey: playlistTracksKey });
      const previousData = queryClient.getQueryData(playlistTracksKey);
      queryClient.setQueryData(
        playlistTracksKey,
        (
          old:
            | {
                data?: { tracks?: Array<{ id: string }>; total?: number };
                tracks?: Array<{ id: string }>;
                total?: number;
              }
            | undefined
        ) => {
          if (!old) return old;
          if (old.data?.tracks) {
            return {
              ...old,
              data: {
                ...old.data,
                tracks: old.data.tracks.filter(track => track.id !== trackId),
                total: (old.data.total ?? old.data.tracks.length) - 1,
              },
            };
          }
          if (old.tracks) {
            return {
              ...old,
              tracks: old.tracks.filter(track => track.id !== trackId),
              total: (old.total ?? old.tracks.length) - 1,
            };
          }
          return old;
        }
      );
      return { previousData, playlistTracksKey };
    },
    onSuccess: async (_data, variables, _context) => {
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'PLAYLIST_TRACK_REMOVED', playlistId: variables.playlistId });
    },
    onError: (error, _variables, context) => {
      if (context?.previousData && context?.playlistTracksKey) {
        queryClient.setQueryData(context.playlistTracksKey, context.previousData);
      }
      createMutationErrorHandler(
        toast,
        'Remove Track from Playlist',
        '/api/v1/playlists/*/tracks/*',
        t('alerts.failedToRemoveTrack'),
        t
      )(error);
    },
  });

  // Rename playlist mutation
  const renamePlaylistMutation = useMutation({
    mutationFn: async ({ playlistId, name }: { playlistId: string; name: string }) => {
      const result = await apiRequest(`/api/v1/app/playlists/${playlistId}`, {
        method: 'PATCH',
        data: { name },
      });
      return result;
    },
    onSuccess: (_, variables) => {
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'PLAYLIST_UPDATED', playlistId: variables.playlistId });
    },
    onError: createMutationErrorHandler(
      toast,
      'Rename Playlist',
      '/api/v1/app/playlists/*/rename',
      t('alerts.failedToRenamePlaylist'),
      t
    ),
  });

  // Update playlist artwork mutation
  const updatePlaylistArtworkMutation = useMutation({
    mutationFn: async ({ playlistId, artworkUrl }: { playlistId: string; artworkUrl: string }) => {
      const result = await apiRequest(`/api/v1/app/playlists/${playlistId}`, {
        method: 'PATCH',
        data: { artworkUrl },
      });
      return result;
    },
    onSuccess: (_, variables) => {
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'PLAYLIST_UPDATED', playlistId: variables.playlistId });
    },
    onError: createMutationErrorHandler(
      toast,
      'Update Playlist Artwork',
      '/api/v1/app/playlists/*/artwork',
      t('alerts.failedToUpdateArtwork'),
      t
    ),
  });

  // Delete playlist mutation (keeps tracks)
  const deletePlaylistMutation = useMutation({
    mutationFn: async ({ playlistId }: { playlistId: string }) => {
      const result = await apiRequest(`/api/v1/app/playlists/${playlistId}`, {
        method: 'DELETE',
      });
      return result;
    },
    onMutate: async ({ playlistId }) => {
      const userPlaylistsKey = ['/api/v1/app/playlists/user', userId];
      await queryClient.cancelQueries({ queryKey: userPlaylistsKey });
      const previousData = queryClient.getQueryData(userPlaylistsKey);
      queryClient.setQueryData(
        userPlaylistsKey,
        (old: { data?: Array<{ id: string }> | { playlists?: Array<{ id: string }> } } | undefined) => {
          if (!old?.data) return old;
          if (Array.isArray(old.data)) {
            return {
              ...old,
              data: old.data.filter(playlist => playlist.id !== playlistId),
            };
          }
          if (old.data.playlists) {
            return {
              ...old,
              data: {
                ...old.data,
                playlists: old.data.playlists.filter(playlist => playlist.id !== playlistId),
              },
            };
          }
          return old;
        }
      );
      return { previousData, userPlaylistsKey };
    },
    onSuccess: async (_data, variables) => {
      invalidateOnEvent(queryClient, { type: 'PLAYLIST_DELETED', playlistId: variables.playlistId });
    },
    onError: (error, _variables, context) => {
      if (context?.previousData && context?.userPlaylistsKey) {
        queryClient.setQueryData(context.userPlaylistsKey, context.previousData);
      }
      createMutationErrorHandler(
        toast,
        'Delete Playlist',
        '/api/v1/app/playlists/*',
        t('alerts.failedToDeletePlaylist'),
        t
      )(error);
    },
  });

  return {
    createPlaylist: createPlaylistMutation.mutateAsync,
    addTrackToPlaylist: addTrackToPlaylistMutation.mutateAsync,
    removeTrackFromPlaylist: removeTrackFromPlaylistMutation.mutateAsync,
    renamePlaylist: renamePlaylistMutation.mutateAsync,
    updatePlaylistArtwork: updatePlaylistArtworkMutation.mutateAsync,
    deletePlaylist: deletePlaylistMutation.mutateAsync,
    isCreatingPlaylist: createPlaylistMutation.isPending,
    isAddingTrack: addTrackToPlaylistMutation.isPending,
    isRemovingTrack: removeTrackFromPlaylistMutation.isPending,
    isRenamingPlaylist: renamePlaylistMutation.isPending,
    isUpdatingArtwork: updatePlaylistArtworkMutation.isPending,
    isDeletingPlaylist: deletePlaylistMutation.isPending,
  };
}
