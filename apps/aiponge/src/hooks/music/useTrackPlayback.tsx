/**
 * Shared Track Playback Hook
 * Unified audio session and playback state management
 * Used by both useMyMusic and useSharedLibrary hooks
 *
 * Now supports auto-advance with shuffle and repeat modes
 * Uses global audio player context to prevent multiple players from playing simultaneously
 * Uses global playback state context to synchronize currentTrack/isPlaying across screens
 */

import { useEffect, useRef, useCallback } from 'react';
import { Image } from 'expo-image';
import { useToast } from '../ui/use-toast';
import { useTranslation } from '../../i18n';
import { configureAudioSession } from './audioSession';
import { logError, getTranslatedFriendlyMessage } from '../../utils/errorSerialization';
import { logger } from '../../lib/logger';
import { getNextTrack } from '../../utils/trackUtils';
import { useGlobalAudioPlayer } from '../../contexts/AudioPlayerContext';
import { usePlaybackState, type PlaybackTrack } from '../../contexts/PlaybackContext';
import { useCastPlayback } from './useCastPlayback';
import { apiRequest } from '../../lib/axiosApiClient';
import { useDownloadStore } from '../../offline/store';
import { forceRefreshExplore } from '../../auth/cacheUtils';
import {
  updateMediaSessionTrack,
  syncMediaSessionPlaybackState,
  updateMediaSessionPosition,
  registerMediaSessionEvents,
  isMediaSessionAvailable,
  type MediaSessionTrack,
} from './MediaSessionService';
import type { PlayableTrack } from '../../types';
import { CONFIG } from '../../constants/appConfig';

export type { PlayableTrack };

// Module-level singleton flag for MediaSession registration
// This ensures handlers are registered EXACTLY once across all hook instances
// but still allows cleanup for hot reload and dev teardown scenarios
let globalMediaSessionRegistered = false;
let globalMediaSessionCleanup: (() => void) | null = null;

