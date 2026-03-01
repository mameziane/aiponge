/**
 * Global Audio Player Context
 * Provides a single shared audio player instance across the entire app
 * Prevents multiple audio players from playing simultaneously
 * Exposes track completion callbacks for queue auto-advance
 *
 * ARCHITECTURE NOTE — DUAL AUDIO SYSTEM (future consolidation candidate):
 * The app uses two audio packages intentionally:
 *   1. expo-audio (this file) — handles actual audio playback everywhere, including Expo Go
 *   2. react-native-track-player (MediaSessionService.ts) — manages the iOS lock screen Now
 *      Playing widget, Bluetooth remote controls (AirPods, car audio), and Control Center.
 *      It does NOT play audio; its track URL is intentionally '' and it mirrors expo-audio state.
 *
 * The split exists because react-native-track-player is a third-party native module not bundled
 * in Expo Go, so expo-audio is required to keep audio working during development without a build.
 *
 * iOS 26 NOTE:
 * react-native-track-player 4.1.x has confirmed memory corruption on iOS 26 and remains
 * blocked in MediaSessionService.ts (lock screen / Bluetooth only — no audio impact).
 * expo-audio 1.1.x does NOT exhibit the same crash; audio playback works normally on iOS 26.
 * The playsInSilentMode session config (audioSession.ts) is required for sound to play
 * when the mute switch is on.
 *
 * TODO (future consolidation): Migrate to react-native-track-player for both playback and media
 * session. It handles both concerns in one package, which removes the dual-init crash risk.
 */

import { createContext, useContext, useRef, useCallback, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import { useAudioPlayer, AudioPlayer } from 'expo-audio';
import { useAuthStore, selectIsAuthenticated } from '../auth';
import { configureAudioSession } from '../hooks/music/audioSession';
import { logger } from '../lib/logger';

// iOS 26 detection — exported for other modules (MediaSessionService, Reanimated guards, etc.)
const iosVersionMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version).split('.')[0], 10) : 0;
export const isIOS26OrLater = iosVersionMajor >= 26;

type TrackEndCallback = () => void;

interface AudioPlayerContextValue {
  player: AudioPlayer;
  registerTrackEndListener: (callback: TrackEndCallback) => () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

// ---------------------------------------------------------------------------
// Audio player provider — uses expo-audio on all platforms including iOS 26
// ---------------------------------------------------------------------------
function AudioPlayerProviderReal({ children }: { children: ReactNode }) {
  const player = useAudioPlayer();
  const trackEndListeners = useRef<Set<TrackEndCallback>>(new Set());

  const registerTrackEndListener = useCallback((callback: TrackEndCallback): (() => void) => {
    trackEndListeners.current.add(callback);
    return () => {
      trackEndListeners.current.delete(callback);
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

  useEffect(() => {
    const handleStatusUpdate = (status: { didJustFinish?: boolean }) => {
      if (status.didJustFinish) {
        trackEndListeners.current.forEach(cb => cb());
      }
    };

    const subscription = player.addListener('playbackStatusUpdate', handleStatusUpdate);

    return () => {
      subscription.remove();
    };
  }, [player]);

  return (
    <AudioPlayerContext.Provider value={{ player, registerTrackEndListener }}>{children}</AudioPlayerContext.Provider>
  );
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
