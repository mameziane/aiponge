/**
 * Media Session Service
 * Manages system media session for Bluetooth, lock screen, and notification controls
 *
 * Environment Detection:
 * - Expo Go: Uses stub implementations (native modules blocked by Metro)
 * - Development Build / Production (iOS < 26): Uses real react-native-track-player
 * - Production iOS 26+: RNTP is FULLY DISABLED — stub only, no crash
 *
 * iOS 26 RNTP HARD BLOCK
 * react-native-track-player 4.1.x has a confirmed memory corruption bug on iPhone OS 26.
 * Its native RunLoop thread (binary offset 0xC2C1BC) starts as soon as RNTP is required
 * and within 1-8 seconds corrupts the Hermes GC heap AND ObjC class dispatch tables
 * (including the new iOS 26 PrototypeTools.PTSettings framework used by UIKit animations),
 * producing three distinct production crash signatures:
 *   (1) EXC_BAD_ACCESS hermes::vm::GCScope::_newChunkAndPHV   (heap ptr 0xdac147f1aa1003f1)
 *   (2) EXC_BAD_ACCESS hermes::vm::DictPropertyMap::findOrAdd  (NULL+12 ptr)
 *   (3) EXC_CRASH SIGABRT — uncaught NSException from background queue (binary 0x69114)
 *
 * Deferring the require() to inside initializeMediaSession() reduced crash latency from
 * 0.88s to ~7-8s but did NOT prevent the crash — RNTP still runs and corrupts memory.
 * The only safe option is a complete block on iOS 26 until RNTP ships a compatible release.
 * Bluetooth/lock-screen controls degrade gracefully to no-op on iOS 26.
 */

import { logger } from '../../lib/logger';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { TrackIdentity } from '../../types';
import { CONFIG } from '../../constants/appConfig';

const isExpoGo = Constants.appOwnership === 'expo';

// Detect iPhone OS 26+ where RNTP 4.1.x has known memory corruption issues.
// Platform.Version on iOS returns a string like "17.5" or "26.2".
const iosVersionMajor = Platform.OS === 'ios'
  ? parseInt(String(Platform.Version).split('.')[0], 10)
  : 0;
const isIOS26OrLater = iosVersionMajor >= 26;

if (isIOS26OrLater) {
  logger.warn(
    '[MediaSession] iPhone OS 26+ detected — deferring RNTP load to avoid startup memory corruption (RNTP 4.1.x incompatibility)'
  );
}

export interface MediaSessionTrack extends TrackIdentity {
  displayName?: string;
  duration?: number;
  album?: string;
}

// Stub implementation for Expo Go (native modules not available)
const TrackPlayerStub = {
  setupPlayer: async () => {},
  updateOptions: async () => {},
  reset: async () => {},
  add: async () => {},
  play: async () => {},
  pause: async () => {},
  seekTo: async () => {},
  setRepeatMode: async () => {},
  addEventListener: () => ({ remove: () => {} }),
};

let TrackPlayer: Record<string, (...args: unknown[]) => unknown> = TrackPlayerStub;
let Event: Record<string, string> = {};
let State: Record<string, string> = {};
let RepeatMode: Record<string, number> = {};
let Capability: Record<string, number> = {};

// Synchronous module-level RNTP load — iOS < 26 and native builds ONLY.
//
// react-native-track-player's registerPlaybackService() MUST be called synchronously
// at module-parse time on iOS. It registers the background audio service via
// setImmediate(factory()) which iOS only services during the initial native module
// initialization window. Any deferral to an async function (useEffect, Promise, etc.)
// misses that window and causes setupPlayer() to throw an NSException → SIGABRT.
//
// iOS 26 is deliberately excluded: RNTP 4.1.x has a confirmed memory-corruption bug
// on iPhone OS 26 (see header comment). On iOS 26 we use the stub and never touch RNTP.
if (!isExpoGo && !isIOS26OrLater) {
  try {
    const TrackPlayerModule = require('react-native-track-player');
    TrackPlayer = TrackPlayerModule.default || TrackPlayerModule;
    Event = TrackPlayerModule.Event || {};
    State = TrackPlayerModule.State || {};
    RepeatMode = TrackPlayerModule.RepeatMode || {};
    Capability = TrackPlayerModule.Capability || {};

    // registerPlaybackService must run here — synchronously — before any async code.
    if (typeof TrackPlayerModule.registerPlaybackService === 'function') {
      TrackPlayerModule.registerPlaybackService(() => async () => {});
      logger.debug('[MediaSession] Playback service registered synchronously at module load');
    }
    logger.info('[MediaSession] react-native-track-player loaded successfully');
  } catch (err) {
    // If RNTP fails to load here the stub remains active; setupPlayer() will be a no-op.
    logger.warn('[MediaSession] Failed to load react-native-track-player at module load', { err });
  }
}