// Reset function for hot reload/dev scenarios - called when all components unmount
export function resetMediaSessionRegistration() {
  if (globalMediaSessionCleanup) {
    globalMediaSessionCleanup();
    globalMediaSessionCleanup = null;
  }
  globalMediaSessionRegistered = false;
}

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

      await forceRefreshExplore();
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
    availableTracks = [],
    onNewTrackStarted,
    onTrackFinished,
  } = options;
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
  const setCurrentTrack = (track: T | null) => setGlobalCurrentTrack(track);

  // Track if we're already handling a track end to prevent duplicate calls
  const isHandlingTrackEnd = useRef(false);

  // Track if we're actively loading a new track to prevent premature 'paused' transitions
  // This prevents the useEffect from seeing transient player.playing=false states during track switch
  const isLoadingNewTrack = useRef(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionCountsRef = useRef({ skipCount: 0, pauseCount: 0, seekCount: 0 });

  /**
   * Helper to update playback phase with automatic media session sync
   * Consolidates scattered setPlaybackPhase + syncMediaSessionPlaybackState calls
   * @param phase - The new playback phase
   * @param syncSession - Whether to sync with media session (default: true for playing/paused/idle)
   */
  const updatePlaybackPhase = useCallback(
    (phase: 'idle' | 'buffering' | 'playing' | 'paused', syncSession: boolean = true) => {
      setPlaybackPhase(phase);

      // Sync media session for phases that represent stable playback states
      // Skip for 'buffering' since it's transitional and will be followed by 'playing'
      if (syncSession && phase !== 'buffering') {
        const isPlaying = phase === 'playing';
        syncMediaSessionPlaybackState(isPlaying).catch(e =>
          logger.warn('[Playback] Failed to sync media session state', e)
        );
      }
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
   * Main play handler - handles play/pause toggle and track switching
   * Memoized with useCallback to prevent stale closures in auto-advance effect
   * @param forceRestart - If true, always restart from beginning (used for auto-advance)
   */
  const handlePlayTrack = useCallback(
    async (track: T, forceRestart: boolean = false) => {
      try {
        if (currentTrack && currentTrack.id !== track.id && isPlaying) {
          interactionCountsRef.current.skipCount++;
          recordTrackPlay(currentTrack.id, player.duration, interactionCountsRef.current).catch(e =>
            logger.warn('[Playback] Failed to record track play', e)
          );
          interactionCountsRef.current = { skipCount: 0, pauseCount: 0, seekCount: 0 };
        }

        // If clicking same track that's playing, pause it (unless forcing restart)
        if (currentTrack?.id === track.id && isPlaying && !forceRestart) {
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
        if (currentTrack?.id === track.id && !forceRestart) {
          // Resume from current position
          if (isCasting) {
            logger.debug('[Playback] Toggle resume via Cast');
            await castPlay();
          } else {
            await configureAudioSession(); // Configure audio to interrupt other apps
            // Show buffering immediately for instant UI feedback (sync skipped for transitional state)
            updatePlaybackPhase('buffering');
            player.play();
          }
          return;
        }

        // If forcing restart of same track (repeat mode), seek to beginning
        if (currentTrack?.id === track.id && forceRestart) {
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
          // Resolve audio URL (prefer offline if available)
          const { uri, isOffline } = resolveAudioUrl(track);
          // Replace and play from start for repeat modes
          player.replace({ uri });
          player.play();
          // Update last played time for offline tracks
          if (isOffline) {
            updateLastPlayed(track.id);
          }
          // Player started - playing phase will be set by sync effect when player.playing changes
          return;
        }

        // Load and play new track
        try {
          // Mark that we're loading a new track - prevents useEffect from transitioning to 'paused'
          // when player.playing briefly becomes false during track switch
          // Cancel any pending loading timeout from a previous track
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
              // Cast successful - update media session and record play
              const mediaTrack: MediaSessionTrack = {
                id: track.id,
                audioUrl: track.audioUrl,
                title: track.title || t('common.unknownTrack'),
                displayName: track.displayName || CONFIG.app.defaultDisplayName,
                artworkUrl: track.artworkUrl,
                duration: track.duration || player.duration,
                album: CONFIG.app.albumName,
              };
              updateMediaSessionTrack(mediaTrack).catch(e =>
                logger.warn('[Playback] Failed to update media session track', e)
              );
              if (onNewTrackStarted) {
                onNewTrackStarted(track.id);
              }
              const nextTrack = getNextTrack(availableTracks as T[], track, shuffleEnabled, repeatMode);
              if (nextTrack?.artworkUrl) {
                prefetchArtwork(nextTrack.artworkUrl).catch(e =>
                  logger.warn('[Playback] Failed to prefetch artwork', e)
                );
              }
              return;
            }
          }

          // Local playback path
          await configureAudioSession(); // Configure audio to interrupt other apps

          // Resolve audio URL (prefer offline if available)
          const { uri, isOffline } = resolveAudioUrl(track);

          // Then start playback
          player.replace({ uri });
          player.play();

          // Update last played time for offline tracks
          if (isOffline) {
            updateLastPlayed(track.id);
          }

          // Update media session for Bluetooth/lock screen display
          const mediaTrack: MediaSessionTrack = {
            id: track.id,
            audioUrl: track.audioUrl,
            title: track.title || t('common.unknownTrack'),
            displayName: track.displayName || CONFIG.app.defaultDisplayName,
            artworkUrl: track.artworkUrl,
            duration: track.duration || player.duration,
            album: CONFIG.app.albumName,
          };
          updateMediaSessionTrack(mediaTrack).catch(e =>
            logger.warn('[Playback] Failed to update media session track', e)
          );

          // Notify callback that a new track started playing (for guest conversion, analytics, etc.)
          if (onNewTrackStarted) {
            onNewTrackStarted(track.id);
          }

          // Prefetch artwork for next track to improve perceived performance
          const nextTrack = getNextTrack(availableTracks as T[], track, shuffleEnabled, repeatMode);
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
    [
      currentTrack,
      isPlaying,
      player,
      setCurrentTrack,
      updatePlaybackPhase,
      toast,
      onNewTrackStarted,
      availableTracks,
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

  // Sync playback phase with actual player state
  // Transitions: buffering → playing when player starts, playing → paused when player stops
  // IMPORTANT: Do NOT transition buffering → paused automatically (buffering is optimistic, wait for player to start)
  useEffect(() => {
    if (player.playing && playbackPhase === 'buffering') {
      // Player successfully started, transition from buffering to playing
      updatePlaybackPhase('playing');

      // Clear loading flag after a short delay to ignore transient player.playing=false during load
      // The player can briefly report false states even after starting
      // Cancel any previous timeout to handle rapid track switches
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = setTimeout(() => {
        isLoadingNewTrack.current = false;
        loadingTimeoutRef.current = null;
      }, 500);
    } else if (!player.playing && playbackPhase === 'playing' && !isLoadingNewTrack.current) {
      // Player stopped while playing, update phase to paused
      // BUT only if we're not in the middle of loading a new track
      // (during track switch, player.playing briefly becomes false)
      updatePlaybackPhase('paused');
    }
    // Note: buffering → paused transition NOT included here - let buffering persist until player starts
  }, [player.playing, playbackPhase, updatePlaybackPhase]);

  /**
   * Auto-advance to next track when current track finishes
   * Monitors playback status and plays next track based on shuffle/repeat settings
   *
   * CRITICAL: This effect must include all context setters and closures in deps
   * to prevent stale state when multiple screens mount simultaneously
   */
  useEffect(() => {
    // Only set up listener if we have a current track
    if (!currentTrack) return;

    const checkInterval = setInterval(() => {
      // Check if track has finished playing
      // expo-audio player considers track finished when position >= duration - 100ms
      const hasFinished = player.currentTime >= player.duration - 0.1 && player.duration > 0 && !player.playing;

      if (hasFinished && !isHandlingTrackEnd.current) {
        isHandlingTrackEnd.current = true;

        // Notify callback that track finished playing (for feedback prompt, analytics, etc.)
        if (onTrackFinished) {
          onTrackFinished(currentTrack.id, currentTrack.title);
        }
        recordTrackPlay(currentTrack.id, player.duration, interactionCountsRef.current).catch(e =>
          logger.warn('[Playback] Failed to record track play', e)
        );
        interactionCountsRef.current = { skipCount: 0, pauseCount: 0, seekCount: 0 };

        // Get next track based on settings
        const nextTrack = getNextTrack<T>(availableTracks as T[], currentTrack, shuffleEnabled, repeatMode);

        if (nextTrack) {
          // Play next track after a brief delay
          // Force restart if it's the same track (repeat-one mode)
          const isReplayingSameTrack = nextTrack.id === currentTrack.id;
          setTimeout(() => {
            handlePlayTrack(nextTrack, isReplayingSameTrack).finally(() => {
              isHandlingTrackEnd.current = false;
            });
          }, 100);
        } else {
          updatePlaybackPhase('idle');
          isHandlingTrackEnd.current = false;
        }
      }
    }, 500); // Check every 500ms

    return () => {
      clearInterval(checkInterval);
      // Reset handling flag on cleanup to prevent stale state
      isHandlingTrackEnd.current = false;
    };
    // Include all referenced variables and functions to prevent stale closures
  }, [
    currentTrack,
    player.currentTime,
    player.duration,
    player.playing,
    shuffleEnabled,
    repeatMode,
    availableTracks,
    updatePlaybackPhase,
    handlePlayTrack,
    onTrackFinished,
  ]);

  /**
   * Pause current track (Cast-aware)
   * Routes to Cast device if casting, otherwise pauses local player
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
   * Routes to Cast device if casting, otherwise resumes local player
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
      const serialized = logError(error, 'Track Resume', currentTrack?.audioUrl || 'unknown');
      updatePlaybackPhase('idle');
      toast({
        title: t('hooks.playback.playbackError'),
        description: getTranslatedFriendlyMessage(serialized, t),
        variant: 'destructive',
      });
    }
  }, [player, updatePlaybackPhase, currentTrack, toast, t, isCasting, castPlay]);

  /**
   * Clear current track and reset player state
   * Used when a track is deleted to prevent stale playback state
   * The expo-audio player.replace() in handlePlayTrack will load new audio
   * Seeking to 0 and pausing fully resets the player for the next track
   */
  const clearCurrentTrack = useCallback(() => {
    player.pause();
    player.seekTo(0);
    setCurrentTrack(null);
    updatePlaybackPhase('idle');
    logger.debug('[Playback] Cleared current track');
  }, [player, setCurrentTrack, updatePlaybackPhase]);

  /**
   * Sync playback position with media session periodically
   * Updates every 5 seconds for lock screen progress bar
   */
  useEffect(() => {
    if (!isMediaSessionAvailable() || !currentTrack || !isPlaying) {
      return;
    }

    const syncPosition = () => {
      if (player.duration > 0) {
        updateMediaSessionPosition(player.currentTime, player.duration).catch(e =>
          logger.warn('[Playback] Failed to update media session position', e)
        );
      }
    };

    // Sync immediately and then every 5 seconds
    syncPosition();
    const interval = setInterval(syncPosition, 5000);

    return () => clearInterval(interval);
  }, [currentTrack, isPlaying, player.currentTime, player.duration]);

  // Use refs to access current state in media session callbacks without re-registering
  const currentTrackRef = useRef(currentTrack);
  const isPlayingRef = useRef(isPlaying);
  const availableTracksRef = useRef(availableTracks);
  const shuffleEnabledRef = useRef(shuffleEnabled);
  const isCastingRef = useRef(isCasting);
  const castPlayRef = useRef(castPlay);
  const castPauseRef = useRef(castPause);
  const castSeekRef = useRef(castSeek);

  // Keep refs in sync with state
  useEffect(() => {
    currentTrackRef.current = currentTrack;
    isPlayingRef.current = isPlaying;
    availableTracksRef.current = availableTracks;
    shuffleEnabledRef.current = shuffleEnabled;
    isCastingRef.current = isCasting;
    castPlayRef.current = castPlay;
    castPauseRef.current = castPause;
    castSeekRef.current = castSeek;
  }, [currentTrack, isPlaying, availableTracks, shuffleEnabled, isCasting, castPlay, castPause, castSeek]);

  /**
   * Register remote control handlers for Bluetooth/lock screen controls
   * These handlers bridge media session controls to the audio player
   * Only registers ONCE globally when media session is available (development builds only)
   * Uses module-level singleton flag to prevent re-registration across all hook instances
   * Uses refs to access current state without causing re-registration
   */
  useEffect(() => {
    // Guard: Only register events if media session is initialized (not in Expo Go)
    if (!isMediaSessionAvailable()) {
      return;
    }

    // Prevent re-registration - use module-level singleton (not component ref)
    // This ensures handlers are registered EXACTLY once across all hook instances
    if (globalMediaSessionRegistered) {
      return;
    }

    globalMediaSessionCleanup = registerMediaSessionEvents({
      onPlay: () => {
        if (currentTrackRef.current && !isPlayingRef.current) {
          if (isCastingRef.current) {
            logger.debug('[MediaSession] Remote play via Cast');
            castPlayRef.current();
          } else {
            player.play();
            setPlaybackPhase('playing');
            syncMediaSessionPlaybackState(true).catch(e =>
              logger.warn('[Playback] Failed to sync media session state', e)
            );
          }
        }
      },
      onPause: () => {
        if (isPlayingRef.current) {
          if (isCastingRef.current) {
            logger.debug('[MediaSession] Remote pause via Cast');
            castPauseRef.current();
          } else {
            player.pause();
            setPlaybackPhase('paused');
            syncMediaSessionPlaybackState(false).catch(e =>
              logger.warn('[Playback] Failed to sync media session state', e)
            );
          }
        }
      },
      onNext: () => {
        if (currentTrackRef.current && availableTracksRef.current.length > 0) {
          const nextTrack = getNextTrack<T>(
            availableTracksRef.current as T[],
            currentTrackRef.current,
            shuffleEnabledRef.current,
            'off'
          );
          if (nextTrack && nextTrack.id !== currentTrackRef.current.id) {
            handlePlayTrack(nextTrack);
          }
        }
      },
      onPrevious: () => {
        if (player.currentTime > 3) {
          if (isCastingRef.current) {
            logger.debug('[MediaSession] Remote seek-to-start via Cast');
            castSeekRef.current(0);
          } else {
            player.seekTo(0);
          }
          updateMediaSessionPosition(0, player.duration).catch(e =>
            logger.warn('[Playback] Failed to update media session position', e)
          );
        } else if (currentTrackRef.current && availableTracksRef.current.length > 0) {
          const currentIndex = availableTracksRef.current.findIndex(t => t.id === currentTrackRef.current!.id);
          if (currentIndex > 0) {
            handlePlayTrack(availableTracksRef.current[currentIndex - 1] as T);
          }
        }
      },
      onSeek: position => {
        if (isCastingRef.current) {
          logger.debug('[MediaSession] Remote seek via Cast', { position });
          castSeekRef.current(position);
        } else {
          player.seekTo(position);
        }
        updateMediaSessionPosition(position, player.duration).catch(e =>
          logger.warn('[Playback] Failed to update media session position', e)
        );
      },
      onStop: () => {
        if (isCastingRef.current) {
          logger.debug('[MediaSession] Remote stop via Cast');
          castPauseRef.current();
        } else {
          player.pause();
        }
        setPlaybackPhase('idle');
        setCurrentTrack(null);
        syncMediaSessionPlaybackState(false).catch(e =>
          logger.warn('[Playback] Failed to sync media session state', e)
        );
      },
    });

    globalMediaSessionRegistered = true;
    logger.info('[MediaSession] Handlers registered (first and only time)');

    // Note: No cleanup that resets the flag - handlers stay registered for app lifetime
    // This is intentional for singleton behavior
  }, [player, handlePlayTrack, setPlaybackPhase, setCurrentTrack]);

  return {
    currentTrack,
    isPlaying,
    player,
    handlePlayTrack,
    pause,
    resume,
    clearCurrentTrack,
  };
}
