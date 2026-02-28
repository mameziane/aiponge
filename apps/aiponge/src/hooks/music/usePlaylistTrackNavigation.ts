import { useCallback } from 'react';
import { usePlaybackQueue, usePlaybackState } from '../../contexts/PlaybackContext';
import { useUnifiedPlaybackControl } from './useUnifiedPlaybackControl';
import { configureAudioSession } from './audioSession';
import { getApiGatewayUrl } from '../../lib/apiConfig';
import { logger } from '../../lib/logger';

interface UsePlaylistTrackNavigationOptions {
  logPrefix?: string;
}

export function usePlaylistTrackNavigation({ logPrefix = '[Playlist]' }: UsePlaylistTrackNavigationOptions = {}) {
  const { shuffleEnabled, repeatMode, toggleShuffle, cycleRepeat, next, previous, hasNext, hasPrevious, trackCount } =
    usePlaybackQueue();

  const { currentTrack, isPlaying } = usePlaybackState();
  const { togglePlayPause: unifiedToggle, playNewTrack } = useUnifiedPlaybackControl();

  const resolveUrl = useCallback((url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const baseUrl = getApiGatewayUrl();
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }, []);

  const handleTogglePlayPause = useCallback(async () => {
    if (currentTrack) {
      await unifiedToggle();
    }
  }, [currentTrack, unifiedToggle]);

  const handleNextTrack = useCallback(async () => {
    const nextTrack = next();
    if (nextTrack) {
      const resolvedAudioUrl = resolveUrl(nextTrack.audioUrl);
      if (!resolvedAudioUrl) {
        logger.error(`${logPrefix} Next track has no audio URL`, { trackId: nextTrack.id });
        return;
      }
      try {
        await configureAudioSession();
        const playableTrack = {
          ...nextTrack,
          audioUrl: resolvedAudioUrl,
          artworkUrl: resolveUrl(nextTrack.artworkUrl),
        };
        await playNewTrack(playableTrack, resolvedAudioUrl);
        logger.debug(`${logPrefix} Playing next track`, { trackId: nextTrack.id });
      } catch (error) {
        logger.error(`${logPrefix} Failed to play next track`, error);
      }
    }
  }, [next, playNewTrack, resolveUrl, logPrefix]);

  const handlePreviousTrack = useCallback(async () => {
    const prevTrack = previous();
    if (prevTrack) {
      const resolvedAudioUrl = resolveUrl(prevTrack.audioUrl);
      if (!resolvedAudioUrl) {
        logger.error(`${logPrefix} Previous track has no audio URL`, { trackId: prevTrack.id });
        return;
      }
      try {
        await configureAudioSession();
        const playableTrack = {
          ...prevTrack,
          audioUrl: resolvedAudioUrl,
          artworkUrl: resolveUrl(prevTrack.artworkUrl),
        };
        await playNewTrack(playableTrack, resolvedAudioUrl);
        logger.debug(`${logPrefix} Playing previous track`, { trackId: prevTrack.id });
      } catch (error) {
        logger.error(`${logPrefix} Failed to play previous track`, error);
      }
    }
  }, [previous, playNewTrack, resolveUrl, logPrefix]);

  return {
    handleNextTrack,
    handlePreviousTrack,
    handleTogglePlayPause,
    resolveUrl,
    shuffleEnabled,
    repeatMode,
    toggleShuffle,
    cycleRepeat,
    hasNext,
    hasPrevious,
    trackCount,
    currentTrack,
    isPlaying,
    playNewTrack,
  };
}
