import {
  createEventBusClient,
  type IStandardizedEventBusClient,
  getServiceName,
  createEvent,
  generateCorrelationId,
} from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('analytics-service-event-publisher');

let eventBusClient: IStandardizedEventBusClient | null = null;

function getEventBusClient(): IStandardizedEventBusClient {
  if (!eventBusClient) {
    eventBusClient = createEventBusClient(getServiceName('ai-analytics-service'));
  }
  return eventBusClient;
}

function safePublish(type: string, data: Record<string, unknown>, correlationId: string): void {
  try {
    const event = createEvent(type, 'ai-analytics-service', data, { correlationId });
    getEventBusClient()
      .publish(event)
      .then(() => logger.debug('Published analytics event: {}', { data0: type, eventId: event.eventId }))
      .catch(error => {
        logger.warn('Failed to publish analytics event (non-blocking): {}', {
          data0: type,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  } catch (error) {
    logger.warn('Failed to create analytics event (non-blocking): {}', {
      data0: type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const AnalyticsEventPublisher = {
  eventRecorded(
    eventType: string,
    eventData: Record<string, unknown>,
    userId?: string,
    sessionId?: string,
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      'analytics.event.recorded',
      {
        eventType,
        eventData,
        userId,
        sessionId,
        timestamp: new Date().toISOString(),
      },
      correlationId
    );
  },

  eventsBatch(
    events: Array<{ eventType: string; eventData: Record<string, unknown>; userId?: string }>,
    batchId: string,
    sourceService: string,
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish('analytics.events.batch', { events, batchId, sourceService }, correlationId);
  },

  metricRecorded(
    metricName: string,
    metricValue: number,
    metricType: 'counter' | 'gauge' | 'histogram',
    labels?: Record<string, string>,
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      'analytics.metric.recorded',
      {
        metricName,
        metricValue,
        metricType,
        labels,
        timestamp: new Date().toISOString(),
      },
      correlationId
    );
  },

  providerUsage(
    providerId: string,
    providerName: string,
    operation: string,
    success: boolean,
    durationMs?: number,
    tokensUsed?: number,
    cost?: number,
    userId?: string,
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      'analytics.provider.usage',
      {
        providerId,
        providerName,
        operation,
        success,
        durationMs,
        tokensUsed,
        cost,
        userId,
      },
      correlationId
    );
  },
};
