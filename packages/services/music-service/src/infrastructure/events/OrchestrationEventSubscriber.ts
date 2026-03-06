/**
 * Orchestration Event Subscriber (music-service)
 *
 * Sub 1: orchestration.flow.confirmed → flip preview track draft → active
 * Sub 2: orchestration.flow.content_ready (book) → trigger album generation
 */

import {
  createEventSubscriber,
  createEventBusClient,
  createEvent,
  serializeError,
  type StandardEvent,
  type EventHandler,
} from '@aiponge/platform-core';
import { CONTENT_VISIBILITY, TRACK_LIFECYCLE } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';
import { eq, and, isNull } from 'drizzle-orm';

const logger = getLogger('orchestration-event-subscriber');

// ── Sub 1: Confirmed — flip preview track ──

interface FlowConfirmedData {
  flowType: string;
  sessionId: string;
  previewTrackId: string;
  creatorId: string;
  recipientId: string;
  recipientIsSelf: boolean;
  visibility: string;
  dedicatedToMemberId: string | null;
}

async function handleFlowConfirmed(_event: StandardEvent, data: FlowConfirmedData): Promise<void> {
  logger.info('Received orchestration.flow.confirmed', {
    sessionId: data.sessionId,
    previewTrackId: data.previewTrackId,
  });

  try {
    const { getDatabase } = await import('../database/DatabaseConnectionFactory');
    const { tracks } = await import('../../schema/music-schema');
    const db = getDatabase();

    // Flip preview track: draft → active, update visibility + dedicatedToMemberId
    const targetVisibility = data.recipientIsSelf ? CONTENT_VISIBILITY.PERSONAL : CONTENT_VISIBILITY.SHARED;

    await db
      .update(tracks)
      .set({
        status: TRACK_LIFECYCLE.ACTIVE,
        visibility: targetVisibility,
        dedicatedToMemberId: data.dedicatedToMemberId,
        updatedAt: new Date(),
      })
      .where(and(eq(tracks.id, data.previewTrackId), isNull(tracks.deletedAt)));

    logger.info('Preview track activated', {
      trackId: data.previewTrackId,
      visibility: targetVisibility,
      dedicatedToMemberId: data.dedicatedToMemberId,
    });
  } catch (error) {
    logger.error('Failed to activate preview track', {
      previewTrackId: data.previewTrackId,
      error: serializeError(error),
    });
    throw error; // Re-throw for retry
  }
}

// ── Sub 2: Content Ready (book) — trigger album generation ──

interface ContentReadyBookData {
  flowType: string;
  sessionId: string;
  creatorId: string;
  recipientId: string;
  recipientIsSelf: boolean;
  visibility: string;
  dedicatedToMemberId: string | null;
  contentType: string;
  contentId: string;
  previewTrackId: string;
  status: string;
  errorMessage?: string;
  bookMetadata: {
    bookId: string;
    bookTitle: string;
    bookType: string;
    bookDescription?: string;
    bookThemes?: string[];
  };
  entries: Array<{
    entryId: string;
    content: string;
    chapterTitle?: string;
    order: number;
  }>;
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
    const client = createEventBusClient('music-service');
    const event = createEvent('orchestration.flow.content_ready', 'music-service', data, { correlationId });
    client
      .publish(event)
      .then(() => logger.debug('Published content_ready (album)', { sessionId: data.sessionId }))
      .catch(err => logger.warn('Failed to publish content_ready (non-blocking)', { error: String(err) }));
  } catch (err) {
    logger.warn('Failed to create content_ready event', { error: String(err) });
  }
}

