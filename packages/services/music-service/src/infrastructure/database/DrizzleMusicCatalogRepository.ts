/**
 * DrizzleMusicCatalogRepository
 * Music catalog repository using injected Drizzle database connection
 * Migrated from PostgreSQLMusicCatalogRepository
 */

import { eq, and, desc, asc, sql, inArray, isNull } from 'drizzle-orm';
import { tracks, albums, type Track, type Album, type NewTrack, type NewAlbum } from '../../schema/music-schema';
import { getLogger } from '../../config/service-urls';
import { getAuditService, getCorrelationContext } from '@aiponge/platform-core';
import type { DatabaseConnection } from './DatabaseConnectionFactory';
import { TRACK_LIFECYCLE, encodeCursor, decodeCursor, type CursorPaginatedResponse } from '@aiponge/shared-contracts';

const logger = getLogger('music-service-drizzle-music-catalog-repository');

/**
 * Retry configuration for database operations
 * Uses exponential backoff to handle transient connection issues
 */
const DB_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
};

/**
 * Check if an error is a transient database error that can be retried
 */
function isTransientDbError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();

  // Connection pool exhaustion, timeouts, deadlocks, and transient query failures
  // "failed query" errors during parallel operations are often transient
  return (
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('deadlock') ||
    message.includes('too many clients') ||
    message.includes('pool') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket') ||
    message.includes('failed query') ||
    message.includes('serialization failure') ||
    message.includes('could not serialize')
  );
}

/**
 * Execute a database operation with exponential backoff retry
 */
