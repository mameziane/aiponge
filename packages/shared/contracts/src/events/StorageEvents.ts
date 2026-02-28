/**
 * Storage Service Event Contracts
 * Events for asset storage operations
 * Used to decouple Storage ↔ Music circular dependency
 */

import { z } from 'zod';
import { baseEventSchema, generateEventId } from './BaseEvent.js';

export type StorageEventType =
  | 'storage.asset.uploaded'
  | 'storage.asset.deleted'
  | 'storage.asset.moved'
  | 'storage.asset.processing_complete'
  | 'storage.asset.processing_failed';

export const storageAssetUploadedEventSchema = baseEventSchema.extend({
  type: z.literal('storage.asset.uploaded'),
  data: z.object({
    assetId: z.string(),
    userId: z.string().uuid(),
    assetType: z.enum(['audio', 'image', 'document', 'other']),
    path: z.string(),
    size: z.number(),
    mimeType: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

export const storageAssetDeletedEventSchema = baseEventSchema.extend({
  type: z.literal('storage.asset.deleted'),
  data: z.object({
    assetId: z.string(),
    userId: z.string().uuid().optional(),
    path: z.string(),
    reason: z.string().optional(),
  }),
});

export const storageAssetMovedEventSchema = baseEventSchema.extend({
  type: z.literal('storage.asset.moved'),
  data: z.object({
    assetId: z.string(),
    userId: z.string().uuid().optional(),
    fromPath: z.string(),
    toPath: z.string(),
  }),
});

export const storageAssetProcessingCompleteEventSchema = baseEventSchema.extend({
  type: z.literal('storage.asset.processing_complete'),
  data: z.object({
    assetId: z.string(),
    userId: z.string().uuid(),
    assetType: z.enum(['audio', 'image', 'document', 'other']),
    originalPath: z.string(),
    processedPath: z.string().optional(),
    processingType: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

export const storageAssetProcessingFailedEventSchema = baseEventSchema.extend({
  type: z.literal('storage.asset.processing_failed'),
  data: z.object({
    assetId: z.string(),
    userId: z.string().uuid(),
    assetType: z.enum(['audio', 'image', 'document', 'other']),
    path: z.string(),
    processingType: z.string(),
    error: z.string(),
  }),
});

export const storageEventSchema = z.discriminatedUnion('type', [
  storageAssetUploadedEventSchema,
  storageAssetDeletedEventSchema,
  storageAssetMovedEventSchema,
  storageAssetProcessingCompleteEventSchema,
  storageAssetProcessingFailedEventSchema,
]);

export type StorageAssetUploadedEvent = z.infer<typeof storageAssetUploadedEventSchema>;
export type StorageAssetDeletedEvent = z.infer<typeof storageAssetDeletedEventSchema>;
export type StorageAssetMovedEvent = z.infer<typeof storageAssetMovedEventSchema>;
export type StorageAssetProcessingCompleteEvent = z.infer<typeof storageAssetProcessingCompleteEventSchema>;
export type StorageAssetProcessingFailedEvent = z.infer<typeof storageAssetProcessingFailedEventSchema>;
export type StorageEvent = z.infer<typeof storageEventSchema>;

export function createStorageEvent<T extends StorageEvent['type']>(
  type: T,
  data: Extract<StorageEvent, { type: T }>['data'],
  source: string = 'storage-service',
  options?: { correlationId?: string }
): Extract<StorageEvent, { type: T }> {
  return {
    eventId: generateEventId('stg'),
    correlationId: options?.correlationId || generateEventId('cor'),
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    data,
  } as Extract<StorageEvent, { type: T }>;
}

export function validateStorageEvent(event: unknown): StorageEvent {
  return storageEventSchema.parse(event);
}
