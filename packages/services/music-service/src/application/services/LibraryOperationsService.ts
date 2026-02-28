/**
 * LibraryOperationsService - CRUD operations for music library
 *
 * Storage structure (unified - all content lives under user folders):
 * - All tracks: uploads/user/{userId}/tracks/
 * - All artwork: uploads/user/{userId}/artworks/
 */

import { getLogger } from '../../config/service-urls';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { sql, eq } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { markFileAsOrphaned } from '@aiponge/shared-contracts/storage';
import { getOrCreateSinglesAlbumForUser, SINGLES_ALBUM_TITLE } from '../helpers/SinglesAlbumHelper';
import {
  APP,
  CONTENT_VISIBILITY,
  TRACK_LIFECYCLE,
  STORAGE_FILE_LIFECYCLE,
  type ContentVisibility,
} from '@aiponge/shared-contracts';

const logger = getLogger('music-service-library-operations');

/**
 * Get the workspace root directory where uploads folder lives.
 * Music service runs from packages/services/music-service, but uploads is at workspace root.
 */
function getWorkspaceRoot(): string {
  // Navigate up from packages/services/music-service to workspace root
  return path.resolve(process.cwd(), '..', '..', '..');
}

/**
 * Get the uploads directory at the workspace root level.
 */
function getUploadsRoot(): string {
  return path.join(getWorkspaceRoot(), 'uploads');
}

export interface TrackDetails {
  id: string;
  title: string;
  artworkUrl?: string;
  audioUrl?: string;
  duration?: number;
  genres?: string[];
  tags?: string[];
  isUserCreation?: boolean;
  displayName?: string;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
  createdAt?: Date;
  userId?: string;
  visibility?: ContentVisibility;
}

export interface DeleteTrackResult {
  success: boolean;
  trackId: string;
  filesDeleted: number;
  error?: string;
}

export class LibraryOperationsService {
  /**
   * Sanitize a filename by stripping query parameters and normalizing
   */
  private sanitizeFilename(filename: string): string {
    // Strip query parameters (e.g., ?token=abc)
    const withoutQuery = filename.split('?')[0];
    // Get just the filename without path
    return path.basename(withoutQuery);
  }

