/**
 * Track Playback Hook
 * Manages playback controls for the track detail screen:
 * play/pause, next/previous from queue, and queue sync.
 */

import { useCallback, useEffect } from 'react';
import { usePlaybackState, usePlaybackQueue } from '../../../contexts/PlaybackContext';
import { useUnifiedPlaybackControl } from '../../../hooks/music/useUnifiedPlaybackControl';
import { configureAudioSession } from '../../../hooks/music/audioSession';
import { logger } from '../../../lib/logger';
import type { TrackData } from './useTrackData';

export function useTrackPlayback(track: TrackData | null, audioUrl: string | null, displayName: string) {
  const { currentTrack, isPlaying } = usePlaybackState();
  const { togglePlayPause: unifiedToggle, playNewTrack } = useUnifiedPlaybackControl();
  const {
    queue,
    queueSource,
    currentIndex,
    shuffleEnabled,
    repeatMode,
    hasNext,
    hasPrevious,
    trackCount,
    next,
    previous,
    toggleShuffle,
    cycleRepeat,
    syncCurrentIndex,
  } = usePlaybackQueue();

  const isCurrentTrackPlaying = track && currentTrack?.id === track.id && isPlaying;
  const showPlaybackControls = audioUrl !== null;

  const handlePlayPause = useCallback(async () => {
    if (!track || !audioUrl) {
      logger.warn('Cannot play - no track or audio URL');
      return;
    }

    try {
      if (currentTrack?.id === track.id) {
        await unifiedToggle();
        return;
      }

      await configureAudioSession();

      const playableTrack = {
        id: track.id,
        title: track.title,
        artworkUrl: track.artworkUrl || '',
        audioUrl: audioUrl,
        displayName: track.displayName || displayName,
        duration: track.duration,
        lyricsId: track.lyricsId,
        hasSyncedLyrics: track.hasSyncedLyrics,
      };

      await playNewTrack(playableTrack, audioUrl);
      logger.debug('[TrackDetail] Started playback', { trackId: track.id });
    } catch (error) {
      logger.error('[TrackDetail] Playback failed', error);
    }
  }, [track, audioUrl, currentTrack, unifiedToggle, playNewTrack, displayName]);

  // Sync queue index when track changes
  useEffect(() => {
    if (track?.id) {
      syncCurrentIndex(track.id);
    }
  }, [track?.id, syncCurrentIndex]);

  const handleNextTrack = useCallback(async () => {
    const nextTrack = next();
    if (nextTrack) {
      if (!nextTrack.audioUrl) {
        logger.error('[TrackDetail] Next track has no audio URL', { trackId: nextTrack.id });
        return;
      }
      try {
        await configureAudioSession();
        await playNewTrack(nextTrack, nextTrack.audioUrl);
        logger.debug('[TrackDetail] Playing next track', { trackId: nextTrack.id });
      } catch (error) {
        logger.error('[TrackDetail] Failed to play next track', error);
      }
    }
  }, [next, playNewTrack]);

  const handlePreviousTrack = useCallback(async () => {
    const prevTrack = previous();
    if (prevTrack) {
      if (!prevTrack.audioUrl) {
        logger.error('[TrackDetail] Previous track has no audio URL', { trackId: prevTrack.id });
        return;
      }
      try {
        await configureAudioSession();
        await playNewTrack(prevTrack, prevTrack.audioUrl);
        logger.debug('[TrackDetail] Playing previous track', { trackId: prevTrack.id });
      } catch (error) {
        logger.error('[TrackDetail] Failed to play previous track', error);
      }
    }
  }, [previous, playNewTrack]);

  return {
    isCurrentTrackPlaying,
    showPlaybackControls,
    handlePlayPause,
    handleNextTrack,
    handlePreviousTrack,
    // Queue state
    queue,
    queueSource,
    currentIndex,
    shuffleEnabled,
    repeatMode,
    hasNext,
    hasPrevious,
    trackCount,
    toggleShuffle,
    cycleRepeat,
    currentTrack,
    isPlaying,
  };
}
