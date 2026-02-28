import express from 'express';
import { MusicCatalogApplicationService } from '../../application/services/MusicCatalogApplicationService';
import { UnifiedAlbumRepository } from '../../infrastructure/database/UnifiedAlbumRepository';
import { createDrizzleRepository, getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '../../config/service-urls';
import { extractAuthContext, serializeError, getResponseHelpers } from '@aiponge/platform-core';
const { sendSuccess, ServiceErrors } = getResponseHelpers();
import { getMusicVisibilityService } from '../../application/services/MusicVisibilityService';
import { getMusicAccessRepository } from '../../infrastructure/database/MusicAccessRepository';
import { APP, contextIsPrivileged } from '@aiponge/shared-contracts';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';
import { sql } from 'drizzle-orm';

const logger = getLogger('catalog-routes');

const router = express.Router();

function getCatalogService(): MusicCatalogApplicationService {
  const albumRepository = createDrizzleRepository(UnifiedAlbumRepository);
  return new MusicCatalogApplicationService(albumRepository);
}

router.get('/', async (req, res) => {
  logger.info('Loading music catalog');

  try {
    const catalogService = getCatalogService();
    const {
      query,
      limit = '20',
      offset = '0',
    } = req.query as {
      query?: string;
      limit?: string;
      offset?: string;
    };

    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);
    const searchQuery = query || '';

    const visibilityService = getMusicVisibilityService();
    const librarianIds = await visibilityService.getLibrarianIds();

    if (librarianIds.length === 0) {
      logger.info('No librarians found, returning empty catalog');
      return sendSuccess(res, {
        tracks: [],
        total: 0,
        albums: 0,
        artists: 0,
        pagination: { limit: limitNum, offset: offsetNum, hasMore: false },
      });
    }

    const accessRepo = getMusicAccessRepository();
    const { tracks, total } = await accessRepo.getCatalogTracks(librarianIds, {
      search: searchQuery,
      limit: limitNum,
      offset: offsetNum,
    });

    const stats = await catalogService.getCatalogStats();

    sendSuccess(res, {
      tracks,
      total,
      albums: stats.totalAlbums,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total,
      },
    });
  } catch (error) {
    logger.error('Error loading catalog', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to load catalog', req);
    return;
  }
});

