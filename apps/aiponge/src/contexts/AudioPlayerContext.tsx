/**
 * Global Audio Player Context
 * Provides a single shared audio player instance across the entire app
 * Prevents multiple audio players from playing simultaneously
 * Exposes track completion callbacks for queue auto-advance
 * Exposes play/pause state change callbacks for reliable phase sync
 *
 * expo-audio handles everything: playback, lock screen controls, and Bluetooth remotes.
 * Lock screen metadata is set via player.setActiveForLockScreen() in MediaSessionService.ts.
 * Play/pause/seek from lock screen and Bluetooth are handled natively by expo-audio.
 */

import { createContext, useContext, useRef, useCallback, useEffect, useMemo, ReactNode } from 'react';
import { Platform } from 'react-native';
import { useAudioPlayer, AudioPlayer } from 'expo-audio';
import { useAuthStore, selectIsAuthenticated } from '../auth';
import { configureAudioSession } from '../hooks/music/audioSession';
import { logger } from '../lib/logger';

// iOS 26 detection — exported for other modules (MediaSessionService, Reanimated guards, etc.)
const iosVersionMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version).split('.')[0], 10) : 0;
export const isIOS26OrLater = iosVersionMajor >= 26;

type TrackEndCallback = () => void;
type PlayingChangeCallback = (isPlaying: boolean) => void;

interface AudioPlayerContextValue {
  player: AudioPlayer;
  registerTrackEndListener: (callback: TrackEndCallback) => () => void;
  registerPlayingChangeListener: (callback: PlayingChangeCallback) => () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

// ---------------------------------------------------------------------------
// Audio player provider — uses expo-audio on all platforms including iOS 26
// ---------------------------------------------------------------------------
function AudioPlayerProviderReal({ children }: { children: ReactNode }) {
  const player = useAudioPlayer();
  const trackEndListeners = useRef<Set<TrackEndCallback>>(new Set());
  const playingChangeListeners = useRef<Set<PlayingChangeCallback>>(new Set());

  const registerTrackEndListener = useCallback((callback: TrackEndCallback): (() => void) => {
    trackEndListeners.current.add(callback);
    return () => {
      trackEndListeners.current.delete(callback);
    };
  }, []);

  const registerPlayingChangeListener = useCallback((callback: PlayingChangeCallback): (() => void) => {
    playingChangeListeners.current.add(callback);
    return () => {
      playingChangeListeners.current.delete(callback);
    };
  }, []);

  // Configure the OS audio session eagerly on mount so it's done before the first tap.
  // configureAudioSession is idempotent (runs setAudioModeAsync only once ever).
  useEffect(() => {
    configureAudioSession();
  }, []);

  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const wasAuthenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    if (wasAuthenticatedRef.current && !isAuthenticated) {
      player.pause();
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, player]);

  // Track previous playing state to detect changes and notify listeners.
  // This is event-driven (via playbackStatusUpdate) rather than relying on React effect deps,
  // which is MORE reliable because player state changes through our memoized context don't
  // trigger consumer re-renders — making player.playing in useEffect deps unreliable.
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    const handleStatusUpdate = (status: { didJustFinish?: boolean }) => {
      // Track end detection
      if (status.didJustFinish) {
        trackEndListeners.current.forEach(cb => cb());
      }

      // Play/pause state change detection
      const isNowPlaying = player.playing;
      if (isNowPlaying !== wasPlayingRef.current) {
        wasPlayingRef.current = isNowPlaying;
        playingChangeListeners.current.forEach(cb => cb(isNowPlaying));
      }
    };

    const subscription = player.addListener('playbackStatusUpdate', handleStatusUpdate);

    return () => {
      subscription.remove();
    };
  }, [player]);

  // Memoize context value to prevent all consumers from re-rendering when this provider
  // re-renders due to useAudioPlayer() internal state changes or auth state changes.
  // All three values are stable useCallback refs.
  const contextValue = useMemo(
    () => ({ player, registerTrackEndListener, registerPlayingChangeListener }),
    [player, registerTrackEndListener, registerPlayingChangeListener]
  );

  return <AudioPlayerContext.Provider value={contextValue}>{children}</AudioPlayerContext.Provider>;
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------
export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  return <AudioPlayerProviderReal>{children}</AudioPlayerProviderReal>;
}

export function useGlobalAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useGlobalAudioPlayer must be used within AudioPlayerProvider');
  }
  return context.player;
}

export function useTrackEndListener(callback: TrackEndCallback | null) {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useTrackEndListener must be used within AudioPlayerProvider');
  }

  useEffect(() => {
    if (!callback) return;
    return context.registerTrackEndListener(callback);
  }, [callback, context]);
}

/**
 * Subscribe to player play/pause state changes via events (not React effect deps).
 * This is more reliable than putting player.playing in useEffect deps because
 * player state changes through our memoized AudioPlayerContext don't trigger
 * consumer re-renders — making deps-based detection unreliable.
 */
export function usePlayerPlayingChange(callback: PlayingChangeCallback | null) {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('usePlayerPlayingChange must be used within AudioPlayerProvider');
  }

  // Store callback in ref so re-registration only happens when context changes (never)
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler: PlayingChangeCallback = isPlaying => {
      callbackRef.current?.(isPlaying);
    };
    return context.registerPlayingChangeListener(handler);
  }, [context]);
}
