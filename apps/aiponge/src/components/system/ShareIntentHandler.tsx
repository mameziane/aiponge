/**
 * ShareIntentHandler Component
 * Handles incoming share intents and navigates to the Create screen
 *
 * This component must be used inside ShareIntentProvider
 */

import { useEffect, useRef, useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore, selectIsAuthenticated, selectUser } from '../../auth/store';
import { logger } from '../../lib/logger';

const PENDING_SHARE_CONTENT_KEY = 'aiponge_pending_share_content';

/**
 * Store pending shared content for later use (after authentication)
 */
export async function storePendingShareContent(content: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_SHARE_CONTENT_KEY, content);
    logger.debug('[ShareIntent] Stored pending content for later');
  } catch (error) {
    logger.error('[ShareIntent] Failed to store pending content', error);
  }
}

/**
 * Retrieve and clear pending shared content
 */
export async function getPendingShareContent(): Promise<string | null> {
  try {
    const content = await AsyncStorage.getItem(PENDING_SHARE_CONTENT_KEY);
    if (content) {
      await AsyncStorage.removeItem(PENDING_SHARE_CONTENT_KEY);
      logger.debug('[ShareIntent] Retrieved pending content');
    }
    return content;
  } catch (error) {
    logger.error('[ShareIntent] Failed to retrieve pending content', error);
    return null;
  }
}

export function ShareIntentHandler() {
  const router = useRouter();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore(selectUser);
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  const processedRef = useRef(false);

  const handleShareIntent = useCallback(async () => {
    if (!hasShareIntent || !shareIntent || processedRef.current) {
      return;
    }

    const content = shareIntent.text || shareIntent.webUrl;
    if (!content) {
      logger.debug('[ShareIntent] No text content to process');
      resetShareIntent();
      return;
    }

    logger.info('[ShareIntent] Received shared content', {
      type: shareIntent.type,
      contentLength: content.length,
      isAuthenticated,
    });

    processedRef.current = true;

    if (isAuthenticated && user) {
      logger.debug('[ShareIntent] User authenticated, navigating to Create');
      router.push({
        pathname: '/(user)/create',
        params: { sharedContent: content },
      } as Href);
      // Delay reset to allow navigation to complete
      setTimeout(() => {
        resetShareIntent();
      }, 500);
    } else {
      logger.debug('[ShareIntent] User not authenticated, storing content');
      await storePendingShareContent(content);
      router.push('/(auth)/login');
      // Delay reset to allow navigation to complete
      setTimeout(() => {
        resetShareIntent();
      }, 500);
    }
  }, [hasShareIntent, shareIntent, isAuthenticated, user, router, resetShareIntent]);

  useEffect(() => {
    if (hasShareIntent) {
      handleShareIntent();
    }
  }, [hasShareIntent, handleShareIntent]);

  useEffect(() => {
    if (!hasShareIntent) {
      processedRef.current = false;
    }
  }, [hasShareIntent]);

  useEffect(() => {
    if (error) {
      logger.error('[ShareIntent] Error', { error });
    }
  }, [error]);

  return null;
}

export default ShareIntentHandler;
