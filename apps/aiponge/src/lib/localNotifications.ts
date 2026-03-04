/**
 * Local Notification Scheduling Utility
 *
 * Schedules and cancels local notifications using expo-notifications
 * as a resilient fallback for push notifications. Maps repeat types
 * (once/daily/weekly/monthly/yearly) to expo-notifications triggers.
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';

const STORAGE_KEY = '@localNotifications:reminderMap';

interface NotificationMapping {
  [reminderId: string]: string[]; // array of notification identifiers
}

// ── Permission ──────────────────────────────────

async function ensurePermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;

  const { status: newStatus } = await Notifications.requestPermissionsAsync();
  if (newStatus !== 'granted') {
    logger.warn('[localNotifications] Permission not granted');
    return false;
  }
  return true;
}

// ── Mapping persistence ─────────────────────────

async function loadMapping(): Promise<NotificationMapping> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveMapping(mapping: NotificationMapping): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
  } catch (error) {
    logger.error('[localNotifications] Failed to persist mapping', error);
  }
}

// ── Schedule ────────────────────────────────────

export interface ScheduleReminderInput {
  reminderId: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
  repeatType: RepeatType;
  /** Required when repeatType is 'weekly' — 0=Sun, 1=Mon, …, 6=Sat */
  daysOfWeek?: number[];
  /** Optional day-of-month for 'monthly' (defaults to current day) */
  dayOfMonth?: number;
  /** Optional month (1–12) for 'yearly' (defaults to current month) */
  month?: number;
  /** Extra data attached to the notification */
  data?: Record<string, unknown>;
}

/**
 * Schedule local notification(s) for a reminder.
 * For weekly reminders with multiple days, schedules one notification per day.
 * Returns the count of successfully scheduled notifications.
 */
export async function scheduleReminderNotification(input: ScheduleReminderInput): Promise<number> {
  const hasPermission = await ensurePermission();
  if (!hasPermission) return 0;

  // Cancel any existing notifications for this reminder first
  await cancelReminderNotification(input.reminderId);

  const identifiers: string[] = [];
  const content: Notifications.NotificationContentInput = {
    title: input.title,
    body: input.body,
    data: {
      type: 'reminder',
      reminderId: input.reminderId,
      ...input.data,
    },
    sound: 'default',
  };

  try {
    switch (input.repeatType) {
      case 'once': {
        // Schedule for the next occurrence of this time
        const date = new Date();
        date.setHours(input.hour, input.minute, 0, 0);
        if (date <= new Date()) {
          date.setDate(date.getDate() + 1);
        }
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
        });
        identifiers.push(id);
        break;
      }

      case 'daily': {
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: input.hour,
            minute: input.minute,
          },
        });
        identifiers.push(id);
        break;
      }

      case 'weekly': {
        // Schedule one notification per selected day
        const days = input.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
        for (const day of days) {
          // expo-notifications weekday: 1=Sunday … 7=Saturday
          const weekday = day + 1;
          const id = await Notifications.scheduleNotificationAsync({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday,
              hour: input.hour,
              minute: input.minute,
            },
          });
          identifiers.push(id);
        }
        break;
      }

      case 'monthly': {
        const dayOfMonth = input.dayOfMonth ?? new Date().getDate();
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
            day: dayOfMonth,
            hour: input.hour,
            minute: input.minute,
          },
        });
        identifiers.push(id);
        break;
      }

      case 'yearly': {
        const month = input.month ?? new Date().getMonth() + 1; // 1-indexed
        const dayOfMonth = input.dayOfMonth ?? new Date().getDate();
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.YEARLY,
            month,
            day: dayOfMonth,
            hour: input.hour,
            minute: input.minute,
          },
        });
        identifiers.push(id);
        break;
      }
    }

    // Persist mapping
    const mapping = await loadMapping();
    mapping[input.reminderId] = identifiers;
    await saveMapping(mapping);

    logger.debug('[localNotifications] Scheduled', {
      reminderId: input.reminderId,
      repeatType: input.repeatType,
      count: identifiers.length,
    });

    return identifiers.length;
  } catch (error) {
    logger.error('[localNotifications] Failed to schedule', error);
    return 0;
  }
}

// ── Cancel ──────────────────────────────────────

/**
 * Cancel all local notifications associated with a reminder ID.
 */
export async function cancelReminderNotification(reminderId: string): Promise<void> {
  try {
    const mapping = await loadMapping();
    const ids = mapping[reminderId];
    if (ids && ids.length > 0) {
      await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));
      delete mapping[reminderId];
      await saveMapping(mapping);
      logger.debug('[localNotifications] Cancelled', { reminderId, count: ids.length });
    }
  } catch (error) {
    logger.error('[localNotifications] Failed to cancel', error);
  }
}

/**
 * Cancel all locally scheduled reminder notifications.
 */
export async function cancelAllReminderNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(STORAGE_KEY);
    logger.debug('[localNotifications] Cancelled all');
  } catch (error) {
    logger.error('[localNotifications] Failed to cancel all', error);
  }
}
