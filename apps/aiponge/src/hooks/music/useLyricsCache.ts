/**
 * Lyrics Cache Hook
 * Fetches, caches, and validates freshness of lyrics for a selected entry.
 * Handles the lifecycle of generated lyrics, including:
 * - Fetching existing lyrics from the API
 * - Freshness validation (entry modified after lyrics were created → treat as stale)
 * - Active generation guard (prevent cached lyrics from overwriting streamed ones)
 */

import React from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';
import { queryKeys } from '../../lib/queryKeys';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import type { Entry } from '../../types/profile.types';

type ExistingLyricsResponse = ServiceResponse<{ id: string; content: string; createdAt: string } | null>;

export interface UseLyricsCacheParams {
  selectedEntryId: string | null;
  entries: Entry[];
  /** Ref to the currently active generation request ID — prevents stale cache from overwriting streamed lyrics */
  activeRequestIdRef: React.MutableRefObject<string | null>;
  /** Ref to the entry ID of the active generation request */
  activeEntryIdRef: React.MutableRefObject<string | null>;
}

export function useLyricsCache({
  selectedEntryId,
  entries,
  activeRequestIdRef,
  activeEntryIdRef,
}: UseLyricsCacheParams) {
  const [generatedLyrics, _setGeneratedLyrics] = useState('');
  const generatedLyricsRef = React.useRef(''); // Ref to track latest lyrics for closure access

  // Wrapper to keep state and ref in sync (for closure access in polling)
  const setGeneratedLyrics = React.useCallback((lyrics: string) => {
    generatedLyricsRef.current = lyrics;
    _setGeneratedLyrics(lyrics);
  }, []);

  const [generatedLyricsId, setGeneratedLyricsId] = useState<string | null>(null);
  const [generatedSongTitle, setGeneratedSongTitle] = useState<string | null>(null);

  // Fetch existing lyrics for selected entry (using dedicated entry-lyrics endpoint)
  // Returns null if no lyrics exist for the entry (not an error)
  const { data: existingLyricsResponse } = useQuery<ExistingLyricsResponse>({
    queryKey: queryKeys.lyrics.byEntry(selectedEntryId ?? undefined),
    queryFn: () => apiRequest(`/api/v1/app/lyrics/entry/${selectedEntryId}`) as Promise<ExistingLyricsResponse>,
    enabled: !!selectedEntryId,
  });

  // Auto-load existing lyrics when entry is selected (but NOT during active generation FOR THAT ENTRY)
  // Invalidate lyrics if the entry was modified after the lyrics were created
  React.useEffect(() => {
    // Skip cached lyrics only if we're actively generating for THIS specific entry
    // This prevents stale cached lyrics from overwriting fresh ones being streamed in,
    // while still allowing cached lyrics to hydrate when switching to a different entry
    if (activeRequestIdRef.current && activeEntryIdRef.current === selectedEntryId) {
      return;
    }

    const lyrics = existingLyricsResponse?.data;
    if (existingLyricsResponse?.success && lyrics) {
      // Check if the entry was modified after the lyrics were created
      const currentEntry = entries.find((t: Entry) => t.id === selectedEntryId);
      if (currentEntry?.updatedAt && lyrics.createdAt) {
        const entryUpdatedAt = new Date(currentEntry.updatedAt).getTime();
        const lyricsCreatedAt = new Date(lyrics.createdAt).getTime();

        if (entryUpdatedAt > lyricsCreatedAt) {
          // Entry was modified after lyrics were generated - treat as stale
          setGeneratedLyrics('');
          setGeneratedLyricsId(null);
          return;
        }
      }
      // Lyrics are still valid - use them
      setGeneratedLyrics(lyrics.content);
      setGeneratedLyricsId(lyrics.id);
    } else if (existingLyricsResponse?.success && !lyrics) {
      setGeneratedLyrics('');
      setGeneratedLyricsId(null);
    }
  }, [existingLyricsResponse, selectedEntryId, entries, activeRequestIdRef, activeEntryIdRef, setGeneratedLyrics]);

  return React.useMemo(
    () => ({
      generatedLyrics,
      generatedLyricsRef,
      generatedLyricsId,
      generatedSongTitle,
      setGeneratedLyrics,
      setGeneratedLyricsId,
      setGeneratedSongTitle,
    }),
    [
      generatedLyrics,
      generatedLyricsRef,
      generatedLyricsId,
      generatedSongTitle,
      setGeneratedLyrics,
      setGeneratedLyricsId,
      setGeneratedSongTitle,
    ]
  );
}
