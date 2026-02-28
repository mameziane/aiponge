import { useMemo } from 'react';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { useAuthState } from '../auth/useAuthState';
import { useApiQuery } from '../system/useAppQuery';
import { QUERY_STALE_TIME } from '../../constants/appConfig';

interface PrivateTrack {
  id: string;
  entryId?: string;
  audioUrl?: string;
  title?: string;
}

export function useEntriesWithSongs() {
  const { isAuthenticated } = useAuthState();

  const { data: privateTracksResponse, isLoading } = useApiQuery<ServiceResponse<{ tracks?: PrivateTrack[] }>>({
    endpoint: '/api/v1/app/library/private',
    context: 'Private Tracks (Entries)',
    enabled: isAuthenticated,
    queryOptions: { staleTime: QUERY_STALE_TIME.medium },
  });

  const entryIdsWithSongs = useMemo(() => {
    const ids = new Set<string>();
    if (privateTracksResponse?.data?.tracks) {
      for (const track of privateTracksResponse.data.tracks) {
        if (track.entryId) {
          ids.add(track.entryId);
        }
      }
    }
    return ids;
  }, [privateTracksResponse]);

  return {
    entryIdsWithSongs,
    isLoading,
  };
}
