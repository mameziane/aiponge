import { useEffect, useRef } from 'react';
import { useAuthStore } from '../../auth/store';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { usePlaybackState } from '../../contexts/PlaybackContext';
import { logger } from '../../lib/logger';

export function AuthPlaybackController() {
  console.log('[TRACE-AUTH-PC] AuthPlaybackController render start');
  const player = useGlobalAudioPlayer();
  const { setCurrentTrack, setPlaybackPhase } = usePlaybackState();
  const wasAuthenticated = useRef<boolean | null>(null);

  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  console.log('[TRACE-AUTH-PC] AuthPlaybackController hooks done');

  useEffect(() => {
    console.log('[TRACE-AUTH-PC] AuthPlaybackController mounted (useEffect ran)');
    if (wasAuthenticated.current === true && isAuthenticated === false) {
      logger.info('[AuthPlaybackController] User logged out - stopping playback');
      player.pause();
      player.replace({ uri: '' });
      setCurrentTrack(null);
      setPlaybackPhase('idle');
    }

    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated, player, setCurrentTrack, setPlaybackPhase]);

  return null;
}
