/**
 * Library Album Routes - Album management endpoints
 * Split from library-routes.ts for maintainability
 *
 * Visibility-aware ABAC: All routes use centralized canEditContent/canDeleteContent
 * from content-access.ts. Librarian operations are handled through the same routes with
 * visibility=shared, eliminating the need for separate /api/librarian/shared-albums routes.
 */

import express from 'express';
import { getLogger } from '../../../config/service-urls';
import { serviceAuthMiddleware, extractAuthContext, serializeError, getResponseHelpers } from '@aiponge/platform-core';
import {
  APP,
  CONTENT_VISIBILITY,
  VISIBILITY_FILTER,
  ContentVisibilitySchema,
  isContentPersonal,
  isContentPubliclyAccessible,
  canEditContent,
  canDeleteContent,
  buildContentAccessContext,
  createAuthContext,
  TIER_IDS,
  contextIsPrivileged,
  ALBUM_LIFECYCLE,
  TRACK_LIFECYCLE,
  CONTENT_LIFECYCLE,
} from '@aiponge/shared-contracts';
const { sendSuccess, sendCreated, ServiceErrors } = getResponseHelpers();
import { getDatabase } from '../../../infrastructure/database/DatabaseConnectionFactory';
import { sql, eq } from 'drizzle-orm';
import { albums } from '../../../schema/music-schema';
import { v4 as uuidv4 } from 'uuid';
import { getServiceRegistry } from '../../../infrastructure/ServiceFactory';

const logger = getLogger('music-service-library-album-routes');
const userClient = getServiceRegistry().userClient;

const router = express.Router();

function parseVisibilityQuery(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (isContentPubliclyAccessible(v) || isContentPersonal(v) || v === VISIBILITY_FILTER.USER) return v;
  return undefined;
}

/**
 * GET /api/library/albums
 * List albums with optional visibility filter
 * ?visibility=shared — list shared library albums (replaces GET /api/librarian/shared-albums)
 * ?visibility=personal — list user's personal albums (default)
 */