let isInitialized = false;

if (isExpoGo) {
  logger.info(
    '[MediaSession] Running in Expo Go - using stub module (requires development build for Bluetooth/lock screen controls)'
  );
}

export async function initializeMediaSession(): Promise<void> {
  if (isInitialized) {
    logger.debug('[MediaSession] Already initialized');
    return;
  }

  // RNTP iOS 26 hard block.
  //
  // react-native-track-player 4.1.x has a confirmed memory corruption bug on iPhone OS 26.
  // Its native RunLoop thread (binary offset 0xC2C1BC) runs from the moment RNTP is required
  // and within seconds corrupts the Hermes GC heap AND ObjC class dispatch tables (PrototypeTools
  // PTSettings), producing at minimum three distinct production crash signatures:
  //
  //   1. EXC_BAD_ACCESS in hermes::vm::GCScope::_newChunkAndPHV   (Hermes heap ptr 0xdac147f1aa1003f1)
  //   2. EXC_BAD_ACCESS in hermes::vm::DictPropertyMap::findOrAdd  (NULL+12 ptr)
  //   3. EXC_CRASH SIGABRT — uncaught NSException from background queue (binary offset 0x69114)
  //
  // Deferring the require() to here (rather than at module-parse time) reduced crash latency
  // from 0.88s to ~7-8s but did NOT prevent the crash — RNTP still loads via this useEffect
  // path and its RunLoop starts corrupting memory within seconds.
  //
  // The ONLY safe option on iPhone OS 26 is to skip RNTP entirely and use the stub.
  // Bluetooth/lock-screen media controls will be unavailable on iOS 26 until a compatible
  // RNTP version is released.  All other app functionality is unaffected.
  if (isIOS26OrLater) {
    logger.warn(
      '[MediaSession] iPhone OS 26+ detected — RNTP 4.1.x is incompatible (memory corruption). ' +
      'Using stub. Bluetooth/lock-screen controls disabled until RNTP is updated.',
      { iosVersionMajor }
    );
    // Mark as initialised so we don't retry on every track change.
    isInitialized = true;
    return;
  }

  // RNTP is loaded synchronously at module-parse time (see block above).
  // If that load failed (e.g. running in Expo Go fallback), TrackPlayer is still the stub
  // and setupPlayer() below will be a safe no-op.
  if (!isExpoGo && TrackPlayer === TrackPlayerStub) {
    // Module-level require failed — do NOT retry here. registerPlaybackService() cannot
    // be called after module-load time on iOS; retrying would not fix the registration.
    logger.warn('[MediaSession] RNTP was not loaded at module-parse time; setup will be skipped');
    isInitialized = true;
    return;
  }

  try {
    await TrackPlayer.setupPlayer({
      waitForBuffer: true,
    });

    await TrackPlayer.updateOptions({
      capabilities: [
        Capability?.Play,
        Capability?.Pause,
        Capability?.Stop,
        Capability?.SeekTo,
        Capability?.SkipToNext,
        Capability?.SkipToPrevious,
      ].filter((val): val is number => val !== undefined),
      compactCapabilities: [Capability?.Play, Capability?.Pause, Capability?.SkipToNext].filter(
        (val): val is number => val !== undefined
      ),
      notificationCapabilities: [
        Capability?.Play,
        Capability?.Pause,
        Capability?.SeekTo,
        Capability?.SkipToNext,
        Capability?.SkipToPrevious,
      ].filter((val): val is number => val !== undefined),
    });

    isInitialized = true;
    logger.info('[MediaSession] Track player initialized successfully');
  } catch (error) {
    if (String(error).includes('already been initialized')) {
      isInitialized = true;
      logger.debug('[MediaSession] Track player was already initialized');
    } else {
      logger.error('[MediaSession] Failed to initialize track player', { error });
    }
  }
}

