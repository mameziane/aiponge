/**
 * Auto-Play On Completion Hook
 *
 * Handles seamless transition from preview audio to final CDN audio
 * when a track generation completes. Extracted from DiscoverScreen to
 * isolate the complex async auto-play logic and reduce component size.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { AudioPlayer } from 'expo-audio';
import type { PlaybackTrack, PlaybackPhase } from '../../contexts/PlaybackContext';
import type { UserCreation } from '../playlists/useExploreData';
import { logger } from '../../lib/logger';

interface UseAutoPlayOnCompletionOptions {
  yourCreations: UserCreation[];
  player: AudioPlayer;
  setCurrentTrack: (track: PlaybackTrack) => void;
  setPlaybackPhase: (phase: PlaybackPhase) => void;
}

/**
 * Returns a stable `handleAutoPlayReady` callback to pass to `useTrackCompletionHandler`.
 * When called, it stores the pending track ID and seek position. The internal effect
 * watches `yourCreations` and auto-plays the completed track when it appears with an audioUrl.
 */
export function useAutoPlayOnCompletion({
  yourCreations,
  player,
  setCurrentTrack,
  setPlaybackPhase,
}: UseAutoPlayOnCompletionOptions) {
  // Track ID pending auto-play after refetch (set when preview was playing on completion)
  const pendingAutoPlayTrackId = useRef<string | null>(null);
  // Position to seek to when auto-playing (for seamless resume from preview)
  const pendingSeekPosition = useRef<number>(0);

  // Keep a ref to yourCreations so the auto-play effect can access the latest
  // data without depending on the array reference (which changes on every fetch).
  const yourCreationsRef = useRef(yourCreations);
  yourCreationsRef.current = yourCreations;

  const handleAutoPlayReady = useCallback((trackId: string, seekPosition: number) => {
    logger.debug('[AutoPlay] Preview was playing, will auto-play final track', {
      trackId,
      seekPosition,
    });
    pendingAutoPlayTrackId.current = trackId;
    pendingSeekPosition.current = seekPosition;
  }, []);

  // Auto-play the final track when it becomes available after refetch.
  // Only runs when yourCreations changes AND a pending auto-play track is set.
  useEffect(() => {
    const pendingId = pendingAutoPlayTrackId.current;
    if (!pendingId) return;

    const creations = yourCreationsRef.current;

    logger.debug('[AutoPlay] Auto-play check', {
      pending: pendingId,
      creationsCount: creations?.length || 0,
    });

    if (!creations || creations.length === 0) {
      logger.debug('[AutoPlay] No creations yet, waiting for refetch');
      return;
    }

    // Find the newly completed track in creations
    const newTrack = creations.find(c => c.id === pendingId);

    if (!newTrack) {
      logger.debug('[AutoPlay] Track not found in creations yet', {
        availableIds: creations.slice(0, 5).map(c => c.id),
      });
      return;
    }

    if (!newTrack.audioUrl) {
      logger.debug('[AutoPlay] Track found but no audioUrl yet', { trackId: newTrack.id });
      return;
    }

    // Capture values before async IIFE (TypeScript narrowing)
    const trackId = newTrack.id;
    const trackTitle = newTrack.title || 'Untitled';
    const trackArtist = newTrack.displayName || 'You';
    const trackArtworkUrl = newTrack.artworkUrl || undefined;
    const trackDuration = newTrack.duration || undefined;
    const audioUrl = newTrack.audioUrl; // Already verified non-null above
    const trackLyricsId = newTrack.lyricsId || undefined;
    const trackHasSyncedLyrics = newTrack.hasSyncedLyrics || false;

    logger.debug('[AutoPlay] Auto-playing completed track', {
      trackTitle,
      trackId,
      audioUrlPreview: audioUrl?.substring(0, 50),
    });
    pendingAutoPlayTrackId.current = null;

    // Use async IIFE to handle async operations in useEffect
    (async () => {
      try {
        // Capture seek position before clearing ref
        const seekPosition = pendingSeekPosition.current;
        pendingSeekPosition.current = 0;

        // IMPORTANT: Do NOT pause here - let the streaming preview continue playing
        // while we prepare the CDN audio. This prevents audio gap during transition.

        // Set up playback state BEFORE loading audio
        setCurrentTrack({
          id: trackId,
          audioUrl: audioUrl,
          title: trackTitle,
          displayName: trackArtist,
          artworkUrl: trackArtworkUrl,
          duration: trackDuration,
          lyricsId: trackLyricsId,
          hasSyncedLyrics: trackHasSyncedLyrics,
        });

        // Load the CDN audio file first (this downloads/buffers the file)
        // The replace call will automatically pause the current playback
        logger.debug('[AutoPlay] Loading CDN audio for seamless transition', { seekPosition });
        await player.replace({ uri: audioUrl });

        // Seek to the position where preview was playing (seamless resume)
        // CRITICAL: Seek BEFORE play to avoid starting from beginning
        if (seekPosition > 0) {
          logger.debug('[AutoPlay] Seeking to preview position', { seekPosition });
          player.seekTo(seekPosition);
          // Small delay to allow seek to complete before play
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Now start playback from the seeked position
        setPlaybackPhase('buffering');
        player.play();
        logger.debug('[AutoPlay] Auto-play started successfully', {
          note: seekPosition > 0 ? `at position ${seekPosition}s` : 'from start',
        });
      } catch (err) {
        logger.warn('[AutoPlay] Failed to auto-play completed track', { error: err });
        setPlaybackPhase('idle');
      }
    })();
  }, [yourCreations, player, setCurrentTrack, setPlaybackPhase]);

  return { handleAutoPlayReady };
}
