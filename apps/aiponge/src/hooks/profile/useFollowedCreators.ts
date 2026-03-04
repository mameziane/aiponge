/**
 * Hook to fetch the list of creators the current user follows.
 * Returns a Set of creator userIds for efficient lookup when splitting
 * books into "followed-creator" vs "shared/public" sections.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, selectUser } from '../../auth/store';
import { apiRequest } from '../../lib/axiosApiClient';
import { queryKeys } from '../../lib/queryKeys';

interface FollowedCreator {
  id: string;
  creatorId: string;
  creatorName: string;
  status: string;
}

export function useFollowedCreators() {
  const user = useAuthStore(selectUser);

  const { data: followedCreators = [], isLoading } = useQuery<FollowedCreator[]>({
    queryKey: queryKeys.creatorMembers.following(),
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: FollowedCreator[] }>(
        '/api/v1/app/creator-members/following'
      );
      return response.data ?? [];
    },
    enabled: !!user?.id && !user.isGuest,
    staleTime: 5 * 60 * 1000,
  });

  const followedCreatorIds = useMemo(() => new Set(followedCreators.map(c => c.creatorId)), [followedCreators]);

  return { followedCreatorIds, followedCreators, isLoading };
}
