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

export function usePlaylistFollow(playlistId: string | undefined, userId: string | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: followersData, isLoading } = useApiQuery<
    ServiceResponse<{ followerCount: number; isFollowing: boolean }>
  >({
    endpoint: playlistId ? `/api/v1/app/playlists/${playlistId}/followers` : '',
    queryKey: queryKeys.playlists.followers(playlistId ?? ''),
    context: 'Playlist Followers',
    enabled: !!playlistId,
    queryOptions: { staleTime: QUERY_STALE_TIME.short },
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!playlistId) throw new Error('Playlist ID required');
      const result = await apiRequest(`/api/v1/app/playlists/${playlistId}/follow`, {
        method: 'POST',
      });
      return result as ServiceResponse<unknown>;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'PLAYLIST_FOLLOWED', playlistId: playlistId! });
    },
    onError: createMutationErrorHandler(
      toast,
      'Follow Playlist',
      `/api/v1/app/playlists/${playlistId}/follow`,
      t('alerts.failedToFollowPlaylist') || 'Failed to follow playlist',
      t
    ),
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (!playlistId) throw new Error('Playlist ID required');
      const result = await apiRequest(`/api/v1/app/playlists/${playlistId}/follow`, {
        method: 'DELETE',
      });
      return result as ServiceResponse<unknown>;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'PLAYLIST_UNFOLLOWED', playlistId: playlistId! });
    },
    onError: createMutationErrorHandler(
      toast,
      'Unfollow Playlist',
      `/api/v1/app/playlists/${playlistId}/follow`,
      t('alerts.failedToUnfollowPlaylist') || 'Failed to unfollow playlist',
      t
    ),
  });

  const toggleFollow = useCallback(async () => {
    if (!userId || !playlistId) {
      logger.warn('Cannot toggle playlist follow: missing userId or playlistId');
      return;
    }

    const isCurrentlyFollowing = followersData?.data?.isFollowing ?? false;

    try {
      if (isCurrentlyFollowing) {
        await unfollowMutation.mutateAsync();
      } else {
        await followMutation.mutateAsync();
      }
    } catch (error) {
      logger.error('Failed to toggle playlist follow', error, { playlistId });
    }
  }, [userId, playlistId, followersData?.data?.isFollowing, followMutation, unfollowMutation]);

  return {
    isFollowing: followersData?.data?.isFollowing ?? false,
    followerCount: followersData?.data?.followerCount ?? 0,
    isLoading,
    toggleFollow,
    isToggling: followMutation.isPending || unfollowMutation.isPending,
    canFollow: !!userId && !!playlistId,
  };
}
