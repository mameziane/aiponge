/**
 * Shared Track Playback Hook
 * Unified audio session and playback state management
 * Used by both useMyMusic and useSharedLibrary hooks
 *
 * Supports auto-advance with shuffle and repeat modes.
 * Uses global audio player context to prevent multiple players from playing simultaneously.
 * Uses global playback state context to synchronize currentTrack/isPlaying across screens.
 *
 * Lock screen / Bluetooth remote controls are handled natively by expo-audio
 * via setActiveForLockScreen() — no JS-side event bridging needed.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Image } from 'expo-image';
import { useToast } from '../ui/use-toast';
import { useTranslation } from '../../i18n';
import { configureAudioSession } from './audioSession';
import { logError, getTranslatedFriendlyMessage } from '../../utils/errorSerialization';
import { logger } from '../../lib/logger';
import { getNextTrack } from '../../utils/trackUtils';
import { useGlobalAudioPlayer, usePlayerPlayingChange } from '../../contexts/AudioPlayerContext';
import { usePlaybackState, type PlaybackTrack } from '../../contexts/PlaybackContext';
import { useNetworkStatus } from '../system/useNetworkStatus';
import { useCastPlayback } from './useCastPlayback';
import { apiRequest } from '../../lib/axiosApiClient';
import { useDownloadStore } from '../../offline/store';
import { updateMediaSessionTrack, clearMediaSession, type MediaSessionTrack } from './MediaSessionService';
import type { PlayableTrack } from '../../types';
import { CONFIG } from '../../constants/appConfig';

export type { PlayableTrack };

export interface UseTrackPlaybackOptions {
  shuffleEnabled?: boolean;
  repeatMode?: 'off' | 'one' | 'all';
  availableTracks?: PlaybackTrack[];
  onNewTrackStarted?: (trackId: string) => void;
  onTrackFinished?: (trackId: string, trackTitle?: string) => void;
}

export interface UseTrackPlaybackReturn<T extends PlayableTrack> {
  currentTrack: T | null;
  isPlaying: boolean;
  player: ReturnType<typeof useGlobalAudioPlayer>;
  handlePlayTrack: (track: T) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  clearCurrentTrack: () => void;
}

const RECORD_PLAY_MAX_RETRIES = 2;
const RECORD_PLAY_RETRY_DELAY_MS = 3000;

async function recordTrackPlay(
  trackId: string,
  duration?: number,
  interactions?: { skipCount?: number; pauseCount?: number; seekCount?: number; sessionType?: string }
): Promise<void> {
  for (let attempt = 0; attempt <= RECORD_PLAY_MAX_RETRIES; attempt++) {
    try {
      await apiRequest('/api/v1/app/library/track-play', {
        method: 'POST',
        data: {
          trackId,
          duration: duration || 0,
          context: { source: 'mobile_app' },
          sessionType: interactions?.sessionType || 'on_demand',
          skipCount: interactions?.skipCount || 0,
          pauseCount: interactions?.pauseCount || 0,
          seekCount: interactions?.seekCount || 0,
        },
      });

      // NOTE: forceRefreshExplore() was removed here because it created a feedback loop:
      // recordTrackPlay → invalidate explore query → refetch → new array references →
      // handlePlayTrack recreated → auto-advance effect restarts → re-render cascade.
      // The explore feed will naturally refresh when the user navigates back to it.
      return;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const isRetryable = status === 404 || status === 502 || status === 503 || !status;

      if (isRetryable && attempt < RECORD_PLAY_MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RECORD_PLAY_RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      logger.warn('Error recording track play', { trackId, attempt, status });
      return;
    }
  }
}

/**
 * Prefetch artwork for upcoming tracks to improve perceived performance
 * Uses expo-image's prefetch API to load images into memory and disk cache
 */
async function prefetchArtwork(artworkUrl?: string): Promise<void> {
  if (!artworkUrl) return;

  try {
    await Image.prefetch(artworkUrl, { cachePolicy: 'memory-disk' });
  } catch (error) {
    // Silent failure - prefetching is a performance optimization, not critical
  }
}

