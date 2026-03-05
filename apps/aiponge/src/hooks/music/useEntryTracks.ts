/**
 * Entry Tracks Hook
 * Fetches the user's private tracks and filters them by selected entry.
 * Provides the entry-scoped track list and last generated track tracking.
 */

import React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';
import { useAuthState } from '../auth/useAuthState';
import { queryKeys } from '../../lib/queryKeys';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import { normalizeMediaUrl } from '../../lib/apiConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';

type PrivateTracksResponse = ServiceResponse<{
  tracks?: Array<{
    id: string;
    entryId?: string;
    audioUrl?: string;
    artworkUrl?: string | null;
    title?: string | null;
    displayName?: string | null;
  }>;
}>;

interface PrivateTrack {
  id: string;
  entryId?: string;
  audioUrl?: string;
  artworkUrl?: string | null;
  title?: string | null;
  displayName?: string | null;
}

export interface UseEntryTracksParams {
  selectedEntryId: string | null;
}

export function useEntryTracks({ selectedEntryId }: UseEntryTracksParams) {
  const { isAuthenticated } = useAuthState();

  // Track ID of most recently generated track (for feedback prompts & guest conversion)
  // The actual track data comes from entryTracks (single source of truth)
  const [lastGeneratedTrackId, setLastGeneratedTrackId] = useState<string | null>(null);

  // Fetch all user's private tracks to show those generated from this entry
  // SCALABILITY: Cached for 30 seconds - allows quick updates after track deletion/addition
  // Only fetch when user is authenticated to prevent 401 errors during startup/hydration
  const { data: privateTracksResponse } = useQuery<PrivateTracksResponse>({
    queryKey: queryKeys.tracks.private(),
    queryFn: () => apiRequest('/api/v1/app/library/private') as Promise<PrivateTracksResponse>,
    enabled: isAuthenticated,
    staleTime: QUERY_STALE_TIME.short,
    gcTime: 300000, // 5 minutes cache retention
  });

  // Filter tracks generated from the selected entry, or include last generated track for guests
  // Normalize media URLs so relative paths (e.g. /uploads/...) become absolute for expo-av/expo-image
  const entryTracks = React.useMemo(() => {
    if (!privateTracksResponse?.data?.tracks) return [];

    let filtered: PrivateTrack[];

    // If we have a selected entry ID, filter by it
    if (selectedEntryId) {
      filtered = privateTracksResponse.data.tracks.filter((track: PrivateTrack) => track.entryId === selectedEntryId);
    } else if (lastGeneratedTrackId) {
      // For users without a saved entry (e.g., guests typing fresh content),
      // include the most recently generated track so they can see/play it
      filtered = privateTracksResponse.data.tracks.filter((track: PrivateTrack) => track.id === lastGeneratedTrackId);
    } else {
      return [];
    }

    // Normalize URLs for mobile playback/display
    return filtered.map(track => ({
      ...track,
      audioUrl: normalizeMediaUrl(track.audioUrl) || track.audioUrl,
      artworkUrl: normalizeMediaUrl(track.artworkUrl) || track.artworkUrl,
    }));
  }, [selectedEntryId, privateTracksResponse, lastGeneratedTrackId]);

  return React.useMemo(
    () => ({
      entryTracks,
      lastGeneratedTrackId,
      setLastGeneratedTrackId,
      privateTracksResponse,
    }),
    [entryTracks, lastGeneratedTrackId, setLastGeneratedTrackId, privateTracksResponse]
  );
}