export async function updateMediaSessionTrack(track: MediaSessionTrack): Promise<void> {
  if (!isInitialized && !isExpoGo) {
    await initializeMediaSession();
  }

  try {
    await TrackPlayer.reset();
    await TrackPlayer.add({
      id: track.id,
      url: '', // Empty - playback handled by expo-audio
      title: track.title || 'Unknown Track',
      artist: track.displayName || CONFIG.app.defaultDisplayName,
      album: track.album || CONFIG.app.defaultDisplayName,
      artwork: track.artworkUrl,
      duration: track.duration || 0,
    });
    logger.debug('[MediaSession] Track updated', { title: track.title, displayName: track.displayName });
  } catch (error) {
    logger.error('[MediaSession] Failed to update track', { error });
  }
}

export async function syncMediaSessionPlaybackState(isPlaying: boolean): Promise<void> {
  try {
    if (isPlaying) {
      await TrackPlayer.play();
    } else {
      await TrackPlayer.pause();
    }
  } catch (error) {
    logger.error('[MediaSession] Failed to sync playback state', { error });
  }
}

export async function updateMediaSessionPosition(position: number, _duration: number): Promise<void> {
  try {
    await TrackPlayer.seekTo(position);
  } catch (error) {
    logger.error('[MediaSession] Failed to update position', { error });
  }
}

export async function clearMediaSession(): Promise<void> {
  try {
    await TrackPlayer.reset();
    logger.debug('[MediaSession] Session cleared');
  } catch (error) {
    logger.error('[MediaSession] Failed to clear session', { error });
  }
}

export function registerMediaSessionEvents(handlers: {
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSeek?: (position: number) => void;
  onStop?: () => void;
}): () => void {
  const subscriptions: { remove: () => void }[] = [];

  try {
    if (handlers.onPlay && Event?.RemotePlay) {
      const playbackSub = TrackPlayer.addEventListener(Event.RemotePlay, () => handlers.onPlay?.()) as unknown as {
        remove: () => void;
      };
      subscriptions.push(playbackSub);
    }

    if (handlers.onPause && Event?.RemotePause) {
      const pauseSub = TrackPlayer.addEventListener(Event.RemotePause, () => handlers.onPause?.()) as unknown as {
        remove: () => void;
      };
      subscriptions.push(pauseSub);
    }

    if (handlers.onNext && Event?.RemoteNext) {
      const nextSub = TrackPlayer.addEventListener(Event.RemoteNext, () => handlers.onNext?.()) as unknown as {
        remove: () => void;
      };
      subscriptions.push(nextSub);
    }

    if (handlers.onPrevious && Event?.RemotePrevious) {
      const prevSub = TrackPlayer.addEventListener(Event.RemotePrevious, () => handlers.onPrevious?.()) as unknown as {
        remove: () => void;
      };
      subscriptions.push(prevSub);
    }

    if (handlers.onSeek && Event?.RemoteSeek) {
      const seekSub = TrackPlayer.addEventListener(Event.RemoteSeek, (event: { position: number }) =>
        handlers.onSeek?.(event.position)
      ) as unknown as { remove: () => void };
      subscriptions.push(seekSub);
    }

    if (handlers.onStop && Event?.RemoteStop) {
      const stopSub = TrackPlayer.addEventListener(Event.RemoteStop, () => handlers.onStop?.()) as unknown as {
        remove: () => void;
      };
      subscriptions.push(stopSub);
    }

    logger.debug('[MediaSession] Event handlers registered', {
      handlers: Object.keys(handlers).length,
    });
  } catch (error) {
    logger.error('[MediaSession] Failed to register event handlers', { error });
  }

  return () => {
    subscriptions.forEach(sub => sub?.remove?.());
  };
}

export async function setMediaSessionRepeatMode(mode: 'off' | 'one' | 'all'): Promise<void> {
  try {
    if (!RepeatMode) return;
    const repeatModeMap: Record<string, unknown> = {
      off: RepeatMode.Off,
      one: RepeatMode.Track,
      all: RepeatMode.Queue,
    };
    await TrackPlayer.setRepeatMode(repeatModeMap[mode]);
  } catch (error) {
    logger.error('[MediaSession] Failed to set repeat mode', { error });
  }
}

export function isMediaSessionAvailable(): boolean {
  return isInitialized || isExpoGo;
}

export function isRunningInExpoGo(): boolean {
  return isExpoGo;
}
