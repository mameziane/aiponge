/**
 * User Lifecycle Event Subscriber
 * Subscribes to all user.* lifecycle event types and persists events to the lifecycle tables.
 * Follows the same pattern as AnalyticsEventSubscriber: register per event type, start consumer.
 */

import {
  createEventSubscriber,
  type EventSubscriber,
  type StandardEvent,
  errorMessage,
  createLogger,
} from '@aiponge/platform-core';
import { USER_LIFECYCLE_EVENT_TYPES } from '@aiponge/shared-contracts';
import { RecordLifecycleEventUseCase } from '../../application/use-cases/lifecycle/RecordLifecycleEventUseCase';
import { LifecycleRepository } from '../repositories/LifecycleRepository';
import { getDatabase } from '../database/DatabaseConnectionFactory';

const logger = createLogger('ai-analytics-service:lifecycle-subscriber');

let subscriberInstance: EventSubscriber | null = null;

async function handleLifecycleEvent(event: StandardEvent, recordUseCase: RecordLifecycleEventUseCase): Promise<void> {
  const data = event.data as Record<string, unknown>;

  await recordUseCase.execute({
    eventType: event.type || (data.eventType as string) || 'unknown',
    userId: (data.userId as string) || 'unknown',
    tier: (data.tier as string) ?? null,
    platform: (data.platform as string) ?? null,
    sessionId: (data.sessionId as string) ?? null,
    metadata: (data.metadata as Record<string, unknown>) ?? {},
    correlationId: event.correlationId || 'unknown',
    source: event.source || 'unknown',
  });

  logger.debug('Lifecycle event processed', {
    eventType: event.type,
    userId: data.userId,
    correlationId: event.correlationId,
  });
}

export async function startUserLifecycleSubscriber(): Promise<void> {
  if (subscriberInstance) {
    logger.warn('User lifecycle subscriber already started');
    return;
  }

  try {
    const db = getDatabase();
    const repository = new LifecycleRepository(db);
    const recordUseCase = new RecordLifecycleEventUseCase(repository);

    subscriberInstance = createEventSubscriber('ai-analytics-service');

    // Register a handler for each lifecycle event type (same pattern as AnalyticsEventSubscriber)
    const allEventTypes = Object.values(USER_LIFECYCLE_EVENT_TYPES);
    for (const eventType of allEventTypes) {
      subscriberInstance.register({
        eventType,
        handler: async (event: StandardEvent) => {
          try {
            await handleLifecycleEvent(event, recordUseCase);
          } catch (err) {
            logger.warn('Failed to process lifecycle event', {
              eventType: event.type,
              correlationId: event.correlationId,
              error: errorMessage(err),
            });
            // Non-blocking: log and continue, never crash the service
          }
        },
        maxRetries: 3,
        retryDelayMs: 1000,
      });
    }

    await subscriberInstance.start();
    logger.info('User lifecycle subscriber started', {
      eventTypeCount: allEventTypes.length,
    });
  } catch (err) {
    logger.warn('Failed to start user lifecycle subscriber', { error: errorMessage(err) });
  }
}

export async function stopUserLifecycleSubscriber(): Promise<void> {
  if (subscriberInstance) {
    try {
      await subscriberInstance.shutdown();
    } catch {
      // Best-effort cleanup
    }
    subscriberInstance = null;
    logger.info('User lifecycle subscriber stopped');
  }
}
