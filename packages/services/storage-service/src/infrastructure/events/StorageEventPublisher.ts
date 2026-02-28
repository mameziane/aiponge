/**
 * Storage Event Publisher
 * Safely publishes storage-related events via the event bus
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

const logger = getLogger('storage-service-event-publisher');

let eventBusClient: IStandardizedEventBusClient | null = null;

function getEventBusClient(): IStandardizedEventBusClient {
  if (!eventBusClient) {
    eventBusClient = createEventBusClient(getServiceName('storage-service'));
  }
  return eventBusClient;
}

function safePublish(type: string, data: Record<string, unknown>, correlationId: string): void {
  try {
    const event = createEvent(type, 'storage-service', data, { correlationId });
    getEventBusClient()
      .publish(event)
      .then(() => logger.debug('Published storage event: {}', { data0: type, eventId: event.eventId }))
      .catch((error: unknown) => {
        logger.warn('Failed to publish storage event (non-blocking): {}', {
          data0: type,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  } catch (error) {
    logger.warn('Failed to create storage event (non-blocking): {}', {
      data0: type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const StorageEventPublisher = {
  assetUploaded(
    assetId: string,
    userId: string,
    assetType: 'audio' | 'image' | 'document' | 'other',
    path: string,
    size: number,
    mimeType: string,
    correlationId: string = generateCorrelationId(),
    metadata?: Record<string, unknown>
  ): void {
    safePublish(
      'storage.asset.uploaded',
      {
        assetId,
        userId,
        assetType,
        path,
        size,
        mimeType,
        metadata,
      },
      correlationId
    );
  },

  assetDeleted(
    assetId: string,
    path: string,
    correlationId: string = generateCorrelationId(),
    userId?: string,
    reason?: string
  ): void {
    safePublish(
      'storage.asset.deleted',
      {
        assetId,
        userId,
        path,
        reason,
      },
      correlationId
    );
  },

  assetMoved(
    assetId: string,
    fromPath: string,
    toPath: string,
    correlationId: string = generateCorrelationId(),
    userId?: string
  ): void {
    safePublish(
      'storage.asset.moved',
      {
        assetId,
        userId,
        fromPath,
        toPath,
      },
      correlationId
    );
  },

  assetProcessingComplete(
    assetId: string,
    userId: string,
    assetType: 'audio' | 'image' | 'document' | 'other',
    originalPath: string,
    processingType: string,
    correlationId: string = generateCorrelationId(),
    processedPath?: string,
    metadata?: Record<string, unknown>
  ): void {
    safePublish(
      'storage.asset.processing_complete',
      {
        assetId,
        userId,
        assetType,
        originalPath,
        processedPath,
        processingType,
        metadata,
      },
      correlationId
    );
  },

  assetProcessingFailed(
    assetId: string,
    userId: string,
    assetType: 'audio' | 'image' | 'document' | 'other',
    path: string,
    processingType: string,
    error: string,
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      'storage.asset.processing_failed',
      {
        assetId,
        userId,
        assetType,
        path,
        processingType,
        error,
      },
      correlationId
    );
  },
};
