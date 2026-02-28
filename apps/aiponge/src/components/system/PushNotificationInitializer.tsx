/**
 * Push Notification Initializer Component
 * Initializes push notification registration when user is authenticated.
 * Handles retries on failure and re-registration on re-login.
 * Reacts to permission state changes from the hook for immediate retry.
 * Must be placed inside providers that give access to auth state.
 */

import { useEffect, useRef, useCallback } from 'react';
import Constants from 'expo-constants';
import { usePushNotifications } from '../../hooks/system/usePushNotifications';
import { useAuthStore, selectIsAuthenticated, selectUser } from '../../auth/store';
import { logger } from '../../lib/logger';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 3;

export function PushNotificationInitializer() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore(selectUser);
  const {
    initializePushNotifications,
    expoPushToken,
    error,
    tokenRestored,
    registerTokenWithBackend,
    permissionStatus,
    permissionGrantedEvent,
  } = usePushNotifications();

  const retryCountRef = useRef(0);
  const lastUserIdRef = useRef<string | null>(null);
  const activeAttemptRef = useRef<Promise<string | null> | null>(null);
  const pendingRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPermissionEventRef = useRef(0);

  const cancelPendingRetry = useCallback(() => {
    if (pendingRetryTimerRef.current) {
      clearTimeout(pendingRetryTimerRef.current);
      pendingRetryTimerRef.current = null;
    }
  }, []);

  const attemptInitialization = useCallback(async (): Promise<string | null> => {
    if (activeAttemptRef.current) {
      logger.debug('[PushNotificationInitializer] Initialization already in progress, waiting');
      return activeAttemptRef.current;
    }

    cancelPendingRetry();

    const attempt = (async () => {
      try {
        logger.info('[PushNotificationInitializer] Attempting push notification initialization', {
          attempt: retryCountRef.current + 1,
          maxRetries: MAX_RETRIES,
        });

        const token = await initializePushNotifications();

        if (token) {
          logger.info('[PushNotificationInitializer] Push token registered successfully');
          retryCountRef.current = 0;
          return token;
        } else if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          logger.warn('[PushNotificationInitializer] Push token registration failed, scheduling retry', {
            retryCount: retryCountRef.current,
          });

          pendingRetryTimerRef.current = setTimeout(() => {
            activeAttemptRef.current = null;
            attemptInitialization();
          }, RETRY_DELAY_MS);
          return null;
        } else {
          logger.info('[PushNotificationInitializer] Max retries reached, will retry on permission change');
          return null;
        }
      } catch (err) {
        logger.error('[PushNotificationInitializer] Failed to initialize push notifications', {
          error: err instanceof Error ? err.message : String(err),
        });

        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          pendingRetryTimerRef.current = setTimeout(() => {
            activeAttemptRef.current = null;
            attemptInitialization();
          }, RETRY_DELAY_MS);
        }
        return null;
      } finally {
        if (!pendingRetryTimerRef.current) {
          activeAttemptRef.current = null;
        }
      }
    })();

    activeAttemptRef.current = attempt;
    return attempt;
  }, [initializePushNotifications, cancelPendingRetry]);

  useEffect(() => {
    if (IS_EXPO_GO) {
      logger.info('[PushNotificationInitializer] Skipping push notifications in Expo Go (requires development build)');
      return;
    }

    if (!isAuthenticated || !user?.id) {
      lastUserIdRef.current = null;
      retryCountRef.current = 0;
      activeAttemptRef.current = null;
      cancelPendingRetry();
      return;
    }

    const userId = user.id;
    const userChanged = userId !== lastUserIdRef.current;

    if (userChanged) {
      lastUserIdRef.current = userId;
      retryCountRef.current = 0;
      activeAttemptRef.current = null;
      cancelPendingRetry();
    }

    if (tokenRestored && expoPushToken) {
      logger.info('[PushNotificationInitializer] Token restored from storage, registering with backend');
      registerTokenWithBackend(expoPushToken).catch(err => {
        logger.warn('[PushNotificationInitializer] Failed to register restored token', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } else if (!expoPushToken && !activeAttemptRef.current) {
      logger.info('[PushNotificationInitializer] No token available, initializing push notifications');
      attemptInitialization();
    }
  }, [
    isAuthenticated,
    user?.id,
    expoPushToken,
    tokenRestored,
    attemptInitialization,
    registerTokenWithBackend,
    cancelPendingRetry,
  ]);

  useEffect(() => {
    if (IS_EXPO_GO || !isAuthenticated || expoPushToken || !permissionGrantedEvent) {
      return;
    }

    if (permissionGrantedEvent > lastPermissionEventRef.current) {
      lastPermissionEventRef.current = permissionGrantedEvent;
      logger.info('[PushNotificationInitializer] Permission granted event received, retrying initialization');
      retryCountRef.current = 0;
      activeAttemptRef.current = null;
      cancelPendingRetry();
      attemptInitialization();
    }
  }, [isAuthenticated, expoPushToken, permissionGrantedEvent, attemptInitialization, cancelPendingRetry]);

  useEffect(() => {
    if (IS_EXPO_GO || !isAuthenticated || expoPushToken) {
      return;
    }

    if (permissionStatus === 'granted' && !activeAttemptRef.current) {
      logger.info('[PushNotificationInitializer] Permission is granted but no token, attempting initialization');
      retryCountRef.current = 0;
      attemptInitialization();
    }
  }, [isAuthenticated, expoPushToken, permissionStatus, attemptInitialization]);

  useEffect(() => {
    if (error) {
      logger.warn('[PushNotificationInitializer] Push notification error', { error });
    }
  }, [error]);

  return null;
}
