/**
 * In-App Review Hook
 * Prompts users to rate the app at optimal moments for better App Store rankings
 *
 * ASO Strategy:
 * - Prompt after positive experiences (song creation, insight generation)
 * - Respect platform rate limits (Apple: once per 365 days shown)
 * - Track engagement milestones before prompting
 * - Never prompt during errors or negative experiences
 */

import { useCallback, useEffect, useRef } from 'react';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { logger } from '../../lib/logger';
import { useAuthStore, selectIsAuthenticated } from '../../auth/store';

const STORAGE_KEYS = {
  LAST_REVIEW_PROMPT: 'app_review_last_prompt',
  POSITIVE_ACTIONS_COUNT: 'app_review_positive_actions',
  HAS_EVER_PROMPTED: 'app_review_has_prompted',
  SESSIONS_COUNT: 'app_review_sessions',
};

const CONFIG = {
  MIN_POSITIVE_ACTIONS: 3,
  MIN_SESSIONS: 3,
  MIN_DAYS_BETWEEN_PROMPTS: 90,
  MIN_DAYS_SINCE_INSTALL: 3,
};

interface ReviewState {
  lastPromptDate: string | null;
  positiveActionsCount: number;
  hasEverPrompted: boolean;
  sessionsCount: number;
}

export function useAppReview() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      incrementSessionCount();
    }
  }, []);

  const getReviewState = useCallback(async (): Promise<ReviewState> => {
    try {
      const [lastPrompt, actions, hasPrompted, sessions] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.LAST_REVIEW_PROMPT),
        AsyncStorage.getItem(STORAGE_KEYS.POSITIVE_ACTIONS_COUNT),
        AsyncStorage.getItem(STORAGE_KEYS.HAS_EVER_PROMPTED),
        AsyncStorage.getItem(STORAGE_KEYS.SESSIONS_COUNT),
      ]);

      return {
        lastPromptDate: lastPrompt,
        positiveActionsCount: parseInt(actions || '0', 10),
        hasEverPrompted: hasPrompted === 'true',
        sessionsCount: parseInt(sessions || '0', 10),
      };
    } catch (error) {
      logger.error('Failed to get review state', error);
      return {
        lastPromptDate: null,
        positiveActionsCount: 0,
        hasEverPrompted: false,
        sessionsCount: 0,
      };
    }
  }, []);

  const incrementSessionCount = useCallback(async () => {
    try {
      const current = await AsyncStorage.getItem(STORAGE_KEYS.SESSIONS_COUNT);
      const count = parseInt(current || '0', 10) + 1;
      await AsyncStorage.setItem(STORAGE_KEYS.SESSIONS_COUNT, count.toString());
    } catch (error) {
      logger.error('Failed to increment session count', error);
    }
  }, []);

  const trackPositiveAction = useCallback(async () => {
    try {
      const current = await AsyncStorage.getItem(STORAGE_KEYS.POSITIVE_ACTIONS_COUNT);
      const count = parseInt(current || '0', 10) + 1;
      await AsyncStorage.setItem(STORAGE_KEYS.POSITIVE_ACTIONS_COUNT, count.toString());
      logger.debug(`Positive action tracked: ${count}`);
      return count;
    } catch (error) {
      logger.error('Failed to track positive action', error);
      return 0;
    }
  }, []);

  const canRequestReview = useCallback(async (): Promise<boolean> => {
    try {
      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) {
        logger.debug('Store review not available on this platform');
        return false;
      }

      if (!isAuthenticated) {
        logger.debug('Skipping review prompt - user not authenticated');
        return false;
      }

      const state = await getReviewState();

      if (state.sessionsCount < CONFIG.MIN_SESSIONS) {
        logger.debug(`Not enough sessions: ${state.sessionsCount}/${CONFIG.MIN_SESSIONS}`);
        return false;
      }

      if (state.positiveActionsCount < CONFIG.MIN_POSITIVE_ACTIONS) {
        logger.debug(`Not enough positive actions: ${state.positiveActionsCount}/${CONFIG.MIN_POSITIVE_ACTIONS}`);
        return false;
      }

      if (state.lastPromptDate) {
        const lastPrompt = new Date(state.lastPromptDate);
        const daysSinceLastPrompt = Math.floor((Date.now() - lastPrompt.getTime()) / (1000 * 60 * 60 * 24));

        if (daysSinceLastPrompt < CONFIG.MIN_DAYS_BETWEEN_PROMPTS) {
          logger.debug(`Too soon since last prompt: ${daysSinceLastPrompt} days`);
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to check review eligibility', error);
      return false;
    }
  }, [isAuthenticated, getReviewState]);

  const requestReview = useCallback(async (): Promise<boolean> => {
    try {
      const eligible = await canRequestReview();
      if (!eligible) {
        return false;
      }

      logger.info('Requesting app store review');

      if (Platform.OS === 'ios') {
        await StoreReview.requestReview();
      } else {
        const hasAction = await StoreReview.hasAction();
        if (hasAction) {
          await StoreReview.requestReview();
        }
      }

      await AsyncStorage.setItem(STORAGE_KEYS.LAST_REVIEW_PROMPT, new Date().toISOString());
      await AsyncStorage.setItem(STORAGE_KEYS.HAS_EVER_PROMPTED, 'true');

      logger.info('Review prompt shown successfully');
      return true;
    } catch (error) {
      logger.error('Failed to request review', error);
      return false;
    }
  }, [canRequestReview]);

  const maybeRequestReviewAfterPositiveAction = useCallback(async (): Promise<void> => {
    const count = await trackPositiveAction();

    if (count === CONFIG.MIN_POSITIVE_ACTIONS || (count > CONFIG.MIN_POSITIVE_ACTIONS && count % 10 === 0)) {
      await requestReview();
    }
  }, [trackPositiveAction, requestReview]);

  const openStorePage = useCallback(async (): Promise<void> => {
    try {
      const storeUrl = StoreReview.storeUrl();
      if (storeUrl) {
        const { Linking } = await import('react-native');
        await Linking.openURL(storeUrl);
      }
    } catch (error) {
      logger.error('Failed to open store page', error);
    }
  }, []);

  return {
    trackPositiveAction,
    maybeRequestReviewAfterPositiveAction,
    requestReview,
    canRequestReview,
    openStorePage,
  };
}
