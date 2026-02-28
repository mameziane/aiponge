import * as SecureStore from 'expo-secure-store';
import { logger } from '../lib/logger';

const USER_MODE_KEY = 'aiponge_user_mode_active';

export async function getUserModeActive(): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(USER_MODE_KEY);
    return value === 'true';
  } catch (error) {
    logger.warn('[userModeStore] Failed to get user mode state', { error });
    return false;
  }
}

export async function setUserModeActive(active: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(USER_MODE_KEY, active ? 'true' : 'false');
  } catch (error) {
    logger.warn('[userModeStore] Failed to set user mode state', { active, error });
  }
}

export async function clearUserModeActive(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(USER_MODE_KEY);
  } catch (error) {
    logger.warn('[userModeStore] Failed to clear user mode state', { error });
  }
}
