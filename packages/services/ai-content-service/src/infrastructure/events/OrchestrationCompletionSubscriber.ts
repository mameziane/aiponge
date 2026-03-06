/**
 * Orchestration Completion Subscriber
 * Subscribes to `orchestration.flow.content_ready` events.
 * Updates session outputs and publishes `orchestration.flow.completed`
 * when all content pieces are done (book + album for wellness).
 *
 * Idempotent: uses getById before update to prevent double-publish.
 */

import {
  createEventSubscriber,
  createEventBusClient,
  createEvent,
  type StandardEvent,
  type EventHandler,
} from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { OrchestrationSessionRepository } from '../database/repositories/OrchestrationSessionRepository';
import { getDatabase } from '../database/DatabaseConnectionFactory';

const logger = getLogger('orchestration-completion-subscriber');

interface ContentReadyData {
  flowType: string;
  sessionId: string;
  creatorId: string;
  recipientId: string;
  recipientIsSelf: boolean;
  visibility: string;
  contentType: 'book' | 'album';
  contentId: string;
  status: 'completed' | 'failed';
  errorMessage?: string;
  // Book-specific
  bookMetadata?: { bookId: string; bookTitle: string };
  // Album-specific
  albumId?: string;
  albumRequestId?: string;
}

function publishFlowCompleted(data: Record<string, unknown>, correlationId?: string): void {
  try {
    const client = createEventBusClient('ai-content-service');
    const event = createEvent('orchestration.flow.completed', 'ai-content-service', data, { correlationId });
    client
      .publish(event)
      .then(() => logger.info('Published orchestration.flow.completed', { sessionId: data.sessionId }))
      .catch(err => logger.warn('Failed to publish flow.completed', { error: String(err) }));
  } catch (err) {
    logger.warn('Failed to create flow.completed event', { error: String(err) });
  }
}

async function handleContentReady(event: StandardEvent, data: ContentReadyData): Promise<void> {
  const repo = new OrchestrationSessionRepository(getDatabase());
  const session = await repo.getById(data.sessionId);

  if (!session) {
    logger.warn('Session not found for content_ready event', { sessionId: data.sessionId });
    return;
  }

  // Skip if session is already terminal (cancelled or failed)
  if (['cancelled', 'failed'].includes(session.status)) {
    logger.warn('Session in terminal state, skipping content_ready', {
      sessionId: data.sessionId,
      status: session.status,
    });
    return;
  }

  const currentOutputs = (session.outputs as Record<string, unknown>) || {};

  if (data.contentType === 'book') {
    if (data.status === 'failed') {
      // Book failed → fail the whole session
      await repo.updateStatus(data.sessionId, 'failed');
      publishFlowCompleted(
        {
          flowType: data.flowType,
          sessionId: data.sessionId,
          creatorId: data.creatorId,
          recipientId: data.recipientId,
          recipientIsSelf: data.recipientIsSelf,
          status: 'failed',
          errorMessage: data.errorMessage || 'Book generation failed',
        },
        event.correlationId
      );
      return;
    }

    // Book completed — update outputs
    await repo.updateOutputs(data.sessionId, {
      bookCompleted: true,
      bookId: data.bookMetadata?.bookId || data.contentId,
    });

    logger.info('Book completed, waiting for album', { sessionId: data.sessionId });
    // Don't publish completed yet — album is still pending
    return;
  }

  if (data.contentType === 'album') {
    if (data.status === 'failed') {
      // Album failed → fail the whole session
      await repo.updateStatus(data.sessionId, 'failed');
      publishFlowCompleted(
        {
          flowType: data.flowType,
          sessionId: data.sessionId,
          creatorId: data.creatorId,
          recipientId: data.recipientId,
          recipientIsSelf: data.recipientIsSelf,
          status: 'failed',
          errorMessage: data.errorMessage || 'Album generation failed',
        },
        event.correlationId
      );
      return;
    }

    // Album completed — update outputs
    await repo.updateOutputs(data.sessionId, {
      albumCompleted: true,
      albumId: data.albumId || data.contentId,
      albumRequestId: data.albumRequestId,
    });

    // Re-read session to check if all content is done
    const updatedSession = await repo.getById(data.sessionId);
    const updatedOutputs = (updatedSession?.outputs as Record<string, unknown>) || {};

    if (updatedOutputs.bookCompleted && updatedOutputs.albumCompleted) {
      // All done → publish completed
      publishFlowCompleted(
        {
          flowType: data.flowType,
          sessionId: data.sessionId,
          creatorId: data.creatorId,
          recipientId: data.recipientId,
          recipientIsSelf: data.recipientIsSelf,
          status: 'completed',
          outputs: {
            albumId: updatedOutputs.albumId || null,
            bookId: updatedOutputs.bookId || null,
          },
        },
        event.correlationId
      );

      logger.info('All content complete, flow.completed published', {
        sessionId: data.sessionId,
        bookId: updatedOutputs.bookId,
        albumId: updatedOutputs.albumId,
      });
    }
  }
}

let subscriber: ReturnType<typeof createEventSubscriber> | null = null;

export async function startOrchestrationCompletionSubscriber(): Promise<void> {
  if (subscriber) return;

  subscriber = createEventSubscriber('ai-content-service').register({
    eventType: 'orchestration.flow.content_ready',
    handler: handleContentReady as EventHandler,
    maxRetries: 3,
  });

  await subscriber.start();
  logger.debug('Orchestration completion subscriber started');
}

export async function stopOrchestrationCompletionSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.shutdown();
    subscriber = null;
  }
}
