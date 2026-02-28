import type { Job } from 'bullmq';
import { createLogger, ServiceLocator } from '@aiponge/platform-core';
import { ExpoPushNotificationProvider, ExpoPushMessage } from '../providers/ExpoPushNotificationProvider';

const logger = createLogger('book-reminder-processor');

interface BookReminder {
  id: string;
  userId: string;
  type: string;
  title: string;
  prompt: string | null;
  time: string;
  timezone: string;
  daysOfWeek: number[];
  enabled: boolean;
  linkedTrackId: string | null;
  linkedTrackTitle: string | null;
}

interface PushToken {
  id: string;
  userId: string;
  token: string;
  isActive: boolean;
}

export interface BookReminderJobData {
  triggeredAt: string;
  correlationId: string;
}

function getLocalTimeForTimezone(now: Date, timezone: string): { time: string; dayOfWeek: number } {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    };

    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);

    const hour = parts.find(p => p.type === 'hour')?.value || '00';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    const weekdayStr = parts.find(p => p.type === 'weekday')?.value || 'Sun';

    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return {
      time: `${hour}:${minute}`,
      dayOfWeek: dayMap[weekdayStr] ?? 0,
    };
  } catch {
    const utcHour = now.getUTCHours().toString().padStart(2, '0');
    const utcMinute = now.getUTCMinutes().toString().padStart(2, '0');
    return {
      time: `${utcHour}:${utcMinute}`,
      dayOfWeek: now.getUTCDay(),
    };
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAllEnabledRemindersAndFilterByLocalTime(now: Date): Promise<BookReminder[]> {
  try {
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await fetchWithTimeout(
      `${userServiceUrl}/api/reminders/book/enabled`,
      {
        headers: {
          'x-request-id': `book-reminder-processor-${Date.now()}`,
          'x-service-auth': 'system-service',
        },
      },
      10000
    );

    if (!response.ok) return [];

    const result = (await response.json()) as { success: boolean; data: BookReminder[] };
    if (!result.success) return [];

    const dueReminders: BookReminder[] = [];

    for (const reminder of result.data) {
      const { time: localTime, dayOfWeek } = getLocalTimeForTimezone(now, reminder.timezone);
      if (reminder.time === localTime && reminder.daysOfWeek.includes(dayOfWeek)) {
        dueReminders.push(reminder);
      }
    }

    return dueReminders;
  } catch (error) {
    logger.error('Error fetching enabled reminders', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function fetchUserPushTokens(userId: string): Promise<PushToken[]> {
  try {
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    const response = await fetchWithTimeout(
      `${userServiceUrl}/api/push-tokens/user/${userId}`,
      {
        headers: {
          'x-request-id': `book-reminder-tokens-${Date.now()}`,
          'x-service-auth': 'system-service',
        },
      },
      5000
    );

    if (!response.ok) return [];

    const result = (await response.json()) as { success: boolean; data: PushToken[] };
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

async function updateLastTriggered(reminderId: string): Promise<void> {
  try {
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    await fetchWithTimeout(
      `${userServiceUrl}/api/reminders/book/${reminderId}/triggered`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': `book-reminder-triggered-${Date.now()}`,
          'x-service-auth': 'system-service',
        },
      },
      5000
    );
  } catch {
    logger.warn('Failed to update lastTriggeredAt', { reminderId });
  }
}

function getDefaultPrompt(type: string): string {
  switch (type) {
    case 'morning':
      return 'Good morning! Take a moment to set your intentions for the day.';
    case 'evening':
      return 'Time to reflect. How was your day?';
    default:
      return 'Time for your book practice.';
  }
}

export async function processBookReminderJob(job: Job<BookReminderJobData>): Promise<void> {
  const now = new Date(job.data.triggeredAt);
  const expoPushProvider = new ExpoPushNotificationProvider();

  logger.debug('Processing book reminder job', {
    jobId: job.id,
    correlationId: job.data.correlationId,
    triggeredAt: job.data.triggeredAt,
  });

  const dueReminders = await fetchAllEnabledRemindersAndFilterByLocalTime(now);

  if (dueReminders.length === 0) {
    logger.debug('No due reminders found', { jobId: job.id });
    return;
  }

  const userIds = [...new Set(dueReminders.map(r => r.userId))];
  const tokensByUserId = new Map<string, string[]>();

  for (const userId of userIds) {
    const tokens = await fetchUserPushTokens(userId);
    if (tokens.length > 0) {
      tokensByUserId.set(
        userId,
        tokens.map(t => t.token)
      );
    }
  }

  const messages: ExpoPushMessage[] = [];
  const messageToReminderId: string[] = [];

  for (const reminder of dueReminders) {
    const userTokens = tokensByUserId.get(reminder.userId) || [];
    if (userTokens.length === 0) continue;

    for (const token of userTokens) {
      if (!expoPushProvider.isValidExpoPushToken(token)) continue;

      messages.push({
        to: token,
        title: reminder.title,
        body: reminder.prompt || getDefaultPrompt(reminder.type),
        data: {
          type: 'book_reminder',
          reminderId: reminder.id,
          reminderType: reminder.type,
          linkedTrackId: reminder.linkedTrackId,
        },
        sound: 'default',
        priority: 'high',
        channelId: 'book',
      });
      messageToReminderId.push(reminder.id);
    }
  }

  if (messages.length === 0) {
    logger.info('No push messages to send', { jobId: job.id, dueReminders: dueReminders.length });
    return;
  }

  const tickets = await expoPushProvider.sendPushNotifications(messages);

  const successfulReminderIds = new Set<string>();
  for (let i = 0; i < tickets.length && i < messageToReminderId.length; i++) {
    if (tickets[i]?.status === 'ok' && messageToReminderId[i]) {
      successfulReminderIds.add(messageToReminderId[i]);
    }
  }

  for (const reminderId of successfulReminderIds) {
    await updateLastTriggered(reminderId);
  }

  const successCount = tickets.filter(t => t.status === 'ok').length;
  const errorCount = tickets.filter(t => t.status === 'error').length;

  logger.info('Book reminder job completed', {
    jobId: job.id,
    dueReminders: dueReminders.length,
    notificationsSent: successCount,
    errors: errorCount,
  });
}
