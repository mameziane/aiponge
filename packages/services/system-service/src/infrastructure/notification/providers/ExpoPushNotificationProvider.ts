/**
 * Expo Push Notification Provider
 * Sends push notifications via Expo's push notification service
 */

import { getLogger } from '../../../config/service-urls';
import { withCircuitBreaker } from '@aiponge/platform-core';

const logger = getLogger('system-service-expo-push');

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
  };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export class ExpoPushNotificationProvider {
  private readonly maxBatchSize = 100;

  async sendPushNotification(message: ExpoPushMessage): Promise<ExpoPushTicket> {
    return (await this.sendPushNotifications([message]))[0];
  }

  async sendPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const tickets: ExpoPushTicket[] = [];

    for (let i = 0; i < messages.length; i += this.maxBatchSize) {
      const batch = messages.slice(i, i + this.maxBatchSize);
      const batchTickets = await this.sendBatch(batch);
      tickets.push(...batchTickets);
    }

    return tickets;
  }

  private async sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    try {
      logger.info('[ExpoPush] Sending batch', {
        count: messages.length,
        recipients: messages.map(m => m.to.substring(0, 30) + '...'),
      });

      const tickets = await withCircuitBreaker<ExpoPushTicket[]>(
        'expo-push-api',
        async () => {
          const response = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-Encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages),
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Expo API error: ${response.status} - ${errorText}`);
          }

          const result = (await response.json()) as { data: ExpoPushTicket[] };
          return result.data;
        },
        {
          timeout: 20000,
          errorThresholdPercentage: 50,
          resetTimeout: 60000,
          volumeThreshold: 5,
        }
      );

      const successCount = tickets.filter(t => t.status === 'ok').length;
      const errorCount = tickets.filter(t => t.status === 'error').length;

      logger.info('[ExpoPush] Batch sent', {
        total: tickets.length,
        success: successCount,
        errors: errorCount,
      });

      return tickets;
    } catch (error) {
      logger.error('[ExpoPush] Failed to send batch', {
        error: error instanceof Error ? error.message : String(error),
      });

      return messages.map(() => ({
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  isValidExpoPushToken(token: string): boolean {
    return /^ExponentPushToken\[[a-zA-Z0-9_-]+\]$|^ExpoPushToken\[[a-zA-Z0-9_-]+\]$/.test(token);
  }
}
