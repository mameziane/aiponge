/**
 * Orchestration Book Subscriber
 * Subscribes to `orchestration.flow.book_requested` events.
 * Generates a book via GenerateBookUseCase, then publishes `content_ready` event.
 *
 * Flow: book_requested → createRequest() → poll until complete → content_ready(book)
 */

import {
  createEventSubscriber,
  createEventBusClient,
  createEvent,
  type StandardEvent,
  type EventHandler,
} from '@aiponge/platform-core';
import { getLogger } from '@config/service-urls';

const logger = getLogger('orchestration-book-subscriber');

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 100; // ~5 minutes max

interface BookRequestedData {
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
    tone?: 'supportive' | 'challenging' | 'neutral';
    depthLevel?: 'brief' | 'standard' | 'deep';
  };
  albumPlan: {
    suggestedTitle: string;
    trackCount: number;
    genres: string[];
    mood: string;
    style: string;
  };
}

function publishContentReady(data: Record<string, unknown>, correlationId?: string): void {
  try {
    const client = createEventBusClient('user-service');
    const event = createEvent('orchestration.flow.content_ready', 'user-service', data, { correlationId });
    client
      .publish(event)
      .then(() => logger.debug('Published content_ready event', { sessionId: data.sessionId }))
      .catch(err => logger.warn('Failed to publish content_ready (non-blocking)', { error: String(err) }));
  } catch (err) {
    logger.warn('Failed to create content_ready event', { error: String(err) });
  }
}

async function handleBookRequested(event: StandardEvent, data: BookRequestedData): Promise<void> {
  logger.info('Received orchestration.flow.book_requested', {
    sessionId: data.sessionId,
    creatorId: data.creatorId,
    bookTypeId: data.bookParams.bookTypeId,
  });

  const baseEventData = {
    flowType: data.flowType,
    sessionId: data.sessionId,
    creatorId: data.creatorId,
    recipientId: data.recipientId,
    recipientIsSelf: data.recipientIsSelf,
    visibility: data.visibility,
    dedicatedToMemberId: data.dedicatedToMemberId,
    contentType: 'book',
    previewTrackId: data.previewTrackId,
    albumPlan: data.albumPlan,
  };

  try {
    // Lazy-load GenerateBookUseCase to avoid circular imports
    const { GenerateBookUseCase } = await import('../../application/use-cases/library/GenerateBookUseCase');
    const useCase = new GenerateBookUseCase();

    // Start book generation
    const result = await useCase.createRequest({
      userId: data.creatorId,
      primaryGoal: data.bookParams.chapterThemes.join('; '),
      language: data.bookParams.language,
      tone: data.bookParams.tone,
      depthLevel: data.bookParams.depthLevel || 'standard',
      bookTypeId: data.bookParams.bookTypeId,
      generationMode: 'book',
      isOnboarding: false,
    });

    if (!result.success || !result.requestId) {
      logger.error('Book generation request failed', { error: result.error, sessionId: data.sessionId });
      publishContentReady(
        { ...baseEventData, status: 'failed', errorMessage: result.error || 'Book generation failed to start' },
        event.correlationId
      );
      return;
    }

    logger.info('Book generation started', { requestId: result.requestId, sessionId: data.sessionId });

    // Poll until completion
    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      attempts++;

      const status = await useCase.getRequestStatus(result.requestId, data.creatorId);

      if (status.status === 'completed' || status.status === 'partial_success') {
        const book = status.book;
        if (!book) {
          publishContentReady(
            { ...baseEventData, status: 'failed', errorMessage: 'Book completed but no data returned' },
            event.correlationId
          );
          return;
        }

        // Flatten entries from chapters for album generation
        const entries = book.chapters.flatMap((chapter, chapterIdx) =>
          chapter.entries.map((entry, entryIdx) => ({
            entryId: `${result.requestId}_ch${chapterIdx}_e${entryIdx}`,
            content: entry.content || entry.prompt,
            chapterTitle: chapter.title,
            order: chapterIdx * 100 + entryIdx,
          }))
        );

        publishContentReady(
          {
            ...baseEventData,
            status: 'completed',
            contentId: result.requestId,
            bookMetadata: {
              bookId: result.requestId,
              bookTitle: book.title,
              bookType: book.typeId || data.bookParams.bookTypeId,
              bookDescription: book.description,
              bookThemes: data.bookParams.chapterThemes,
            },
            entries,
          },
          event.correlationId
        );

        logger.info('Book generation completed, content_ready published', {
          sessionId: data.sessionId,
          requestId: result.requestId,
          entriesCount: entries.length,
        });
        return;
      }

      if (status.status === 'failed') {
        publishContentReady(
          { ...baseEventData, status: 'failed', errorMessage: status.error || 'Book generation failed' },
          event.correlationId
        );
        return;
      }

      // Still processing — continue polling
    }

    // Timed out
    logger.error('Book generation timed out', { sessionId: data.sessionId, requestId: result.requestId });
    publishContentReady(
      { ...baseEventData, status: 'failed', errorMessage: 'Book generation timed out' },
      event.correlationId
    );
  } catch (error) {
    logger.error('Book generation handler failed', {
      sessionId: data.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    publishContentReady(
      {
        ...baseEventData,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
      event.correlationId
    );
  }
}

let subscriber: ReturnType<typeof createEventSubscriber> | null = null;

export async function startOrchestrationBookSubscriber(): Promise<void> {
  if (subscriber) return;

  subscriber = createEventSubscriber('user-service').register({
    eventType: 'orchestration.flow.book_requested',
    handler: handleBookRequested as EventHandler,
    maxRetries: 2,
  });

  await subscriber.start();
  logger.debug('Orchestration book subscriber started for User Service');
}

export async function stopOrchestrationBookSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.shutdown();
    subscriber = null;
  }
}