router.get('/public-albums', async (req, res) => {
  try {
    const { limit = '50', offset = '0', search } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);
    const offsetNum = parseInt(offset as string) || 0;

    const { userId } = extractAuthContext(req);
    const visibilityService = getMusicVisibilityService();
    const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId || null);

    logger.info('Public albums access resolved', { userId: userId || 'anonymous', accessibleCreatorIds, count: accessibleCreatorIds.length });

    if (accessibleCreatorIds.length === 0) {
      logger.info('No accessible creators found, returning empty public albums');
      return sendSuccess(res, { albums: [], total: 0, limit: limitNum, offset: offsetNum });
    }

    const accessRepo = getMusicAccessRepository();
    const { albums: rawAlbums, total } = await accessRepo.getPublicAlbums(accessibleCreatorIds, {
      search: search as string | undefined,
      limit: limitNum,
      offset: offsetNum,
    });

    const albums = rawAlbums.map((row) => ({
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

    logger.info('Fetched public albums', { albumCount: albums.length, total });

    sendSuccess(res, {
      albums,
      total: Number(total),
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    logger.error('List Public Albums - Failed', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to list public albums', req);
  }
});

router.get('/public-albums/:albumId', async (req, res) => {
  try {
    const { albumId } = req.params;

    const { userId } = extractAuthContext(req);
    const visibilityService = getMusicVisibilityService();
    const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId || null);

    if (accessibleCreatorIds.length === 0) {
      logger.info('No accessible creators found, returning 404 for single album');
      ServiceErrors.notFound(res, 'Album', req);
      return;
    }

    const accessRepo = getMusicAccessRepository();
    const result = await accessRepo.getPublicAlbumWithTracks(albumId, accessibleCreatorIds);

    if (!result) {
      ServiceErrors.notFound(res, 'Album', req);
      return;
    }

    const albumRow = result.album as unknown as Record<string, unknown>;
    const album = {
      id: albumRow.id,
      title: albumRow.title,
      coverArtworkUrl: albumRow.cover_artwork_url,
      releaseType: albumRow.release_type,
      status: albumRow.status,
      totalTracks: albumRow.published_track_count || albumRow.total_tracks || 0,
      releaseDate: albumRow.release_date,
      displayName: albumRow.display_name || '',
      createdAt: albumRow.created_at,
      updatedAt: albumRow.updated_at,
    };

    const tracks = result.tracks.map((row) => ({
      id: row.id,
      title: row.title,
      audioUrl: row.file_url,
      artworkUrl: row.artwork_url,
      durationSeconds: row.duration,
      trackNumber: row.track_number,
      playCount: row.play_count || 0,
      language: row.language,
      displayName: row.display_name || '',
      lyricsId: row.lyrics_id,
      hasSyncedLyrics: row.has_synced_lyrics || false,
      lyricsContent: row.lyrics_content,
      lyricsSyncedLines: row.lyrics_synced_lines,
    }));

    logger.info('Fetched public album details', { albumId, trackCount: tracks.length });

    sendSuccess(res, { album, tracks });
  } catch (error) {
    logger.error('Get Public Album - Failed', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get public album', req);
  }
});

/**
 * POST /api/catalog/admin/fix-display-names
 * Batch-fix tracks and albums that have null or 'aiponge' as displayName
 * by resolving the real creator name from the user service.
 * Requires admin or librarian role.
 */
router.post('/admin/fix-display-names', async (req, res) => {
  try {
    const authContext = extractAuthContext(req);
    if (!contextIsPrivileged(authContext)) {
      ServiceErrors.forbidden(res, 'Admin or librarian access required', req);
      return;
    }

    const db = getDatabase();
    const userClient = getServiceRegistry().userClient;

    const affectedTracks = await db.execute(sql`
      SELECT DISTINCT user_id FROM mus_tracks
      WHERE metadata->>'displayName' IS NULL
         OR metadata->>'displayName' = ${APP.DEFAULT_DISPLAY_NAME}
         OR metadata->>'displayName' = ''
         OR metadata->>'displayName' = 'aiponge'
    `);
    const affectedAlbums = await db.execute(sql`
      SELECT DISTINCT user_id FROM mus_albums
      WHERE metadata->>'displayName' IS NULL
         OR metadata->>'displayName' = ${APP.DEFAULT_DISPLAY_NAME}
         OR metadata->>'displayName' = ''
         OR metadata->>'displayName' = 'aiponge'
    `);

    const userIdSet = new Set<string>();
    for (const row of affectedTracks.rows as { user_id: string }[]) {
      if (row.user_id) userIdSet.add(row.user_id);
    }
    for (const row of affectedAlbums.rows as { user_id: string }[]) {
      if (row.user_id) userIdSet.add(row.user_id);
    }

    const userIds = Array.from(userIdSet);
    logger.info('Batch fix display names - resolving users', { userCount: userIds.length });

    const displayNameMap = new Map<string, string>();
    for (const uid of userIds) {
      const result = await userClient.getUserDisplayName(uid);
      if (result.success && result.displayName) {
        displayNameMap.set(uid, result.displayName);
      }
    }

    let tracksUpdated = 0;
    let albumsUpdated = 0;

    for (const [uid, name] of displayNameMap) {
      const trackResult = await db.execute(sql`
        UPDATE mus_tracks
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{displayName}', to_jsonb(${name}::text)),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${uid}
          AND (metadata->>'displayName' IS NULL
               OR metadata->>'displayName' = ${APP.DEFAULT_DISPLAY_NAME}
               OR metadata->>'displayName' = ''
               OR metadata->>'displayName' = 'aiponge')
      `);
      tracksUpdated += (trackResult as { rowCount?: number }).rowCount || 0;

      const albumResult = await db.execute(sql`
        UPDATE mus_albums
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{displayName}', to_jsonb(${name}::text)),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${uid}
          AND (metadata->>'displayName' IS NULL
               OR metadata->>'displayName' = ${APP.DEFAULT_DISPLAY_NAME}
               OR metadata->>'displayName' = ''
               OR metadata->>'displayName' = 'aiponge')
      `);
      albumsUpdated += (albumResult as { rowCount?: number }).rowCount || 0;
    }

    logger.info('Batch fix display names completed', {
      usersResolved: displayNameMap.size,
      usersNotResolved: userIds.length - displayNameMap.size,
      tracksUpdated,
      albumsUpdated,
    });

    sendSuccess(res, {
      usersProcessed: userIds.length,
      usersResolved: displayNameMap.size,
      tracksUpdated,
      albumsUpdated,
    });
  } catch (error) {
    logger.error('Batch fix display names - Failed', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to batch fix display names', req);
  }
});

export default router;
