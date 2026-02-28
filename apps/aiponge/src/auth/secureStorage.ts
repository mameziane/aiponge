/**
 * Secure Storage Adapter
 * Wraps Expo SecureStore for Zustand persistence
 * CRITICAL: Uses the 'name' parameter provided by Zustand for proper state hydration
 */

import * as SecureStore from 'expo-secure-store';
import { StateStorage } from 'zustand/middleware';
import { logger } from '../lib/logger';

export const secureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await SecureStore.getItemAsync(name);
      return value;
    } catch (error) {
      logger.error('SecureStore getItem error', error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch (error) {
      logger.error('SecureStore setItem error', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (error) {
      logger.error('SecureStore removeItem error', error);
    }
  },
};
