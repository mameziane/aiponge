/**
 * Audio Output Hook
 * Detects and displays current audio output device (Bluetooth, speaker, headphones, etc.)
 *
 * Environment Detection:
 * - Expo Go: Uses stub implementations (native modules blocked by Metro)
 * - Development Build: Uses @siteed/expo-audio-studio for real device detection
 *
 * NOTE: Metro config blocks native modules and redirects to stubs automatically.
 */

import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { logger } from '../../lib/logger';
import Constants from 'expo-constants';
import type { IconName } from '../../types/ui.types';

export interface AudioOutputInfo {
  deviceName: string;
  deviceType: 'speaker' | 'bluetooth' | 'wired' | 'usb' | 'builtin' | 'unavailable';
  icon: IconName;
}

interface AudioDevice {
  id: string;
  name: string;
  type: string;
  isDefault?: boolean;
}

const isExpoGo = Constants.appOwnership === 'expo';

// iOS 26 detection — expo-audio-studio starts AVAudioSession monitoring at native init
// time on iOS 26, activating CoreMedia queues and triggering NSException crashes.
// Same root cause as the RNTP crash — native AppDelegate/+load code runs before JS.
// Metro redirects the require() to a stub on iOS (see metro.config.js), and
// react-native.config.js excludes the native binary entirely, preventing the
// background thread from starting.
const iosVersionMajor = Platform.OS === 'ios'
  ? parseInt(String(Platform.Version).split('.')[0], 10)
  : 0;
const isIOS26OrLater = iosVersionMajor >= 26;

// Stub implementation for Expo Go and iOS 26 (native modules not available / unsafe)
const audioDeviceManagerStub = {
  getAvailableDevices: async (): Promise<AudioDevice[]> => [],
  getCurrentDevice: async (): Promise<AudioDevice | null> => null,
  selectDevice: async (_deviceId: string): Promise<boolean> => false,
  refreshDevices: async (): Promise<AudioDevice[]> => [],
  addDeviceChangeListener:
    (_callback: (devices: AudioDevice[]) => void): (() => void) =>
    () => {},
};

// Only load native module on non-Expo-Go AND non-iOS26 builds.
// On iOS the Metro redirect to the stub handles this transparently.
let audioDeviceManager: typeof audioDeviceManagerStub = audioDeviceManagerStub;

if (!isExpoGo && !isIOS26OrLater) {
  try {
    const audioStudioModule = require('@siteed/expo-audio-studio');
    audioDeviceManager = audioStudioModule.audioDeviceManager || audioDeviceManagerStub;
  } catch (error) {
    logger.warn('[useAudioOutput] Failed to load @siteed/expo-audio-studio, using stub', { error });
  }
} else if (isIOS26OrLater) {
  logger.warn('[useAudioOutput] iPhone OS 26+ — expo-audio-studio disabled (AVAudioSession crash). Audio device detection unavailable.');
} else {
  logger.info('[useAudioOutput] Running in Expo Go - using stub (requires development build for device detection)');
}

function classifyDevice(device: AudioDevice | null): AudioOutputInfo {
  if (!device) {
    return {
      deviceName: 'Audio Output',
      deviceType: 'unavailable',
      icon: 'volume-high',
    };
  }

  const deviceName = device.name || 'Unknown Device';
  const deviceTypeLower = (device.type || '').toLowerCase();

  let deviceType: AudioOutputInfo['deviceType'] = 'builtin';
  let icon: IconName = 'volume-high';

  if (deviceTypeLower.includes('bluetooth') || deviceTypeLower.includes('a2dp')) {
    deviceType = 'bluetooth';
    icon = 'bluetooth';
  } else if (
    deviceTypeLower.includes('wired') ||
    deviceTypeLower.includes('headphone') ||
    deviceTypeLower.includes('headset')
  ) {
    deviceType = 'wired';
    icon = 'headset';
  } else if (deviceTypeLower.includes('usb')) {
    deviceType = 'usb';
    icon = 'hardware-chip-outline';
  } else if (deviceTypeLower.includes('speaker') || deviceTypeLower.includes('builtin')) {
    deviceType = 'builtin';
    icon = 'volume-high';
  }

  return {
    deviceName,
    deviceType,
    icon,
  };
}

export function useAudioOutput() {
  const [outputInfo, setOutputInfo] = useState<AudioOutputInfo>({
    deviceName: 'Audio Output',
    deviceType: 'builtin',
    icon: 'volume-high',
  });
  const [isLoading, setIsLoading] = useState(!isExpoGo);
  const [error, setError] = useState<Error | null>(null);
  const [allDevices, setAllDevices] = useState<AudioDevice[]>([]);
  const [supportsOutputDiscovery, setSupportsOutputDiscovery] = useState(!isExpoGo);

  useEffect(() => {
    let mounted = true;
    let removeListener: (() => void) | null = null;

    async function initializeDeviceDetection() {
      if (!audioDeviceManager) {
        setIsLoading(false);
        setSupportsOutputDiscovery(false);
        return;
      }

      try {
        const devices = await audioDeviceManager.getAvailableDevices();
        const currentDevice = await audioDeviceManager.getCurrentDevice();

        if (!mounted) return;

        setAllDevices(devices || []);
        setOutputInfo(classifyDevice(currentDevice));
        setIsLoading(false);

        if (audioDeviceManager.addDeviceChangeListener) {
          removeListener = audioDeviceManager.addDeviceChangeListener((updatedDevices: AudioDevice[]) => {
            if (!mounted) return;
            setAllDevices(updatedDevices || []);

            audioDeviceManager.getCurrentDevice().then((device: AudioDevice | null) => {
              if (mounted) {
                setOutputInfo(classifyDevice(device));
              }
            });
          });
        }

        logger.debug('[useAudioOutput] Device detection initialized', {
          deviceCount: devices?.length || 0,
          currentDevice: currentDevice?.name,
        });
      } catch (err) {
        if (!mounted) return;
        logger.error('[useAudioOutput] Failed to initialize audio device detection', { error: err });
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
        setSupportsOutputDiscovery(false);
      }
    }

    initializeDeviceDetection();

    return () => {
      mounted = false;
      if (removeListener) {
        removeListener();
      }
    };
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!audioDeviceManager?.refreshDevices) return;

    try {
      const devices = await audioDeviceManager.refreshDevices();
      setAllDevices(devices || []);
      const currentDevice = await audioDeviceManager.getCurrentDevice();
      setOutputInfo(classifyDevice(currentDevice));
    } catch (err) {
      logger.error('[useAudioOutput] Failed to refresh audio devices', { error: err });
    }
  }, []);

  const selectDevice = useCallback(async (deviceId: string) => {
    if (!audioDeviceManager?.selectDevice) return false;

    try {
      const success = await audioDeviceManager.selectDevice(deviceId);
      if (success) {
        const currentDevice = await audioDeviceManager.getCurrentDevice();
        setOutputInfo(classifyDevice(currentDevice));
      }
      return success;
    } catch (err) {
      logger.error('[useAudioOutput] Failed to select audio device', { error: err });
      return false;
    }
  }, []);

  return {
    outputInfo,
    isLoading,
    error,
    allDevices,
    supportsOutputDiscovery,
    refreshDevices,
    selectDevice,
    isRunningInExpoGo: isExpoGo,
  };
}
