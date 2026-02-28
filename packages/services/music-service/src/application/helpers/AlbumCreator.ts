/**
 * AlbumCreator - Unified album creation utility
 *
 * Single interface for creating albums using the unified mus_albums table.
 * All content is stored in the same table, distinguished by the visibility column:
 * - visibility='shared' for shared library content (librarian-created)
 * - visibility='personal' for user-owned private content
 * - visibility='public' for publicly accessible content
 *
 * Lifecycle is controlled by status column (draft, active, published, archived).
 */

import { getLogger } from '../../config/service-urls';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { albums } from '../../schema/music-schema';
import { v4 as uuidv4 } from 'uuid';
import {
  CONTENT_VISIBILITY,
  ALBUM_LIFECYCLE,
  type ContentVisibility,
  type AlbumLifecycleStatus,
} from '@aiponge/shared-contracts';

const logger = getLogger('music-service:album-creator');

export type AlbumType = 'album' | 'single' | 'ep' | 'compilation';
export type AlbumStatus = AlbumLifecycleStatus;

export { ContentVisibility };

export interface AlbumData {
  title: string;
  userId: string;
  visibility: ContentVisibility;
  description?: string;
  artworkUrl?: string;
  totalTracks?: number;
  totalDuration?: number;
  type?: AlbumType;
  releaseDate?: Date;
  isExplicit?: boolean;
  genres?: string[];
  metadata?: Record<string, unknown>;
  chapterId?: string;
  mood?: string;
  generatedByUserId?: string;
}

export interface AlbumCreationResult {
  success: boolean;
  albumId?: string;
  error?: string;
}

export async function createAlbum(data: AlbumData): Promise<AlbumCreationResult> {
  const db = getDatabase();
  const albumId = uuidv4();

  try {
    const albumType = data.type || (data.totalTracks === 1 ? 'single' : 'album');

    await db.insert(albums).values({
      id: albumId,
      title: data.title,
      userId: data.userId,
      description: data.description,
      artworkUrl: data.artworkUrl,
      totalTracks: data.totalTracks || 0,
      totalDuration: data.totalDuration || 0,
      type: albumType,
      releaseDate: data.releaseDate || null,
      isExplicit: data.isExplicit || false,
      visibility: data.visibility ?? CONTENT_VISIBILITY.PERSONAL,
      playCount: 0,
      mood: data.mood,
      genres: data.genres || [],
      status: ALBUM_LIFECYCLE.DRAFT,
      chapterId: data.chapterId,
      metadata: {
        ...data.metadata,
        ...(data.generatedByUserId ? { generatedBy: data.generatedByUserId } : {}),
      },
    } as typeof albums.$inferInsert);

    logger.info('Album created', {
      albumId,
      title: data.title,
      userId: data.userId,
      visibility: data.visibility,
      totalTracks: data.totalTracks,
    });

    return { success: true, albumId };
  } catch (error) {
    logger.error('Album creation failed', {
      visibility: data.visibility,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Album creation failed',
    };
  }
}

export async function updateAlbumStatus(
  albumId: string,
  status: AlbumStatus,
  visibility: ContentVisibility
): Promise<boolean> {
  const db = getDatabase();
  const { sql } = await import('drizzle-orm');

  try {
    await db
      .update(albums)
      .set({ status, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(sql`id = ${albumId}`);

    logger.info('Album status updated', { albumId, status, visibility });
    return true;
  } catch (error) {
    logger.error('Failed to update album status', {
      albumId,
      status,
      visibility,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
