import { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { type DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import { PlaylistService, DuplicateTrackError } from '../../application/services/PlaylistService';
import { SmartPlaylistEngine, SMART_PLAYLIST_DEFINITIONS } from '../../application/services/SmartPlaylistEngine';
import { GeneratePlaylistArtworkUseCase } from '../../application/use-cases/music/GeneratePlaylistArtworkUseCase';
import { toAbsoluteUrl } from '../../application/utils/url-utils';
import { getLogger } from '../../config/service-urls';
import { extractAuthContext, serializeError, getResponseHelpers } from '@aiponge/platform-core';
import {
  CONTENT_VISIBILITY,
  TRACK_LIFECYCLE,
  isContentPubliclyAccessible,
  canEditContent,
  canDeleteContent,
  buildContentAccessContext,
  TIER_IDS,
  contextIsPrivileged,
} from '@aiponge/shared-contracts';

const { sendSuccess, sendCreated, ServiceErrors } = getResponseHelpers();
const logger = getLogger('playlist-controller');

export class PlaylistController {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly playlistService: PlaylistService,
    private readonly smartPlaylistEngine: SmartPlaylistEngine
  ) {}

  async test(req: Request, res: Response): Promise<void> {
    logger.info('✅ TEST ENDPOINT HIT');
    sendSuccess(res, { message: 'Playlist routes working' });
  }

  async searchPlaylists(req: Request, res: Response): Promise<void> {
    try {
      const { q, limit } = req.query;

      if (!q || typeof q !== 'string') {
        ServiceErrors.badRequest(res, 'Missing required query parameter: q', req);
        return;
      }

      logger.info('Searching playlists with query: {}', { data0: q });

      const playlists = await this.playlistService.searchPlaylists(q, limit ? parseInt(limit as string) : 20);

      sendSuccess(res, {
        playlists,
        total: playlists.length,
      });
    } catch (error) {
      logger.error('Failed to search playlists', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to search playlists', req);
      return;
    }
  }

  async getPublicPlaylists(req: Request, res: Response): Promise<void> {
    logger.info('🎵 PUBLIC PLAYLISTS REQUEST RECEIVED', { query: req.query });

    try {
      const { limit } = req.query;
      const parsedLimit = limit ? parseInt(limit as string) : 20;

      logger.info('Loading public playlists with limit: {}', { data0: parsedLimit });

      const playlists = await this.playlistService.getPublicPlaylists(parsedLimit);

      logger.info('✅ Successfully loaded {} public playlists', { data0: playlists.length });

      sendSuccess(res, {
        playlists,
        total: playlists.length,
      });
    } catch (error) {
      logger.error('Failed to load public playlists', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to load public playlists', req);
      return;
    }
  }

  async getSmartPlaylists(req: Request, res: Response): Promise<void> {
    const { userId } = req.params as { userId: string };

    try {
      logger.info('Loading smart playlists for user: {}', { data0: userId });

      const smartPlaylists = await this.smartPlaylistEngine.getSmartPlaylistsForUser(userId);

      sendSuccess(res, {
        playlists: smartPlaylists,
        total: smartPlaylists.length,
        definitions: SMART_PLAYLIST_DEFINITIONS.map(d => ({
          smartKey: d.smartKey,
          name: d.name,
          icon: d.icon,
          color: d.color,
        })),
      });
    } catch (error) {
      logger.error('Failed to load smart playlists', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to load smart playlists', req);
      return;
    }
  }

  async getSmartPlaylistTracks(req: Request, res: Response): Promise<void> {
    const { userId, smartKey } = req.params as { userId: string; smartKey: string };

    try {
      logger.info('Loading tracks for smart playlist: {} for user: {}', { data0: smartKey, data1: userId });

      const tracks = await this.smartPlaylistEngine.getSmartPlaylistTracks(userId, smartKey);

      const enrichedTracks = tracks.map(track => ({
        ...track,
        fileUrl: toAbsoluteUrl(track.fileUrl),
        artworkUrl: track.artworkUrl ? toAbsoluteUrl(track.artworkUrl) : undefined,
      }));

      sendSuccess(res, {
        tracks: enrichedTracks,
        total: enrichedTracks.length,
      });
    } catch (error) {
      logger.error('Failed to load smart playlist tracks', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to load smart playlist tracks', req);
      return;
    }
  }

  async migrateToSmartPlaylists(req: Request, res: Response): Promise<void> {
    const { userId } = req.params as { userId: string };
    const authContext = extractAuthContext(req);
    const requesterId = authContext.userId;

    if (requesterId !== userId && !contextIsPrivileged(authContext)) {
      ServiceErrors.forbidden(res, 'Access denied', req);
      return;
    }

    try {
      logger.info('Migrating user to smart playlists: {}', { data0: userId });

      const result = await this.smartPlaylistEngine.migrateUserToSmartPlaylists(userId);

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Failed to migrate user to smart playlists', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to migrate user to smart playlists', req);
      return;
    }
  }

  async getUserPlaylists(req: Request, res: Response): Promise<void> {
    const { userId } = req.params as { userId: string };
    const { includeEmpty } = req.query;

    try {
      let playlists = await this.playlistService.getUserPlaylists(userId);

      if (includeEmpty !== 'true') {
        const defaultPlaylistNames = [
          'Calm Reset',
          'Focus Flow',
          'Energy Reboot',
          'Sleep Drift',
          'Emotional Balance',
          'Heart Coherence',
          'Gratitude Frequency',
          'Let Go Loop',
          'Safe Haven',
          'Forgive & Flow',
          'New Habit Groove',
          'Identity Upgrade',
          'From Craving to Choice',
          'Morning Intention',
          'Evening Integration',
          'Insight Mode',
          'Memory Garden',
          'Belief Rewriter',
          'Inner Dialogue',
          'Emotion Mirror',
          'Resilience Builder',
          'Flow Pulse',
          'Serotonin Sunrise',
          'Night Detox',
        ];

        playlists = playlists.filter(p => {
          if (!defaultPlaylistNames.includes(p.name)) return true;
          return true;
        });
      }

      sendSuccess(res, {
        playlists,
        total: playlists.length,
      });
    } catch (error) {
      logger.error('Failed to load playlists', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to load playlists', req);
      return;
    }
  }

  async getPlaylist(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      logger.info('Loading playlist: {}', { data0: playlistId });

      const playlist = await this.playlistService.getPlaylist(playlistId);

      if (!playlist) {
        ServiceErrors.notFound(res, 'Playlist', req);
        return;
      }

      sendSuccess(res, playlist);
    } catch (error) {
      logger.error('Failed to load playlist', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to load playlist', req);
      return;
    }
  }

  async createPlaylist(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        description,
        visibility = CONTENT_VISIBILITY.PERSONAL,
        mood,
        genre,
        category,
        icon,
        color,
        tags,
        playlistType,
      } = req.body;
      const authContext = extractAuthContext(req);
      const userId = authContext.userId;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      if (!name) {
        ServiceErrors.badRequest(res, 'Missing required field: name', req);
        return;
      }

      if (isContentPubliclyAccessible(visibility) && !contextIsPrivileged(authContext)) {
        ServiceErrors.forbidden(res, 'Librarian or admin access required to create shared playlists', req);
        return;
      }

      logger.info('Creating playlist: {} for user: {}', { data0: name, data1: userId });

      const playlist = await this.playlistService.createPlaylist({
        name,
        userId,
        description,
        visibility,
        mood,
        genre,
        category,
        icon,
        color,
        tags,
        playlistType,
      });

      sendCreated(res, playlist);
    } catch (error) {
      logger.error('Failed to create playlist', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to create playlist', req);
      return;
    }
  }

  async updatePlaylist(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const authContext = extractAuthContext(req);
      const userId = authContext.userId;
      const updates = req.body;

      const playlist = await this.playlistService.getPlaylist(playlistId);
      if (!playlist) {
        ServiceErrors.notFound(res, 'Playlist', req);
        return;
      }

      const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);
      if (!canEditContent({ ownerId: playlist.userId ?? '', visibility: playlist.visibility }, accessCtx)) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }

      await this.playlistService.updatePlaylist(playlistId, updates);

      logger.info('Playlist updated', { playlistId, visibility: playlist.visibility, updatedBy: userId });
      sendSuccess(res, { message: 'Playlist updated successfully' });
    } catch (error) {
      logger.error('Failed to update playlist', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update playlist', req);
      return;
    }
  }

  async deletePlaylist(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const authContext = extractAuthContext(req);
      const userId = authContext.userId;

      const playlist = await this.playlistService.getPlaylist(playlistId);
      if (!playlist) {
        ServiceErrors.notFound(res, 'Playlist', req);
        return;
      }

      if (isContentPubliclyAccessible(playlist.visibility)) {
        if (!contextIsPrivileged(authContext)) {
          ServiceErrors.forbidden(res, 'Librarian or admin access required to delete shared playlists', req);
          return;
        }
      } else {
        const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);
        if (!canDeleteContent({ ownerId: playlist.userId ?? '', visibility: playlist.visibility }, accessCtx)) {
          ServiceErrors.forbidden(res, 'Access denied', req);
          return;
        }
      }

      await this.playlistService.deletePlaylist(playlistId);

      logger.info('Playlist deleted', { playlistId, visibility: playlist.visibility, deletedBy: userId });
      sendSuccess(res, { message: 'Playlist deleted successfully' });
    } catch (error) {
      logger.error('Failed to delete playlist', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to delete playlist', req);
      return;
    }
  }

  async getPlaylistTracks(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const { search, genreFilter } = req.query;
      const { userId } = extractAuthContext(req);
      const startTime = Date.now();

      logger.info('Loading enriched tracks for playlist: {} (user: {}, search: {}, genre: {})', {
        data0: playlistId,
        data1: userId || 'unknown',
        data2: search || 'none',
        data3: genreFilter || 'none',
      });

      const whereConditions = [sql`pt.playlist_id = ${playlistId}`];

      if (search && typeof search === 'string') {
        whereConditions.push(sql`(
          to_tsvector('english', t.title) @@ plainto_tsquery('english', ${search}) OR 
          to_tsvector('english', COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), 'You')) @@ plainto_tsquery('english', ${search})
        )`);
      }

      if (genreFilter && typeof genreFilter === 'string') {
        whereConditions.push(sql`(
          COALESCE(t.genres, ARRAY[]::text[]) @> ARRAY[${genreFilter}]::text[]
        )`);
      }

      const whereClause = sql.join(whereConditions, sql.raw(' AND '));

      const result = await this.db.execute(sql`
        SELECT 
          pt.track_id as id,
          pt.position,
          t.title,
          CASE 
            WHEN t.visibility = ${CONTENT_VISIBILITY.PERSONAL} AND t.user_id = ${userId} THEN COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), 'You')
            WHEN t.visibility IN (${CONTENT_VISIBILITY.SHARED}, ${CONTENT_VISIBILITY.PUBLIC}) THEN COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), '')
            ELSE 'Unknown'
          END as display_name,
          t.duration,
          t.file_url as audio_url,
          t.artwork_url,
          COALESCE(t.genres, ARRAY[]::text[]) as genres,
          COALESCE(t.tags, ARRAY[]::text[]) as tags,
          COALESCE(t.play_count, 0) as play_count,
          t.created_at as added_at,
          t.lyrics_id,
          t.play_on_date,
          CASE WHEN t.visibility = ${CONTENT_VISIBILITY.PERSONAL} THEN true ELSE false END as is_private
        FROM mus_playlist_tracks pt
        JOIN mus_tracks t ON pt.track_id = t.id AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
        WHERE ${whereClause}
          AND (t.visibility IN (${CONTENT_VISIBILITY.SHARED}, ${CONTENT_VISIBILITY.PUBLIC}) OR (t.visibility = ${CONTENT_VISIBILITY.PERSONAL} AND t.user_id = ${userId}))
        ORDER BY pt.position ASC
      `);

      const tracks = (result.rows || []).map((row: Record<string, unknown>) => ({
        id: row.id,
        title: row.title || 'Unknown Track',
        displayName: row.display_name || 'Unknown',
        duration: row.duration || 0,
        audioUrl: toAbsoluteUrl(row.audio_url as string | null | undefined),
        artworkUrl: row.artwork_url ? toAbsoluteUrl(row.artwork_url as string) : undefined,
        genres: row.genres || [],
        tags: row.tags || [],
        playCount: row.play_count || 0,
        addedAt: (row.added_at as Date | undefined)?.toISOString?.() || new Date().toISOString(),
        lyricsId: row.lyrics_id || undefined,
        isPrivate: row.is_private || false,
        playOnDate: row.play_on_date || null,
      }));

      const queryTime = Date.now() - startTime;
      logger.info('✅ Loaded {} enriched tracks for playlist in {}ms', {
        data0: tracks.length,
        data1: queryTime,
      });

      sendSuccess(res, {
        tracks,
        total: tracks.length,
      });
    } catch (error) {
      logger.error('Failed to load playlist tracks', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to load playlist tracks', req);
      return;
    }
  }

  async addTrackToPlaylist(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const { trackId, trackIds } = req.body;
      const authContext = extractAuthContext(req);
      const userId = authContext.userId;

      const playlist = await this.playlistService.getPlaylist(playlistId);
      if (!playlist) {
        ServiceErrors.notFound(res, 'Playlist', req);
        return;
      }

      const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);
      if (!canEditContent({ ownerId: playlist.userId ?? '', visibility: playlist.visibility }, accessCtx)) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }

      if (trackIds && Array.isArray(trackIds) && trackIds.length > 0) {
        const validTrackIds = trackIds.filter(
          (id: unknown): id is string => typeof id === 'string' && (id as string).length > 0
        );
        let addedCount = 0;
        for (const tid of validTrackIds) {
          try {
            await this.playlistService.addTrackToPlaylist(playlistId, tid, userId);
            addedCount++;
          } catch (e) {
            logger.warn('Failed to add track to playlist', { trackId: tid, playlistId });
          }
        }
        return sendSuccess(res, { addedCount });
      }

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Missing required field: trackId or trackIds', req);
        return;
      }

      await this.playlistService.addTrackToPlaylist(playlistId, trackId, userId);
      sendCreated(res, { message: 'Track added to playlist successfully' });
    } catch (error) {
      if (error instanceof DuplicateTrackError) {
        ServiceErrors.badRequest(res, error.message, req);
        return;
      }
      logger.error('Failed to add track to playlist', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to add track to playlist', req);
      return;
    }
  }

  async removeTrackFromPlaylist(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId, trackId } = req.params as { playlistId: string; trackId: string };
      const authContext = extractAuthContext(req);
      const userId = authContext.userId;

      const playlist = await this.playlistService.getPlaylist(playlistId);
      if (!playlist) {
        ServiceErrors.notFound(res, 'Playlist', req);
        return;
      }

      const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);
      if (!canEditContent({ ownerId: playlist.userId ?? '', visibility: playlist.visibility }, accessCtx)) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }

      await this.playlistService.removeTrackFromPlaylist(playlistId, trackId);

      logger.info('Track removed from playlist', { playlistId, trackId, removedBy: userId });
      sendSuccess(res, { message: 'Track removed from playlist successfully' });
    } catch (error) {
      logger.error('Failed to remove track from playlist', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to remove track from playlist', req);
      return;
    }
  }

  async batchUpdateTracks(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const { trackIds, action } = req.body;
      const authContext = extractAuthContext(req);
      const userId = authContext.userId;

      if (action !== 'add' && action !== 'remove') {
        ServiceErrors.badRequest(res, 'action must be "add" or "remove"', req);
        return;
      }

      const playlist = await this.playlistService.getPlaylist(playlistId);
      if (!playlist) {
        ServiceErrors.notFound(res, 'Playlist', req);
        return;
      }

      const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);
      if (!canEditContent({ ownerId: playlist.userId ?? '', visibility: playlist.visibility }, accessCtx)) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }

      const validTrackIds = (trackIds as unknown[]).filter(
        (id: unknown): id is string => typeof id === 'string' && (id as string).length > 0
      );
      let processed = 0;
      let failed = 0;
      const errors: { trackId: string; error: string }[] = [];

      await this.db.transaction(async () => {
        for (const tid of validTrackIds) {
          try {
            if (action === 'add') {
              await this.playlistService.addTrackToPlaylist(playlistId, tid, userId);
            } else {
              await this.playlistService.removeTrackFromPlaylist(playlistId, tid);
            }
            processed++;
          } catch (e) {
            failed++;
            errors.push({ trackId: tid, error: e instanceof Error ? e.message : 'Unknown error' });
          }
        }
      });

      logger.info('Batch playlist track operation completed', {
        playlistId,
        action,
        processed,
        failed,
        userId,
      });

      sendSuccess(res, { action, processed, failed, errors });
    } catch (error) {
      logger.error('Batch playlist track operation failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to batch update playlist tracks', req);
    }
  }

  async generateArtwork(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const authContext = extractAuthContext(req);

      logger.info('Generating AI artwork for playlist: {}', { data0: playlistId });

      const playlist = await this.playlistService.getPlaylist(playlistId);

      if (!playlist) {
        ServiceErrors.notFound(res, 'Playlist', req);
        return;
      }

      const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);
      if (!canEditContent({ ownerId: playlist.userId ?? '', visibility: playlist.visibility }, accessCtx)) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }

      const generateArtworkUseCase = new GeneratePlaylistArtworkUseCase();

      const result = await generateArtworkUseCase.execute({
        playlistId: playlist.id,
        playlistName: playlist.name,
        description: playlist.description || undefined,
        mood: playlist.mood || undefined,
        genre: playlist.genre || undefined,
        trackCount: 0,
      });

      if (!result.success || !result.artworkUrl) {
        logger.error('Failed to generate playlist artwork', {
          error: result.error,
          playlistId,
        });
        ServiceErrors.internal(res, result.error || 'Failed to generate playlist artwork', undefined, req);
        return;
      }

      await this.playlistService.updatePlaylist(playlistId, {
        artworkUrl: result.artworkUrl,
      });

      logger.info('✅ Playlist artwork generated and saved', {
        playlistId,
        artworkUrl: result.artworkUrl,
        processingTimeMs: result.processingTimeMs,
      });

      sendSuccess(res, {
        artworkUrl: result.artworkUrl,
        revisedPrompt: result.revisedPrompt,
        processingTimeMs: result.processingTimeMs,
      });
    } catch (error) {
      logger.error('Failed to generate playlist artwork', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate playlist artwork', req);
      return;
    }
  }

  async getFollowers(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const { userId } = extractAuthContext(req);

      const countResult = await this.db.execute(sql`
        SELECT COUNT(*)::int as count
        FROM mus_playlist_followers
        WHERE playlist_id = ${playlistId}
      `);

      const isFollowing = userId
        ? await this.db.execute(sql`
        SELECT id FROM mus_playlist_followers
        WHERE playlist_id = ${playlistId} AND user_id = ${userId}
        LIMIT 1
      `)
        : { rows: [] };

      sendSuccess(res, {
        followerCount: (countResult.rows[0] as Record<string, unknown>)?.count || 0,
        isFollowing: isFollowing.rows && isFollowing.rows.length > 0,
      });
    } catch (error) {
      logger.error('Failed to get playlist followers', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to get playlist followers', req);
      return;
    }
  }

  async followPlaylist(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const existing = await this.db.execute(sql`
        SELECT id FROM mus_playlist_followers
        WHERE playlist_id = ${playlistId} AND user_id = ${userId}
        LIMIT 1
      `);

      if (existing.rows && existing.rows.length > 0) {
        return sendSuccess(res, { message: 'Already following', alreadyFollowing: true });
      }

      await this.db.execute(sql`
        INSERT INTO mus_playlist_followers (id, playlist_id, user_id, followed_at)
        VALUES (gen_random_uuid(), ${playlistId}, ${userId}, NOW())
      `);

      await this.db.execute(sql`
        UPDATE mus_playlists
        SET follower_count = COALESCE(follower_count, 0) + 1,
            updated_at = NOW()
        WHERE id = ${playlistId}
      `);

      logger.info('Follow Playlist - User followed playlist', { userId, playlistId });

      sendSuccess(res, { message: 'Now following playlist' });
    } catch (error) {
      logger.error('Failed to follow playlist', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to follow playlist', req);
      return;
    }
  }

  async unfollowPlaylist(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const deleteResult = await this.db.execute(sql`
        DELETE FROM mus_playlist_followers
        WHERE playlist_id = ${playlistId} AND user_id = ${userId}
        RETURNING id
      `);

      if (!deleteResult.rows || deleteResult.rows.length === 0) {
        return sendSuccess(res, { message: 'Was not following', wasNotFollowing: true });
      }

      await this.db.execute(sql`
        UPDATE mus_playlists
        SET follower_count = GREATEST(COALESCE(follower_count, 0) - 1, 0),
            updated_at = NOW()
        WHERE id = ${playlistId}
      `);

      logger.info('Unfollow Playlist - User unfollowed playlist', { userId, playlistId });

      sendSuccess(res, { message: 'Unfollowed playlist' });
    } catch (error) {
      logger.error('Failed to unfollow playlist', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to unfollow playlist', req);
      return;
    }
  }

  async likePlaylist(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      await this.db.execute(sql`
        INSERT INTO mus_playlist_likes (id, playlist_id, user_id, liked_at)
        VALUES (gen_random_uuid(), ${playlistId}, ${userId}, NOW())
        ON CONFLICT (playlist_id, user_id) DO NOTHING
      `);

      await this.db.execute(sql`
        UPDATE mus_playlists
        SET like_count = (SELECT COUNT(*) FROM mus_playlist_likes WHERE playlist_id = ${playlistId}),
            updated_at = NOW()
        WHERE id = ${playlistId}
      `);

      logger.info('Like Playlist - User liked playlist', { userId, playlistId });

      sendSuccess(res, { message: 'Playlist liked' });
    } catch (error) {
      logger.error('Failed to like playlist', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to like playlist', req);
      return;
    }
  }

  async unlikePlaylist(req: Request, res: Response): Promise<void> {
    try {
      const { playlistId } = req.params as { playlistId: string };
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const deleteResult = await this.db.execute(sql`
        DELETE FROM mus_playlist_likes
        WHERE playlist_id = ${playlistId} AND user_id = ${userId}
        RETURNING id
      `);

      if (!deleteResult.rows || deleteResult.rows.length === 0) {
        return sendSuccess(res, { message: 'Was not liked', wasNotLiked: true });
      }

      await this.db.execute(sql`
        UPDATE mus_playlists
        SET like_count = GREATEST((SELECT COUNT(*) FROM mus_playlist_likes WHERE playlist_id = ${playlistId}), 0),
            updated_at = NOW()
        WHERE id = ${playlistId}
      `);

      logger.info('Unlike Playlist - User unliked playlist', { userId, playlistId });

      sendSuccess(res, { message: 'Playlist unliked' });
    } catch (error) {
      logger.error('Failed to unlike playlist', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to unlike playlist', req);
      return;
    }
  }
}
