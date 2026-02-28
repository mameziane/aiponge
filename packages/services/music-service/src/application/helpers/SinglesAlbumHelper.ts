/**
 * SinglesAlbumHelper - Consolidated Singles album management
 *
 * Provides a single source of truth for creating/finding Singles albums
 * in the shared library. This eliminates duplicate implementations across:
 * - LibraryService
 * - LibraryOperationsService
 * - LibraryTrackGenerationService
 *
 * Design decisions:
 * - Uses "aiponge Singles" as the canonical title (no date suffix)
 * - One global Singles album per user (no proliferation)
 * - Uses upsert pattern to prevent race conditions
 */

import { getLogger } from '../../config/service-urls';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { albums } from '../../schema/music-schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { CONTENT_VISIBILITY, ALBUM_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = getLogger('music-service:singles-album-helper');

export const SINGLES_ALBUM_TITLE = 'aiponge Singles';
export const SINGLES_ALBUM_TYPE = 'compilation' as const;

export interface SinglesAlbumInfo {
  albumId: string;
  userId: string;
  isNew: boolean;
}

/**
 * Get or create a Singles album for a specific user.
 *
 * Used for shared library tracks that don't belong to a specific album.
 *
 * @param userId - The user ID who owns the singles album
 * @returns SinglesAlbumInfo with albumId and userId
 */
export async function getOrCreateSinglesAlbumForUser(userId: string): Promise<SinglesAlbumInfo> {
  const db = getDatabase();

  const existingAlbum = await db
    .select({ id: albums.id })
    .from(albums)
    .where(
      and(
        eq(albums.userId, userId),
        eq(albums.title, SINGLES_ALBUM_TITLE),
        eq(albums.visibility, CONTENT_VISIBILITY.SHARED)
      )
    )
    .limit(1);

  if (existingAlbum.length > 0) {
    logger.debug('Found existing Singles album', {
      albumId: existingAlbum[0].id,
      userId,
    });
    return {
      albumId: existingAlbum[0].id,
      userId,
      isNew: false,
    };
  }

  const albumId = uuidv4();

  try {
    await db.insert(albums).values({
      id: albumId,
      title: SINGLES_ALBUM_TITLE,
      userId,
      description: 'Individual songs collection',
      type: SINGLES_ALBUM_TYPE,
      status: ALBUM_LIFECYCLE.PUBLISHED,
      visibility: CONTENT_VISIBILITY.SHARED,
      totalTracks: 0,
      totalDuration: 0,
      genres: [],
      metadata: {
        isSystemAlbum: true,
        purpose: 'singles-collection',
        autoCreated: true,
      },
    } as typeof albums.$inferInsert);

    logger.info('Created Singles album for shared library', {
      albumId,
      userId,
    });

    return {
      albumId,
      userId,
      isNew: true,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('unique')) {
      logger.debug('Singles album created by concurrent request, fetching existing');
      const retryAlbum = await db
        .select({ id: albums.id })
        .from(albums)
        .where(
          and(
            eq(albums.userId, userId),
            eq(albums.title, SINGLES_ALBUM_TITLE),
            eq(albums.visibility, CONTENT_VISIBILITY.SHARED)
          )
        )
        .limit(1);

      if (retryAlbum.length > 0) {
        return {
          albumId: retryAlbum[0].id,
          userId,
          isNew: false,
        };
      }
    }

    logger.error('Failed to create Singles album', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Check if a given album ID is a Singles album.
 * Useful for UI display or special handling.
 */
export async function isSinglesAlbum(albumId: string): Promise<boolean> {
  const db = getDatabase();

  const album = await db.select({ title: albums.title }).from(albums).where(eq(albums.id, albumId)).limit(1);

  return album.length > 0 && album[0].title === SINGLES_ALBUM_TITLE;
}
