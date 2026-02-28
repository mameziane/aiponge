import type { Job } from 'bullmq';
import { createLogger, ServiceLocator } from '@aiponge/platform-core';
import { ExpoPushNotificationProvider, ExpoPushMessage } from '../providers/ExpoPushNotificationProvider';

const logger = createLogger('track-alarm-processor');

interface TrackSchedule {
  id: string;
  userTrackId: string;
  userId: string;
  baseDate: string;
  repeatType: 'once' | 'weekly' | 'monthly' | 'yearly';
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timezone: string;
  isActive: boolean;
  trackTitle: string;
  trackArtworkUrl: string | null;
  trackFileUrl: string;
}

interface PushToken {
  id: string;
  userId: string;
  token: string;
  isActive: boolean;
}

export interface TrackAlarmJobData {
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

async function fetchDueAlarms(now: Date): Promise<TrackSchedule[]> {
  try {
    const musicServiceUrl = ServiceLocator.getServiceUrl('music-service');

    const response = await fetchWithTimeout(
      `${musicServiceUrl}/api/music/library/schedules/enabled`,
      {
        headers: {
          'x-request-id': `track-alarm-processor-${Date.now()}`,
          'x-service-auth': 'system-service',
        },
      },
      10000
    );

    if (!response.ok) return [];

    const result = (await response.json()) as { success: boolean; data: TrackSchedule[] };
    if (!result.success) return [];

    return result.data.filter(schedule => {
      const userTimezone = schedule.timezone || 'UTC';
      const { time: currentLocalTime, dayOfWeek: currentLocalDayOfWeek } = getLocalTimeForTimezone(now, userTimezone);
      const baseDate = new Date(schedule.baseDate);
      const { time: scheduledLocalTime } = getLocalTimeForTimezone(baseDate, userTimezone);

      const timeMatches = currentLocalTime === scheduledLocalTime;
      if (!timeMatches) return false;

      if (schedule.repeatType === 'weekly') {
        return schedule.dayOfWeek === currentLocalDayOfWeek;
      }

      if (schedule.repeatType === 'monthly') {
        const localDayOfMonth = parseInt(
          new Intl.DateTimeFormat('en-US', {
            timeZone: schedule.timezone || 'UTC',
            day: 'numeric',
          }).format(now)
        );
        return schedule.dayOfMonth === localDayOfMonth;
      }

      if (schedule.repeatType === 'once') {
        const scheduledLocalDate = new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone }).format(baseDate);
        const todayLocalDate = new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone }).format(now);
        return scheduledLocalDate === todayLocalDate;
      }

      return false;
    });
  } catch (error) {
    logger.error('Error fetching enabled schedules', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function fetchPushTokensForUsers(userIds: string[]): Promise<Record<string, string[]>> {
  const tokensByUser: Record<string, string[]> = {};

  try {
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

    for (const userId of userIds) {
      try {
        const response = await fetchWithTimeout(
          `${userServiceUrl}/api/reminders/push-tokens/${userId}`,
          {
            headers: {
              'x-request-id': `track-alarm-tokens-${Date.now()}`,
              'x-service-auth': 'system-service',
            },
          },
          5000
        );

        if (response.ok) {
          const result = (await response.json()) as { success: boolean; data: PushToken[] };
          if (result.success && result.data) {
            tokensByUser[userId] = result.data.filter(t => t.isActive).map(t => t.token);
          }
        }
      } catch {
        // Skip user if token fetch fails
      }
    }
  } catch (error) {
    logger.error('Error fetching push tokens', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return tokensByUser;
}

export async function processTrackAlarmJob(job: Job<TrackAlarmJobData>): Promise<void> {
  const now = new Date(job.data.triggeredAt);
  const expoPushProvider = new ExpoPushNotificationProvider();

  logger.debug('Processing track alarm job', {
    jobId: job.id,
    correlationId: job.data.correlationId,
    triggeredAt: job.data.triggeredAt,
  });

  const dueAlarms = await fetchDueAlarms(now);

  if (dueAlarms.length === 0) {
    logger.debug('No due alarms found', { jobId: job.id });
    return;
  }

  const userIds = [...new Set(dueAlarms.map(a => a.userId))];
  const tokensByUser = await fetchPushTokensForUsers(userIds);

  const messages: ExpoPushMessage[] = [];

  for (const alarm of dueAlarms) {
    const tokens = tokensByUser[alarm.userId];
    if (!tokens || tokens.length === 0) continue;

    for (const token of tokens) {
      if (!expoPushProvider.isValidExpoPushToken(token)) continue;

      messages.push({
        to: token,
        title: 'Time to play your music!',
        body: alarm.trackTitle,
        sound: 'default',
        priority: 'high',
        channelId: 'track-alarms',
        data: {
          type: 'track_alarm',
          trackId: alarm.userTrackId,
          trackTitle: alarm.trackTitle,
          trackArtworkUrl: alarm.trackArtworkUrl,
          trackFileUrl: alarm.trackFileUrl,
          scheduleId: alarm.id,
          action: 'play_track',
        },
      });
    }
  }

  if (messages.length === 0) {
    logger.info('No push messages to send', { jobId: job.id, dueAlarms: dueAlarms.length });
    return;
  }

  const tickets = await expoPushProvider.sendPushNotifications(messages);

  const successCount = tickets.filter(t => t.status === 'ok').length;
  const errorCount = tickets.filter(t => t.status === 'error').length;

  logger.info('Track alarm job completed', {
    jobId: job.id,
    dueAlarms: dueAlarms.length,
    notificationsSent: successCount,
    errors: errorCount,
  });
}