router.get('/albums', serviceAuthMiddleware({ required: false }), async (req, res) => {
  try {
    const userId = (res.locals.userId || extractAuthContext(req).userId) as string | undefined;
    const visibilityParam = parseVisibilityQuery(req.query.visibility as string);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string | undefined;
    const db = getDatabase();

    if (isContentPubliclyAccessible(visibilityParam || '')) {
      const result = await db.execute(sql`
        SELECT 
          a.id,
          a.title,
          a.artwork_url,
          a.type as release_type,
          a.status,
          a.total_tracks,
          a.release_date,
          a.visibility,
          a.created_at,
          a.updated_at,
          COALESCE(NULLIF(NULLIF(a.metadata->>'displayName', ''), 'aiponge'), '') as display_name,
          COALESCE(a.artwork_url, (
            SELECT t.artwork_url 
            FROM mus_tracks t 
            WHERE t.album_id = a.id AND t.artwork_url IS NOT NULL 
            ORDER BY t.track_number ASC, t.created_at ASC 
            LIMIT 1
          )) as cover_artwork_url,
          (SELECT COUNT(*)::int FROM mus_tracks t WHERE t.album_id = a.id) as track_count
        FROM mus_albums a
        WHERE a.visibility IN (${CONTENT_VISIBILITY.SHARED}, ${CONTENT_VISIBILITY.PUBLIC})
        ${search ? sql`AND to_tsvector('english', a.title) @@ plainto_tsquery('english', ${search})` : sql``}
        ORDER BY a.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int as total
        FROM mus_albums
        WHERE visibility IN (${CONTENT_VISIBILITY.SHARED}, ${CONTENT_VISIBILITY.PUBLIC})
        ${search ? sql`AND to_tsvector('english', title) @@ plainto_tsquery('english', ${search})` : sql``}
      `);

      const total = (countResult.rows[0] as Record<string, unknown>)?.total || 0;

      const albumsList = (result.rows || []).map((row: Record<string, unknown>) => ({
        id: row.id,
        title: row.title,
        coverArtworkUrl: row.cover_artwork_url,
        releaseType: row.release_type,
        status: row.status,
        totalTracks: row.track_count || row.total_tracks || 0,
        releaseDate: row.release_date,
        displayName: row.display_name || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return sendSuccess(res, {
        albums: albumsList,
        total: Number(total),
        limit,
        offset,
      });
    }

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const result = await db.execute(sql`
      SELECT 
        a.id, a.user_id, a.chapter_id, a.title, a.description, 
        COALESCE(a.artwork_url, (
          SELECT t.artwork_url 
          FROM mus_tracks t 
          WHERE t.album_id = a.id AND t.artwork_url IS NOT NULL
            AND (COALESCE(t.track_number, 0), t.generation_number) IN (
              SELECT COALESCE(track_number, 0), MAX(generation_number)
              FROM mus_tracks
              WHERE album_id = a.id
              GROUP BY COALESCE(track_number, 0)
            )
          ORDER BY t.track_number ASC, t.created_at ASC 
          LIMIT 1
        )) as artwork_url,
        a.total_tracks, a.total_duration, a.status, a.metadata, a.created_at, a.updated_at
      FROM mus_albums a
      WHERE a.user_id = ${userId} AND a.status IN (${ALBUM_LIFECYCLE.ACTIVE}, ${ALBUM_LIFECYCLE.DRAFT}, ${ALBUM_LIFECYCLE.PUBLISHED})
      ORDER BY a.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const personalAlbums = (result.rows || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      userId: row.user_id,
      chapterId: row.chapter_id,
      title: row.title,
      description: row.description,
      coverArtworkUrl: row.artwork_url,
      totalTracks: row.total_tracks,
      totalDuration: row.total_duration,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    sendSuccess(res, { albums: personalAlbums, total: personalAlbums.length });
  } catch (error) {
    logger.error('Get Albums Error', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to fetch albums', req);
    return;
  }
});

/**
 * GET /api/library/albums/:albumId
 * Get a specific album with its tracks — visibility-aware access
 * Shared albums: public access. Personal albums: owner-only.
 * Replaces both personal GET and GET /api/librarian/shared-albums/:albumId
 */
router.get('/albums/:albumId', serviceAuthMiddleware({ required: false }), async (req, res) => {
  try {
    const { albumId } = req.params;
    const userId = (res.locals.userId || extractAuthContext(req).userId) as string | undefined;
    const db = getDatabase();

    const albumResult = await db.execute(sql`
      SELECT 
        a.id, a.user_id, a.chapter_id, a.title, a.description, a.visibility,
        COALESCE(a.artwork_url, (
          SELECT t.artwork_url 
          FROM mus_tracks t 
          WHERE t.album_id = a.id AND t.artwork_url IS NOT NULL
            AND (COALESCE(t.track_number, 0), t.generation_number) IN (
              SELECT COALESCE(track_number, 0), MAX(generation_number)
              FROM mus_tracks
              WHERE album_id = a.id
              GROUP BY COALESCE(track_number, 0)
            )
          ORDER BY t.track_number ASC, t.created_at ASC 
          LIMIT 1
        )) as artwork_url,
        a.total_tracks, a.total_duration, a.status, a.metadata, a.type as release_type,
        a.release_date, a.created_at, a.updated_at,
        COALESCE(NULLIF(NULLIF(a.metadata->>'displayName', ''), 'aiponge'), '') as display_name
      FROM mus_albums a
      WHERE a.id = ${albumId} AND a.status IN (${ALBUM_LIFECYCLE.ACTIVE}, ${ALBUM_LIFECYCLE.DRAFT}, ${ALBUM_LIFECYCLE.PUBLISHED})
      LIMIT 1
    `);

    if (!albumResult.rows || albumResult.rows.length === 0) {
      ServiceErrors.notFound(res, 'Album', req);
      return;
    }

    const row = albumResult.rows[0] as Record<string, unknown>;

    if (!isContentPubliclyAccessible(row.visibility as string) && row.user_id !== userId) {
      ServiceErrors.notFound(res, 'Album', req);
      return;
    }

    const album = {
      id: row.id,
      userId: row.user_id,
      chapterId: row.chapter_id,
      title: row.title,
      description: row.description,
      coverArtworkUrl: row.artwork_url,
      totalTracks: row.total_tracks,
      totalDuration: row.total_duration,
      status: row.status,
      releaseType: row.release_type,
      releaseDate: row.release_date,
      displayName: row.display_name || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    const tracksResult = await db.execute(sql`
      SELECT t.id, t.title, t.file_url AS "fileUrl", t.artwork_url AS "artworkUrl", 
             t.duration, t.play_count AS "playCount",
             t.track_number AS "trackNumber", 
             COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), '') AS "displayName", 
             t.created_at AS "createdAt", 
             t.lyrics_id AS "lyricsId", t.has_synced_lyrics AS "hasSyncedLyrics",
             t.status,
             l.content as lyrics_content,
             l.synced_lines as lyrics_synced_lines
      FROM mus_tracks t
      LEFT JOIN mus_lyrics l ON t.lyrics_id = l.id
      WHERE t.album_id = ${albumId} AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
        AND (COALESCE(t.track_number, 0), t.generation_number) IN (
          SELECT COALESCE(track_number, 0), MAX(generation_number)
          FROM mus_tracks
          WHERE album_id = ${albumId} AND status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
          GROUP BY COALESCE(track_number, 0)
        )
      ORDER BY t.track_number ASC, t.created_at DESC
    `);

    const tracksList = (tracksResult.rows || []).map((t: Record<string, unknown>, index: number) => ({
      id: t.id,
      title: t.title,
      displayName: t.displayName || '',
      audioUrl: t.fileUrl,
      artworkUrl: t.artworkUrl,
      duration: t.duration,
      durationSeconds: t.duration || 0,
      trackNumber: t.trackNumber || index + 1,
      playCount: t.playCount,
      language: t.language,
      status: t.status,
      createdAt: t.createdAt,
      lyricsId: t.lyricsId,
      hasSyncedLyrics: t.hasSyncedLyrics,
      lyricsContent: t.lyrics_content,
      lyricsSyncedLines: t.lyrics_synced_lines,
    }));

    sendSuccess(res, { album, tracks: tracksList });
  } catch (error) {
    logger.error('Get Album Error', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to fetch album', req);
    return;
  }
});

/**
 * POST /api/library/albums
 * Create an album — visibility determines authorization
 * visibility=shared requires privileged role (replaces POST /api/librarian/shared-albums)
 * visibility=personal (default) requires authenticated user
 */
router.post('/albums', serviceAuthMiddleware({ required: true }), async (req, res) => {
  try {
    const authContext = extractAuthContext(req);
    const userId = (res.locals.userId || extractAuthContext(req).userId) as string;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const {
      title,
      description,
      artworkUrl,
      releaseType,
      displayName,
      visibility = CONTENT_VISIBILITY.PERSONAL,
    } = req.body;

    if (isContentPubliclyAccessible(visibility) && !contextIsPrivileged(authContext)) {
      ServiceErrors.forbidden(res, 'Librarian or admin access required to create shared albums', req);
      return;
    }

    if (!title || typeof title !== 'string') {
      ServiceErrors.badRequest(res, 'Album title is required', req);
      return;
    }

    const db = getDatabase();
    const albumId = uuidv4();
    let resolvedDisplayName = displayName && typeof displayName === 'string' ? displayName : '';
    if (!resolvedDisplayName) {
      const profileResult = await userClient.getUserDisplayName(userId);
      resolvedDisplayName = profileResult.success && profileResult.displayName ? profileResult.displayName : '';
    }

    await db.execute(sql`
      INSERT INTO mus_albums (id, title, description, artwork_url, type, user_id, visibility, status, total_tracks, metadata, created_at, updated_at)
      VALUES (
        ${albumId}, ${title.trim()}, 
        ${description && typeof description === 'string' ? description.trim() : null},
        ${artworkUrl && typeof artworkUrl === 'string' ? artworkUrl.trim() : null},
        ${releaseType && typeof releaseType === 'string' ? releaseType : 'album'},
        ${userId}, ${visibility}, 
        ${isContentPubliclyAccessible(visibility) ? ALBUM_LIFECYCLE.PUBLISHED : ALBUM_LIFECYCLE.ACTIVE},
        0, ${JSON.stringify({ displayName: resolvedDisplayName })}::jsonb,
        NOW(), NOW()
      )
    `);

    logger.info('Album created', { albumId, title, visibility, createdBy: userId });

    sendCreated(res, { albumId, title, visibility, displayName: resolvedDisplayName });
  } catch (error) {
    logger.error('Create Album - Failed', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to create album', req);
    return;
  }
});

/**
 * PATCH /api/library/albums/:albumId
 * Update an album — authorization determined by record's visibility via canEditContent
 * Personal albums: owner-only. Shared albums: owner, admin, or librarian.
 * Replaces both personal PATCH and PATCH /api/librarian/shared-albums/:albumId
 */
router.patch('/albums/:albumId', serviceAuthMiddleware({ required: true }), async (req, res) => {
  try {
    const { albumId } = req.params;
    const authContext = extractAuthContext(req);
    const userId = (res.locals.userId || extractAuthContext(req).userId) as string;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const { title, description, artworkUrl, visibility } = req.body;

    if (!title && description === undefined && artworkUrl === undefined && visibility === undefined) {
      ServiceErrors.badRequest(res, 'At least one field must be provided', req);
      return;
    }

    if (visibility !== undefined && !ContentVisibilitySchema.safeParse(visibility).success) {
      ServiceErrors.badRequest(res, 'Invalid visibility value. Must be personal, shared, or public', req);
      return;
    }

    const db = getDatabase();

    const existing = await db.execute(sql`
      SELECT id, user_id, visibility FROM mus_albums
      WHERE id = ${albumId} AND status IN (${ALBUM_LIFECYCLE.ACTIVE}, ${ALBUM_LIFECYCLE.DRAFT}, ${ALBUM_LIFECYCLE.PUBLISHED})
      LIMIT 1
    `);

    if (!existing.rows || existing.rows.length === 0) {
      ServiceErrors.notFound(res, 'Album', req);
      return;
    }

    const album = existing.rows[0] as { id: string; user_id: string; visibility: string };
    const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);

    if (!canEditContent({ ownerId: album.user_id, visibility: album.visibility }, accessCtx)) {
      ServiceErrors.forbidden(res, 'Access denied', req);
      return;
    }

    if (visibility !== undefined && isContentPubliclyAccessible(visibility) && !contextIsPrivileged(authContext)) {
      ServiceErrors.forbidden(res, 'Librarian or admin access required to set shared visibility', req);
      return;
    }

    if (artworkUrl !== undefined) {
      await db.execute(sql`
        UPDATE mus_albums SET artwork_url = ${artworkUrl || null}, updated_at = NOW() WHERE id = ${albumId}
      `);
    }
    if (title) {
      await db.execute(sql`
        UPDATE mus_albums SET title = ${title.trim()}, updated_at = NOW() WHERE id = ${albumId}
      `);
    }
    if (description !== undefined) {
      await db.execute(sql`
        UPDATE mus_albums SET description = ${description?.trim() || null}, updated_at = NOW() WHERE id = ${albumId}
      `);
    }
    if (visibility !== undefined) {
      await db.execute(sql`
        UPDATE mus_albums SET visibility = ${visibility}, updated_at = NOW() WHERE id = ${albumId}
      `);
    }

    logger.info('Album updated', { albumId, visibility: album.visibility, updatedBy: userId });

    sendSuccess(res, { message: 'Album updated successfully' });
  } catch (error) {
    logger.error('Update Album Error', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to update album', req);
    return;
  }
});

/**
 * DELETE /api/library/albums/:albumId
 * Delete an album — authorization determined by record's visibility via canDeleteContent
 * Personal albums: owner or admin. Shared albums: privileged users only.
 * Replaces DELETE /api/librarian/shared-albums/:albumId (which was not previously implemented)
 */
router.delete('/albums/:albumId', serviceAuthMiddleware({ required: true }), async (req, res) => {
  try {
    const { albumId } = req.params;
    const authContext = extractAuthContext(req);
    const userId = (res.locals.userId || extractAuthContext(req).userId) as string;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const db = getDatabase();

    const existing = await db.execute(sql`
      SELECT id, user_id, visibility FROM mus_albums
      WHERE id = ${albumId} AND status IN (${ALBUM_LIFECYCLE.ACTIVE}, ${ALBUM_LIFECYCLE.DRAFT}, ${ALBUM_LIFECYCLE.PUBLISHED})
      LIMIT 1
    `);

    if (!existing.rows || existing.rows.length === 0) {
      ServiceErrors.notFound(res, 'Album', req);
      return;
    }

    const album = existing.rows[0] as { id: string; user_id: string; visibility: string };

    if (isContentPubliclyAccessible(album.visibility)) {
      if (!contextIsPrivileged(authContext)) {
        ServiceErrors.forbidden(res, 'Librarian or admin access required to delete shared albums', req);
        return;
      }
    } else {
      const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);
      if (!canDeleteContent({ ownerId: album.user_id, visibility: album.visibility }, accessCtx)) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }
    }

    await db.execute(sql`
      UPDATE mus_albums SET status = ${CONTENT_LIFECYCLE.DELETED}, updated_at = NOW() WHERE id = ${albumId}
    `);

    logger.info('Album deleted', { albumId, visibility: album.visibility, deletedBy: userId });

    sendSuccess(res, { message: 'Album deleted', albumId });
  } catch (error) {
    logger.error('Delete Album Error', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to delete album', req);
    return;
  }
});

router.patch('/albums/:albumId/artwork', serviceAuthMiddleware({ required: true }), async (req, res) => {
  try {
    const { albumId } = req.params;
    const authContext = extractAuthContext(req);
    const userId = (res.locals.userId || extractAuthContext(req).userId) as string;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const { artworkUrl } = req.body;

    if (artworkUrl === undefined) {
      ServiceErrors.badRequest(res, 'artworkUrl is required', req);
      return;
    }

    const db = getDatabase();

    const existing = await db.execute(sql`
      SELECT id, user_id, visibility FROM mus_albums
      WHERE id = ${albumId} AND status IN (${ALBUM_LIFECYCLE.ACTIVE}, ${ALBUM_LIFECYCLE.DRAFT}, ${ALBUM_LIFECYCLE.PUBLISHED})
      LIMIT 1
    `);

    if (!existing.rows || existing.rows.length === 0) {
      ServiceErrors.notFound(res, 'Album', req);
      return;
    }

    const album = existing.rows[0] as { id: string; user_id: string; visibility: string };
    const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);

    if (!canEditContent({ ownerId: album.user_id, visibility: album.visibility }, accessCtx)) {
      ServiceErrors.forbidden(res, 'Access denied', req);
      return;
    }

    await db.execute(sql`
      UPDATE mus_albums
      SET artwork_url = ${artworkUrl || null}, updated_at = NOW()
      WHERE id = ${albumId}
    `);

    logger.info('Album artwork updated', { albumId, updatedBy: userId, artworkUrl: artworkUrl ? 'set' : 'cleared' });

    sendSuccess(res, { message: 'Album artwork updated successfully' });
  } catch (error) {
    logger.error('Update Album Artwork Error', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to update album artwork', req);
    return;
  }
});

router.get('/albums/chapter/:chapterId', serviceAuthMiddleware({ required: true }), async (req, res) => {
  try {
    const { chapterId } = req.params;
    const userId = (res.locals.userId || extractAuthContext(req).userId) as string;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const db = getDatabase();

    const result = await db.execute(sql`
      SELECT 
        a.id, a.user_id, a.chapter_id, a.title, a.description, 
        COALESCE(a.artwork_url, (
          SELECT t.artwork_url 
          FROM mus_tracks t 
          WHERE t.album_id = a.id AND t.artwork_url IS NOT NULL 
          ORDER BY t.track_number ASC, t.created_at ASC 
          LIMIT 1
        )) as artwork_url,
        a.total_tracks, a.total_duration, a.status, a.metadata, a.created_at, a.updated_at
      FROM mus_albums a
      WHERE a.chapter_id = ${chapterId} AND a.user_id = ${userId} AND a.status IN (${ALBUM_LIFECYCLE.ACTIVE}, ${ALBUM_LIFECYCLE.DRAFT}, ${ALBUM_LIFECYCLE.PUBLISHED})
      LIMIT 1
    `);

    if (!result.rows || result.rows.length === 0) {
      ServiceErrors.notFound(res, 'Album', req);
      return;
    }

    const row = result.rows[0] as Record<string, unknown>;
    const album = {
      id: row.id,
      userId: row.user_id,
      chapterId: row.chapter_id,
      title: row.title,
      description: row.description,
      coverArtworkUrl: row.artwork_url,
      totalTracks: row.total_tracks,
      totalDuration: row.total_duration,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    sendSuccess(res, album);
  } catch (error) {
    logger.error('Get Album by Chapter Error', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to fetch album', req);
    return;
  }
});

export default router;