async function handleContentReadyBook(event: StandardEvent, data: ContentReadyBookData): Promise<void> {
  // Only handle book content
  if (data.contentType !== 'book') return;

  // Skip failed books
  if (data.status === 'failed') {
    logger.warn('Received failed book content_ready, skipping album generation', {
      sessionId: data.sessionId,
      error: data.errorMessage,
    });
    return;
  }

  logger.info('Received content_ready (book), starting album generation', {
    sessionId: data.sessionId,
    bookId: data.bookMetadata.bookId,
    entryCount: data.entries.length,
  });

  const baseAlbumEventData = {
    flowType: data.flowType,
    sessionId: data.sessionId,
    creatorId: data.creatorId,
    recipientId: data.recipientId,
    recipientIsSelf: data.recipientIsSelf,
    visibility: data.visibility,
    dedicatedToMemberId: data.dedicatedToMemberId,
    contentType: 'album',
  };

  try {
    // Lazy-load AlbumGenerationService with all dependencies
    const { AlbumGenerationService } = await import('../../application/services/AlbumGenerationService');
    const { StorageServiceClient } = await import('../clients/StorageServiceClient');
    const { GenerateArtworkUseCase } = await import('../../application/use-cases/music/GenerateArtworkUseCase');
    const { lyricsPreparationService } = await import('../../application/services/LyricsPreparationService');
    const { getDatabase } = await import('../database/DatabaseConnectionFactory');
    const { DrizzleMusicCatalogRepository } = await import('../database/DrizzleMusicCatalogRepository');
    const { DrizzleUserTrackRepository } = await import('../database/DrizzleUserTrackRepository');
    const { UnifiedLyricsRepository } = await import('../database/UnifiedLyricsRepository');
    const { createMusicOrchestrator } = await import('../../domains/ai-music/providers');
    const { getServiceRegistry } = await import('../ServiceFactory');

    const db = getDatabase();
    const registry = getServiceRegistry();

    const albumService = new AlbumGenerationService({
      storageClient: registry.storageClient as InstanceType<typeof StorageServiceClient>,
      artworkUseCase: new GenerateArtworkUseCase(),
      lyricsPreparationService,
      catalogRepository: new DrizzleMusicCatalogRepository(db),
      userTrackRepository: new DrizzleUserTrackRepository(db),
      lyricsRepository: new UnifiedLyricsRepository(db),
      musicProviderOrchestrator: createMusicOrchestrator(
        registry.providersClient as unknown as Parameters<typeof createMusicOrchestrator>[0]
      ),
    });

    const targetVisibility = data.recipientIsSelf ? CONTENT_VISIBILITY.PERSONAL : CONTENT_VISIBILITY.SHARED;

    const result = await albumService.generate({
      userId: data.creatorId,
      bookId: data.bookMetadata.bookId,
      bookTitle: data.bookMetadata.bookTitle,
      bookType: data.bookMetadata.bookType,
      bookDescription: data.bookMetadata.bookDescription,
      bookThemes: data.bookMetadata.bookThemes,
      entries: data.entries,
      targetVisibility: targetVisibility as typeof CONTENT_VISIBILITY.PERSONAL,
      genre: data.albumPlan.genres[0],
      genres: data.albumPlan.genres,
      mood: data.albumPlan.mood,
      style: data.albumPlan.style,
      displayName: data.albumPlan.suggestedTitle,
    });

    if (result.success && result.albumId) {
      // Set dedicatedToMemberId on album
      if (data.dedicatedToMemberId) {
        const { albums } = await import('../../schema/music-schema');
        await db
          .update(albums)
          .set({ dedicatedToMemberId: data.dedicatedToMemberId, updatedAt: new Date() })
          .where(and(eq(albums.id, result.albumId), isNull(albums.deletedAt)));
      }

      publishContentReady(
        {
          ...baseAlbumEventData,
          status: 'completed',
          contentId: result.albumId,
          albumId: result.albumId,
          albumRequestId: result.albumRequestId,
        },
        event.correlationId
      );

      logger.info('Album generation completed', {
        sessionId: data.sessionId,
        albumId: result.albumId,
        totalTracks: result.totalTracks,
      });
    } else {
      publishContentReady(
        {
          ...baseAlbumEventData,
          status: 'failed',
          contentId: '',
          albumId: null,
          albumRequestId: result.albumRequestId,
          errorMessage: result.error || 'Album generation failed',
        },
        event.correlationId
      );
    }
  } catch (error) {
    logger.error('Album generation handler failed', {
      sessionId: data.sessionId,
      error: serializeError(error),
    });
    publishContentReady(
      {
        ...baseAlbumEventData,
        status: 'failed',
        contentId: '',
        albumId: null,
        albumRequestId: '',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
      event.correlationId
    );
  }
}

// ── Subscriber lifecycle ──

let subscriber: ReturnType<typeof createEventSubscriber> | null = null;

export async function startOrchestrationEventSubscriber(): Promise<void> {
  if (subscriber) return;

  subscriber = createEventSubscriber('music-service')
    .register({
      eventType: 'orchestration.flow.confirmed',
      handler: handleFlowConfirmed as EventHandler,
      maxRetries: 3,
    })
    .register({
      eventType: 'orchestration.flow.content_ready',
      handler: handleContentReadyBook as EventHandler,
      maxRetries: 2,
    });

  await subscriber.start();
  logger.debug('Orchestration event subscriber started for Music Service');
}

export async function stopOrchestrationEventSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.shutdown();
    subscriber = null;
  }
}

export function isOrchestrationEventSubscriberReady(): boolean {
  return subscriber !== null;
}
