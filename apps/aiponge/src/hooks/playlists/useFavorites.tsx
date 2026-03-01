import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_VISIBILITY, type ServiceResponse } from '@aiponge/shared-contracts';
import { apiRequest } from '../../lib/axiosApiClient';
import { useToast } from '../ui/use-toast';
import { createMutationErrorHandler } from '../../lib/queryErrorHandler';
import { useTranslation } from '../../i18n';
import { logger } from '../../lib/logger';
import { useApiQuery } from '../system/useAppQuery';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';
import { useBatchFavorites } from '../music/useBatchMutations';
import { QUERY_STALE_TIME } from '../../constants/appConfig';

const FAVORITES_PLAYLIST_NAME = 'Favorites';

export interface FavoritesPlaylist {
  id: string;
  name: string;
  totalTracks: number;
}

interface FavoritesTrack {
  id: string;
  title?: string;
}

/**
 * Hook to manage favorites playlist and track membership
 * Automatically creates a "Favorites" playlist if it doesn't exist
 */
export function useFavorites(userId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [trackIdsInFavorites, setTrackIdsInFavorites] = useState<Set<string>>(new Set());

  // Fetch user's playlists to find or create Favorites
  const { data: playlistsData, isLoading: isLoadingPlaylists } = useApiQuery<
    ServiceResponse<{ playlists: FavoritesPlaylist[] }>
  >({
    endpoint: userId ? `/api/v1/app/playlists/user/${userId}` : '',
    queryKey: queryKeys.playlists.byUser(userId),
    context: 'User Playlists (Favorites)',
    enabled: !!userId,
  });

  const playlists = playlistsData?.data?.playlists || [];

  // Find the Favorites playlist
  const favoritesPlaylist = playlists?.find((p: FavoritesPlaylist) => p.name === FAVORITES_PLAYLIST_NAME);

  // Only compute endpoint when we have a valid playlist ID
  const favoritesPlaylistId = favoritesPlaylist?.id;

  // Fetch tracks in the Favorites playlist
  const { data: favoritesTracksData, isLoading: isLoadingTracks } = useApiQuery<
    ServiceResponse<{ tracks: FavoritesTrack[] }>
  >({
    endpoint: favoritesPlaylistId ? `/api/v1/app/playlists/${favoritesPlaylistId}/tracks` : '',
    queryKey: queryKeys.playlists.tracks(favoritesPlaylistId ?? ''),
    context: 'Favorites Tracks',
    enabled: !!favoritesPlaylistId,
  });

  useEffect(() => {
    if (!favoritesTracksData) return;
    const tracks = favoritesTracksData?.data?.tracks;
    const ids = new Set<string>((tracks || []).map((t: FavoritesTrack) => t.id));
    logger.debug('[useFavorites] Setting favorite track IDs', {
      count: ids.size,
      trackIds: Array.from(ids).slice(0, 5),
    });
    setTrackIdsInFavorites(ids);
  }, [favoritesTracksData]);

  // Create Favorites playlist mutation
  const createFavoritesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/v1/app/playlists', {
        method: 'POST',
        data: {
          name: FAVORITES_PLAYLIST_NAME,
          description: t('components.favorites.yourFavoriteTracks'),
          visibility: CONTENT_VISIBILITY.PERSONAL,
        },
      });
    },
    onSuccess: () => {
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'PLAYLIST_CREATED' });
    },
    onError: createMutationErrorHandler(
      toast,
      'Create Favorites Playlist',
      '/api/v1/playlists',
      t('alerts.failedToCreateFavorites'),
      t
    ),
  });

  // Add track to Favorites mutation
  const addToFavoritesMutation = useMutation({
    mutationFn: async ({ playlistId, trackId }: { playlistId: string; trackId: string }) => {
      return apiRequest(`/api/v1/app/playlists/${playlistId}/tracks`, {
        method: 'POST',
        data: {
          trackId,
        },
      });
    },
    onSuccess: (_, variables) => {
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'TRACK_FAVORITED', trackId: variables.trackId });
      // Optimistically update the set
      setTrackIdsInFavorites(prev => new Set([...prev, variables.trackId]));
    },
    onError: (error, variables) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Handle "Track already in/exists in playlist" as success — just sync the state.
      // Backend is now idempotent (returns 200), but keep this as a safety net.
      if (errorMessage.includes('already exists in playlist') || errorMessage.includes('already in playlist')) {
        logger.debug('Track already in favorites, syncing state', { trackId: variables.trackId });
        setTrackIdsInFavorites(prev => new Set([...prev, variables.trackId]));
        invalidateOnEvent(queryClient, { type: 'TRACK_FAVORITED', trackId: variables.trackId });
        return;
      }
      // For other errors, use the standard handler
      createMutationErrorHandler(
        toast,
        'Add to Favorites',
        '/api/v1/playlists/*/tracks',
        t('alerts.failedToAddToFavorites'),
        t
      )(error);
    },
  });

  // Remove track from Favorites mutation
  const removeFromFavoritesMutation = useMutation({
    mutationFn: async ({ playlistId, trackId }: { playlistId: string; trackId: string }) => {
      return apiRequest(`/api/v1/app/playlists/${playlistId}/tracks/${trackId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_, variables) => {
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'TRACK_UNFAVORITED', trackId: variables.trackId });
      // Optimistically update the set
      setTrackIdsInFavorites(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.trackId);
        return newSet;
      });
    },
    onError: createMutationErrorHandler(
      toast,
      'Remove from Favorites',
      '/api/v1/playlists/*/tracks/*',
      t('alerts.failedToRemoveFromFavorites'),
      t
    ),
  });

  const batchFavorites = useBatchFavorites();

  const toggleFavoritesBatch = useCallback(
    async (trackIds: string[], action: 'add' | 'remove') => {
      if (!favoritesPlaylist) {
        try {
          await createFavoritesMutation.mutateAsync();
        } catch (error) {
          logger.error('Failed to create Favorites playlist for batch operation', error);
          return;
        }
      }
      await batchFavorites.mutateAsync({ trackIds, action });
    },
    [favoritesPlaylist, createFavoritesMutation, batchFavorites]
  );

  // Toggle favorite status for a track
  const toggleFavorite = useCallback(
    async (trackId: string) => {
      let playlist = favoritesPlaylist;

      if (!playlist) {
        try {
          const result = await createFavoritesMutation.mutateAsync();
          const created = (result as { data?: { playlist?: FavoritesPlaylist } })?.data?.playlist;
          if (created?.id) {
            playlist = created;
          } else {
            logger.error('Created Favorites playlist but no ID returned');
            return;
          }
        } catch (error) {
          logger.error('Failed to create Favorites playlist', error);
          return;
        }
      }

      const isFavoriteNow = trackIdsInFavorites.has(trackId);

      try {
        if (isFavoriteNow) {
          await removeFromFavoritesMutation.mutateAsync({
            playlistId: playlist.id,
            trackId,
          });
        } else {
          await addToFavoritesMutation.mutateAsync({
            playlistId: playlist.id,
            trackId,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('already exists in playlist') && !errorMessage.includes('already in playlist')) {
          logger.error('Failed to toggle favorite', error, { trackId });
        }
      }
    },
    [
      favoritesPlaylist,
      trackIdsInFavorites,
      createFavoritesMutation,
      addToFavoritesMutation,
      removeFromFavoritesMutation,
    ]
  );

  // Check if a track is in favorites
  const isFavorite = useCallback(
    (trackId: string) => {
      return trackIdsInFavorites.has(trackId);
    },
    [trackIdsInFavorites]
  );

  return {
    favoritesPlaylist,
    isLoading: isLoadingPlaylists || isLoadingTracks,
    isFavorite,
    toggleFavorite,
    toggleFavoritesBatch,
    isToggling: addToFavoritesMutation.isPending || removeFromFavoritesMutation.isPending,
    isBatchToggling: batchFavorites.isPending,
  };
}

export function useAlbumFavorites(userId: string | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [likedAlbumIds, setLikedAlbumIds] = useState<Set<string>>(new Set());

  const { data: likedData, isLoading } = useQuery<ServiceResponse<{ likedAlbumIds: string[] }>>({
    queryKey: queryKeys.albums.liked(userId),
    queryFn: async () => {
      return apiRequest<ServiceResponse<{ likedAlbumIds: string[] }>>('/api/v1/app/library/liked-albums');
    },
    enabled: !!userId,
    staleTime: QUERY_STALE_TIME.short,
  });

  useEffect(() => {
    if (likedData?.data?.likedAlbumIds) {
      setLikedAlbumIds(new Set(likedData.data.likedAlbumIds));
    }
  }, [likedData]);

  const likeMutation = useMutation({
    mutationFn: async (albumId: string) => {
      return apiRequest<ServiceResponse<{ alreadyLiked?: boolean }>>(`/api/v1/app/library/album/${albumId}/like`, {
        method: 'POST',
      });
    },
    onMutate: async albumId => {
      setLikedAlbumIds(prev => new Set([...prev, albumId]));
    },
    onSuccess: (data, albumId) => {
      if (data.data?.alreadyLiked) {
        setLikedAlbumIds(prev => new Set([...prev, albumId]));
      }
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'ALBUM_LIKED', albumId, userId });
    },
    onError: (error, albumId) => {
      setLikedAlbumIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(albumId);
        return newSet;
      });
      createMutationErrorHandler(
        toast,
        'Like Album',
        `/api/v1/app/library/album/${albumId}/like`,
        t('alerts.failedToLikeAlbum') || 'Failed to like album',
        t
      )(error);
    },
  });

  const unlikeMutation = useMutation({
    mutationFn: async (albumId: string) => {
      return apiRequest<ServiceResponse<unknown>>(`/api/v1/app/library/album/${albumId}/like`, {
        method: 'DELETE',
      });
    },
    onMutate: async albumId => {
      setLikedAlbumIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(albumId);
        return newSet;
      });
    },
    onSuccess: (_, albumId) => {
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'ALBUM_UNLIKED', albumId, userId });
    },
    onError: (error, albumId) => {
      setLikedAlbumIds(prev => new Set([...prev, albumId]));
      createMutationErrorHandler(
        toast,
        'Unlike Album',
        `/api/v1/app/library/album/${albumId}/like`,
        t('alerts.failedToUnlikeAlbum') || 'Failed to unlike album',
        t
      )(error);
    },
  });

  const toggleLike = useCallback(
    async (albumId: string) => {
      if (!userId) {
        logger.warn('Cannot like album: user not authenticated');
        return;
      }

      const isCurrentlyLiked = likedAlbumIds.has(albumId);

      try {
        if (isCurrentlyLiked) {
          await unlikeMutation.mutateAsync(albumId);
        } else {
          await likeMutation.mutateAsync(albumId);
        }
      } catch (error) {
        logger.error('Failed to toggle album like', error, { albumId });
      }
    },
    [userId, likedAlbumIds, likeMutation, unlikeMutation]
  );

  const isLiked = useCallback((albumId: string) => likedAlbumIds.has(albumId), [likedAlbumIds]);

  return {
    isLoading,
    isLiked,
    toggleLike,
    isToggling: likeMutation.isPending || unlikeMutation.isPending,
    likedCount: likedAlbumIds.size,
    canLike: !!userId,
  };
}

export function useCreatorFollows(userId: string | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [followedCreatorIds, setFollowedCreatorIds] = useState<Set<string>>(new Set());

  const { data: followedData, isLoading } = useQuery<ServiceResponse<{ followedCreatorIds: string[] }>>({
    queryKey: queryKeys.creators.followed(userId),
    queryFn: async () => {
      return apiRequest<ServiceResponse<{ followedCreatorIds: string[] }>>('/api/v1/app/library/followed-creators');
    },
    enabled: !!userId,
    staleTime: QUERY_STALE_TIME.short,
  });

  useEffect(() => {
    if (followedData?.data?.followedCreatorIds) {
      setFollowedCreatorIds(new Set(followedData.data.followedCreatorIds));
    }
  }, [followedData]);

  const followMutation = useMutation({
    mutationFn: async (creatorId: string) => {
      return apiRequest<ServiceResponse<{ alreadyFollowing?: boolean }>>(
        `/api/v1/app/library/creator/${creatorId}/follow`,
        {
          method: 'POST',
        }
      );
    },
    onMutate: async creatorId => {
      setFollowedCreatorIds(prev => new Set([...prev, creatorId]));
    },
    onSuccess: (data, creatorId) => {
      if (data.data?.alreadyFollowing) {
        setFollowedCreatorIds(prev => new Set([...prev, creatorId]));
      }
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'CREATOR_FOLLOWED', creatorId, userId });
    },
    onError: (error, creatorId) => {
      setFollowedCreatorIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(creatorId);
        return newSet;
      });
      createMutationErrorHandler(
        toast,
        'Follow Creator',
        `/api/v1/app/library/creator/${creatorId}/follow`,
        t('alerts.failedToFollowCreator') || 'Failed to follow creator',
        t
      )(error);
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (creatorId: string) => {
      return apiRequest<ServiceResponse<unknown>>(`/api/v1/app/library/creator/${creatorId}/follow`, {
        method: 'DELETE',
      });
    },
    onMutate: async creatorId => {
      setFollowedCreatorIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(creatorId);
        return newSet;
      });
    },
    onSuccess: (_, creatorId) => {
      // Use centralized cache invalidation
      invalidateOnEvent(queryClient, { type: 'CREATOR_UNFOLLOWED', creatorId, userId });
    },
    onError: (error, creatorId) => {
      setFollowedCreatorIds(prev => new Set([...prev, creatorId]));
      createMutationErrorHandler(
        toast,
        'Unfollow Creator',
        `/api/v1/app/library/creator/${creatorId}/follow`,
        t('alerts.failedToUnfollowCreator') || 'Failed to unfollow creator',
        t
      )(error);
    },
  });

  const toggleFollow = useCallback(
    async (creatorId: string) => {
      if (!userId) {
        logger.warn('Cannot follow creator: user not authenticated');
        return;
      }

      const isCurrentlyFollowing = followedCreatorIds.has(creatorId);

      try {
        if (isCurrentlyFollowing) {
          await unfollowMutation.mutateAsync(creatorId);
        } else {
          await followMutation.mutateAsync(creatorId);
        }
      } catch (error) {
        logger.error('Failed to toggle creator follow', error, { creatorId });
      }
    },
    [userId, followedCreatorIds, followMutation, unfollowMutation]
  );

  const isFollowing = useCallback((creatorId: string) => followedCreatorIds.has(creatorId), [followedCreatorIds]);

  return {
    isLoading,
    isFollowing,
    toggleFollow,
    isToggling: followMutation.isPending || unfollowMutation.isPending,
    followingCount: followedCreatorIds.size,
    canFollow: !!userId,
  };
}