async function withDbRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= DB_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry non-transient errors (constraint violations, syntax errors, etc.)
      if (!isTransientDbError(error)) {
        throw lastError;
      }

      // Don't retry after max attempts
      if (attempt >= DB_RETRY_CONFIG.maxRetries) {
        logger.error(`${operationName} failed after ${attempt + 1} attempts`, {
          error: lastError.message,
        });
        throw lastError;
      }

      // Calculate exponential backoff delay with jitter
      const delay = Math.min(
        DB_RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt) + Math.random() * 50,
        DB_RETRY_CONFIG.maxDelayMs
      );

      logger.warn(`${operationName} failed (attempt ${attempt + 1}), retrying in ${delay}ms`, {
        error: lastError.message,
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // TypeScript needs this even though it's unreachable
  throw lastError ?? new Error(`${operationName} failed`);
}

export interface IMusicCatalogRepository {
  saveTrack(track: NewTrack): Promise<Track>;
  findTrackById(id: string): Promise<Track | null>;
  findTracksByUserId(userId: string): Promise<Track[]>;
  findTracksByAlbumId(albumId: string): Promise<Track[]>;
  searchTracks(query: string, limit?: number, cursor?: string): Promise<CursorPaginatedResponse<Track>>;
  updateTrackPlayCount(id: string): Promise<void>;
  updateTrackAlbumLink(trackId: string, albumId: string, trackNumber?: number): Promise<void>;
  deleteTrack(id: string): Promise<void>;
  saveAlbum(album: NewAlbum): Promise<Album>;
  findAlbumById(id: string): Promise<Album | null>;
  findAlbumsByUserId(userId: string): Promise<Album[]>;
  searchAlbums(query: string, limit?: number): Promise<Album[]>;
  getTopAlbums(limit?: number): Promise<Album[]>;
  updateAlbumPlayCount(id: string): Promise<void>;
  getCatalogStats(): Promise<{
    totalTracks: number;
    totalAlbums: number;
    totalGenres: number;
  }>;
}

export class DrizzleMusicCatalogRepository implements IMusicCatalogRepository {
  private readonly readDb: DatabaseConnection;

  constructor(
    private readonly db: DatabaseConnection,
    readDb?: DatabaseConnection
  ) {
    this.readDb = readDb || db;
  }

  async saveTrack(trackData: NewTrack): Promise<Track> {
    const id = trackData.id || crypto.randomUUID();
    const now = new Date();

    // Use retry wrapper for transient DB connection issues
    // This prevents full track regeneration when only the DB insert fails
    const track = await withDbRetry(async () => {
      const [result] = await this.db
        .insert(tracks)
        .values({
          ...trackData,
          id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tracks.id,
          set: {
            title: trackData.title,
            fileUrl: trackData.fileUrl,
            artworkUrl: trackData.artworkUrl,
            duration: trackData.duration,
            fileSize: trackData.fileSize,
            mimeType: trackData.mimeType,
            quality: trackData.quality,
            lyricsId: trackData.lyricsId,
            hasSyncedLyrics: trackData.hasSyncedLyrics,
            status: trackData.status,
            metadata: trackData.metadata,
            updatedAt: now,
          },
        })
        .returning();
      return result;
    }, 'saveTrack');

    logger.info('Track saved', { id: track.id, title: track.title });
    getAuditService().log({
      userId: track.userId,
      targetType: 'track',
      targetId: track.id,
      action: 'create',
      serviceName: 'music-service',
      correlationId: getCorrelationContext()?.correlationId,
    });
    return track;
  }

  async findTrackById(id: string): Promise<Track | null> {
    const result = await this.readDb
      .select()
      .from(tracks)
      .where(and(eq(tracks.id, id), isNull(tracks.deletedAt)))
      .limit(1);
    return result[0] || null;
  }

  async findTracksByUserId(userId: string): Promise<Track[]> {
    return await this.readDb
      .select()
      .from(tracks)
      .where(
        and(
          eq(tracks.userId, userId),
          eq(tracks.status, TRACK_LIFECYCLE.PUBLISHED),
          isNull(tracks.deletedAt),
          sql`(COALESCE(${tracks.albumId}::text, ''), COALESCE(${tracks.trackNumber}, 0), ${tracks.generationNumber}) IN (
            SELECT COALESCE(album_id::text, ''), COALESCE(track_number, 0), MAX(generation_number)
            FROM mus_tracks
            WHERE user_id = ${userId} AND status = ${TRACK_LIFECYCLE.PUBLISHED} AND deleted_at IS NULL
            GROUP BY COALESCE(album_id::text, ''), COALESCE(track_number, 0)
          )`
        )
      )
      .orderBy(asc(tracks.albumId), asc(tracks.trackNumber));
  }

  async findTracksByAlbumId(albumId: string): Promise<Track[]> {
    return await this.readDb
      .select()
      .from(tracks)
      .where(
        and(
          eq(tracks.albumId, albumId),
          eq(tracks.status, TRACK_LIFECYCLE.PUBLISHED),
          isNull(tracks.deletedAt),
          sql`(COALESCE(${tracks.trackNumber}, 0), ${tracks.generationNumber}) IN (
            SELECT COALESCE(track_number, 0), MAX(generation_number)
            FROM mus_tracks
            WHERE album_id = ${albumId} AND status = ${TRACK_LIFECYCLE.PUBLISHED} AND deleted_at IS NULL
            GROUP BY COALESCE(track_number, 0)
          )`
        )
      )
      .orderBy(asc(tracks.trackNumber));
  }

  async searchTracks(query: string, limit: number = 50, cursor?: string): Promise<CursorPaginatedResponse<Track>> {
    interface TrackCursor {
      playCount: number;
      id: string;
    }
    const decoded = cursor ? decodeCursor<TrackCursor>(cursor) : null;

    const conditions = [
      eq(tracks.status, TRACK_LIFECYCLE.PUBLISHED),
      isNull(tracks.deletedAt),
      sql`to_tsvector('english', ${tracks.title}) @@ plainto_tsquery('english', ${query})`,
      sql`(COALESCE(${tracks.albumId}::text, ''), COALESCE(${tracks.trackNumber}, 0), ${tracks.generationNumber}) IN (
        SELECT COALESCE(album_id::text, ''), COALESCE(track_number, 0), MAX(generation_number)
        FROM mus_tracks
        WHERE status = ${TRACK_LIFECYCLE.PUBLISHED} AND deleted_at IS NULL
        GROUP BY COALESCE(album_id::text, ''), COALESCE(track_number, 0)
      )`,
    ];

    if (decoded) {
      conditions.push(sql`(COALESCE(${tracks.playCount}, 0), ${tracks.id}) < (${decoded.playCount}, ${decoded.id})`);
    }

    const rows = await this.readDb
      .select()
      .from(tracks)
      .where(and(...conditions))
      .orderBy(sql`COALESCE(${tracks.playCount}, 0) DESC`, desc(tracks.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem ? encodeCursor({ playCount: lastItem.playCount ?? 0, id: lastItem.id }) : null;

    return { items, nextCursor, hasMore };
  }

  async countTracks(query: string): Promise<number> {
    const result = await this.readDb
      .select({ count: sql<number>`count(*)` })
      .from(tracks)
      .where(
        and(
          eq(tracks.status, TRACK_LIFECYCLE.PUBLISHED),
          isNull(tracks.deletedAt),
          sql`to_tsvector('english', ${tracks.title}) @@ plainto_tsquery('english', ${query})`,
          sql`(COALESCE(${tracks.albumId}::text, ''), COALESCE(${tracks.trackNumber}, 0), ${tracks.generationNumber}) IN (
            SELECT COALESCE(album_id::text, ''), COALESCE(track_number, 0), MAX(generation_number)
            FROM mus_tracks
            WHERE status = ${TRACK_LIFECYCLE.PUBLISHED} AND deleted_at IS NULL
            GROUP BY COALESCE(album_id::text, ''), COALESCE(track_number, 0)
          )`
        )
      );
    return Number(result[0]?.count ?? 0);
  }

  async updateTrackPlayCount(id: string): Promise<void> {
    await this.db
      .update(tracks)
      .set({
        playCount: sql`COALESCE(${tracks.playCount}, 0) + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(tracks.id, id), isNull(tracks.deletedAt)));
  }

  async deleteTrack(id: string): Promise<void> {
    await this.db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, id));
    logger.info('Track deleted', { id });
    getAuditService().log({
      targetType: 'track',
      targetId: id,
      action: 'delete',
      serviceName: 'music-service',
      correlationId: getCorrelationContext()?.correlationId,
    });
  }

  async updateTrackAlbumLink(trackId: string, albumId: string, trackNumber?: number): Promise<void> {
    const updateData: Partial<typeof tracks.$inferInsert> = {
      albumId,
      updatedAt: new Date(),
    };
    if (trackNumber !== undefined) {
      updateData.trackNumber = trackNumber;
    }

    await this.db
      .update(tracks)
      .set(updateData)
      .where(and(eq(tracks.id, trackId), isNull(tracks.deletedAt)));
    logger.info('Track album link updated', { trackId, albumId, trackNumber });
  }

  async updateHasSyncedLyrics(trackId: string, hasSyncedLyrics: boolean): Promise<void> {
    await this.db
      .update(tracks)
      .set({ hasSyncedLyrics, updatedAt: new Date() })
      .where(and(eq(tracks.id, trackId), isNull(tracks.deletedAt)));
    logger.info('Track hasSyncedLyrics updated', { trackId, hasSyncedLyrics });
  }

  async saveAlbum(albumData: NewAlbum): Promise<Album> {
    // Use retry wrapper for transient DB connection issues
    const album = await withDbRetry(async () => {
      const [result] = await this.db
        .insert(albums)
        .values({
          ...albumData,
          id: albumData.id || crypto.randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return result;
    }, 'saveAlbum');

    logger.info('Album saved', { id: album.id, title: album.title });
    getAuditService().log({
      userId: album.userId,
      targetType: 'album',
      targetId: album.id,
      action: 'create',
      serviceName: 'music-service',
      correlationId: getCorrelationContext()?.correlationId,
    });
    return album;
  }

  async findAlbumById(id: string): Promise<Album | null> {
    const result = await this.readDb
      .select()
      .from(albums)
      .where(and(eq(albums.id, id), isNull(albums.deletedAt)))
      .limit(1);
    return result[0] || null;
  }

  async findAlbumsByUserId(userId: string): Promise<Album[]> {
    return await this.readDb
      .select()
      .from(albums)
      .where(and(eq(albums.userId, userId), isNull(albums.deletedAt)))
      .orderBy(desc(albums.releaseDate));
  }

  async searchAlbums(query: string, limit: number = 50): Promise<Album[]> {
    return await this.readDb
      .select()
      .from(albums)
      .where(
        and(
          sql`to_tsvector('english', ${albums.title}) @@ plainto_tsquery('english', ${query})`,
          isNull(albums.deletedAt)
        )
      )
      .orderBy(desc(albums.playCount))
      .limit(Math.min(limit || 20, 100));
  }

  async getTopAlbums(limit: number = 20): Promise<Album[]> {
    return await this.readDb
      .select()
      .from(albums)
      .where(isNull(albums.deletedAt))
      .orderBy(desc(albums.playCount))
      .limit(Math.min(limit || 20, 100));
  }

  async updateAlbumPlayCount(id: string): Promise<void> {
    await this.db
      .update(albums)
      .set({
        playCount: sql`COALESCE(${albums.playCount}, 0) + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(albums.id, id), isNull(albums.deletedAt)));
  }

  async getCatalogStats(): Promise<{
    totalTracks: number;
    totalAlbums: number;
    totalGenres: number;
  }> {
    const [trackCount] = await this.readDb
      .select({ count: sql<number>`count(*)` })
      .from(tracks)
      .where(and(eq(tracks.status, TRACK_LIFECYCLE.PUBLISHED), isNull(tracks.deletedAt)));

    const [albumCount] = await this.readDb
      .select({ count: sql<number>`count(*)` })
      .from(albums)
      .where(isNull(albums.deletedAt));

    const genreResult = await this.readDb
      .select({ genres: tracks.genres })
      .from(tracks)
      .where(and(eq(tracks.status, TRACK_LIFECYCLE.PUBLISHED), isNull(tracks.deletedAt)));

    const uniqueGenres = new Set<string>();
    genreResult.forEach(r => {
      if (Array.isArray(r.genres)) {
        r.genres.forEach(g => uniqueGenres.add(g));
      }
    });

    return {
      totalTracks: trackCount?.count || 0,
      totalAlbums: albumCount?.count || 0,
      totalGenres: uniqueGenres.size,
    };
  }
}
