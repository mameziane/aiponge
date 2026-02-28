/**
 * Storage Event Subscriber
 * Handles storage.asset.* events from Storage Service
 * Replaces HTTP-based asset registration with event-driven updates
 */

import { createEventSubscriber, type StandardEvent, type EventHandler } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('music-storage-subscriber');

interface AssetUploadedData {
  assetId: string;
  userId: string;
  assetType: 'audio' | 'image' | 'document' | 'other';
  path: string;
  size: number;
  mimeType: string;
  metadata?: Record<string, unknown>;
}

interface AssetDeletedData {
  assetId: string;
  userId?: string;
  path: string;
  reason?: string;
}

interface AssetMovedData {
  assetId: string;
  userId?: string;
  fromPath: string;
  toPath: string;
}

interface AssetProcessingData {
  assetId: string;
  userId: string;
  assetType: 'audio' | 'image' | 'document' | 'other';
  originalPath?: string;
  path?: string;
  processedPath?: string;
  processingType: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

const pendingAssets = new Map<string, { userId: string; path: string; status: string; updatedAt: number }>();

async function handleAssetUploaded(_event: StandardEvent, data: AssetUploadedData): Promise<void> {
  if (data.assetType !== 'audio') {
    logger.debug('Ignoring non-audio asset: {}', { data0: data.assetId });
    return;
  }

  logger.info('Audio asset uploaded: {} by user {} at {}', {
    data0: data.assetId,
    data1: data.userId,
    data2: data.path,
  });

  pendingAssets.set(data.assetId, {
    userId: data.userId,
    path: data.path,
    status: 'uploaded',
    updatedAt: Date.now(),
  });
}

async function handleAssetDeleted(_event: StandardEvent, data: AssetDeletedData): Promise<void> {
  logger.info('Asset deleted: {} reason={}', {
    data0: data.assetId,
    data1: data.reason || 'not specified',
  });
  pendingAssets.delete(data.assetId);
}

async function handleAssetMoved(_event: StandardEvent, data: AssetMovedData): Promise<void> {
  logger.info('Asset moved: {} from {} to {}', {
    data0: data.assetId,
    data1: data.fromPath,
    data2: data.toPath,
  });

  const existing = pendingAssets.get(data.assetId);
  if (existing) {
    existing.path = data.toPath;
    existing.updatedAt = Date.now();
  }
}

async function handleAssetProcessingComplete(_event: StandardEvent, data: AssetProcessingData): Promise<void> {
  logger.info('Asset processing complete: {} type={}', {
    data0: data.assetId,
    data1: data.processingType,
  });

  const existing = pendingAssets.get(data.assetId);
  if (existing) {
    existing.status = 'processed';
    existing.updatedAt = Date.now();
  }
}

async function handleAssetProcessingFailed(_event: StandardEvent, data: AssetProcessingData): Promise<void> {
  logger.error('Asset processing failed: {} type={} error={}', {
    data0: data.assetId,
    data1: data.processingType,
    data2: data.error || 'unknown',
  });

  const existing = pendingAssets.get(data.assetId);
  if (existing) {
    existing.status = 'failed';
    existing.updatedAt = Date.now();
  }
}

let subscriber: ReturnType<typeof createEventSubscriber> | null = null;

export async function startStorageEventSubscriber(): Promise<void> {
  if (subscriber) return;

  subscriber = createEventSubscriber('music-service')
    .register({
      eventType: 'storage.asset.uploaded',
      handler: handleAssetUploaded as EventHandler,
    })
    .register({
      eventType: 'storage.asset.deleted',
      handler: handleAssetDeleted as EventHandler,
    })
    .register({
      eventType: 'storage.asset.moved',
      handler: handleAssetMoved as EventHandler,
    })
    .register({
      eventType: 'storage.asset.processing_complete',
      handler: handleAssetProcessingComplete as EventHandler,
    })
    .register({
      eventType: 'storage.asset.processing_failed',
      handler: handleAssetProcessingFailed as EventHandler,
    });

  await subscriber.start();
  logger.debug('Storage event subscriber started for Music Service');
}

export async function stopStorageEventSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.shutdown();
    subscriber = null;
  }
}

export function getPendingAssets(): Map<string, { userId: string; path: string; status: string; updatedAt: number }> {
  return pendingAssets;
}
