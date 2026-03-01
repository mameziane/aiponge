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
 * iOS 26 EXPO-AUDIO HARD BLOCK
 * expo-audio 1.x initialises an AVAudioEngine instance on the UI thread the moment
 * useAudioPlayer() is called.  On iPhone OS 26 this engine starts a background audio
 * processing thread that races with the Hermes GC during startup — same class of
 * EXC_BAD_ACCESS heap-corruption crash as react-native-track-player 4.1.x.
 * The fix mirrors the RNTP guard: on iOS 26 the real AudioPlayerProvider is never
 * mounted; a lightweight stub provider is used instead.  Audio playback is unavailable
 * on iOS 26 until expo-audio ships a compatible release.
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

// iOS 26 detection — must match the check in MediaSessionService.ts and audioSession.ts
const iosVersionMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version).split('.')[0], 10) : 0;
export const isIOS26OrLater = iosVersionMajor >= 26;

type TrackEndCallback = () => void;

interface AudioPlayerContextValue {
  // Always typed as AudioPlayer so callers don't need to handle the iOS 26 stub union.
  // The iOS 26 provider casts the stub to AudioPlayer at the boundary; the stub's
  // no-op methods are call-safe for all properties consumers actually access.
  player: AudioPlayer;
  registerTrackEndListener: (callback: TrackEndCallback) => () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

// ---------------------------------------------------------------------------
// Stub player for iOS 26 — satisfies the AudioPlayer duck-type without
// touching AVAudioEngine or the AVAudioSession at all.
// ---------------------------------------------------------------------------
class StubAudioPlayer {
  readonly isIOS26Stub = true;

  // Satisfy property reads from useTrackPlayback and lyrics components.
  // Without these, accessing player.currentTime / player.duration / player.playing
  // returns undefined, and useAudioPlayerStatus(player) crashes because the native
  // player handle is null.
  playing = false;
  currentTime = 0;
  duration = 0;
  isLoaded = false;
  muted = false;
  volume = 1;
  rate = 1;
  loop = false;
  isBuffering = false;
  paused = true;

  pause() {}
  play() {}
  remove() {}
  replace(_source: unknown) {}
  seekTo(_position: number) {}
  setRate(_rate: number) {}
  addListener(_event: string, _handler: (...args: unknown[]) => void) {
    return { remove: () => {} };
  }
}

// ---------------------------------------------------------------------------
// iOS 26 stub provider — no expo-audio hooks, no AVAudioEngine init
// ---------------------------------------------------------------------------
function AudioPlayerProviderIOS26({ children }: { children: ReactNode }) {
  const stubPlayer = useRef(new StubAudioPlayer()).current;
  const trackEndListeners = useRef<Set<TrackEndCallback>>(new Set());

  const registerTrackEndListener = useCallback((callback: TrackEndCallback): (() => void) => {
    trackEndListeners.current.add(callback);
    return () => {
      trackEndListeners.current.delete(callback);
    };
  }, []);

  useEffect(() => {
    logger.warn(
      '[AudioPlayer] iPhone OS 26+ detected — expo-audio AVAudioEngine is incompatible ' +
        '(background-thread crash). Using stub. Audio playback disabled until expo-audio is updated.',
      { iosVersionMajor }
    );
  }, []);

  return (
    <AudioPlayerContext.Provider value={{ player: stubPlayer as unknown as AudioPlayer, registerTrackEndListener }}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Real provider — used on iOS < 26 and Android
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
// Public export — picks the right provider based on OS version
// ---------------------------------------------------------------------------
export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  if (isIOS26OrLater) {
    return <AudioPlayerProviderIOS26>{children}</AudioPlayerProviderIOS26>;
  }
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
