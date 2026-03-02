/**
 * Storage Event Subscriber
 * Handles storage.asset.deleted events from Storage Service
 * Nullifies stale file URL references in user-service tables
 */

import { createEventSubscriber, type StandardEvent, type EventHandler } from '@aiponge/platform-core';
import { sql } from 'drizzle-orm';
import { getLogger } from '@config/service-urls';
import { getDatabase } from '../database/DatabaseConnectionFactory';

const logger = getLogger('user-storage-subscriber');

interface AssetDeletedData {
  assetId: string;
  userId?: string;
  path: string;
  publicUrl?: string;
  reason?: string;
}

async function handleAssetDeleted(_event: StandardEvent, data: AssetDeletedData): Promise<void> {
  const storagePath = data.path;
  if (!storagePath) return;

  logger.info('Received storage.asset.deleted event', {
    assetId: data.assetId,
    storagePath,
    reason: data.reason,
  });

  try {
    const db = getDatabase();
    const pattern = `%${storagePath}`;

    await Promise.all([
      // Nullify avatarUrl in usr_accounts profile JSONB
      db.execute(sql`
        UPDATE usr_accounts
        SET profile = jsonb_set(profile, '{avatarUrl}', 'null'::jsonb), updated_at = NOW()
        WHERE profile->>'avatarUrl' LIKE ${pattern}
      `),

      // Nullify illustration_url in lib_entries
      db.execute(sql`
        UPDATE lib_entries SET illustration_url = NULL, updated_at = NOW()
        WHERE illustration_url LIKE ${pattern}
      `),

      // Nullify url in lib_illustrations
      db.execute(sql`
        UPDATE lib_illustrations SET url = NULL
        WHERE url LIKE ${pattern}
      `),

      // Nullify thumbnail_url in lib_illustrations (Drizzle field: artworkUrl)
      db.execute(sql`
        UPDATE lib_illustrations SET thumbnail_url = NULL
        WHERE thumbnail_url LIKE ${pattern}
      `),
    ]);

    logger.info('Nullified stale user-service URL references for deleted asset', { storagePath });
  } catch (error) {
    logger.warn('Failed to nullify stale user-service URL references (non-critical)', {
      storagePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

let subscriber: ReturnType<typeof createEventSubscriber> | null = null;

export async function startStorageEventSubscriber(): Promise<void> {
  if (subscriber) return;

  subscriber = createEventSubscriber('user-service').register({
    eventType: 'storage.asset.deleted',
    handler: handleAssetDeleted as EventHandler,
    maxRetries: 3,
  });

  await subscriber.start();
  logger.debug('Storage event subscriber started for User Service');
}

export async function stopStorageEventSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.shutdown();
    subscriber = null;
  }
}
