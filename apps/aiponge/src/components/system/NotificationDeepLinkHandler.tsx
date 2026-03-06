/**
 * Notification Deep Link Handler
 * Navigates to the appropriate screen when a user taps a notification.
 *
 * Handles two scenarios:
 *   1. Cold start — app was killed, user taps notification → getLastNotificationResponseAsync()
 *   2. Runtime — app is running/backgrounded, user taps notification → response listener
 *
 * Routing:
 *   - type "reminder" + reminderType "listening" → music tab
 *   - type "reminder" + reminderType "reading" or default → books tab
 *   - type "orchestration_completed" → album-detail (if albumId) or music tab
 *
 * Note: track_alarm notifications are handled by TrackAlarmHandler (separate component).
 */

import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { logger } from '../../lib/logger';

interface ReminderNotificationData {
  type: 'reminder';
  reminderId: string;
  reminderType?: 'reading' | 'listening' | string;
}

interface OrchestrationNotificationData {
  type: 'orchestration_completed';
  flowType: string;
  sessionId: string;
  albumId?: string;
  bookId?: string;
}

function isReminderNotification(data: unknown): data is ReminderNotificationData {
  return (data as Record<string, unknown> | undefined)?.type === 'reminder';
}

function isOrchestrationNotification(data: unknown): data is OrchestrationNotificationData {
  return (data as Record<string, unknown> | undefined)?.type === 'orchestration_completed';
}

export function NotificationDeepLinkHandler() {
  const router = useRouter();
  const handledIdsRef = useRef<Set<string>>(new Set());

  const handleReminderTap = useCallback(
    (data: ReminderNotificationData, source: string) => {
      if (data.reminderType === 'listening') {
        logger.info(`[DeepLink] ${source} reminder → music`, {
          reminderId: data.reminderId,
          reminderType: data.reminderType,
        });
        router.push('/(user)/music');
      } else {
        logger.info(`[DeepLink] ${source} reminder → books`, {
          reminderId: data.reminderId,
          reminderType: data.reminderType,
        });
        router.push('/(user)/books');
      }
    },
    [router]
  );

  const handleOrchestrationTap = useCallback(
    (data: OrchestrationNotificationData, source: string) => {
      if (data.albumId) {
        logger.info(`[DeepLink] ${source} orchestration → album-detail`, {
          albumId: data.albumId,
          flowType: data.flowType,
        });
        router.push({
          pathname: '/album-detail',
          params: { albumId: data.albumId },
        });
      } else {
        logger.info(`[DeepLink] ${source} orchestration → music`, {
          flowType: data.flowType,
        });
        router.push('/(user)/music');
      }
    },
    [router]
  );

  const handleNotificationData = useCallback(
    (data: unknown, source: string) => {
      if (isReminderNotification(data)) {
        handleReminderTap(data, source);
      } else if (isOrchestrationNotification(data)) {
        handleOrchestrationTap(data, source);
      }
    },
    [handleReminderTap, handleOrchestrationTap]
  );

  // Runtime: handle notification taps while app is running or backgrounded
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const id = response.notification.request.identifier;
      if (handledIdsRef.current.has(id)) return;
      handledIdsRef.current.add(id);

      const data = response.notification.request.content.data as unknown;
      handleNotificationData(data, 'Runtime');
    });

    return () => subscription.remove();
  }, [handleNotificationData]);

  // Cold-start: check for the notification that launched the app
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (!response) return;

        const id = response.notification.request.identifier;
        if (handledIdsRef.current.has(id)) return;
        handledIdsRef.current.add(id);

        const data = response.notification.request.content.data as unknown;
        handleNotificationData(data, 'Cold-start');
      } catch (error) {
        logger.error('[DeepLink] Failed to check cold-start notification', { error });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [handleNotificationData]);

  return null;
}