  /**
   * Delete a local file (best-effort, non-blocking)
   */
  private async deleteLocalFile(fileUrl: string): Promise<void> {
    try {
      // Skip remote URLs
      if (
        fileUrl.startsWith('http://') ||
        fileUrl.startsWith('https://') ||
        fileUrl.startsWith('s3://') ||
        fileUrl.startsWith('gs://')
      ) {
        return;
      }

      // Skip API endpoint URLs
      if (fileUrl.startsWith('/api/') || fileUrl.includes('/api/')) {
        return;
      }

      // Strip query parameters before building path
      const cleanUrl = fileUrl.split('?')[0];
      const uploadsRoot = getUploadsRoot();
      let filePath: string;
      if (cleanUrl.startsWith('/uploads/')) {
        filePath = path.join(uploadsRoot, cleanUrl.substring('/uploads/'.length));
      } else if (cleanUrl.startsWith('uploads/')) {
        filePath = path.join(uploadsRoot, cleanUrl.substring('uploads/'.length));
      } else {
        filePath = path.join(uploadsRoot, cleanUrl);
      }

      await fs.unlink(filePath);
      logger.info('Deleted local file after move', { fileUrl, filePath });
    } catch (error) {
      // Best-effort cleanup - don't fail the operation
      logger.warn('Failed to delete local file (will be orphaned)', {
        fileUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get track details - checks both shared and user tracks
   */
  async getTrackDetails(trackId: string): Promise<TrackDetails | null> {
    const db = getDatabase();

    // Query unified mus_tracks table with album visibility to determine content type
    const result = await db.execute(sql`
      SELECT 
        t.id,
        t.title,
        t.artwork_url,
        t.file_url as audio_url,
        t.duration,
        t.genres,
        t.lyrics_id,
        t.has_synced_lyrics,
        t.created_at,
        t.user_id,
        t.visibility,
        CASE WHEN t.visibility = ${CONTENT_VISIBILITY.PERSONAL} THEN true ELSE false END as is_user_creation,
        CASE WHEN t.visibility = ${CONTENT_VISIBILITY.PERSONAL} THEN COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), 'You') ELSE COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), '') END as display_name
      FROM mus_tracks t
      WHERE t.id = ${trackId}::uuid AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
      LIMIT 1
    `);

    const row = result.rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: row.id as string,
      title: row.title as string,
      artworkUrl: row.artwork_url as string | undefined,
      audioUrl: row.audio_url as string | undefined,
      duration: row.duration as number,
      genres: row.genres as string[],
      isUserCreation: row.is_user_creation as boolean,
      displayName: row.display_name as string,
      lyricsId: row.lyrics_id as string | undefined,
      hasSyncedLyrics: row.has_synced_lyrics as boolean,
      createdAt: row.created_at as Date,
      userId: row.user_id as string,
      visibility: row.visibility as ContentVisibility | undefined,
    };
  }

  /**
   * Delete a user track (soft delete) and clean up files
   * Also deletes thumbnails, updates stg_files registry, and removes associated lyrics
   */
  async deleteTrack(trackId: string, userId: string): Promise<DeleteTrackResult> {
    const db = getDatabase();

    const checkResult = await db.execute(sql`
      SELECT t.id, t.file_url, t.artwork_url, t.lyrics_id
      FROM mus_tracks t
      WHERE t.id = ${trackId} AND t.user_id = ${userId} AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL} AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
      LIMIT 1
    `);

    const track = checkResult.rows?.[0] as
      | { id: string; file_url?: string; artwork_url?: string; lyrics_id?: string }
      | undefined;
    if (!track) {
      return { success: false, trackId, filesDeleted: 0, error: 'Track not found' };
    }

    // Check if files are still used by promoted copies before deleting
    // Promoted tracks share file_url with their source, so we must not delete files still in use
    const filesToCheck = [track.file_url, track.artwork_url].filter(Boolean) as string[];
    const filesToDelete: string[] = [];

    for (const url of filesToCheck) {
      const urlStr = String(url);
      // Check if any other active track uses this file URL
      const otherUsersResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM mus_tracks 
        WHERE (file_url = ${urlStr} OR artwork_url = ${urlStr})
          AND id != ${trackId} 
          AND status = ${TRACK_LIFECYCLE.ACTIVE}
      `);
      const otherUsersCount = Number(otherUsersResult.rows?.[0]?.count || 0);
      if (otherUsersCount === 0) {
        filesToDelete.push(urlStr);
      } else {
        logger.info('Skipping file deletion - still used by promoted copies', {
          trackId,
          fileUrl: urlStr,
          otherUsersCount,
        });
      }
    }

    // Delete physical files only if not used by other tracks
    let filesDeleted = 0;
    const uploadsRoot = getUploadsRoot();
    for (const urlStr of filesToDelete) {
      try {
        const filePath = path.join(uploadsRoot, urlStr.replace('/uploads/', ''));
        await fs.unlink(filePath);
        filesDeleted++;

        // Also delete thumbnail if it's an image
        if (/\.(webp|jpg|jpeg|png|gif)$/i.test(filePath)) {
          const thumbPath = filePath.replace(/\.(webp|jpg|jpeg|png|gif)$/i, '_thumb.webp');
          try {
            await fs.unlink(thumbPath);
            filesDeleted++;
          } catch (thumbError) {
            logger.debug('Thumbnail not found or already deleted (non-blocking)', { thumbPath });
          }
        }
      } catch (fileError) {
        logger.debug('File already gone or inaccessible (non-blocking)', {
          file: urlStr,
          error: fileError instanceof Error ? fileError.message : String(fileError),
        });
      }
    }

    // Mark files as deleted in stg_files registry only for files we actually deleted
    try {
      for (const urlStr of filesToDelete) {
        const storagePath = urlStr.replace(/^\/uploads\//, '').split('?')[0];
        // Strip extension to match both main file and thumbnail (_thumb.webp)
        const baseStoragePath = storagePath.replace(/\.(webp|jpg|jpeg|png|gif|mp3|wav|m4a|ogg)$/i, '');
        await db.execute(sql`
          UPDATE stg_files SET status = ${STORAGE_FILE_LIFECYCLE.DELETED}, updated_at = NOW()
          WHERE storage_path LIKE ${baseStoragePath + '%'}
        `);
      }
    } catch (error) {
      logger.warn('Failed to update stg_files registry', {
        trackId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Soft delete track FIRST (and clear lyrics reference) before deleting lyrics
    // This ensures if lyrics deletion fails, we don't have a track pointing to deleted lyrics
    const lyricsId = track.lyrics_id;
    await db.execute(sql`
      UPDATE mus_tracks SET status = ${TRACK_LIFECYCLE.DELETED}, lyrics_id = NULL, updated_at = NOW()
      WHERE id = ${trackId} AND user_id = ${userId}
    `);

    // Clean up playlist references and update playlist totals
    try {
      const affectedPlaylists = await db.execute(sql`
        DELETE FROM mus_playlist_tracks 
        WHERE track_id = ${trackId}
        RETURNING playlist_id
      `);

      // Update total_tracks for affected playlists
      if (affectedPlaylists.rows && affectedPlaylists.rows.length > 0) {
        const playlistIds = [...new Set(affectedPlaylists.rows.map((r: Record<string, unknown>) => r.playlist_id as string))];
        for (const playlistId of playlistIds) {
          await db.execute(sql`
            UPDATE mus_playlists 
            SET total_tracks = (SELECT COUNT(*) FROM mus_playlist_tracks WHERE playlist_id = ${playlistId}),
                updated_at = NOW()
            WHERE id = ${playlistId}
          `);
        }
        logger.info('Cleaned up playlist references', { trackId, playlistsUpdated: playlistIds.length });
      }
    } catch (error) {
      logger.warn('Failed to clean up playlist references', {
        trackId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (lyricsId) {
      try {
        const { UnifiedLyricsRepository } = await import('../../infrastructure/database/UnifiedLyricsRepository');
        const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
        const lyricsRepo = new UnifiedLyricsRepository(getDatabase());
        await lyricsRepo.delete(lyricsId);
        logger.info('Associated lyrics deleted', { trackId, lyricsId });
      } catch (error) {
        logger.warn('Failed to delete associated lyrics (orphaned lyrics may exist)', {
          trackId,
          lyricsId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Handle orphaned promoted copies: clear sourceTrackId reference
    // This prevents promoted copies from pointing to deleted original tracks
    try {
      const orphanedResult = await db.execute(sql`
        UPDATE mus_tracks 
        SET metadata = metadata - 'sourceTrackId', updated_at = NOW()
        WHERE metadata->>'sourceTrackId' = ${trackId}
        RETURNING id
      `);
      const orphanedCount = orphanedResult.rows?.length || 0;
      if (orphanedCount > 0) {
        logger.info('Cleared sourceTrackId references from promoted copies', {
          originalTrackId: trackId,
          orphanedCopiesUpdated: orphanedCount,
        });
      }
    } catch (error) {
      logger.warn('Failed to clear sourceTrackId references', {
        trackId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info('Track deleted', { trackId, filesDeleted, lyricsDeleted: !!lyricsId });
    return { success: true, trackId, filesDeleted };
  }

  /**
   * Update display name in metadata for all user's tracks
   * Display name is stored in metadata.displayName for music content attribution
   */
  async bulkUpdateDisplayName(userId: string, displayName: string): Promise<number> {
    const db = getDatabase();

    const result = await db.execute(sql`
      UPDATE mus_tracks t
      SET metadata = jsonb_set(COALESCE(t.metadata, '{}'::jsonb), '{displayName}', ${JSON.stringify(displayName)}::jsonb),
          updated_at = NOW()
      WHERE t.user_id = ${userId} AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL} AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
    `);
    return result.rowCount || 0;
  }

  /**
   * Record a track play - simple version
   */
  async recordTrackPlay(
    trackId: string,
    userId: string,
    duration?: number,
    options?: { completionRate?: number; context?: object; deviceType?: string; sessionId?: string }
  ): Promise<void> {
    const db = getDatabase();

    await db.execute(sql`
      INSERT INTO mus_recently_played (user_id, track_id, played_at, duration, completion_rate, context, device_type, session_id)
      VALUES (
        ${userId},
        ${trackId},
        NOW(),
        ${duration || 0},
        ${String(options?.completionRate ?? 0)},
        ${options?.context ? JSON.stringify(options.context) : '{}'}::jsonb,
        ${options?.deviceType || null},
        ${options?.sessionId || null}
      )
    `);

    // Increment play count on unified mus_tracks table
    await db.execute(sql`UPDATE mus_tracks SET play_count = COALESCE(play_count, 0) + 1 WHERE id = ${trackId}`);
  }

  /**
   * Get IDs of tracks the user has liked
   */
  async getLikedTrackIds(userId: string): Promise<string[]> {
    const db = getDatabase();
    const result = await db.execute(sql`
      SELECT track_id FROM mus_favorite_tracks WHERE user_id = ${userId}
    `);
    return (result.rows || []).map((row: Record<string, unknown>) => row.track_id as string);
  }

  /**
   * Like a track
   */
  async likeTrack(trackId: string, userId: string): Promise<boolean> {
    const db = getDatabase();

    // Use upsert pattern - ignore if already liked
    await db.execute(sql`
      INSERT INTO mus_favorite_tracks (id, user_id, track_id, added_at)
      VALUES (${uuidv4()}, ${userId}, ${trackId}, NOW())
      ON CONFLICT (user_id, track_id) DO NOTHING
    `);

    // Update like count
    await db.execute(sql`UPDATE mus_tracks SET like_count = COALESCE(like_count, 0) + 1 WHERE id = ${trackId}`);

    return true;
  }

  /**
   * Unlike a track
   */
  async unlikeTrack(trackId: string, userId: string): Promise<boolean> {
    const db = getDatabase();

    const result = await db.execute(sql`
      DELETE FROM mus_favorite_tracks WHERE user_id = ${userId} AND track_id = ${trackId}
    `);

    if (result.rowCount && result.rowCount > 0) {
      await db.execute(
        sql`UPDATE mus_tracks SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0) WHERE id = ${trackId}`
      );
    }

    return true;
  }

  /**
   * Update track artwork - replaces old artwork with new one
   * Deletes old artwork file from storage if it exists locally
   */
  async updateTrackArtwork(
    trackId: string,
    userId: string,
    newArtworkUrl: string
  ): Promise<{ success: boolean; oldArtworkUrl?: string; error?: string }> {
    const db = getDatabase();

    const checkResult = await db.execute(sql`
      SELECT t.id, t.artwork_url
      FROM mus_tracks t
      WHERE t.id = ${trackId} AND t.user_id = ${userId} AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL} AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
      LIMIT 1
    `);

    const track = checkResult.rows?.[0] as { id: string; artwork_url?: string } | undefined;
    if (!track) {
      return { success: false, error: 'Track not found or not owned by user' };
    }

    const oldArtworkUrl = track.artwork_url;

    // Mark old artwork file as orphaned (will be cleaned up after 24h grace period)
    if (oldArtworkUrl && String(oldArtworkUrl).includes('/uploads/')) {
      try {
        const orphanResult = await markFileAsOrphaned(String(oldArtworkUrl));
        if (orphanResult.success) {
          logger.info('Marked old artwork as orphaned', { oldArtworkUrl, trackId, marked: orphanResult.marked });
        } else {
          logger.warn('Failed to mark old artwork as orphaned', {
            oldArtworkUrl,
            error: orphanResult.error,
          });
        }
      } catch (error) {
        logger.warn('Error calling orphan marking service', {
          error: error instanceof Error ? error.message : String(error),
          oldArtworkUrl,
        });
        // Continue anyway - orphan marking is best-effort
      }
    }

    // Update track with new artwork URL (unified mus_tracks table)
    await db.execute(sql`
      UPDATE mus_tracks 
      SET artwork_url = ${newArtworkUrl}, updated_at = NOW()
      WHERE id = ${trackId} AND user_id = ${userId}
    `);

    logger.info('Track artwork updated', { trackId, newArtworkUrl });
    return { success: true, oldArtworkUrl };
  }

  /**
   * Share a user track to the public shared library (creates a copy)
   * Any user can share their own tracks
   * Files in user folders are copied to shared folders
   */
  async shareUserTrackToPublicLibrary(
    trackId: string,
    userId: string
  ): Promise<{ success: boolean; sharedTrackId?: string; error?: string }> {
    const db = getDatabase();

    const trackResult = await db.execute(sql`
      SELECT t.id, t.title, t.file_url, t.artwork_url, t.duration, t.lyrics_id, 
             t.has_synced_lyrics, t.genres, t.tags, COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), 'You') as display_name, 
             t.file_size, t.mime_type
      FROM mus_tracks t
      WHERE t.id = ${trackId} AND t.user_id = ${userId} AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL} AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
      LIMIT 1
    `);

    const track = trackResult.rows?.[0] as Record<string, unknown> | undefined;
    if (!track) {
      return { success: false, error: 'Track not found or not owned by user' };
    }

    // Check if this user track has already been shared by looking up sourceTrackId in metadata
    // This provides a stable reference independent of title changes
    const alreadySharedResult = await db.execute(sql`
      SELECT id FROM mus_tracks 
      WHERE metadata->>'sourceTrackId' = ${trackId}
        AND status = ${TRACK_LIFECYCLE.PUBLISHED}
      LIMIT 1
    `);
    if (alreadySharedResult.rows?.length > 0) {
      return {
        success: false,
        error: 'This track has already been shared to the library',
        sharedTrackId: (alreadySharedResult.rows[0] as Record<string, unknown>).id as string,
      };
    }

    const newTrackId = uuidv4();

    const { albumId: singlesAlbumId, userId: defaultUserId } = await getOrCreateSinglesAlbumForUser(userId);

    const sharedFileUrl = String(track.file_url);
    const sharedArtworkUrl = track.artwork_url ? String(track.artwork_url) : null;

    const displayName = track.display_name || '';

    // Create shared track (copy) with new file URLs and link to source user track
    // Use raw SQL for insert to handle id and store sourceTrackId in metadata
    const genresArray = Array.isArray(track.genres)
      ? track.genres.filter((g: unknown): g is string => typeof g === 'string')
      : [];
    const tagsArray = Array.isArray(track.tags)
      ? track.tags.filter((t: unknown): t is string => typeof t === 'string')
      : [];

    // Store source track ID in metadata for promotion tracking
    const trackMetadata = {
      displayName,
      sourceTrackId: trackId,
      promotedAt: new Date().toISOString(),
    };

    await db.execute(sql`
      INSERT INTO mus_tracks (
        id, title, user_id, album_id, duration, file_url, artwork_url, lyrics_id,
        has_synced_lyrics, genres, tags, status, quality, file_size, mime_type,
        play_count, generated_by_user_id, metadata
      ) VALUES (
        ${newTrackId}, ${track.title}, ${userId}, ${singlesAlbumId}, ${track.duration},
        ${sharedFileUrl}, ${sharedArtworkUrl}, ${track.lyrics_id},
        ${track.has_synced_lyrics || false}, ${genresArray}::text[], ${tagsArray}::text[],
        ${TRACK_LIFECYCLE.PUBLISHED}, 'standard', ${track.file_size}, ${track.mime_type || 'audio/mpeg'},
        0, ${userId}, ${JSON.stringify(trackMetadata)}::jsonb
      )
    `);

    // Update singles album track count
    await db.execute(sql`
      UPDATE mus_albums 
      SET total_tracks = (SELECT COUNT(*) FROM mus_tracks WHERE album_id = ${singlesAlbumId}),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${singlesAlbumId}
    `);

    logger.info('User track shared to public library', {
      originalTrackId: trackId,
      sharedTrackId: newTrackId,
      albumId: singlesAlbumId,
      originalFileUrl: track.file_url,
      sharedFileUrl,
      sourceUserTrackId: trackId,
      userId,
    });

    return { success: true, sharedTrackId: newTrackId };
  }

  /**
   * Unpromote/unshare a user track from the public shared library
   * Removes the shared copy, the original personal track remains intact
   * Files are soft-deleted and handled by existing orphan cleanup processes
   */
  async unshareUserTrackFromPublicLibrary(
    trackId: string,
    userId: string
  ): Promise<{ success: boolean; deletedTrackId?: string; error?: string }> {
    const db = getDatabase();

    const originalTrackResult = await db.execute(sql`
      SELECT t.id, t.user_id
      FROM mus_tracks t
      WHERE t.id = ${trackId} AND t.user_id = ${userId} AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL} AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
      LIMIT 1
    `);

    const originalTrack = originalTrackResult.rows?.[0] as Record<string, unknown> | undefined;
    if (!originalTrack) {
      return { success: false, error: 'Original track not found or not owned by user' };
    }

    const sharedTrackResult = await db.execute(sql`
      SELECT t.id, t.album_id
      FROM mus_tracks t
      WHERE t.metadata->>'sourceTrackId' = ${trackId}
        AND t.visibility = ${CONTENT_VISIBILITY.SHARED}
        AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
      LIMIT 1
    `);

    if (!sharedTrackResult.rows?.length) {
      return { success: false, error: 'Track has not been shared to the library' };
    }

    const sharedTrack = sharedTrackResult.rows[0] as Record<string, unknown>;
    const sharedTrackId = sharedTrack.id as string;
    const albumId = sharedTrack.album_id as string;

    await db.execute(sql`
      UPDATE mus_tracks SET status = ${TRACK_LIFECYCLE.DELETED}, updated_at = NOW()
      WHERE id = ${sharedTrackId}
    `);

    if (albumId) {
      await db.execute(sql`
        UPDATE mus_albums SET total_tracks = GREATEST(0, total_tracks - 1), updated_at = NOW()
        WHERE id = ${albumId}
      `);
    }

    logger.info('Track unshared from public library', {
      originalTrackId: trackId,
      deletedTrackId: sharedTrackId,
      userId,
    });

    return { success: true, deletedTrackId: sharedTrackId };
  }

  /**
   * Move a user track to the public shared library (admin only)
   * This moves the track, not copies - original is marked as deleted and files are cleaned up
   * Files in user folders are copied to shared folders then deleted
   */
  async moveUserTrackToPublicLibrary(
    trackId: string,
    adminUserId: string
  ): Promise<{ success: boolean; sharedTrackId?: string; error?: string }> {
    const db = getDatabase();

    const trackResult = await db.execute(sql`
      SELECT t.id, t.user_id, t.title, t.file_url, t.artwork_url, t.duration, t.lyrics_id, 
             t.has_synced_lyrics, t.genres, t.tags, COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), 'You') as display_name,
             t.file_size, t.mime_type
      FROM mus_tracks t
      WHERE t.id = ${trackId} AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL} AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
      LIMIT 1
    `);

    const track = trackResult.rows?.[0] as Record<string, unknown> | undefined;
    if (!track) {
      return { success: false, error: 'Track not found' };
    }

    // Check if this user track has already been moved by looking up the source_user_track_id
    // This provides a stable reference independent of title changes
    const alreadyMovedResult = await db.execute(sql`
      SELECT id FROM mus_tracks 
      WHERE source_user_track_id = ${trackId}
        AND status = ${TRACK_LIFECYCLE.PUBLISHED}
      LIMIT 1
    `);
    if (alreadyMovedResult.rows?.length > 0) {
      return {
        success: false,
        error: 'This track has already been moved to the library',
        sharedTrackId: (alreadyMovedResult.rows[0] as Record<string, unknown>).id as string,
      };
    }

    // Store original file URLs for cleanup after successful move
    const originalFileUrl = String(track.file_url);
    const originalArtworkUrl = track.artwork_url ? String(track.artwork_url) : null;

    const newTrackId = uuidv4();

    const { albumId: singlesAlbumId, userId: defaultUserId } = await getOrCreateSinglesAlbumForUser(adminUserId);

    const sharedFileUrl = originalFileUrl;
    const sharedArtworkUrl = originalArtworkUrl;

    const displayName = track.display_name || '';

    // Create shared track with new file URLs and link to source user track
    // Use raw SQL for insert to handle id and store sourceTrackId in metadata
    const genresArray = Array.isArray(track.genres)
      ? track.genres.filter((g: unknown): g is string => typeof g === 'string')
      : [];
    const tagsArray = Array.isArray(track.tags)
      ? track.tags.filter((t: unknown): t is string => typeof t === 'string')
      : [];

    // Store source track ID and move metadata for admin operations
    const trackMetadata = {
      displayName,
      sourceTrackId: trackId,
      movedBy: adminUserId,
      movedAt: new Date().toISOString(),
    };

    await db.execute(sql`
      INSERT INTO mus_tracks (
        id, title, user_id, album_id, duration, file_url, artwork_url, lyrics_id,
        has_synced_lyrics, genres, tags, status, quality, file_size, mime_type,
        play_count, generated_by_user_id, metadata
      ) VALUES (
        ${newTrackId}, ${track.title}, ${track.user_id}, ${singlesAlbumId}, ${track.duration},
        ${sharedFileUrl}, ${sharedArtworkUrl}, ${track.lyrics_id},
        ${track.has_synced_lyrics || false}, ${genresArray}::text[], ${tagsArray}::text[],
        ${TRACK_LIFECYCLE.PUBLISHED}, 'standard', ${track.file_size}, ${track.mime_type || 'audio/mpeg'},
        0, ${track.user_id}, ${JSON.stringify(trackMetadata)}::jsonb
      )
    `);

    // Update singles album track count
    await db.execute(sql`
      UPDATE mus_albums 
      SET total_tracks = (SELECT COUNT(*) FROM mus_tracks WHERE album_id = ${singlesAlbumId}),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${singlesAlbumId}
    `);

    // Mark original as moved (unified mus_tracks table)
    await db.execute(sql`
      UPDATE mus_tracks SET status = 'moved_to_shared', updated_at = NOW()
      WHERE id = ${trackId}
    `);

    logger.info('User track moved to public library by admin', {
      originalTrackId: trackId,
      sharedTrackId: newTrackId,
      originalOwner: track.user_id,
      fileUrl: sharedFileUrl,
      adminUserId,
    });

    return { success: true, sharedTrackId: newTrackId };
  }

  /**
   * Delete a track from the shared library (admin only)
   * Soft-deletes the track and cleans up associated files (including thumbnails) and lyrics
   */
  async deleteSharedTrack(
    trackId: string,
    adminUserId: string
  ): Promise<{ success: boolean; trackId?: string; error?: string }> {
    const db = getDatabase();

    // Get track details from shared library (mus_tracks)
    const trackResult = await db.execute(sql`
      SELECT id, file_url, artwork_url, lyrics_id
      FROM mus_tracks 
      WHERE id = ${trackId} AND status = ${TRACK_LIFECYCLE.PUBLISHED}
      LIMIT 1
    `);

    const track = trackResult.rows?.[0] as
      | { id: string; file_url?: string; artwork_url?: string; lyrics_id?: string }
      | undefined;
    if (!track) {
      return { success: false, error: 'Track not found in shared library' };
    }

    // Delete physical files (best-effort, including thumbnails)
    let filesDeleted = 0;
    for (const url of [track.file_url, track.artwork_url].filter(Boolean)) {
      try {
        const urlStr = String(url);
        await this.deleteLocalFile(urlStr);
        filesDeleted++;

        // Also delete thumbnail if it's an image
        if (/\.(webp|jpg|jpeg|png|gif)$/i.test(urlStr)) {
          const thumbUrl = urlStr.replace(/\.(webp|jpg|jpeg|png|gif)$/i, '_thumb.webp');
          try {
            await this.deleteLocalFile(thumbUrl);
            filesDeleted++;
          } catch (thumbError) {
            logger.debug('Thumbnail not found or already deleted (non-blocking)', { thumbUrl });
          }
        }
      } catch (fileError) {
        logger.debug('File deletion failed (non-blocking)', {
          error: fileError instanceof Error ? fileError.message : String(fileError),
        });
      }
    }

    // Mark files as deleted in stg_files registry (if tracked)
    try {
      for (const url of [track.file_url, track.artwork_url].filter(Boolean)) {
        const urlStr = String(url);
        const storagePath = urlStr.replace(/^\/uploads\//, '').split('?')[0];
        // Strip extension to match both main file and thumbnail (_thumb.webp)
        const baseStoragePath = storagePath.replace(/\.(webp|jpg|jpeg|png|gif|mp3|wav|m4a|ogg)$/i, '');
        await db.execute(sql`
          UPDATE stg_files SET status = ${STORAGE_FILE_LIFECYCLE.DELETED}, updated_at = NOW()
          WHERE storage_path LIKE ${baseStoragePath + '%'}
        `);
      }
    } catch (error) {
      logger.warn('Failed to update stg_files registry', {
        trackId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Soft delete track FIRST (and clear lyrics reference) before deleting lyrics
    // This ensures if lyrics deletion fails, we don't have a track pointing to deleted lyrics
    const lyricsId = track.lyrics_id;
    await db.execute(sql`
      UPDATE mus_tracks SET status = ${TRACK_LIFECYCLE.DELETED}, lyrics_id = NULL, updated_at = NOW()
      WHERE id = ${trackId}
    `);

    // Clean up playlist references and update playlist totals
    try {
      const affectedPlaylists = await db.execute(sql`
        DELETE FROM mus_playlist_tracks 
        WHERE track_id = ${trackId}
        RETURNING playlist_id
      `);

      // Update total_tracks for affected playlists
      if (affectedPlaylists.rows && affectedPlaylists.rows.length > 0) {
        const playlistIds = [...new Set(affectedPlaylists.rows.map((r: Record<string, unknown>) => r.playlist_id as string))];
        for (const playlistId of playlistIds) {
          await db.execute(sql`
            UPDATE mus_playlists 
            SET total_tracks = (SELECT COUNT(*) FROM mus_playlist_tracks WHERE playlist_id = ${playlistId}),
                updated_at = NOW()
            WHERE id = ${playlistId}
          `);
        }
        logger.info('Cleaned up playlist references', { trackId, playlistsUpdated: playlistIds.length });
      }
    } catch (error) {
      logger.warn('Failed to clean up playlist references', {
        trackId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (lyricsId) {
      try {
        const { UnifiedLyricsRepository } = await import('../../infrastructure/database/UnifiedLyricsRepository');
        const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
        const lyricsRepo = new UnifiedLyricsRepository(getDatabase());
        await lyricsRepo.delete(lyricsId);
        logger.info('Associated lyrics deleted', { trackId, lyricsId });
      } catch (error) {
        logger.warn('Failed to delete associated lyrics (orphaned lyrics may exist)', {
          trackId,
          lyricsId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Shared track deleted by admin', {
      trackId,
      filesDeleted,
      lyricsDeleted: !!lyricsId,
      adminUserId,
    });

    return { success: true, trackId };
  }
}

export const libraryOperationsService = new LibraryOperationsService();
