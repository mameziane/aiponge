/**
 * Queue Auto-Advance Hook
 *
 * Subscribes to playback queue auto-advance events and plays tracks
 * through the unified playback control pipeline.
 *
 * This hook should be used in a component that's mounted throughout
 * the app (like the root layout) to ensure auto-advance works globally.
 */

import { useEffect, useCallback } from 'react';
import { usePlaybackQueue, QueueTrack } from '../../contexts/PlaybackContext';
import { useUnifiedPlaybackControl } from './useUnifiedPlaybackControl';
import { configureAudioSession } from './audioSession';
import { getApiGatewayUrl } from '../../lib/apiConfig';
import { logger } from '../../lib/logger';

export function useQueueAutoAdvance() {
  const { registerAutoAdvanceCallback } = usePlaybackQueue();
  const { playNewTrack } = useUnifiedPlaybackControl();

  const handleAutoAdvance = useCallback(
    async (track: QueueTrack): Promise<void> => {
      if (!track.audioUrl) {
        logger.error('[QueueAutoAdvance] Track has no audio URL', { trackId: track.id });
        return;
      }

      try {
        await configureAudioSession();

        const resolvedUrl = track.audioUrl.startsWith('http')
          ? track.audioUrl
          : `${getApiGatewayUrl()}${track.audioUrl}`;

        await playNewTrack(
          {
            id: track.id,
            title: track.title,
            displayName: track.displayName || '',
            artworkUrl: track.artworkUrl,
            audioUrl: resolvedUrl,
            lyricsId: track.lyricsId,
            hasSyncedLyrics: track.hasSyncedLyrics,
          },
          resolvedUrl
        );

        logger.debug('[QueueAutoAdvance] Successfully auto-advanced to track', {
          trackId: track.id,
          title: track.title,
        });
      } catch (error) {
        logger.error('[QueueAutoAdvance] Failed to auto-advance', error);
        throw error;
      }
    },
    [playNewTrack]
  );

  useEffect(() => {
    const unsubscribe = registerAutoAdvanceCallback(handleAutoAdvance);
    return unsubscribe;
  }, [registerAutoAdvanceCallback, handleAutoAdvance]);
}
