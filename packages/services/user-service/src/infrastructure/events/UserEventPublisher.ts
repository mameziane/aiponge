import {
  createEventBusClient,
  type IStandardizedEventBusClient,
  getServiceName,
  createEvent,
  generateCorrelationId,
} from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('user-service-event-publisher');

const EVENT_PUBLISH_MAX_RETRIES = 3;
const EVENT_PUBLISH_RETRY_DELAY_MS = 1000;

let eventBusClient: IStandardizedEventBusClient | null = null;

function getEventBusClient(): IStandardizedEventBusClient {
  if (!eventBusClient) {
    eventBusClient = createEventBusClient(getServiceName('user-service'));
  }
  return eventBusClient;
}

async function publishWithRetry(type: string, data: Record<string, unknown>, correlationId: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= EVENT_PUBLISH_MAX_RETRIES; attempt++) {
    try {
      const event = createEvent(type, 'user-service', data, { correlationId });
      await getEventBusClient().publish(event);
      logger.debug('Published user event: {}', { data0: type, eventId: event.eventId });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < EVENT_PUBLISH_MAX_RETRIES) {
        logger.debug('Retrying user event publish (attempt {}/{}): {}', {
          data0: attempt,
          data1: EVENT_PUBLISH_MAX_RETRIES,
          data2: type,
        });
        await new Promise(resolve => setTimeout(resolve, EVENT_PUBLISH_RETRY_DELAY_MS * attempt));
      }
    }
  }
  logger.warn('Failed to publish user event after {} attempts (non-blocking): {}', {
    data0: EVENT_PUBLISH_MAX_RETRIES,
    data1: type,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

function safePublish(type: string, data: Record<string, unknown>, correlationId: string): void {
  publishWithRetry(type, data, correlationId).catch((error: unknown) => {
    logger.warn('Unexpected error in event publisher (non-blocking): {}', {
      data0: type,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export const UserEventPublisher = {
  userDeleted(userId: string, correlationId: string = generateCorrelationId()): void {
    safePublish('user.deleted', { userId }, correlationId);
  },

  libraryEntryDeleted(
    entryId: string,
    userId: string,
    correlationId: string = generateCorrelationId(),
    chapterId?: string,
    bookId?: string
  ): void {
    safePublish('user.library.entry.deleted', { entryId, userId, chapterId, bookId }, correlationId);
  },

  libraryChapterDeleted(
    chapterId: string,
    userId: string,
    correlationId: string = generateCorrelationId(),
    bookId?: string
  ): void {
    safePublish('user.library.chapter.deleted', { chapterId, userId, bookId }, correlationId);
  },

  creatorMemberFollowed(memberId: string, creatorId: string, correlationId: string = generateCorrelationId()): void {
    safePublish('user.creator_member.followed', { memberId, creatorId }, correlationId);
  },

  creatorMemberUnfollowed(memberId: string, creatorId: string, correlationId: string = generateCorrelationId()): void {
    safePublish('user.creator_member.unfollowed', { memberId, creatorId }, correlationId);
  },
};
