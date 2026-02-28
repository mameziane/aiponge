/**
 * UnifiedAlbumRepository
 * Consolidated repository for all albums (personal, draft, shared)
 * Uses unified mus_albums table with visibility-based filtering
 *
 * Replaces: DrizzleAlbumRepository, DrizzleUserAlbumRepository
 */

import { eq, and, desc, sql, or, count, inArray, isNull } from 'drizzle-orm';
import { MusicError } from '../../application/errors';
import { albums, tracks, Album as AlbumSchema } from '../../schema/music-schema';
import { getLogger } from '../../config/service-urls';
import { getAuditService, getCorrelationContext, errorMessage } from '@aiponge/platform-core';
import type { DatabaseConnection } from './DatabaseConnectionFactory';
import { Album } from '../../domains/music-catalog/entities/Album';
import {
  CONTENT_VISIBILITY,
  VISIBILITY_FILTER,
  APP,
  ALBUM_LIFECYCLE,
  TRACK_LIFECYCLE,
  type ContentVisibility,
  type VisibilityFilter,
  type AlbumLifecycleStatus,
} from '@aiponge/shared-contracts';

const logger = getLogger('music-service-unified-album-repository');

export type AlbumVisibility = ContentVisibility;
export type AlbumVisibilityFilter = VisibilityFilter;

export interface AlbumEntity {
  id: string;
  title: string;
  userId: string;
  displayName: string;
  genre: string[];
  releaseDate?: Date;
  totalDuration?: number;
  trackCount?: number;
  artworkUrl?: string;
  recordLabel?: string;
  catalogNumber?: string;
  isCompilation: boolean;
  visibility?: AlbumVisibility;
  chapterId?: string;
  status: AlbumLifecycleStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DB_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
};

function isTransientDbError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();

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

async function withDbRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= DB_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isTransientDbError(error)) {
        throw lastError;
      }

      if (attempt >= DB_RETRY_CONFIG.maxRetries) {
        logger.error(`${operationName} failed after ${attempt + 1} attempts`, {
          error: lastError.message,
        });
        throw lastError;
      }

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

  throw lastError ?? new Error(`${operationName} failed`);
}

export class UnifiedAlbumRepository {
  constructor(private readonly db: DatabaseConnection) {}

  private getVisibilityCondition(filter: AlbumVisibilityFilter) {
    switch (filter) {
      case VISIBILITY_FILTER.USER:
      case VISIBILITY_FILTER.PERSONAL:
        return eq(albums.visibility, CONTENT_VISIBILITY.PERSONAL);
      case VISIBILITY_FILTER.SHARED:
        return eq(albums.visibility, CONTENT_VISIBILITY.SHARED);
      case VISIBILITY_FILTER.PUBLIC:
        return eq(albums.visibility, CONTENT_VISIBILITY.PUBLIC);
      case VISIBILITY_FILTER.PUBLICLY_ACCESSIBLE:
        return inArray(albums.visibility, [CONTENT_VISIBILITY.SHARED, CONTENT_VISIBILITY.PUBLIC]);
      case VISIBILITY_FILTER.ALL:
        return undefined;
      default:
        return eq(albums.visibility, filter);
    }
  }

  async create(album: AlbumEntity): Promise<AlbumEntity> {
    try {
      const displayName = album.displayName || '';
      const visibility = album.visibility || CONTENT_VISIBILITY.SHARED;

      const result = await this.db
        .insert(albums)
        .values({
          id: album.id,
          title: album.title,
          userId: album.userId,
          description: `Album by ${displayName}`,
          genres: album.genre,
          artworkUrl: album.artworkUrl,
          releaseDate: album.releaseDate,
          type: album.isCompilation ? 'compilation' : 'album',
          totalTracks: album.trackCount || 0,
          totalDuration: album.totalDuration || 0,
          isExplicit: false,
          visibility,
          chapterId: album.chapterId,
          status: album.status,
          playCount: 0,
          metadata: {
            recordLabel: album.recordLabel,
            catalogNumber: album.catalogNumber,
            displayName: displayName,
          },
        })
        .returning();

      logger.info('Album created', { id: result[0].id, visibility });
      getAuditService().log({
        userId: album.userId,
        targetType: 'album',
        targetId: result[0].id,
        action: 'create',
        serviceName: 'music-service',
        correlationId: getCorrelationContext()?.correlationId,
      });
      return this.mapRowToAlbumEntity(result[0]);
    } catch (error) {
      logger.error('Error creating album:', { error: error instanceof Error ? error.message : String(error) });
      throw MusicError.internalError('Failed to create album', error instanceof Error ? error : undefined);
    }
  }