/**
 * Hook for managing track playback with audio session configuration
 * Handles play/pause/resume, state synchronization, error handling, and auto-advance
 *
 * @param options - Shuffle, repeat, and available tracks for auto-advance
 */
export function useTrackPlayback<T extends PlayableTrack>(
  options: UseTrackPlaybackOptions = {}
): UseTrackPlaybackReturn<T> {
  const {
    shuffleEnabled = false,
    repeatMode = 'off',
    availableTracks: rawAvailableTracks,
    onNewTrackStarted,
    onTrackFinished,
  } = options;
  // Stabilize availableTracks: when caller omits it, default [] creates a new array each render
  // which invalidates handlePlayTrack (useCallback dep) and the auto-advance useEffect.
  const availableTracks = useMemo(() => rawAvailableTracks ?? [], [rawAvailableTracks]);
  const { toast } = useToast();
  const { t } = useTranslation();
  const player = useGlobalAudioPlayer();

  // Offline download store for preferring local files
  const getLocalAudioPath = useDownloadStore(state => state.getLocalAudioPath);
  const updateLastPlayed = useDownloadStore(state => state.updateLastPlayed);

  // Use global playback state (shared across all screens)
  const {
    currentTrack: globalCurrentTrack,
    isPlaying,
    playbackPhase,
    setCurrentTrack: setGlobalCurrentTrack,
    setPlaybackPhase,
  } = usePlaybackState();

  // Cast playback integration for Chromecast-aware controls
  const { isCasting, castPlay, castPause, castSeek, transferToCast } = useCastPlayback();

  // Cast global current track to generic type T for type safety
  const currentTrack = globalCurrentTrack as T | null;
  const setCurrentTrack = useCallback((track: T | null) => setGlobalCurrentTrack(track), [setGlobalCurrentTrack]);

  // Track if we're already handling a track end to prevent duplicate calls
  const isHandlingTrackEnd = useRef(false);

  // Track if we're actively loading a new track to prevent premature 'paused' transitions
  // This prevents the useEffect from seeing transient player.playing=false states during track switch
  const isLoadingNewTrack = useRef(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionCountsRef = useRef({ skipCount: 0, pauseCount: 0, seekCount: 0 });

  // Network-aware playback recovery (WiFi↔cellular transition, stream stall)
  const network = useNetworkStatus();
  const lastNetworkTypeRef = useRef(network.type);
  const lastRecoveryTimeRef = useRef(0);
  const stallTickCountRef = useRef(0);
  const lastCurrentTimeRef = useRef(0);

  // CRITICAL: Refs for values that change frequently but are only READ inside handlePlayTrack.
  // Using refs instead of useCallback deps prevents handlePlayTrack from being recreated on every
  // PlaybackContext update (currentTrack/isPlaying change) or data refetch (availableTracks change).
  // Without this, handlePlayTrack had 19 deps and was recreated on every play/pause/track change
  // AND every React Query refetch — causing the auto-advance effect to tear down and recreate its
  // setInterval, contributing to the cascading update storm that triggers "Maximum update depth exceeded".
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  // availableTracks gets a new array reference on every React Query refetch because
  // normalizeTracks() creates new objects. Reading via ref prevents handlePlayTrack
  // from being recreated, which was the PRIMARY cause of the render cascade for users
  // with data across multiple explore sections (15+ tracks).
  const availableTracksCallbackRef = useRef(availableTracks);
  availableTracksCallbackRef.current = availableTracks;

  /**
   * Helper to update playback phase.
   * expo-audio natively syncs play/pause state with the lock screen — no manual sync needed.
   */
  const updatePlaybackPhase = useCallback(
    (phase: 'idle' | 'buffering' | 'playing' | 'paused') => {
      setPlaybackPhase(phase);
    },
    [setPlaybackPhase]
  );

  /**
   * Resolve the audio URL for a track, preferring local offline file if available
   * Returns the local file path for downloaded tracks, otherwise the network URL
   */
  const resolveAudioUrl = useCallback(
    (track: T): { uri: string; isOffline: boolean } => {
      const localPath = getLocalAudioPath(track.id);
      if (localPath) {
        logger.debug('[Playback] Using offline audio', { trackId: track.id, localPath });
        return { uri: localPath, isOffline: true };
      }
      return { uri: track.audioUrl, isOffline: false };
    },
    [getLocalAudioPath]
  );

  /**
   * Recover playback after network change or stream stall.
   * Saves current position, re-replaces the audio source, seeks back, and resumes.
   * 5-second cooldown prevents rapid re-recovery loops.
   */
  const recoverPlayback = useCallback(async () => {
    const track = currentTrackRef.current;
    if (!track || isCasting) return;

    const now = Date.now();
    if (now - lastRecoveryTimeRef.current < 5000) {
      logger.debug('[Playback] Recovery skipped — cooldown active');
      return;
    }

    const position = player.currentTime;
    lastRecoveryTimeRef.current = now;
    stallTickCountRef.current = 0;

    logger.info('[Playback] Recovering playback stream', { trackId: track.id, position });
    updatePlaybackPhase('buffering');

    try {
      await configureAudioSession();
      const { uri } = resolveAudioUrl(track as T);
      player.replace({ uri });
      await player.seekTo(position);
      player.play();
    } catch (error) {
      logger.warn('[Playback] Stream recovery failed', { error });
    }
  }, [player, resolveAudioUrl, isCasting, updatePlaybackPhase]);

  /**
   * Network type change recovery.
   * When WiFi↔cellular transition happens during active playback, the TCP connection
   * for the audio stream breaks. Automatically recover by re-loading at current position.
   */
  useEffect(() => {
    const prevType = lastNetworkTypeRef.current;
    lastNetworkTypeRef.current = network.type;

    // Skip initial render or no actual change
    if (!prevType || prevType === network.type) return;
    // Skip if nothing is actively playing
    if (!currentTrackRef.current || !isPlayingRef.current) return;
    // Skip if we went offline (nothing to recover to)
    if (network.isOffline) return;
    // Skip offline tracks — local files don't need network recovery
    const { isOffline } = resolveAudioUrl(currentTrackRef.current as T);
    if (isOffline) return;

    logger.info('[Playback] Network type changed during playback', {
      from: prevType,
      to: network.type,
    });
    void recoverPlayback();
  }, [network.type, network.isOffline, resolveAudioUrl, recoverPlayback]);

  /**
   * Update the lock screen with track metadata via expo-audio's native API.
   */
  const updateLockScreen = useCallback(
    (track: T) => {
      const mediaTrack: MediaSessionTrack = {
        id: track.id,
        audioUrl: track.audioUrl,
        title: track.title || t('common.unknownTrack'),
        displayName: track.displayName || CONFIG.app.defaultDisplayName,
        artworkUrl: track.artworkUrl,
        duration: track.duration || player.duration,
        album: CONFIG.app.albumName,
      };
      updateMediaSessionTrack(player, mediaTrack);
    },
    [player, t]
  );

  /**
   * Main play handler - handles play/pause toggle and track switching
   * Memoized with useCallback to prevent stale closures in auto-advance effect
   * @param forceRestart - If true, always restart from beginning (used for auto-advance)
   */
  const handlePlayTrack = useCallback(
    async (track: T, forceRestart: boolean = false) => {
      // Read from refs to avoid depending on currentTrack/isPlaying in useCallback deps.
      // This makes handlePlayTrack stable across PlaybackContext updates.
      const curTrack = currentTrackRef.current;
      const playing = isPlayingRef.current;

      try {
        if (curTrack && curTrack.id !== track.id && playing) {
          interactionCountsRef.current.skipCount++;
          recordTrackPlay(curTrack.id, player.duration, interactionCountsRef.current).catch(e =>
            logger.warn('[Playback] Failed to record track play', e)
          );
          interactionCountsRef.current = { skipCount: 0, pauseCount: 0, seekCount: 0 };
        }

        // If clicking same track that's playing, pause it (unless forcing restart)
        if (curTrack?.id === track.id && playing && !forceRestart) {
          if (isCasting) {
            logger.debug('[Playback] Toggle pause via Cast');
            await castPause();
          } else {
            player.pause();
            updatePlaybackPhase('paused');
          }
          return;
        }

        // If same track but paused (or forcing restart), handle accordingly
        if (curTrack?.id === track.id && !forceRestart) {
          // Resume from current position
          if (isCasting) {
            logger.debug('[Playback] Toggle resume via Cast');
            await castPlay();
          } else {
            await configureAudioSession(); // Configure audio to interrupt other apps
            // Show buffering immediately for instant UI feedback
            updatePlaybackPhase('buffering');
            player.play();
          }
          return;
        }

        // If forcing restart of same track (repeat mode), seek to beginning
        if (curTrack?.id === track.id && forceRestart) {
          // Cancel any pending loading timeout and mark as loading
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          isLoadingNewTrack.current = true;
          updatePlaybackPhase('buffering');

          // If casting, restart via Cast
          if (isCasting) {
            logger.debug('[Playback] Force restart via Cast', { trackId: track.id });
            const castTrack = {
              id: track.id,
              audioUrl: track.audioUrl,
              title: track.title || t('common.unknownTrack'),
              displayName: track.displayName || CONFIG.app.defaultDisplayName,
              artworkUrl: track.artworkUrl,
              duration: track.duration,
            };
            const castSuccess = await transferToCast(castTrack);
            if (castSuccess) {
              updatePlaybackPhase('playing');
              return;
            }
            logger.warn('[Playback] Cast restart failed, falling back to local');
          }

          // Local playback path
          await configureAudioSession();
          const { uri, isOffline } = resolveAudioUrl(track);
          player.replace({ uri });
          player.play();
          if (isOffline) {
            updateLastPlayed(track.id);
          }
          return;
        }

        // Load and play new track
        try {
          // Mark that we're loading a new track - prevents useEffect from transitioning to 'paused'
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          isLoadingNewTrack.current = true;
          interactionCountsRef.current = { skipCount: 0, pauseCount: 0, seekCount: 0 };

          // Update UI state FIRST for immediate visual feedback
          setCurrentTrack(track);
          updatePlaybackPhase('buffering');

          // If casting, transfer the new track to Cast device
          if (isCasting) {
            logger.debug('[Playback] Loading new track via Cast', { trackId: track.id });
            const castTrack = {
              id: track.id,
              audioUrl: track.audioUrl,
              title: track.title || t('common.unknownTrack'),
              displayName: track.displayName || CONFIG.app.defaultDisplayName,
              artworkUrl: track.artworkUrl,
              duration: track.duration,
            };
            const castSuccess = await transferToCast(castTrack);
            if (!castSuccess) {
              logger.warn('[Playback] Cast transfer failed, falling back to local');
              // Fall through to local playback
            } else {
              // Cast successful - update lock screen and record play
              updateLockScreen(track);
              if (onNewTrackStarted) {
                onNewTrackStarted(track.id);
              }
              const nextTrack = getNextTrack(
                availableTracksCallbackRef.current as T[],
                track,
                shuffleEnabled,
                repeatMode
              );
              if (nextTrack?.artworkUrl) {
                prefetchArtwork(nextTrack.artworkUrl).catch(e =>
                  logger.warn('[Playback] Failed to prefetch artwork', e)
                );
              }
              return;
            }
          }

          // Local playback path
          await configureAudioSession();

          // Resolve audio URL (prefer offline if available)
          const { uri, isOffline } = resolveAudioUrl(track);

          // Then start playback
          player.replace({ uri });
          player.play();

          // Update last played time for offline tracks
          if (isOffline) {
            updateLastPlayed(track.id);
          }

          // Update lock screen for Bluetooth/lock screen display
          updateLockScreen(track);

          // Notify callback that a new track started playing (for guest conversion, analytics, etc.)
          if (onNewTrackStarted) {
            onNewTrackStarted(track.id);
          }

          // Prefetch artwork for next track to improve perceived performance
          const nextTrack = getNextTrack(availableTracksCallbackRef.current as T[], track, shuffleEnabled, repeatMode);
          if (nextTrack?.artworkUrl) {
            prefetchArtwork(nextTrack.artworkUrl).catch(e => logger.warn('[Playback] Failed to prefetch artwork', e));
          }
        } catch (playError) {
          const serialized = logError(playError, 'Audio Play', track.audioUrl);
          updatePlaybackPhase('idle');
          toast({
            title: t('hooks.playback.playbackError'),
            description: getTranslatedFriendlyMessage(serialized, t),
            variant: 'destructive',
          });
        }
      } catch (error) {
        const serialized = logError(error, 'Track Playback', track.audioUrl);
        updatePlaybackPhase('idle');
        toast({
          title: t('hooks.playback.playbackError'),
          description: getTranslatedFriendlyMessage(serialized, t),
          variant: 'destructive',
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentTrack, isPlaying, and
    // availableTracks intentionally read via refs to prevent this callback from being recreated
    // on every PlaybackContext update or React Query refetch. availableTracks changes on every
    // refetch (normalizeTracks creates new objects), which was the PRIMARY cause of the infinite
    // render cascade for users with data across multiple explore sections.
    [
      player,
      setCurrentTrack,
      updatePlaybackPhase,
      updateLockScreen,
      toast,
      onNewTrackStarted,
      shuffleEnabled,
      repeatMode,
      resolveAudioUrl,
      updateLastPlayed,
      isCasting,
      castPlay,
      castPause,
      transferToCast,
      t,
    ]
  );

  // Sync playback phase with actual player state via EVENT-BASED listener (not effect deps).
  //
  // Why events instead of useEffect deps:
  // 1. player.playing changes don't trigger re-renders in DiscoverScreen because our
  //    AudioPlayerContext is memoized — so player.playing in effect deps was unreliable
  // 2. The old approach had a feedback loop risk: effect writes playbackPhase → PlaybackContext
  //    updates → consumers re-render → effect re-evaluates → potentially writes again
  // 3. Event-based: fires exactly once per actual play/pause transition, no re-render needed
  const playbackPhaseRef = useRef(playbackPhase);
  playbackPhaseRef.current = playbackPhase;

  usePlayerPlayingChange((isNowPlaying: boolean) => {
    // Skip when no track is loaded — expo-audio on iOS can emit spurious player.playing
    // changes during audio session setup, which would trigger unwanted phase transitions
    if (!currentTrackRef.current) return;

    const phase = playbackPhaseRef.current;

    if (isNowPlaying && phase === 'buffering') {
      // Player successfully started, transition from buffering to playing
      updatePlaybackPhase('playing');

      // Reset stall tracking — new playback starts clean
      stallTickCountRef.current = 0;
      lastCurrentTimeRef.current = 0;

      // Clear loading flag after a short delay to ignore transient player.playing=false during load
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = setTimeout(() => {
        isLoadingNewTrack.current = false;
        loadingTimeoutRef.current = null;
      }, 500);
    } else if (!isNowPlaying && phase === 'playing' && !isLoadingNewTrack.current) {
      // Player stopped while playing, update phase to paused
      // BUT only if we're not in the middle of loading a new track
      updatePlaybackPhase('paused');
    }
  });

  /**
   * Auto-advance to next track when current track finishes
   * Monitors playback status and plays next track based on shuffle/repeat settings
   *
   * Uses refs for currentTrack and availableTracks to minimize how often this effect
   * re-creates its setInterval. Previously, every PlaybackContext or data-refetch update
   * tore down and recreated this interval, adding to the render cascade.
   */
  const availableTracksRef = useRef(availableTracks);
  availableTracksRef.current = availableTracks;
  const onTrackFinishedRef = useRef(onTrackFinished);
  onTrackFinishedRef.current = onTrackFinished;

  useEffect(() => {
    if (!currentTrackRef.current) return;

    const checkInterval = setInterval(() => {
      const curTrack = currentTrackRef.current;
      if (!curTrack) return;

      // Stall detection: player reports "playing" but currentTime is frozen.
      // 6 ticks × 500ms = 3 seconds of stall before triggering recovery.
      if (player.playing && player.currentTime > 0) {
        if (Math.abs(player.currentTime - lastCurrentTimeRef.current) < 0.01) {
          stallTickCountRef.current++;
          if (stallTickCountRef.current >= 6) {
            logger.info('[Playback] Stream stall detected', {
              currentTime: player.currentTime,
              stallTicks: stallTickCountRef.current,
            });
            void recoverPlayback();
          }
        } else {
          stallTickCountRef.current = 0;
        }
        lastCurrentTimeRef.current = player.currentTime;
      }

      // Guard: require player.duration > 1 (not just > 0) to prevent false positives from
      // tracks with duration=0 in the DB whose actual audio may briefly report a tiny duration
      // during initial load. Real songs are always > 1 second.
      const hasFinished = player.currentTime >= player.duration - 0.1 && player.duration > 1 && !player.playing;

      if (hasFinished && !isHandlingTrackEnd.current) {
        isHandlingTrackEnd.current = true;

        if (onTrackFinishedRef.current) {
          onTrackFinishedRef.current(curTrack.id, curTrack.title);
        }
        recordTrackPlay(curTrack.id, player.duration, interactionCountsRef.current).catch(e =>
          logger.warn('[Playback] Failed to record track play', e)
        );
        interactionCountsRef.current = { skipCount: 0, pauseCount: 0, seekCount: 0 };

        const nextTrack = getNextTrack<T>(availableTracksRef.current as T[], curTrack, shuffleEnabled, repeatMode);

        if (nextTrack) {
          const isReplayingSameTrack = nextTrack.id === curTrack.id;
          setTimeout(() => {
            handlePlayTrack(nextTrack, isReplayingSameTrack).finally(() => {
              isHandlingTrackEnd.current = false;
            });
          }, 100);
        } else {
          // No next track — end of queue without repeat.
          // Clear currentTrack so the mini-player hides and reset phase.
          setCurrentTrack(null);
          updatePlaybackPhase('idle');
          isHandlingTrackEnd.current = false;
        }
      }
    }, 500);

    return () => {
      clearInterval(checkInterval);
      isHandlingTrackEnd.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentTrack, availableTracks,
    // and onTrackFinished are read via refs. player.currentTime/duration/playing are polled
    // by setInterval every 500ms. recoverPlayback is stable (deps are all memoized).
  }, [shuffleEnabled, repeatMode, updatePlaybackPhase, handlePlayTrack, setCurrentTrack, recoverPlayback]);

  /**
   * Pause current track (Cast-aware)
   */
  const pause = useCallback(() => {
    if (isCasting) {
      logger.debug('[Playback] Pausing via Cast');
      castPause();
    } else {
      player.pause();
      interactionCountsRef.current.pauseCount++;
      updatePlaybackPhase('paused');
    }
  }, [player, updatePlaybackPhase, isCasting, castPause]);

  /**
   * Resume current track (Cast-aware)
   */
  const resume = useCallback(async () => {
    try {
      if (isCasting) {
        logger.debug('[Playback] Resuming via Cast');
        await castPlay();
      } else {
        await configureAudioSession();
        updatePlaybackPhase('buffering');
        player.play();
      }
    } catch (error) {
      const serialized = logError(error, 'Track Resume', currentTrackRef.current?.audioUrl || 'unknown');
      updatePlaybackPhase('idle');
      toast({
        title: t('hooks.playback.playbackError'),
        description: getTranslatedFriendlyMessage(serialized, t),
        variant: 'destructive',
      });
    }
  }, [player, updatePlaybackPhase, toast, t, isCasting, castPlay]);

  /**
   * Clear current track and reset player state
   */
  const clearCurrentTrack = useCallback(() => {
    player.pause();
    player.seekTo(0);
    clearMediaSession(player);
    setCurrentTrack(null);
    updatePlaybackPhase('idle');
    logger.debug('[Playback] Cleared current track');
  }, [player, setCurrentTrack, updatePlaybackPhase]);

  return useMemo(
    () => ({
      currentTrack,
      isPlaying,
      player,
      handlePlayTrack,
      pause,
      resume,
      clearCurrentTrack,
    }),
    [currentTrack, isPlaying, player, handlePlayTrack, pause, resume, clearCurrentTrack]
  );
}
