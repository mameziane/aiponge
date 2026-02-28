import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../lib/axiosApiClient';
import { logger } from '../lib/logger';

const ONBOARDING_COMPLETED_PREFIX = '@aiponge:onboarding_completed:';
const INTRO_SLIDES_SEEN_KEY = '@aiponge:intro_slides_seen';

/**
 * Check if a specific user has completed onboarding
 * For registered users: checks AsyncStorage cache first, then backend database
 * For guest users: checks device-local storage only (each guest session is independent)
 * @param userId - User ID to check (optional, returns false if not provided)
 * @param isGuest - Whether this is a guest user (optional)
 */
export async function hasCompletedOnboarding(userId?: string, isGuest?: boolean): Promise<boolean> {
  if (!userId) {
    return false; // New/unauthenticated users haven't completed onboarding
  }

  try {
    const key = `${ONBOARDING_COMPLETED_PREFIX}${userId}`;

    // Guest users use device-local storage only (each session has unique UUID from backend)
    if (isGuest) {
      const value = await AsyncStorage.getItem(key);
      return value === 'true';
    }

    // For registered users: Check AsyncStorage cache first to prevent race conditions
    // This handles the case where onboarding just completed but backend transaction hasn't committed
    const cachedValue = await AsyncStorage.getItem(key);
    if (cachedValue === 'true') {
      return true; // Trust the local cache - user completed onboarding
    }

    // Fallback to backend check for multi-device support
    const response = await apiClient.get<{
      success: boolean;
      onboardingCompleted: boolean;
      userId: string;
    }>('/api/v1/app/onboarding/status');

    if (response.success && response.onboardingCompleted !== undefined) {
      // Cache the backend response
      if (response.onboardingCompleted) {
        await AsyncStorage.setItem(key, 'true');
      }
      return response.onboardingCompleted;
    }

    return false;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error);
    logger.error('Error checking onboarding status', { error: errorMessage });
    const key = `${ONBOARDING_COMPLETED_PREFIX}${userId}`;
    const value = await AsyncStorage.getItem(key);
    return value === 'true';
  }
}

/**
 * Mark onboarding as completed for a specific user
 * @param userId - User ID to mark as completed
 */
export async function setOnboardingCompleted(userId: string): Promise<void> {
  try {
    const key = `${ONBOARDING_COMPLETED_PREFIX}${userId}`;
    await AsyncStorage.setItem(key, 'true');
  } catch (error) {
    logger.error('Error setting onboarding completed', error);
  }
}

/**
 * Clear onboarding flag for a specific user (used on logout)
 * @param userId - User ID to clear (optional, clears all if not provided)
 */
export async function clearOnboardingForUser(userId?: string): Promise<void> {
  try {
    if (userId) {
      const key = `${ONBOARDING_COMPLETED_PREFIX}${userId}`;
      await AsyncStorage.removeItem(key);
    } else {
      // Clear all onboarding flags (dev/testing purposes)
      const allKeys = await AsyncStorage.getAllKeys();
      const onboardingKeys = allKeys.filter(key => key.startsWith(ONBOARDING_COMPLETED_PREFIX));
      await AsyncStorage.multiRemove(onboardingKeys);
    }
  } catch (error) {
    logger.error('Error clearing onboarding', error);
  }
}

/**
 * Check if intro slides have been seen (device-local, not user-specific)
 * This is for guests who share a test user UUID
 */
export async function hasSeenIntroSlides(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(INTRO_SLIDES_SEEN_KEY);
    return value === 'true';
  } catch (error) {
    logger.error('Error checking intro slides status', error);
    return false;
  }
}

/**
 * Mark intro slides as seen (device-local)
 */
export async function setIntroSlidesSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_SLIDES_SEEN_KEY, 'true');
  } catch (error) {
    logger.error('Error setting intro slides seen', error);
  }
}

/**
 * Clear intro slides flag (for testing/development)
 */
export async function clearIntroSlidesSeen(): Promise<void> {
  try {
    await AsyncStorage.removeItem(INTRO_SLIDES_SEEN_KEY);
  } catch (error) {
    logger.error('Error clearing intro slides flag', error);
  }
}
