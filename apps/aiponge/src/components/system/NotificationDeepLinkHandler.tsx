/**
 * Notification Deep Link Handler
 * Navigates to the appropriate screen when a user taps a reminder notification.
 *
 * Handles two scenarios:
 *   1. Cold start — app was killed, user taps notification → getLastNotificationResponseAsync()
 *   2. Runtime — app is running/backgrounded, user taps notification → response listener
 *
 * Routing:
 *   - reminderType "listening" → music tab
 *   - reminderType "reading" or default → books tab
 *
 * Note: track_alarm notifications are handled by TrackAlarmHandler (separate component).
 * This component only handles `type: 'reminder'` notifications.
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

function isReminderNotification(data: unknown): data is ReminderNotificationData {
  return (data as Record<string, unknown> | undefined)?.type === 'reminder';
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
        // Default: reading reminders → books tab
        logger.info(`[DeepLink] ${source} reminder → books`, {
          reminderId: data.reminderId,
          reminderType: data.reminderType,
        });
        router.push('/(user)/books');
      }
    },
    [router]
  );

  // Runtime: handle notification taps while app is running or backgrounded
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const id = response.notification.request.identifier;
      if (handledIdsRef.current.has(id)) return;
      handledIdsRef.current.add(id);

      const data = response.notification.request.content.data as unknown;
      if (isReminderNotification(data)) {
        handleReminderTap(data, 'Runtime');
      }
    });

    return () => subscription.remove();
  }, [handleReminderTap]);

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
        if (isReminderNotification(data)) {
          handleReminderTap(data, 'Cold-start');
        }
      } catch (error) {
        logger.error('[DeepLink] Failed to check cold-start notification', { error });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [handleReminderTap]);

  return null;
}
