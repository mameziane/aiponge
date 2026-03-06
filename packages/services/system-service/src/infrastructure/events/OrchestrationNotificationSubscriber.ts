/**
 * Orchestration Notification Subscriber
 * Subscribes to `orchestration.flow.completed` events.
 * Sends push notification to recipient when flow completes successfully.
 *
 * Skip notification when:
 * - status = 'failed' (notify creator instead, or just log)
 * - recipientIsSelf = true (creator sees the content directly)
 */

import {
  createEventSubscriber,
  createEventBusClient,
  createEvent,
  ServiceLocator,
  type StandardEvent,
  type EventHandler,
} from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { ExpoPushNotificationProvider } from '../notification/providers/ExpoPushNotificationProvider';

const logger = getLogger('orchestration-notification-subscriber');

interface FlowCompletedData {
  flowType: string;
  sessionId: string;
  creatorId: string;
  recipientId: string;
  recipientIsSelf: boolean;
  status: 'completed' | 'failed';
  errorMessage?: string;
  outputs?: {
    albumId: string | null;
    bookId: string | null;
    albumTitle?: string | null;
    bookTitle?: string | null;
  };
}

async function fetchPushTokens(userId: string): Promise<string[]> {
  try {
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const response = await fetch(`${userServiceUrl}/api/reminders/push-tokens/${userId}`, {
      headers: {
        'x-request-id': `orch-notify-${Date.now()}`,
        'x-service-auth': 'system-service',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const result = (await response.json()) as {
        success: boolean;
        data: Array<{ token: string; isActive: boolean }>;
      };
      if (result.success && result.data) {
        return result.data.filter(t => t.isActive).map(t => t.token);
      }
    }
  } catch (error) {
    logger.warn('Failed to fetch push tokens', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return [];
}

function publishDelivered(data: Record<string, unknown>, correlationId?: string): void {
  try {
    const client = createEventBusClient('system-service');
    const event = createEvent('orchestration.flow.delivered', 'system-service', data, { correlationId });
    client
      .publish(event)
      .then(() => logger.debug('Published flow.delivered', { sessionId: data.sessionId }))
      .catch(err => logger.warn('Failed to publish flow.delivered', { error: String(err) }));
  } catch (err) {
    logger.warn('Failed to create flow.delivered event', { error: String(err) });
  }
}

async function handleFlowCompleted(event: StandardEvent, data: FlowCompletedData): Promise<void> {
  logger.info('Received orchestration.flow.completed', {
    sessionId: data.sessionId,
    status: data.status,
    recipientIsSelf: data.recipientIsSelf,
  });

  // Skip notification for failed flows (could notify creator in a future iteration)
  if (data.status === 'failed') {
    logger.warn('Flow completed with failure, skipping notification', {
      sessionId: data.sessionId,
      error: data.errorMessage,
    });
    return;
  }

  // Skip notification if recipient is the creator (they already know)
  // No delivered event for self — delivered means "recipient was notified"
  if (data.recipientIsSelf) {
    logger.debug('Recipient is self, skipping push notification and delivered event', {
      sessionId: data.sessionId,
    });
    return;
  }

  // Send push notification to recipient
  const tokens = await fetchPushTokens(data.recipientId);
  if (tokens.length === 0) {
    logger.warn('No push tokens for recipient', { recipientId: data.recipientId });
    return;
  }

  const expoPushProvider = new ExpoPushNotificationProvider();
  const messages = tokens
    .filter(token => expoPushProvider.isValidExpoPushToken(token))
    .map(token => ({
      to: token,
      title: 'A special gift for you',
      body: 'Someone created a personalized album and book just for you. Tap to listen.',
      data: {
        type: 'orchestration_completed',
        flowType: data.flowType,
        sessionId: data.sessionId,
        albumId: data.outputs?.albumId,
        bookId: data.outputs?.bookId,
      },
      sound: 'default' as const,
      priority: 'high' as const,
    }));

  if (messages.length === 0) {
    logger.warn('No valid push tokens for recipient', { recipientId: data.recipientId });
    return;
  }

  try {
    await expoPushProvider.sendPushNotifications(messages);
    logger.info('Push notification sent to recipient', {
      recipientId: data.recipientId,
      tokenCount: messages.length,
    });
  } catch (error) {
    logger.error('Failed to send push notification', {
      recipientId: data.recipientId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Publish delivered event for analytics
  publishDelivered(
    {
      flowType: data.flowType,
      sessionId: data.sessionId,
      recipientId: data.recipientId,
      deliveredAt: new Date().toISOString(),
    },
    event.correlationId
  );
}

let subscriber: ReturnType<typeof createEventSubscriber> | null = null;

export async function startOrchestrationNotificationSubscriber(): Promise<void> {
  if (subscriber) return;

  subscriber = createEventSubscriber('system-service').register({
    eventType: 'orchestration.flow.completed',
    handler: handleFlowCompleted as EventHandler,
    maxRetries: 3,
  });

  await subscriber.start();
  logger.debug('Orchestration notification subscriber started');
}

export async function stopOrchestrationNotificationSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.shutdown();
    subscriber = null;
  }
}