  async findById(
    id: string,
    visibilityFilter: AlbumVisibilityFilter = VISIBILITY_FILTER.ALL
  ): Promise<AlbumEntity | null> {
    try {
      const visibilityCondition = this.getVisibilityCondition(visibilityFilter);
      const conditions = visibilityCondition
        ? and(eq(albums.id, id), visibilityCondition, isNull(albums.deletedAt))
        : and(eq(albums.id, id), isNull(albums.deletedAt));

      const result = await this.db.select().from(albums).where(conditions).limit(1);

      if (result.length === 0) {
        return null;
      }

      return this.mapRowToAlbumEntity(result[0]);
    } catch (error) {
      logger.error('Error finding album by ID:', { error: error instanceof Error ? error.message : String(error) });
      throw MusicError.internalError('Failed to find album', error instanceof Error ? error : undefined);
    }
  }

  async findByIdAsUserAlbum(
    id: string,
    visibilityFilter: AlbumVisibilityFilter = VISIBILITY_FILTER.USER
  ): Promise<Album | null> {
    try {
      const visibilityCondition = this.getVisibilityCondition(visibilityFilter);
      const conditions = visibilityCondition
        ? and(eq(albums.id, id), visibilityCondition, isNull(albums.deletedAt))
        : and(eq(albums.id, id), isNull(albums.deletedAt));

      const result = await this.db.select().from(albums).where(conditions).limit(1);

      if (!result[0]) return null;
      return this.mapToUserAlbumEntity(result[0]);
    } catch (error) {
      logger.error('Failed to find album by id', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(album: AlbumEntity): Promise<AlbumEntity> {
    try {
      const displayName = album.displayName || '';
      const result = await this.db
        .update(albums)
        .set({
          title: album.title,
          userId: album.userId,
          description: `Album by ${displayName}`,
          genres: album.genre,
          artworkUrl: album.artworkUrl,
          releaseDate: album.releaseDate,
          type: album.isCompilation ? 'compilation' : 'album',
          totalTracks: album.trackCount || 0,
          totalDuration: album.totalDuration || 0,
          status: album.status,
          visibility: album.visibility,
          metadata: {
            recordLabel: album.recordLabel,
            catalogNumber: album.catalogNumber,
            displayName: displayName,
          },
          updatedAt: new Date(),
        })
        .where(and(eq(albums.id, album.id), isNull(albums.deletedAt)))
        .returning();

      if (!result[0]) {
        throw MusicError.albumNotFound(album.id);
      }

      return this.mapRowToAlbumEntity(result[0]);
    } catch (error) {
      logger.error('Error updating album:', { error: error instanceof Error ? error.message : String(error) });
      throw MusicError.internalError('Failed to update album', error instanceof Error ? error : undefined);
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.db.update(albums).set({ deletedAt: new Date() }).where(eq(albums.id, id));
      logger.info('Album deleted', { albumId: id });
      getAuditService().log({
        targetType: 'album',
        targetId: id,
        action: 'delete',
        serviceName: 'music-service',
        correlationId: getCorrelationContext()?.correlationId,
      });
      return true;
    } catch (error) {
      logger.error('Error deleting album:', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  async findByUser(
    userId: string,
    options: { visibility?: AlbumVisibilityFilter; limit?: number; offset?: number } = {}
  ): Promise<AlbumEntity[]> {
    const { visibility = VISIBILITY_FILTER.ALL, limit = 50, offset = 0 } = options;
    try {
      const visibilityCondition = this.getVisibilityCondition(visibility);
      const conditions = visibilityCondition
        ? and(eq(albums.userId, userId), visibilityCondition, isNull(albums.deletedAt))
        : and(eq(albums.userId, userId), isNull(albums.deletedAt));

      const result = await this.db
        .select()
        .from(albums)
        .where(conditions)
        .orderBy(desc(albums.releaseDate))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);

      return result.map(row => this.mapRowToAlbumEntity(row));
    } catch (error) {
      logger.error('Error finding albums by user:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw MusicError.internalError('Failed to find albums by user', error instanceof Error ? error : undefined);
    }
  }

  async findByUserAsUserAlbum(
    userId: string,
    options: { visibility?: AlbumVisibilityFilter; status?: string; limit?: number; offset?: number } = {}
  ): Promise<Album[]> {
    const { visibility = VISIBILITY_FILTER.USER, status = ALBUM_LIFECYCLE.ACTIVE, limit = 50, offset = 0 } = options;
    try {
      const visibilityCondition = this.getVisibilityCondition(visibility);
      let conditions: ReturnType<typeof and> = and(eq(albums.userId, userId), isNull(albums.deletedAt));

      if (visibilityCondition) {
        conditions = and(conditions, visibilityCondition);
      }
      if (status !== 'all') {
        conditions = and(conditions, eq(albums.status, status));
      }

      const result = await this.db
        .select()
        .from(albums)
        .where(conditions)
        .orderBy(desc(albums.createdAt))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);

      return result.map(row => this.mapToUserAlbumEntity(row));
    } catch (error) {
      logger.error('Failed to find albums by user', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByUserIdAndChapterId(
    userId: string,
    chapterId: string,
    visibilityFilter: AlbumVisibilityFilter = VISIBILITY_FILTER.USER
  ): Promise<Album | null> {
    try {
      const visibilityCondition = this.getVisibilityCondition(visibilityFilter);
      let conditions = and(eq(albums.userId, userId), eq(albums.chapterId, chapterId), isNull(albums.deletedAt));

      if (visibilityCondition) {
        conditions = and(conditions, visibilityCondition);
      }

      const result = await this.db.select().from(albums).where(conditions).limit(1);

      if (!result[0]) return null;
      return this.mapToUserAlbumEntity(result[0]);
    } catch (error) {
      logger.error('Failed to find album by user and chapter', {
        userId,
        chapterId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByChapterId(
    chapterId: string,
    visibilityFilter: AlbumVisibilityFilter = VISIBILITY_FILTER.ALL
  ): Promise<AlbumEntity | null> {
    try {
      const visibilityCondition = this.getVisibilityCondition(visibilityFilter);
      const conditions = visibilityCondition
        ? and(eq(albums.chapterId, chapterId), visibilityCondition, isNull(albums.deletedAt))
        : and(eq(albums.chapterId, chapterId), isNull(albums.deletedAt));

      const result = await this.db.select().from(albums).where(conditions).limit(1);

      if (result.length === 0) {
        return null;
      }

      return this.mapRowToAlbumEntity(result[0]);
    } catch (error) {
      logger.error('Error finding album by chapterId:', {
        error: error instanceof Error ? error.message : String(error),
        chapterId,
      });
      throw MusicError.internalError('Failed to find album by chapterId', error instanceof Error ? error : undefined);
    }
  }

  async findByChapterIdAsUserAlbum(
    chapterId: string,
    visibilityFilter: AlbumVisibilityFilter = VISIBILITY_FILTER.USER
  ): Promise<Album | null> {
    try {
      const visibilityCondition = this.getVisibilityCondition(visibilityFilter);
      const conditions = visibilityCondition
        ? and(eq(albums.chapterId, chapterId), visibilityCondition, isNull(albums.deletedAt))
        : and(eq(albums.chapterId, chapterId), isNull(albums.deletedAt));

      const result = await this.db.select().from(albums).where(conditions).limit(1);

      if (!result[0]) return null;
      return this.mapToUserAlbumEntity(result[0]);
    } catch (error) {
      logger.error('Failed to find album by chapter', {
        chapterId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByTitle(
    title: string,
    visibilityFilter: AlbumVisibilityFilter = VISIBILITY_FILTER.ALL
  ): Promise<AlbumEntity[]> {
    try {
      const visibilityCondition = this.getVisibilityCondition(visibilityFilter);
      const ftsCondition = sql`to_tsvector('english', ${albums.title}) @@ plainto_tsquery('english', ${title})`;
      const conditions = visibilityCondition
        ? and(ftsCondition, visibilityCondition, isNull(albums.deletedAt))
        : and(ftsCondition, isNull(albums.deletedAt));

      const result = await this.db.select().from(albums).where(conditions);

      return result.map(row => this.mapRowToAlbumEntity(row));
    } catch (error) {
      logger.error('Error finding albums by title:', { error: error instanceof Error ? error.message : String(error) });
      throw MusicError.internalError('Failed to find albums by title', error instanceof Error ? error : undefined);
    }
  }

  async searchAlbums(
    query: string,
    options: { visibility?: AlbumVisibilityFilter; limit?: number; offset?: number } = {}
  ): Promise<AlbumEntity[]> {
    const { visibility = CONTENT_VISIBILITY.SHARED, limit = 20, offset = 0 } = options;
    try {
      const ftsCondition = sql`to_tsvector('english', ${albums.title}) @@ plainto_tsquery('english', ${query})`;
      const visibilityCondition = this.getVisibilityCondition(visibility);
      const conditions = visibilityCondition
        ? and(ftsCondition, visibilityCondition, isNull(albums.deletedAt))
        : and(ftsCondition, isNull(albums.deletedAt));

      const result = await this.db
        .select()
        .from(albums)
        .where(conditions)
        .orderBy(desc(albums.releaseDate))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);

      return result.map(row => this.mapRowToAlbumEntity(row));
    } catch (error) {
      logger.error('Error searching albums:', { error: error instanceof Error ? error.message : String(error) });
      throw MusicError.internalError('Failed to search albums', error instanceof Error ? error : undefined);
    }
  }

  async findByGenre(
    genre: string,
    options: { visibility?: AlbumVisibilityFilter; limit?: number; offset?: number } = {}
  ): Promise<AlbumEntity[]> {
    const { visibility = CONTENT_VISIBILITY.SHARED, limit = 20, offset = 0 } = options;
    try {
      const visibilityCondition = this.getVisibilityCondition(visibility);
      const genreCondition = sql`${albums.genres}::jsonb ? ${genre}`;
      const conditions = visibilityCondition
        ? and(genreCondition, visibilityCondition, isNull(albums.deletedAt))
        : and(genreCondition, isNull(albums.deletedAt));

      const result = await this.db
        .select()
        .from(albums)
        .where(conditions)
        .orderBy(desc(albums.releaseDate))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);

      return result.map(row => this.mapRowToAlbumEntity(row));
    } catch (error) {
      logger.error('Error finding albums by genre:', { error: error instanceof Error ? error.message : String(error) });
      throw MusicError.internalError('Failed to find albums by genre', error instanceof Error ? error : undefined);
    }
  }

  async count(visibilityFilter: AlbumVisibilityFilter = VISIBILITY_FILTER.ALL): Promise<number> {
    try {
      const visibilityCondition = this.getVisibilityCondition(visibilityFilter);
      const query = visibilityCondition
        ? this.db
            .select({ count: count() })
            .from(albums)
            .where(and(visibilityCondition, isNull(albums.deletedAt)))
        : this.db.select({ count: count() }).from(albums).where(isNull(albums.deletedAt));

      const result = await query;
      return result[0]?.count || 0;
    } catch (error) {
      logger.error('Error counting albums:', { error: error instanceof Error ? error.message : String(error) });
      throw MusicError.internalError('Failed to count albums', error instanceof Error ? error : undefined);
    }
  }

  async saveUserAlbum(album: Album, visibility: AlbumVisibility = CONTENT_VISIBILITY.PERSONAL): Promise<Album> {
    try {
      const data = album.toJSON();

      const result = await withDbRetry(async () => {
        return this.db
          .insert(albums)
          .values({
            id: data.id,
            userId: data.userId,
            chapterId: data.chapterId,
            title: data.title,
            description: data.description,
            artworkUrl: data.artworkUrl,
            totalTracks: data.totalTracks || 0,
            totalDuration: data.totalDuration || 0,
            type: data.type || 'album',
            releaseDate: data.releaseDate || null,
            isExplicit: data.isExplicit || false,
            playCount: data.playCount || 0,
            mood: data.mood,
            genres: data.genres || [],
            status: data.status || ALBUM_LIFECYCLE.DRAFT,
            visibility,
            metadata: data.metadata || {},
          })
          .onConflictDoUpdate({
            target: albums.id,
            set: {
              title: data.title,
              description: data.description,
              artworkUrl: data.artworkUrl,
              totalTracks: data.totalTracks || 0,
              totalDuration: data.totalDuration || 0,
              type: data.type || 'album',
              releaseDate: data.releaseDate || null,
              isExplicit: data.isExplicit || false,
              playCount: data.playCount || 0,
              mood: data.mood,
              genres: data.genres || [],
              status: data.status || ALBUM_LIFECYCLE.DRAFT,
              metadata: data.metadata || {},
              updatedAt: sql`CURRENT_TIMESTAMP`,
            },
          })
          .returning();
      }, 'saveAlbum');

      logger.info('Album saved', { albumId: result[0].id, chapterId: data.chapterId, visibility });
      getAuditService().log({
        userId: data.userId,
        targetType: 'album',
        targetId: result[0].id,
        action: 'create',
        serviceName: 'music-service',
        correlationId: getCorrelationContext()?.correlationId,
      });
      return this.mapToUserAlbumEntity(result[0]);
    } catch (error) {
      logger.error('Failed to save album', {
        albumId: album.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async updateTotals(albumId: string): Promise<void> {
    try {
      const totalsResult = await this.db
        .select({
          count: sql<number>`COUNT(*)`,
          duration: sql<number>`COALESCE(SUM(duration), 0)`,
        })
        .from(tracks)
        .where(
          and(
            eq(tracks.albumId, albumId),
            eq(tracks.status, TRACK_LIFECYCLE.ACTIVE),
            isNull(tracks.deletedAt),
            sql`(COALESCE(${tracks.trackNumber}, 0), ${tracks.generationNumber}) IN (
              SELECT COALESCE(track_number, 0), MAX(generation_number)
              FROM mus_tracks
              WHERE album_id = ${albumId} AND status = ${TRACK_LIFECYCLE.ACTIVE} AND deleted_at IS NULL
              GROUP BY COALESCE(track_number, 0)
            )`
          )
        );

      const totals = totalsResult[0] || { count: 0, duration: 0 };

      await this.db
        .update(albums)
        .set({
          totalTracks: Number(totals.count) || 0,
          totalDuration: Number(totals.duration) || 0,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(albums.id, albumId), isNull(albums.deletedAt)));

      logger.info('Album totals updated', { albumId, tracks: totals.count, duration: totals.duration });
    } catch (error) {
      logger.error('Failed to update album totals', {
        albumId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async refreshAlbumStats(albumId: string): Promise<void> {
    try {
      await this.db.execute(sql`
        UPDATE mus_albums 
        SET 
          total_tracks = COALESCE((SELECT COUNT(*) FROM mus_tracks WHERE album_id = ${albumId} AND status = ${TRACK_LIFECYCLE.PUBLISHED} AND deleted_at IS NULL), 0),
          total_duration = COALESCE((SELECT SUM(duration) FROM mus_tracks WHERE album_id = ${albumId} AND status = ${TRACK_LIFECYCLE.PUBLISHED} AND deleted_at IS NULL), 0),
          release_date = COALESCE(release_date, (SELECT MIN(created_at) FROM mus_tracks WHERE album_id = ${albumId} AND deleted_at IS NULL)),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${albumId} AND deleted_at IS NULL
      `);
      logger.debug('Refreshed album stats', { albumId });
    } catch (error) {
      logger.error('Error refreshing album stats:', {
        error: error instanceof Error ? error.message : String(error),
        albumId,
      });
    }
  }

  async getNextTrackNumber(albumId: string): Promise<number> {
    try {
      const result = await this.db
        .select({
          maxTrackNumber: sql<number>`COALESCE(MAX(track_number), 0)`,
        })
        .from(tracks)
        .where(and(eq(tracks.albumId, albumId), isNull(tracks.deletedAt)));

      return (Number(result[0]?.maxTrackNumber) || 0) + 1;
    } catch (error) {
      logger.error('Failed to get next track number', {
        albumId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 1;
    }
  }

  async updateArtwork(albumId: string, artworkUrl: string): Promise<void> {
    try {
      await this.db
        .update(albums)
        .set({
          artworkUrl,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(albums.id, albumId), isNull(albums.deletedAt)));

      logger.info('Album artwork updated', { albumId });
    } catch (error) {
      logger.error('Failed to update album artwork', {
        albumId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async updateStatus(albumId: string, status: AlbumLifecycleStatus): Promise<void> {
    try {
      await this.db
        .update(albums)
        .set({
          status,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(albums.id, albumId), isNull(albums.deletedAt)));

      logger.info('Album status updated', { albumId, status });
    } catch (error) {
      logger.error('Failed to update album status', {
        albumId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async ensureValidVisibility(): Promise<{ updated: number }> {
    try {
      const result = await this.db.execute(sql`
        UPDATE mus_albums 
        SET visibility = ${CONTENT_VISIBILITY.PERSONAL}
        WHERE visibility IS NULL 
          OR visibility NOT IN (${CONTENT_VISIBILITY.SHARED}, ${CONTENT_VISIBILITY.PERSONAL}, ${CONTENT_VISIBILITY.PUBLIC})
      `);

      const totalUpdated = Number(result.rowCount || 0);
      logger.info('Album visibility validation complete', { updated: totalUpdated });
      return { updated: totalUpdated };
    } catch (error) {
      logger.error('Error validating album visibility', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private mapRowToAlbumEntity(row: Record<string, unknown>): AlbumEntity {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      title: row.title as string,
      userId: row.userId as string,
      displayName: (metadata.displayName as string) || '',
      genre: Array.isArray(row.genres) ? row.genres : [],
      releaseDate: row.releaseDate ? new Date(row.releaseDate as string) : undefined,
      totalDuration: row.totalDuration as number | undefined,
      trackCount: row.totalTracks as number | undefined,
      artworkUrl: row.artworkUrl as string | undefined,
      recordLabel: metadata.recordLabel as string | undefined,
      catalogNumber: metadata.catalogNumber as string | undefined,
      isCompilation: row.type === 'compilation',
      visibility: (row.visibility as ContentVisibility) || CONTENT_VISIBILITY.PERSONAL,
      chapterId: row.chapterId as string | undefined,
      status: (row.status as AlbumLifecycleStatus) || ALBUM_LIFECYCLE.DRAFT,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    };
  }

  private mapToUserAlbumEntity(row: AlbumSchema): Album {
    return Album.create({
      id: row.id,
      userId: row.userId,
      chapterId: row.chapterId ?? undefined,
      title: row.title,
      description: row.description || undefined,
      artworkUrl: row.artworkUrl || undefined,
      totalTracks: row.totalTracks || 0,
      totalDuration: row.totalDuration || 0,
      type: (row.type as 'album' | 'single' | 'ep' | 'compilation') || 'album',
      releaseDate: row.releaseDate ? new Date(row.releaseDate) : undefined,
      isExplicit: row.isExplicit || false,
      playCount: row.playCount || 0,
      mood: row.mood || undefined,
      genres: row.genres || [],
      status: (row.status as AlbumLifecycleStatus) || ALBUM_LIFECYCLE.DRAFT,
      metadata: (row.metadata as Record<string, unknown>) || {},
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    });
  }
}
