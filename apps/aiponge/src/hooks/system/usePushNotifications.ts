import { useState, useEffect, useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthState } from '../auth/useAuthState';
import { apiClient } from '../../lib/axiosApiClient';
import { useAuthStore, selectToken } from '../../auth/store';
import { logger } from '../../lib/logger';

const PUSH_TOKEN_KEY = 'aiponge_expo_push_token';
const PERMISSION_CHECK_INTERVAL_MS = 30000;
const IS_EXPO_GO = Constants.appOwnership === 'expo';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushNotificationState {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  isLoading: boolean;
  error: string | null;
  permissionStatus: Notifications.PermissionStatus | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    expoPushToken: null,
    notification: null,
    isLoading: false,
    error: null,
    permissionStatus: null,
  });
  const [tokenRestored, setTokenRestored] = useState(false);
  const [permissionGrantedEvent, setPermissionGrantedEvent] = useState(0);

  const { userId, isAuthenticated } = useAuthState();
  const lastKnownPermissionRef = useRef<Notifications.PermissionStatus | null>(null);
  // Track which user+token combinations have been registered to prevent duplicate API calls
  const registeredTokensRef = useRef<Set<string>>(new Set());
  // Track pending registration promises to handle concurrent calls
  const pendingRegistrationRef = useRef<Map<string, Promise<boolean>>>(new Map());

  useEffect(() => {
    if (IS_EXPO_GO) return;

    const loadStoredToken = async () => {
      try {
        const storedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
        if (storedToken) {
          setState(prev => ({ ...prev, expoPushToken: storedToken }));
          setTokenRestored(true);
          logger.debug('[PushNotifications] Restored token from storage');
        }
      } catch (error) {
        logger.error('[PushNotifications] Failed to load stored token', error);
      }
    };
    loadStoredToken();
  }, []);

  const checkPermissionStatus = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      const previousStatus = lastKnownPermissionRef.current;
      lastKnownPermissionRef.current = status;

      setState(prev => ({ ...prev, permissionStatus: status }));

      if (previousStatus !== null && previousStatus !== 'granted' && status === 'granted') {
        logger.debug('[PushNotifications] Permission transitioned to granted');
        setPermissionGrantedEvent(prev => prev + 1);
      }

      return status;
    } catch (error) {
      logger.error('[PushNotifications] Failed to check permission status', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (IS_EXPO_GO) return;
    checkPermissionStatus();
  }, [checkPermissionStatus]);

  useEffect(() => {
    if (IS_EXPO_GO) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkPermissionStatus();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        checkPermissionStatus();
      }
    }, PERMISSION_CHECK_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [checkPermissionStatus]);

  const registerForPushNotifications = useCallback(async (): Promise<string | null> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      lastKnownPermissionRef.current = finalStatus;
      setState(prev => ({ ...prev, permissionStatus: finalStatus }));

      if (finalStatus !== 'granted') {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Push notification permission denied',
        }));
        return null;
      }

      if (Constants.appOwnership === 'expo') {
        logger.warn(
          '[PushNotifications] Remote push notifications not supported in Expo Go (SDK 53+). Use a development build.'
        );
        return null;
      }

      const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
      if (!projectId) {
        throw new Error(
          'EXPO_PUBLIC_PROJECT_ID is not configured. Push notifications require a valid Expo project ID.'
        );
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      const token = tokenData.data;

      setState(prev => ({ ...prev, expoPushToken: token }));

      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('book', {
          name: 'Book Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6366f1',
          sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('track-alarms', {
          name: 'Track Alarms',
          description: 'Notifications for scheduled music playback',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#10b981',
          sound: 'default',
        });
      }

      setState(prev => ({ ...prev, isLoading: false }));
      return token;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to register for push notifications';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return null;
    }
  }, []);

  const registerTokenWithBackend = useCallback(
    async (token: string): Promise<boolean> => {
      if (!isAuthenticated || !userId) {
        return false;
      }

      // Verify auth token is actually available in the store before making API call
      // This prevents race condition where isAuthenticated is true but token isn't loaded yet
      const authToken = selectToken(useAuthStore.getState());
      if (!authToken) {
        logger.debug('[PushNotifications] Auth token not yet available, skipping registration');
        return false;
      }

      // Create unique key for this user+token combination
      const registrationKey = `${userId}:${token}`;

      // Already registered in this session - skip
      if (registeredTokensRef.current.has(registrationKey)) {
        logger.debug('[PushNotifications] Token already registered for this user, skipping');
        return true;
      }

      // Check if there's already a pending registration for this key
      // This handles concurrent calls during app startup
      const pendingRegistration = pendingRegistrationRef.current.get(registrationKey);
      if (pendingRegistration) {
        logger.debug('[PushNotifications] Registration already in progress, waiting');
        return pendingRegistration;
      }

      // Create the registration promise and store it
      const registrationPromise = (async (): Promise<boolean> => {
        try {
          await apiClient.post<{ success: boolean }>('/api/v1/app/reminders/push-token', {
            token,
            platform: Platform.OS,
          });

          // Mark as registered to prevent future calls
          registeredTokensRef.current.add(registrationKey);
          logger.debug('[PushNotifications] Token registered with backend');
          return true;
        } catch (error) {
          logger.error('[PushNotifications] Failed to register token with backend', error);
          return false;
        } finally {
          // Clean up pending promise
          pendingRegistrationRef.current.delete(registrationKey);
        }
      })();

      pendingRegistrationRef.current.set(registrationKey, registrationPromise);
      return registrationPromise;
    },
    [isAuthenticated, userId]
  );

  const initializePushNotifications = useCallback(async () => {
    const token = await registerForPushNotifications();

    if (token && isAuthenticated) {
      await registerTokenWithBackend(token);
    }

    return token;
  }, [registerForPushNotifications, registerTokenWithBackend, isAuthenticated]);

  useEffect(() => {
    if (IS_EXPO_GO) return;

    const notificationSubscription = Notifications.addNotificationReceivedListener(notification => {
      setState(prev => ({ ...prev, notification }));
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.type === 'book_reminder') {
        logger.debug('[PushNotifications] Book reminder tapped, navigate to books');
      } else if (data?.type === 'track_alarm') {
        logger.debug('[PushNotifications] Track alarm tapped', {
          trackId: data.trackId,
          trackTitle: data.trackTitle,
          action: data.action,
        });
        setState(prev => ({ ...prev, notification: response.notification }));
      }
    });

    return () => {
      notificationSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (IS_EXPO_GO) return;
    if (isAuthenticated && userId && state.expoPushToken) {
      registerTokenWithBackend(state.expoPushToken);
    }
  }, [isAuthenticated, userId, state.expoPushToken, registerTokenWithBackend]);

  return {
    ...state,
    tokenRestored,
    permissionGrantedEvent,
    registerForPushNotifications,
    registerTokenWithBackend,
    initializePushNotifications,
    checkPermissionStatus,
  };
}
