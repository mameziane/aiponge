import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateOnEvent } from '../../lib/cacheManager';

export function useBatchFavorites() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ trackIds, action }: { trackIds: string[]; action: 'add' | 'remove' }) => {
      const result = await apiRequest('/api/v1/app/music/favorites/batch', {
        method: 'POST',
        data: { trackIds, action },
      });
      return result;
    },
    onSuccess: (_, variables) => {
      const eventType = variables.action === 'add' ? 'TRACK_FAVORITED' : 'TRACK_UNFAVORITED';
      variables.trackIds.forEach(trackId => {
        invalidateOnEvent(queryClient, { type: eventType, trackId });
      });
    },
  });
}

export function useBatchTrackUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      updates,
    }: {
      updates: Array<{ id: string; title?: string; genres?: string[]; tags?: string[]; visibility?: string }>;
    }) => {
      const result = await apiRequest('/api/v1/app/music/tracks/batch', {
        method: 'PATCH',
        data: { updates },
      });
      return result;
    },
    onSuccess: (_, variables) => {
      variables.updates.forEach(update => {
        invalidateOnEvent(queryClient, { type: 'TRACK_UPDATED', trackId: update.id });
      });
    },
  });
}

export function useBatchPlaylistTracks(playlistId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ trackIds, action }: { trackIds: string[]; action: 'add' | 'remove' }) => {
      const result = await apiRequest(`/api/v1/app/music/playlists/${playlistId}/tracks/batch`, {
        method: 'POST',
        data: { trackIds, action },
      });
      return result;
    },
    onSuccess: (_, variables) => {
      const eventType = variables.action === 'add' ? 'PLAYLIST_TRACK_ADDED' : 'PLAYLIST_TRACK_REMOVED';
      invalidateOnEvent(queryClient, { type: eventType, playlistId });
    },
  });
}
