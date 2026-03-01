/**
 * Chromecast Hook
 *
 * Provides Chromecast/Google Cast functionality for casting audio to Cast devices.
 * Requires production/development build - will show fallback in Expo Go.
 *
 * Uses react-native-google-cast for native Cast SDK integration.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { logger } from '../../lib/logger';

const isExpoGo = Constants.appOwnership === 'expo';

export interface CastDevice {
  deviceId: string;
  deviceName: string;
  modelName?: string;
}

export interface CastState {
  isConnected: boolean;
  isConnecting: boolean;
  device: CastDevice | null;
  devices: CastDevice[];
}

interface CastMediaParams {
  mediaUrl: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  duration?: number;
  contentType?: string;
}

interface RemoteMediaClient {
  loadMedia(request: unknown): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(request: { position: number }): Promise<void>;
  setStreamVolume(volume: number): Promise<void>;
}

type CastContextType = {
  getCastState?: () => Promise<unknown>;
  onCastStateChanged?: (cb: (state: unknown) => void) => { remove?: () => void };
  getSessionManager?: () => {
    getDiscoveredDevices?: () => Promise<unknown[]>;
    getCurrentSession?: () => Promise<{
      device?: { deviceId: string; friendlyName?: string; modelName?: string };
      getRemoteMediaClient?: () => RemoteMediaClient | null;
    }>;
    endCurrentSession?: (stopCasting: boolean) => Promise<void>;
  };
};

type GoogleCastType = {
  showCastDialog?: () => Promise<void>;
  [key: string]: unknown;
};

let GoogleCast: GoogleCastType | null = null;
let CastButton: React.ComponentType<Record<string, unknown>> | null = null;

let useCastStateHook: (() => unknown) | null = null;

let useDevicesHook: (() => Array<{ deviceId: string; friendlyName: string }>) | null = null;

let useRemoteMediaClientHook: (() => unknown) | null = null;
let CastContext: CastContextType | null = null;
let castModuleLoaded = false;
let castModuleLoadAttempted = false;

function loadCastModule(): void {
  if (castModuleLoadAttempted) return;
  castModuleLoadAttempted = true;

  if (isExpoGo) return;

  try {
    logger.info('[useChromecast] Loading react-native-google-cast (lazy)');
    const googleCastModule = require('react-native-google-cast');
    GoogleCast = googleCastModule.default || googleCastModule;
    CastButton = googleCastModule.CastButton;
    useCastStateHook = googleCastModule.useCastState;
    useDevicesHook = googleCastModule.useDevices;
    useRemoteMediaClientHook = googleCastModule.useRemoteMediaClient;
    CastContext = googleCastModule.CastContext;
    castModuleLoaded = true;
    logger.info('[useChromecast] react-native-google-cast loaded successfully');
  } catch (error) {
    logger.warn('[useChromecast] Failed to load react-native-google-cast', { error });
  }
}

function useSafeCastState() {
  const [state, setState] = useState<unknown>(null);

  useEffect(() => {
    if (!castModuleLoaded || !CastContext) return;
    const ctx = CastContext;

    let subscription: { remove?: () => void } | null = null;

    const checkState = async () => {
      try {
        logger.info('[useChromecast] useSafeCastState: calling getCastState');
        const castState = await ctx.getCastState?.();
        logger.info('[useChromecast] useSafeCastState: getCastState returned', { castState });
        setState(castState);
      } catch (err) {
        logger.debug('[useChromecast] getCastState not available', { error: err });
      }
    };

    checkState();

    try {
      logger.info('[useChromecast] useSafeCastState: subscribing to onCastStateChanged');
      if (typeof ctx.onCastStateChanged === 'function') {
        subscription = ctx.onCastStateChanged((newState: unknown) => {
          setState(newState);
        });
        logger.info('[useChromecast] useSafeCastState: onCastStateChanged subscribed OK');
      }
    } catch (err) {
      logger.debug('[useChromecast] Could not subscribe to cast state changes', { error: err });
    }

    return () => {
      try {
        subscription?.remove?.();
      } catch (err) {
        // Ignore cleanup errors
      }
    };
  }, []);

  return state;
}

function useSafeDevices() {
  const [devices, setDevices] = useState<unknown[]>([]);

  useEffect(() => {
    if (!castModuleLoaded || !GoogleCast) return;

    const discoverDevices = async () => {
      try {
        logger.info('[useChromecast] useSafeDevices: calling getDiscoveredDevices');
        const sessionManager = CastContext?.getSessionManager?.();
        if (sessionManager) {
          const discoveredDevices = (await sessionManager.getDiscoveredDevices?.()) || [];
          logger.info('[useChromecast] useSafeDevices: discovered devices', { count: discoveredDevices.length });
          setDevices(discoveredDevices);
        }
      } catch (err) {
        logger.debug('[useChromecast] Could not discover devices', { error: err });
      }
    };

    discoverDevices();
  }, []);

  return devices;
}

function useSafeRemoteMediaClient(): RemoteMediaClient | null {
  const [client, setClient] = useState<RemoteMediaClient | null>(null);

  useEffect(() => {
    if (!castModuleLoaded || !CastContext) return;
    const ctx = CastContext;

    const getClient = async () => {
      try {
        const session = await ctx.getSessionManager?.()?.getCurrentSession?.();
        if (session) {
          setClient(session.getRemoteMediaClient?.() || null);
        }
      } catch (err) {
        logger.debug('[useChromecast] Could not get remote media client', { error: err });
      }
    };

    getClient();
  }, []);

  return client;
}

export function useChromecast() {
  console.log('[TRACE-CAST] useChromecast called - loadCastModule about to run');
  loadCastModule();
  console.log('[TRACE-CAST] loadCastModule completed - castModuleLoaded:', castModuleLoaded);

  const [castState, setCastState] = useState<CastState>({
    isConnected: false,
    isConnecting: false,
    device: null,
    devices: [],
  });
  const [isSupported] = useState(!isExpoGo && castModuleLoaded);
  const [error, setError] = useState<Error | null>(null);

  const nativeCastState = useSafeCastState();
  const nativeDevices = useSafeDevices();
  const remoteMediaClient = useSafeRemoteMediaClient();

  useEffect(() => {
    if (!isSupported) return;

    const stateMap: Record<string, boolean> = {
      connected: true,
      connecting: false,
    };

    const isConnected = nativeCastState === 'connected';
    const isConnecting = nativeCastState === 'connecting';

    setCastState(prev => ({
      ...prev,
      isConnected,
      isConnecting,
      devices: (
        (nativeDevices as Array<{
          deviceId: string;
          friendlyName?: string;
          deviceName?: string;
          modelName?: string;
        }>) || []
      ).map(d => ({
        deviceId: d.deviceId,
        deviceName: d.friendlyName || d.deviceName || 'Cast Device',
        modelName: d.modelName,
      })),
    }));
  }, [nativeCastState, nativeDevices, isSupported]);

  useEffect(() => {
    if (!isSupported || !GoogleCast) return;

    const getCurrentDevice = async () => {
      try {
        const session = await CastContext?.getSessionManager?.()?.getCurrentSession?.();
        if (session) {
          const device = session.device;
          setCastState(prev => ({
            ...prev,
            device: device
              ? {
                  deviceId: device.deviceId,
                  deviceName: device.friendlyName || 'Cast Device',
                  modelName: device.modelName,
                }
              : null,
          }));
        }
      } catch (err) {
        logger.debug('[useChromecast] Could not get current device', { error: err });
      }
    };

    getCurrentDevice();
  }, [castState.isConnected, isSupported]);

  const showCastDialog = useCallback(async () => {
    if (!isSupported || !GoogleCast) {
      logger.warn('[useChromecast] Cast not supported');
      return false;
    }

    try {
      await GoogleCast.showCastDialog?.();
      return true;
    } catch (err) {
      logger.error('[useChromecast] Failed to show cast dialog', { error: err });
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }, [isSupported]);

  const castMedia = useCallback(
    async (params: CastMediaParams) => {
      if (!isSupported || !remoteMediaClient) {
        logger.warn('[useChromecast] Cannot cast - not connected or not supported');
        return false;
      }

      try {
        await remoteMediaClient.loadMedia({
          mediaInfo: {
            contentUrl: params.mediaUrl,
            contentType: params.contentType || 'audio/mpeg',
            metadata: {
              type: 'musicTrack',
              title: params.title,
              subtitle: params.subtitle,
              images: params.artworkUrl ? [{ url: params.artworkUrl }] : [],
            },
            streamDuration: params.duration,
          },
          autoplay: true,
        });

        logger.info('[useChromecast] Media cast started', { title: params.title });
        return true;
      } catch (err) {
        logger.error('[useChromecast] Failed to cast media', { error: err });
        setError(err instanceof Error ? err : new Error(String(err)));
        return false;
      }
    },
    [isSupported, remoteMediaClient]
  );

  const play = useCallback(async () => {
    if (!remoteMediaClient) return false;
    try {
      await remoteMediaClient.play();
      return true;
    } catch (err) {
      logger.error('[useChromecast] Failed to play', { error: err });
      return false;
    }
  }, [remoteMediaClient]);

  const pause = useCallback(async () => {
    if (!remoteMediaClient) return false;
    try {
      await remoteMediaClient.pause();
      return true;
    } catch (err) {
      logger.error('[useChromecast] Failed to pause', { error: err });
      return false;
    }
  }, [remoteMediaClient]);

  const stop = useCallback(async () => {
    if (!remoteMediaClient) return false;
    try {
      await remoteMediaClient.stop();
      return true;
    } catch (err) {
      logger.error('[useChromecast] Failed to stop', { error: err });
      return false;
    }
  }, [remoteMediaClient]);

  const seek = useCallback(
    async (position: number) => {
      if (!remoteMediaClient) return false;
      try {
        await remoteMediaClient.seek({ position });
        return true;
      } catch (err) {
        logger.error('[useChromecast] Failed to seek', { error: err });
        return false;
      }
    },
    [remoteMediaClient]
  );

  const setVolume = useCallback(
    async (volume: number) => {
      if (!remoteMediaClient) return false;
      try {
        await remoteMediaClient.setStreamVolume(volume);
        return true;
      } catch (err) {
        logger.error('[useChromecast] Failed to set volume', { error: err });
        return false;
      }
    },
    [remoteMediaClient]
  );

  const disconnect = useCallback(async () => {
    if (!isSupported || !CastContext) return false;
    try {
      await CastContext.getSessionManager?.()?.endCurrentSession?.(true);
      logger.info('[useChromecast] Disconnected from Cast device');
      return true;
    } catch (err) {
      logger.error('[useChromecast] Failed to disconnect', { error: err });
      return false;
    }
  }, [isSupported]);

  return {
    ...castState,
    isSupported,
    isRunningInExpoGo: isExpoGo,
    error,
    showCastDialog,
    castMedia,
    play,
    pause,
    stop,
    seek,
    setVolume,
    disconnect,
    CastButton,
  };
}

export { CastButton };
