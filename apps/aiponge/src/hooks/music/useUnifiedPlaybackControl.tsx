/**
 * Unified Playback Control Hook
 *
 * Provides a single interface for play/pause/seek that automatically routes
 * commands to either local player or Cast device based on current state.
 *
 * This prevents the issue where components directly control the local player
 * while audio is being cast to an external device.
 */

import { useCallback } from 'react';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { usePlaybackState, PlaybackTrack } from '../../contexts/PlaybackContext';
import { useCastPlayback } from './useCastPlayback';
import { syncMediaSessionPlaybackState, updateMediaSessionTrack } from './MediaSessionService';
import { logger } from '../../lib/logger';

interface UseUnifiedPlaybackControlReturn {
  play: () => Promise<void>;
  pause: () => void;
  togglePlayPause: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  playNewTrack: (track: PlaybackTrack, audioUrl: string) => Promise<void>;
  isCasting: boolean;
  isPlaying: boolean;
  currentTrack: PlaybackTrack | null;
}

export function useUnifiedPlaybackControl(): UseUnifiedPlaybackControlReturn {
  const player = useGlobalAudioPlayer();
  const { currentTrack, isPlaying, playbackPhase, setPlaybackPhase, setCurrentTrack } = usePlaybackState();
  const { isCasting, castPlay, castPause, castSeek, transferToCast } = useCastPlayback();

  const play = useCallback(async () => {
    if (isCasting) {
      logger.debug('[UnifiedPlayback] Routing play to Cast');
      await castPlay();
    } else {
      logger.debug('[UnifiedPlayback] Playing locally');
      // Set buffering first, then useTrackPlayback's useEffect will transition to 'playing'
      // when player.playing becomes true
      setPlaybackPhase('buffering');
      player.play();
    }
  }, [isCasting, castPlay, player, setPlaybackPhase]);

  const pause = useCallback(() => {
    if (isCasting) {
      logger.debug('[UnifiedPlayback] Routing pause to Cast');
      castPause();
    } else {
      logger.debug('[UnifiedPlayback] Pausing locally');
      player.pause();
      setPlaybackPhase('paused');
      syncMediaSessionPlaybackState(false).catch(e =>
        logger.warn('[UnifiedPlayback] Failed to sync media session state', e)
      );
    }
  }, [isCasting, castPause, player, setPlaybackPhase]);

  const togglePlayPause = useCallback(async () => {
    if (isPlaying) {
      pause();
    } else {
      await play();
    }
  }, [isPlaying, play, pause]);

  const seekTo = useCallback(
    async (position: number) => {
      if (isCasting) {
        logger.debug('[UnifiedPlayback] Routing seek to Cast', { position });
        await castSeek(position);
      } else {
        logger.debug('[UnifiedPlayback] Seeking locally', { position });
        player.seekTo(position);
      }
    },
    [isCasting, castSeek, player]
  );

  const playNewTrack = useCallback(
    async (track: PlaybackTrack, audioUrl: string) => {
      logger.debug('[UnifiedPlayback] Playing new track', { trackId: track.id, isCasting });

      setCurrentTrack(track);
      setPlaybackPhase('buffering');

      if (isCasting) {
        logger.debug('[UnifiedPlayback] Routing new track to Cast');
        await transferToCast(track);
      } else {
        logger.debug('[UnifiedPlayback] Loading new track locally');
        player.replace({ uri: audioUrl });
        player.play();
        // Note: Don't set 'playing' here - let useTrackPlayback's useEffect transition
        // from 'buffering' to 'playing' when player.playing becomes true
      }

      updateMediaSessionTrack(track).catch(e =>
        logger.warn('[UnifiedPlayback] Failed to update media session track', e)
      );
    },
    [isCasting, player, setCurrentTrack, setPlaybackPhase, transferToCast]
  );

  return {
    play,
    pause,
    togglePlayPause,
    seekTo,
    playNewTrack,
    isCasting,
    isPlaying,
    currentTrack,
  };
}
