/**
 * DrizzleUserTrackRepository - PostgreSQL implementation for tracks
 * Uses unified mus_tracks table with visibility column for access control
 *
 * Post-consolidation: Supports both personal and shared tracks through
 * visibility filtering. Personal tracks use visibility = 'personal'.
 */

import { eq, desc, and, sql, isNull } from 'drizzle-orm';
import { Track } from '../../domains/music-catalog/entities/Track';
import { tracks } from '../../schema/music-schema';
import { getLogger } from '../../config/service-urls';
import type { DatabaseConnection } from './DatabaseConnectionFactory';
import { MusicError } from '../../application/errors';
import { CONTENT_VISIBILITY, type ContentVisibility } from '@aiponge/shared-contracts';

const logger = getLogger('music-service-drizzleusertrackrepository');

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

  throw lastError ?? MusicError.internalError(`${operationName} failed`);
}

export class DrizzleUserTrackRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async save(track: Track): Promise<Track> {
    try {
      const trackData = track.toJSON();

      logger.info('Saving user track to database', {
        module: 'drizzle_user_track_repository',
        operation: 'save',
        trackId: trackData.id,
        userId: trackData.userId,
        title: trackData.title,
        sourceType: trackData.sourceType,
        fileUrl: trackData.fileUrl,
        phase: 'save_started',
      });

      if (!trackData.id || !trackData.userId || !trackData.fileUrl) {
        const missingFields = [];
        if (!trackData.id) missingFields.push('id');
        if (!trackData.userId) missingFields.push('userId');
        if (!trackData.fileUrl) missingFields.push('fileUrl');

        logger.error('Missing required fields for user track', {
          module: 'drizzle_user_track_repository',
          operation: 'save',
          missingFields,
          trackData: JSON.stringify(trackData, null, 2),
          phase: 'validation_failed',
        });
        throw MusicError.invalidTrackData(`Missing required fields: ${missingFields.join(', ')}`);
      }

      if (trackData.fileUrl.includes('_normalize_effect_effect_master')) {
        logger.warn('File URL contains processing effects suffix - this may indicate a problem', {
          module: 'drizzle_user_track_repository',
          operation: 'save',
          trackId: trackData.id,
          fileUrl: trackData.fileUrl,
          phase: 'url_validation_warning',
        });
      }

      const isAbsoluteUrl = trackData.fileUrl.startsWith('http://') || trackData.fileUrl.startsWith('https://');
      const isRelativePath = trackData.fileUrl.startsWith('/');

      if (isAbsoluteUrl) {
        try {
          new URL(trackData.fileUrl);
        } catch (urlError) {
          logger.error('Invalid absolute URL format', {
            module: 'drizzle_user_track_repository',
            operation: 'save',
            trackId: trackData.id,
            fileUrl: trackData.fileUrl,
            error: urlError instanceof Error ? urlError.message : String(urlError),
            phase: 'url_validation_failed',
          });
          throw MusicError.invalidTrackData(`Invalid file URL format: ${trackData.fileUrl}`);
        }
      } else if (!isRelativePath) {
        logger.error('Invalid file path format - must be absolute URL or relative path', {
          module: 'drizzle_user_track_repository',
          operation: 'save',
          trackId: trackData.id,
          fileUrl: trackData.fileUrl,
          phase: 'url_validation_failed',
        });
        throw MusicError.invalidTrackData(
          `Invalid file path format (must start with / or http(s)://): ${trackData.fileUrl}`
        );
      }

      const insertData: Partial<typeof tracks.$inferInsert> = {
        id: trackData.id,
        userId: trackData.userId,
        title: trackData.title,
        fileUrl: trackData.fileUrl,
        mimeType: trackData.mimeType || 'audio/mpeg',
        quality: trackData.quality || 'high',
        status: trackData.status,
        visibility: trackData.visibility || CONTENT_VISIBILITY.PERSONAL,
        metadata: trackData.metadata || {},
        sourceType: trackData.sourceType || 'generated',
      };

      insertData.duration = trackData.duration ?? 0;
      insertData.fileSize = trackData.fileSize ?? 0;
      insertData.playCount = trackData.playCount ?? 0;
      insertData.likeCount = trackData.likeCount ?? 0;
      insertData.language = trackData.language || 'en';

      if (trackData.artworkUrl) insertData.artworkUrl = trackData.artworkUrl;
      if (trackData.generationRequestId) insertData.generationRequestId = trackData.generationRequestId;
      if (trackData.generatedByUserId) insertData.generatedByUserId = trackData.generatedByUserId;
      if (trackData.genres && trackData.genres.length > 0) insertData.genres = trackData.genres;
      if (trackData.lyricsId) insertData.lyricsId = trackData.lyricsId;
      if (trackData.hasSyncedLyrics !== undefined) insertData.hasSyncedLyrics = trackData.hasSyncedLyrics;
      if (trackData.albumId) insertData.albumId = trackData.albumId;
      if (trackData.trackNumber) insertData.trackNumber = trackData.trackNumber;
      insertData.generationNumber = trackData.generationNumber ?? 1;
      if (trackData.variantGroupId) insertData.variantGroupId = trackData.variantGroupId;
      if (trackData.playOnDate) insertData.playOnDate = trackData.playOnDate;
      if (trackData.createdAt) insertData.createdAt = trackData.createdAt;
      if (trackData.updatedAt) insertData.updatedAt = trackData.updatedAt;

      logger.info('Attempting database insert', {
        module: 'drizzle_user_track_repository',
        operation: 'save',
        trackId: trackData.id,
        insertDataKeys: Object.keys(insertData),
        phase: 'insert_attempt',
      });

      await withDbRetry(() => this.db.insert(tracks).values(insertData as typeof tracks.$inferInsert), 'saveTrack');

      logger.info('User track saved successfully', {
        module: 'drizzle_user_track_repository',
        operation: 'save',
        trackId: trackData.id,
        userId: trackData.userId,
        phase: 'save_completed',
      });

      return track;
    } catch (error) {
      logger.error('CRITICAL: Failed to save user track to database', {
        module: 'drizzle_user_track_repository',
        operation: 'save',
        trackId: track.id,
        userId: track.userId,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : 'Unknown',
        },
        trackData: JSON.stringify(track.toJSON(), null, 2),
        phase: 'save_failed',
      });
      throw error;
    }
  }

  async findById(id: string): Promise<Track | null> {
    const result = await this.db
      .select()
      .from(tracks)
      .where(and(eq(tracks.id, id), isNull(tracks.deletedAt)))
      .limit(1);

    return result[0] ? this.mapToEntity(result[0]) : null;
  }

  async findByUserId(userId: string, limit?: number, offset?: number): Promise<Track[]> {
    const query = this.db
      .select()
      .from(tracks)
      .where(
        and(
          eq(tracks.userId, userId),
          isNull(tracks.deletedAt),
          sql`(COALESCE(${tracks.albumId}::text, ''), COALESCE(${tracks.trackNumber}, 0), ${tracks.generationNumber}) IN (
            SELECT COALESCE(album_id::text, ''), COALESCE(track_number, 0), MAX(generation_number)
            FROM mus_tracks
            WHERE user_id = ${userId} AND deleted_at IS NULL
            GROUP BY COALESCE(album_id::text, ''), COALESCE(track_number, 0)
          )`
        )
      )
      .orderBy(desc(tracks.createdAt))
      .$dynamic();

    const limitedQuery = limit ? query.limit(Math.min(limit || 20, 100)) : query;
    const paginatedQuery = offset ? limitedQuery.offset(offset) : limitedQuery;

    const results = await paginatedQuery;
    return results.map(row => this.mapToEntity(row));
  }

  async findByAlbumId(albumId: string): Promise<Track[]> {
    const results = await this.db
      .select()
      .from(tracks)
      .where(
        and(
          eq(tracks.albumId, albumId),
          isNull(tracks.deletedAt),
          sql`(${tracks.trackNumber}, ${tracks.generationNumber}) IN (
            SELECT track_number, MAX(generation_number)
            FROM mus_tracks
            WHERE album_id = ${albumId} AND deleted_at IS NULL
            GROUP BY track_number
          )`
        )
      )
      .orderBy(tracks.trackNumber);

    return results.map(row => this.mapToEntity(row));
  }

  async updateAlbumLink(trackId: string, albumId: string, trackNumber?: number): Promise<void> {
    try {
      const updateData: Partial<typeof tracks.$inferInsert> = {
        albumId: albumId,
      };
      if (trackNumber !== undefined) {
        updateData.trackNumber = trackNumber;
      }

      await this.db
        .update(tracks)
        .set(updateData)
        .where(and(eq(tracks.id, trackId), isNull(tracks.deletedAt)));

      logger.info('Track album link updated', {
        module: 'drizzle_user_track_repository',
        operation: 'updateAlbumLink',
        trackId,
        albumId,
        trackNumber,
      });
    } catch (error) {
      logger.error('Failed to update track album link', {
        module: 'drizzle_user_track_repository',
        operation: 'updateAlbumLink',
        trackId,
        albumId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async updateHasSyncedLyrics(trackId: string, hasSyncedLyrics: boolean): Promise<void> {
    try {
      await this.db
        .update(tracks)
        .set({ hasSyncedLyrics })
        .where(and(eq(tracks.id, trackId), isNull(tracks.deletedAt)));

      logger.info('Track hasSyncedLyrics updated', {
        module: 'drizzle_user_track_repository',
        operation: 'updateHasSyncedLyrics',
        trackId,
        hasSyncedLyrics,
      });
    } catch (error) {
      logger.error('Failed to update hasSyncedLyrics', {
        module: 'drizzle_user_track_repository',
        operation: 'updateHasSyncedLyrics',
        trackId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private mapToEntity(row: Record<string, unknown>): Track {
    const r = row as Record<string, unknown>;
    return Track.create({
      id: r.id as string | undefined,
      userId: (r.user_id ?? r.userId) as string,
      title: r.title as string,
      fileUrl: (r.file_url ?? r.fileUrl) as string,
      artworkUrl: (r.artwork_url ?? r.artworkUrl) as string | undefined,
      duration: r.duration as number | undefined,
      fileSize: (r.file_size ?? r.fileSize) as number | undefined,
      mimeType: (r.mime_type ?? r.mimeType) as string | undefined,
      quality: (r.quality ?? 'high') as string,
      status: r.status as import('@aiponge/shared-contracts').TrackLifecycleStatus | undefined,
      visibility: (r.visibility ?? CONTENT_VISIBILITY.PERSONAL) as
        | import('@aiponge/shared-contracts').ContentVisibility
        | undefined,
      metadata: r.metadata as Record<string, unknown> | undefined,
      sourceType: (r.source_type ?? r.sourceType ?? 'generated') as never,
      generationRequestId: (r.generation_request_id ?? r.generationRequestId) as string | undefined,
      generatedByUserId: (r.generated_by_user_id ?? r.generatedByUserId) as string | undefined,
      genres: (r.genres ?? []) as string[],
      language: (r.language ?? 'en') as string,
      variantGroupId: (r.variant_group_id ?? r.variantGroupId) as string | undefined,
      lyricsId: (r.lyrics_id ?? r.lyricsId) as string | undefined,
      hasSyncedLyrics: (r.has_synced_lyrics ?? r.hasSyncedLyrics ?? false) as boolean | undefined,
      albumId: (r.album_id ?? r.albumId) as string | undefined,
      trackNumber: (r.track_number ?? r.trackNumber) as number | undefined,
      generationNumber: (r.generation_number ?? r.generationNumber ?? 1) as number,
      playCount: (r.play_count ?? r.playCount ?? 0) as number,
      likeCount: (r.like_count ?? r.likeCount ?? 0) as number,
      playOnDate: (r.play_on_date ?? r.playOnDate ?? null) as Date | null | undefined,
      createdAt: (r.created_at ?? r.createdAt) as Date | undefined,
      updatedAt: (r.updated_at ?? r.updatedAt) as Date | undefined,
    });
  }
}
