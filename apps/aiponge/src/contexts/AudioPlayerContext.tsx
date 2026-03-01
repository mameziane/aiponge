/**
 * Global Audio Player Context
 * Provides a single shared audio player instance across the entire app
 * Prevents multiple audio players from playing simultaneously
 * Exposes track completion callbacks for queue auto-advance
 *
 * expo-audio handles everything: playback, lock screen controls, and Bluetooth remotes.
 * Lock screen metadata is set via player.setActiveForLockScreen() in MediaSessionService.ts.
 * Play/pause/seek from lock screen and Bluetooth are handled natively by expo-audio.
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
