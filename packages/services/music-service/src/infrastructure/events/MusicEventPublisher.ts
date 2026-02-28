import {
  createEventBusClient,
  type IStandardizedEventBusClient,
  getServiceName,
  createEvent,
  generateCorrelationId,
} from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('music-service-event-publisher');

let eventBusClient: IStandardizedEventBusClient | null = null;

function getEventBusClient(): IStandardizedEventBusClient {
  if (!eventBusClient) {
    eventBusClient = createEventBusClient(getServiceName('music-service'));
  }
  return eventBusClient;
}

function safePublish(type: string, data: Record<string, unknown>, correlationId: string): void {
  try {
    const event = createEvent(type, 'music-service', data, { correlationId });
    getEventBusClient()
      .publish(event)
      .then(() => logger.debug('Published music event: {}', { data0: type, eventId: event.eventId }))
      .catch(error => {
        logger.warn('Failed to publish music event (non-blocking): {}', {
          data0: type,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  } catch (error) {
    logger.warn('Failed to create music event (non-blocking): {}', {
      data0: type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const MusicEventPublisher = {
  generationCompleted(
    userId: string,
    requestId: string,
    correlationId: string = generateCorrelationId(),
    trackId?: string,
    albumId?: string,
    audioUrl?: string
  ): void {
    safePublish(
      'music.generation.completed',
      {
        userId,
        requestId,
        trackId,
        albumId,
        audioUrl,
      },
      correlationId
    );
  },

  generationFailed(
    userId: string,
    requestId: string,
    error: string,
    correlationId: string = generateCorrelationId(),
    isLastAttempt?: boolean
  ): void {
    safePublish(
      'music.generation.failed',
      {
        userId,
        requestId,
        error,
        isLastAttempt,
      },
      correlationId
    );
  },

  trackPlayed(
    trackId: string,
    userId: string,
    playDuration: number,
    correlationId: string = generateCorrelationId(),
    metadata?: Record<string, unknown>
  ): void {
    safePublish(
      'music.track.played',
      {
        trackId,
        userId,
        playDuration,
        timestamp: new Date().toISOString(),
        metadata,
      },
      correlationId
    );
  },

  trackAdded(
    trackId: string,
    title: string,
    displayName: string,
    addedBy: string,
    duration: number,
    correlationId: string = generateCorrelationId(),
    album?: string
  ): void {
    safePublish(
      'music.track.added',
      {
        trackId,
        title,
        displayName,
        addedBy,
        duration,
        album,
      },
      correlationId
    );
  },

  trackRemoved(
    trackId: string,
    removedBy: string,
    correlationId: string = generateCorrelationId(),
    reason?: string
  ): void {
    safePublish('music.track.removed', { trackId, removedBy, reason }, correlationId);
  },

  playlistCreated(
    playlistId: string,
    name: string,
    createdBy: string,
    visibility: string,
    correlationId: string = generateCorrelationId(),
    description?: string
  ): void {
    safePublish(
      'music.playlist.created',
      {
        playlistId,
        name,
        description,
        createdBy,
        visibility,
      },
      correlationId
    );
  },

  albumCreated(
    albumId: string,
    title: string,
    displayName: string,
    createdBy: string,
    trackCount: number,
    correlationId: string = generateCorrelationId(),
    releaseDate?: string
  ): void {
    safePublish(
      'music.album.created',
      {
        albumId,
        title,
        displayName,
        createdBy,
        trackCount,
        releaseDate,
      },
      correlationId
    );
  },
};
