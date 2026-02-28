/**
 * Config Event Publisher
 * Safely publishes config-related events via the event bus
 * Uses fire-and-forget pattern - errors are logged but don't affect main operations
 */

import {
  createEventBusClient,
  type IStandardizedEventBusClient,
  getServiceName,
  createEvent,
  generateCorrelationId,
} from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('ai-config-service-event-publisher');

let eventBusClient: IStandardizedEventBusClient | null = null;

function getEventBusClient(): IStandardizedEventBusClient {
  if (!eventBusClient) {
    eventBusClient = createEventBusClient(getServiceName('ai-config-service'));
  }
  return eventBusClient;
}

function safePublish(type: string, data: Record<string, unknown>, correlationId: string): void {
  try {
    const event = createEvent(type, 'ai-config-service', data, { correlationId });
    getEventBusClient()
      .publish(event)
      .then(() => logger.debug('Published config event: {}', { data0: type, eventId: event.eventId }))
      .catch(error => {
        logger.warn('Failed to publish config event (non-blocking): {}', {
          data0: type,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  } catch (error) {
    logger.warn('Failed to create config event (non-blocking): {}', {
      data0: type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const ConfigEventPublisher = {
  templateCreated(
    templateId: string,
    templateKey: string,
    category: string,
    correlationId: string = generateCorrelationId(),
    version?: string
  ): void {
    safePublish(
      'config.template.created',
      {
        templateId,
        templateKey,
        category,
        version: version || '1.0.0',
      },
      correlationId
    );
  },

  templateUpdated(
    templateId: string,
    templateKey: string,
    category: string,
    correlationId: string = generateCorrelationId(),
    changes?: string[],
    version?: string
  ): void {
    safePublish(
      'config.template.updated',
      {
        templateId,
        templateKey,
        category,
        version: version || '1.0.0',
        changes,
      },
      correlationId
    );
  },

  templateDeleted(templateId: string, templateKey: string, correlationId: string = generateCorrelationId()): void {
    safePublish(
      'config.template.deleted',
      {
        templateId,
        templateKey,
      },
      correlationId
    );
  },

  providerUpdated(
    providerId: string,
    providerName: string,
    enabled: boolean,
    correlationId: string = generateCorrelationId(),
    priority?: number
  ): void {
    safePublish(
      'config.provider.updated',
      {
        providerId,
        providerName,
        enabled,
        priority,
      },
      correlationId
    );
  },

  providerHealthChanged(
    providerId: string,
    providerName: string,
    previousStatus: 'healthy' | 'degraded' | 'unhealthy',
    currentStatus: 'healthy' | 'degraded' | 'unhealthy',
    correlationId: string = generateCorrelationId(),
    reason?: string
  ): void {
    safePublish(
      'config.provider.health_changed',
      {
        providerId,
        providerName,
        previousStatus,
        currentStatus,
        reason,
      },
      correlationId
    );
  },
};
