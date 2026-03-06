/**
 * Orchestration Event Publisher
 * Publishes orchestration flow events to the event bus.
 * Non-blocking fire-and-forget — failures are logged but never throw.
 */

import {
  createEventBusClient,
  createEvent,
  getServiceName,
  type IStandardizedEventBusClient,
} from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('orchestration-event-publisher');

let eventBusClient: IStandardizedEventBusClient | null = null;

function getEventBusClient(): IStandardizedEventBusClient {
  if (!eventBusClient) {
    eventBusClient = createEventBusClient(getServiceName('ai-content-service'));
  }
  return eventBusClient;
}

function safePublish(type: string, data: Record<string, unknown>, correlationId?: string): void {
  try {
    const event = createEvent(type, 'ai-content-service', data, { correlationId });
    getEventBusClient()
      .publish(event)
      .then(() => logger.debug('Published orchestration event', { type, eventId: event.eventId }))
      .catch(error => {
        logger.warn('Failed to publish orchestration event (non-blocking)', {
          type,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  } catch (error) {
    logger.warn('Failed to create orchestration event (non-blocking)', {
      type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const OrchestrationEventPublisher = {
  flowPlanned(
    data: {
      flowType: string;
      sessionId: string;
      creatorId: string;
      recipientId: string;
      recipientIsSelf: boolean;
    },
    correlationId?: string
  ): void {
    safePublish('orchestration.flow.planned', data as unknown as Record<string, unknown>, correlationId);
  },

  flowConfirmed(
    data: {
      flowType: string;
      sessionId: string;
      previewTrackId: string;
      creatorId: string;
      recipientId: string;
      recipientIsSelf: boolean;
      visibility: string;
      dedicatedToMemberId: string | null;
    },
    correlationId?: string
  ): void {
    safePublish('orchestration.flow.confirmed', data as unknown as Record<string, unknown>, correlationId);
  },

  bookRequested(
    data: {
      flowType: string;
      sessionId: string;
      creatorId: string;
      recipientId: string;
      recipientIsSelf: boolean;
      visibility: string;
      dedicatedToMemberId: string | null;
      previewTrackId: string;
      bookParams: {
        bookTypeId: string;
        chapterThemes: string[];
        suggestedTitle: string;
        language?: string;
        tone?: string;
        depthLevel?: string;
      };
      albumPlan: {
        suggestedTitle: string;
        trackCount: number;
        genres: string[];
        mood: string;
        style: string;
      };
    },
    correlationId?: string
  ): void {
    safePublish('orchestration.flow.book_requested', data as unknown as Record<string, unknown>, correlationId);
  },

  contentReady(data: Record<string, unknown>, correlationId?: string): void {
    safePublish('orchestration.flow.content_ready', data, correlationId);
  },

  flowCompleted(data: Record<string, unknown>, correlationId?: string): void {
    safePublish('orchestration.flow.completed', data, correlationId);
  },
};
