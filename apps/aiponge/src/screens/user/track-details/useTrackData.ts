/**
 * Track Data Hook
 * Fetches track and lyrics data from API, handles params parsing,
 * inline lyrics, and audio URL resolution.
 */

import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { apiRequest } from '../../../lib/axiosApiClient';
import { logError, getTranslatedFriendlyMessage } from '../../../utils/errorSerialization';
import { logger } from '../../../lib/logger';
import { getApiGatewayUrl } from '../../../lib/apiConfig';
import type { SyncedLine } from '@aiponge/shared-contracts';

export interface LyricsData {
  id: string;
  content: string;
  syncedLines?: SyncedLine[];
  title?: string;
  style?: string;
  mood?: string;
  themes?: string[];
}

export interface TrackData {
  id: string;
  title: string;
  displayName?: string;
  artworkUrl?: string;
  fileUrl?: string;
  audioUrl?: string;
  duration?: number;
  durationSeconds?: number;
  lyricsId?: string;
  createdAt?: string;
  playCount?: number;
  hasSyncedLyrics?: boolean;
  lyricsContent?: string;
  lyricsSyncedLines?: SyncedLine[];
  lyricsStyle?: string;
  lyricsMood?: string;
  lyricsThemes?: string[];
}

export function useTrackData(t: (key: string | string[], options?: Record<string, unknown>) => string) {
  const params = useLocalSearchParams();

  const [track, setTrack] = useState<TrackData | null>(null);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const fetchLyrics = useCallback(
    async (lyricsId: string) => {
      setIsLoadingLyrics(true);
      setLyricsError(null);

      try {
        const response = await apiRequest<{ data: LyricsData }>(`/api/v1/app/lyrics/id/${lyricsId}`);
        if (response?.data) {
          setLyrics(response.data);
        } else {
          setLyricsError(t('components.lyricsModal.lyricsNotFound'));
        }
      } catch (err) {
        const serialized = logError(err, 'Fetch Lyrics', lyricsId);
        setLyricsError(getTranslatedFriendlyMessage(serialized, t));
      } finally {
        setIsLoadingLyrics(false);
      }
    },
    [t]
  );

  const fetchTrackById = useCallback(
    async (trackId: string, options?: { silentOnNotFound?: boolean }) => {
      setIsLoadingTrack(true);
      if (!options?.silentOnNotFound) {
        setTrackError(null);
      }

      try {
        const response = await apiRequest<{ data: TrackData }>(`/api/v1/app/library/track/${trackId}`);
        if (response?.data) {
          setTrack(response.data);
          if (response.data.lyricsId) {
            fetchLyrics(response.data.lyricsId);
          }
        } else if (!options?.silentOnNotFound) {
          setTrackError(t('components.trackDetails.trackNotFound'));
        }
      } catch (err) {
        const serialized = logError(err, 'Fetch Track', trackId);
        if (!options?.silentOnNotFound) {
          setTrackError(getTranslatedFriendlyMessage(serialized, t));
        } else {
          logger.debug('Track not found in database, using navigation params data', { trackId });
        }
      } finally {
        setIsLoadingTrack(false);
      }
    },
    [t, fetchLyrics]
  );

  // Parse track from navigation params or fetch by ID
  useEffect(() => {
    if (params.track) {
      try {
        const parsedTrack = JSON.parse(params.track as string);
        setTrack(parsedTrack);

        // Check for inline lyrics data first (from shared library album details)
        if (parsedTrack.lyricsContent || parsedTrack.lyricsSyncedLines) {
          logger.debug('Using inline lyrics data from track', {
            hasContent: !!parsedTrack.lyricsContent,
            hasSyncedLines: !!parsedTrack.lyricsSyncedLines?.length,
            hasStyle: !!parsedTrack.lyricsStyle,
            hasMood: !!parsedTrack.lyricsMood,
          });
          setLyrics({
            id: parsedTrack.lyricsId || parsedTrack.id,
            content: parsedTrack.lyricsContent || '',
            syncedLines: parsedTrack.lyricsSyncedLines,
            style: parsedTrack.lyricsStyle,
            mood: parsedTrack.lyricsMood,
            themes: parsedTrack.lyricsThemes,
          });
        } else if (parsedTrack.lyricsId) {
          fetchLyrics(parsedTrack.lyricsId);
        } else if (parsedTrack.hasSyncedLyrics) {
          fetchTrackById(parsedTrack.id, { silentOnNotFound: true });
        }
      } catch (error) {
        logger.error('Failed to parse track data', error);
      }
    } else if (params.trackId) {
      fetchTrackById(params.trackId as string);
    }
  }, [params.track, params.trackId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve audio URL from track data
  useEffect(() => {
    const sourceUrl = track?.fileUrl || track?.audioUrl;
    if (sourceUrl) {
      const baseUrl = getApiGatewayUrl();
      const resolvedUrl = sourceUrl.startsWith('http')
        ? sourceUrl
        : `${baseUrl}${sourceUrl.startsWith('/') ? '' : '/'}${sourceUrl}`;
      setAudioUrl(resolvedUrl);
      logger.debug('[TrackDetail] Resolved audio URL', { sourceUrl, resolvedUrl });
    }
  }, [track]);

  return {
    track,
    setTrack,
    lyrics,
    audioUrl,
    isLoadingTrack,
    isLoadingLyrics,
    trackError,
    lyricsError,
  };
}
