import { Request, Response } from 'express';
import { sql, eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { type DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import { getLogger, getOwnPort } from '../../config/service-urls';
import { serializeError, extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
import {
  CONTENT_VISIBILITY,
  VISIBILITY_FILTER,
  isContentPersonal,
  isContentPubliclyAccessible,
  canEditContent,
  canDeleteContent,
  buildContentAccessContext,
  contextIsPrivileged,
  TIER_IDS,
  TRACK_LIFECYCLE,
} from '@aiponge/shared-contracts';
import { MusicError, LibraryError } from '../../application/errors';
import { libraryOperationsService } from '../../application/services/LibraryOperationsService';
import { fetchExploreFeedOptimized } from '../../application/services/ExploreFeedService';
import { GetUserLibraryUseCase } from '../../application/use-cases/library/GetUserLibraryUseCase';
import { UserServiceClient } from '../../infrastructure/clients/UserServiceClient';
import { getMusicVisibilityService } from '../../application/services/MusicVisibilityService';
import { getMusicAccessRepository } from '../../infrastructure/database/MusicAccessRepository';
import { tracks, albums } from '../../schema/music-schema';
import { TrackAnalysisService } from '../../application/services/TrackAnalysisService';

const { sendSuccess, sendCreated, ServiceErrors } = getResponseHelpers();
const logger = getLogger('music-service-library-track-controller');

const VALID_TRACK_STATUSES: string[] = [
  TRACK_LIFECYCLE.PUBLISHED,
  TRACK_LIFECYCLE.DRAFT,
  TRACK_LIFECYCLE.ARCHIVED,
  TRACK_LIFECYCLE.ACTIVE,
];

export class TrackController {
  private readonly getUserLibraryUseCase: GetUserLibraryUseCase;
  private readonly userClient: UserServiceClient;
  private readonly analysisService: TrackAnalysisService;

  constructor(
    private readonly db: DatabaseConnection,
    getUserLibraryUseCase: GetUserLibraryUseCase,
    userClient: UserServiceClient
  ) {
    this.getUserLibraryUseCase = getUserLibraryUseCase;
    this.userClient = userClient;
    this.analysisService = new TrackAnalysisService(db);
  }

  async listTracks(req: Request, res: Response): Promise<void> {
    try {
      const visibilityParam = this.parseVisibilityQuery(req.query.visibility as string);
      const { userId } = extractAuthContext(req);
      const { limit = '50', offset = '0', search } = req.query;
      const limitNum = Math.min(parseInt(limit as string) || 50, 100);
      const offsetNum = parseInt(offset as string) || 0;

      if (isContentPubliclyAccessible(visibilityParam || '')) {
        const searchTerm = search && typeof search === 'string' ? search.trim() : null;
        const whereConditions = searchTerm
          ? and(
              eq(tracks.status, TRACK_LIFECYCLE.PUBLISHED),
              sql`to_tsvector('english', ${tracks.title}) @@ plainto_tsquery('english', ${searchTerm})`
            )
          : eq(tracks.status, TRACK_LIFECYCLE.PUBLISHED);

        const result = await this.db
          .select({
            id: tracks.id,
            title: tracks.title,
            userId: tracks.userId,
            duration: tracks.duration,
            fileUrl: tracks.fileUrl,
            artworkUrl: tracks.artworkUrl,
            genres: tracks.genres,
            tags: tracks.tags,
            status: tracks.status,
            playCount: tracks.playCount,
            createdAt: tracks.createdAt,
            updatedAt: tracks.updatedAt,
            metadata: tracks.metadata,
          })
          .from(tracks)
          .where(whereConditions)
          .orderBy(sql`${tracks.createdAt} DESC`)
          .limit(limitNum)
          .offset(offsetNum);

        const tracksWithDisplayName = result.map(track => ({
          ...track,
          displayName: (track.metadata as { displayName?: string })?.displayName || '',
        }));

        const countResult = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(tracks)
          .where(whereConditions);
        const total = countResult[0]?.count || 0;

        return sendSuccess(res, {
          tracks: tracksWithDisplayName,
          total: Number(total),
          limit: limitNum,
          offset: offsetNum,
        });
      }

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required for personal tracks', req);
        return;
      }

      const result = await this.db.execute(sql`
        SELECT t.id, t.title, t.file_url, t.artwork_url, t.duration, t.play_count,
               t.track_number, t.status, t.created_at, t.lyrics_id, t.has_synced_lyrics,
               COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), 'You') as display_name
        FROM mus_tracks t
        WHERE t.user_id = ${userId}
          AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
          AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
        ORDER BY t.created_at DESC
        LIMIT ${limitNum} OFFSET ${offsetNum}
      `);

      const personalTracks = (result.rows || []).map((t: Record<string, unknown>) => ({
        id: t.id,
        title: t.title,
        audioUrl: t.file_url,
        artworkUrl: t.artwork_url,
        duration: t.duration,
        playCount: t.play_count,
        trackNumber: t.track_number,
        displayName: t.display_name || 'You',
        status: t.status,
        lyricsId: t.lyrics_id,
        hasSyncedLyrics: t.has_synced_lyrics,
        createdAt: t.created_at,
      }));

      sendSuccess(res, {
        tracks: personalTracks,
        total: personalTracks.length,
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      logger.error('List Tracks - Failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to list tracks', req);
    }
  }

  async createTrack(req: Request, res: Response): Promise<void> {
    try {
      const authContext = extractAuthContext(req);
      const userId = authContext.userId;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const {
        albumId,
        title,
        fileUrl,
        artworkUrl,
        duration,
        genres,
        tags,
        displayName,
        trackNumber,
        language,
        lyricsId,
        hasSyncedLyrics,
        fileSize,
        mimeType,
        quality,
        visibility = CONTENT_VISIBILITY.PERSONAL,
      } = req.body;

      if (isContentPubliclyAccessible(visibility) && !contextIsPrivileged(authContext)) {
        ServiceErrors.forbidden(res, 'Librarian or admin access required to create shared tracks', req);
        return;
      }

      const validation = this.validateTrackInput(req.body);
      if (validation.error) {
        ServiceErrors.badRequest(res, validation.error, req);
        return;
      }

      const existingAlbum = await this.db
        .select({ id: albums.id, userId: albums.userId })
        .from(albums)
        .where(eq(albums.id, albumId))
        .limit(1);
      if (!existingAlbum.length) {
        ServiceErrors.notFound(res, 'Album', req);
        return;
      }

      let resolvedDisplayName = displayName && typeof displayName === 'string' ? displayName : '';
      if (!resolvedDisplayName) {
        const profileResult = await this.userClient.getUserDisplayName(userId);
        resolvedDisplayName = profileResult.success && profileResult.displayName ? profileResult.displayName : '';
      }
      const trackId = uuidv4();
      const genresArray = Array.isArray(genres) ? genres.filter((g: unknown): g is string => typeof g === 'string') : [];
      const tagsArray = Array.isArray(tags) ? tags.filter((t: unknown): t is string => typeof t === 'string') : [];

      await this.db
        .insert(tracks)
        .values(
          this.buildTrackInsertValues(req.body, userId, trackId, resolvedDisplayName, genresArray, tagsArray, visibility) as typeof tracks.$inferInsert
        );

      await this.db.execute(sql`
        UPDATE mus_albums 
        SET total_tracks = (SELECT COUNT(*) FROM mus_tracks WHERE album_id = ${albumId}),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${albumId}
      `);

      logger.info('Track created', { trackId, albumId, title, visibility, createdBy: userId });

      sendCreated(res, { trackId, albumId, title, displayName: resolvedDisplayName, trackNumber });
    } catch (error) {
      logger.error('Create Track - Failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to create track', req);
    }
  }

  async promoteTrack(req: Request, res: Response): Promise<void> {
    try {
      const authContext = extractAuthContext(req);
      const userId = authContext.userId;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      if (!contextIsPrivileged(authContext)) {
        ServiceErrors.forbidden(res, 'Librarian or admin access required to promote tracks', req);
        return;
      }

      const { trackId } = req.params;
      const result = await libraryOperationsService.moveUserTrackToPublicLibrary(trackId, userId);

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Failed to promote track', req);
        return;
      }

      logger.info('Track promoted to shared library', {
        trackId,
        sharedTrackId: result.sharedTrackId,
        promotedBy: userId,
      });

      sendSuccess(res, { sharedTrackId: result.sharedTrackId });
    } catch (error) {
      logger.error('Promote Track - Failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to promote track', req);
    }
  }

  async getTrack(req: Request, res: Response): Promise<void> {
    try {
      const { trackId } = req.params;
      const { userId, role } = extractAuthContext(req);

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID is required', req);
        return;
      }

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      const track = await libraryOperationsService.getTrackDetails(trackId);

      if (!track) {
        ServiceErrors.notFound(res, 'Track', req);
        return;
      }

      const visibilityService = getMusicVisibilityService();
      const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId);

      const hasAccess = visibilityService.checkItemAccess({
        itemUserId: track.userId || '',
        visibility: track.visibility || CONTENT_VISIBILITY.PERSONAL,
        requestingUserId: userId,
        accessibleCreatorIds,
        role,
      });

      if (!hasAccess) {
        logger.warn('Track Details - User lacks access to track', {
          trackId,
          userId,
          creatorId: track.userId ?? 'unknown',
        });
        ServiceErrors.notFound(res, 'Track', req);
        return;
      }

      sendSuccess(res, track);
    } catch (error) {
      logger.error('Library GET Track Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to fetch track', req);
      return;
    }
  }

  async deleteTrack(req: Request, res: Response): Promise<void> {
    try {
      const { trackId } = req.params;
      const authContext = extractAuthContext(req);
      const userId = authContext.userId;

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID is required', req);
        return;
      }

      const existing = await this.db.execute(sql`
        SELECT t.id, t.user_id, t.visibility
        FROM mus_tracks t
        WHERE t.id = ${trackId} AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
        LIMIT 1
      `);

      if (!existing.rows || existing.rows.length === 0) {
        ServiceErrors.notFound(res, 'Track', req);
        return;
      }

      const track = existing.rows[0] as { id: string; user_id: string; visibility: string };

      if (isContentPubliclyAccessible(track.visibility)) {
        if (!contextIsPrivileged(authContext)) {
          ServiceErrors.forbidden(res, 'Librarian or admin access required to delete shared tracks', req);
          return;
        }
        const result = await libraryOperationsService.deleteSharedTrack(trackId, userId);
        if (!result.success) {
          ServiceErrors.notFound(res, result.error || 'Shared track', req);
          return;
        }
        logger.info('Shared track deleted', { trackId, deletedBy: userId });
        return sendSuccess(res, { message: 'Track deleted', trackId: result.trackId });
      }

      const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);
      if (!canDeleteContent({ ownerId: track.user_id, visibility: track.visibility }, accessCtx)) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }

      const result = await libraryOperationsService.deleteTrack(trackId, userId);

      if (!result.success) {
        if (result.error?.includes('already been deleted')) {
          ServiceErrors.conflict(res, result.error, req);
        } else {
          ServiceErrors.notFound(res, result.error || 'Track', req);
        }
        return;
      }

      this.getUserLibraryUseCase.clearUserCache(userId);

      logger.info('Personal track deleted', { trackId, deletedBy: userId });

      sendSuccess(res, { trackId: result.trackId, filesDeleted: result.filesDeleted });
    } catch (error) {
      logger.error('Delete Track - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to delete track', req);
      return;
    }
  }

  async getExploreFeed(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);

      logger.debug('Explore - Fetching explore feed for user', { userId });

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      const visibilityService = getMusicVisibilityService();
      const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId);

      logger.debug('Explore - Accessible creators resolved', {
        userId,
        totalAccessible: accessibleCreatorIds.length,
      });

      const exploreData = await fetchExploreFeedOptimized(userId, { accessibleCreatorIds });

      sendSuccess(res, exploreData);
    } catch (error) {
      logger.error('Explore - Error fetching explore feed', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch explore feed', req);
      return;
    }
  }

  async analyzeTiming(req: Request, res: Response): Promise<void> {
    const { trackId } = req.params;
    const { clipId: bodyClipId, lyricsId: bodyLyricsId, forceRefresh } = req.body || {};
    const { userId } = extractAuthContext(req);
    let tempFilePath: string | null = null;

    try {
      logger.info('Lyrics Timing Analysis - Starting analysis', {
        trackId,
        userId,
        bodyClipId: bodyClipId || 'not-provided',
        forceRefresh: forceRefresh || false,
      });

      const path = await import('path');
      const fs = await import('fs/promises');

      const track = await this.analysisService.fetchAccessibleTrack(trackId, userId);

      const audioResult = await this.analysisService.resolveAudioFilePath(String(track.file_url), path, fs);
      tempFilePath = audioResult.tempFilePath;

      const effectiveLyricsId = bodyLyricsId || track.lyrics_id;
      const { lyricsData, isUserLyrics } = await this.analysisService.fetchLyricsForAnalysis(effectiveLyricsId, userId);
      const effectiveClipId = bodyClipId || lyricsData.clipId || undefined;

      const lyricsTimingService = await this.analysisService.createLyricsTimingService();

      const analysisResult = await lyricsTimingService.getSyncedLyrics({
        clipId: effectiveClipId,
        audioFilePath: audioResult.resolvedPath,
        lyricsText: lyricsData.content,
        lyricsLines: lyricsData.syncedLines as Array<{ text: string; type?: string }> | undefined,
        forceRefresh: forceRefresh || false,
      });

      if (!analysisResult.success) {
        throw LibraryError.internalError(analysisResult.error || 'Lyrics timing analysis failed');
      }

      logger.info('Lyrics Timing Analysis - Analysis complete', {
        trackId,
        syncedLinesCount: analysisResult.syncedLines?.length || 0,
        confidence: analysisResult.metadata.confidence,
        processingTime: analysisResult.metadata.processingTime,
        method: analysisResult.metadata.method,
      });

      await this.analysisService.persistAnalysisResults(trackId, effectiveLyricsId, analysisResult, effectiveClipId);

      logger.info('Lyrics Timing Analysis - Track marked with synced lyrics', { visibility: track.visibility });

      await this.analysisService.cleanupTempFile(tempFilePath);
      tempFilePath = null;

      sendSuccess(res, {
        trackId,
        lyricsId: effectiveLyricsId,
        syncedLinesCount: analysisResult.syncedLines?.length || 0,
        confidence: analysisResult.metadata.confidence,
        processingTime: analysisResult.metadata.processingTime,
        method: analysisResult.metadata.method,
        visibility: track.visibility,
        isUserLyrics,
        hasRawTimeline: !!analysisResult.rawTimeline,
      });
    } catch (error) {
      logger.error('Lyrics Timing Analysis - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to analyze lyrics timing', req);
      return;
    } finally {
      await this.analysisService.cleanupTempFile(tempFilePath);
    }
  }

  async analyzeTimingBatch(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const { trackIds, limit = 10 } = req.body;

      logger.info('Batch Lyrics Analysis - Starting batch analysis', {
        trackIdsCount: trackIds?.length || 'all',
        limit,
        userId,
      });

      let query;
      if (trackIds && Array.isArray(trackIds) && trackIds.length > 0) {
        query = sql`
          SELECT t.id, t.title, t.file_url, t.lyrics_id
          FROM mus_tracks t
          WHERE t.user_id = ${userId}
            AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
            AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
            AND t.lyrics_id IS NOT NULL
            AND t.file_url IS NOT NULL
            AND t.id = ANY(${trackIds})
          LIMIT ${limit}
        `;
      } else {
        query = sql`
          SELECT t.id, t.title, t.file_url, t.lyrics_id
          FROM mus_tracks t
          WHERE t.user_id = ${userId}
            AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
            AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
            AND t.lyrics_id IS NOT NULL
            AND t.file_url IS NOT NULL
            AND t.has_synced_lyrics = false
          ORDER BY t.created_at DESC
          LIMIT ${limit}
        `;
      }

      const tracksResult = await this.db.execute(query);
      const batchTracks = tracksResult.rows || [];

      logger.info('Batch Lyrics Analysis - Found tracks to analyze', { count: batchTracks.length });

      if (batchTracks.length === 0) {
        return sendSuccess(res, {
          processed: 0,
          successful: 0,
          failed: 0,
          results: [],
        });
      }

      const results: Record<string, unknown>[] = [];
      let successful = 0;
      let failed = 0;

      for (const track of batchTracks) {
        try {
          logger.debug('Batch - Analyzing track', { trackId: track.id });

          const analysisResponse = await fetch(
            `http://localhost:${getOwnPort()}/api/library/analyze-timing/${track.id}`,
            {
              method: 'POST',
              headers: {
                'x-user-id': userId,
              },
              signal: AbortSignal.timeout(120000),
            }
          );

          const analysisData = (await analysisResponse.json()) as { success: boolean; data?: Record<string, unknown>; error?: string };

          if (analysisData.success) {
            successful++;
            results.push({
              trackId: track.id,
              title: track.title,
              success: true,
              ...analysisData.data,
            });
          } else {
            failed++;
            results.push({
              trackId: track.id,
              title: track.title,
              success: false,
              error: analysisData.error,
            });
          }
        } catch (error) {
          failed++;
          results.push({
            trackId: track.id,
            title: track.title,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      logger.info('Batch Lyrics Analysis - Complete', { successful, failed });

      sendSuccess(res, {
        processed: batchTracks.length,
        successful,
        failed,
        results,
      });
    } catch (error) {
      logger.error('Batch Lyrics Analysis - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to process batch analysis', req);
      return;
    }
  }

  async recordTrackPlay(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const { trackId, duration, context, completionRate, deviceType, sessionId } = req.body;

      logger.debug('Track Play - Recording play', { userId, trackId, duration });

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID is required', req);
        return;
      }

      if (completionRate != null && (typeof completionRate !== 'number' || completionRate < 0 || completionRate > 1)) {
        ServiceErrors.badRequest(res, 'completionRate must be a number between 0 and 1', req);
        return;
      }

      const visibilityService = getMusicVisibilityService();
      const accessRepo = getMusicAccessRepository();
      const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId);

      const trackInfo = await accessRepo.getAccessibleTrackForPlay(trackId, userId, accessibleCreatorIds);

      if (!trackInfo) {
        logger.warn('Track Play - Track not found or access denied', { trackId, userId });
        ServiceErrors.notFound(res, 'Track', req);
        return;
      }

      const trackType = isContentPubliclyAccessible(trackInfo.visibility ?? CONTENT_VISIBILITY.PERSONAL)
        ? CONTENT_VISIBILITY.SHARED
        : VISIBILITY_FILTER.USER;

      await this.db.execute(sql`
        INSERT INTO mus_recently_played (
          user_id,
          track_id,
          album_id,
          played_at,
          duration,
          completion_rate,
          context,
          device_type,
          session_id
        ) VALUES (
          ${userId},
          ${trackId},
          ${trackInfo.album_id || null},
          NOW(),
          ${Math.round(duration) || 0},
          ${String(completionRate ?? 0)},
          ${context ? JSON.stringify(context) : '{}'}::jsonb,
          ${deviceType || null},
          ${sessionId || null}
        )
      `);

      await this.db.execute(sql`
        UPDATE mus_tracks
        SET play_count = COALESCE(play_count, 0) + 1,
            updated_at = NOW()
        WHERE id = ${trackId}
      `);
      logger.debug('Track Play - Incremented play count', { trackId, trackType });

      logger.info('Track Play - Track play recorded successfully', { trackType });

      this.userClient.incrementPuzzleListens(userId).catch(error => {
        logger.warn('Failed to increment puzzle listens (non-critical)', { userId, error: error?.message });
      });

      sendSuccess(res, { message: 'Play recorded' });
    } catch (error) {
      logger.error('Track Play - Error recording play', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to record play', req);
      return;
    }
  }

  async updateTrack(req: Request, res: Response): Promise<void> {
    try {
      const { trackId } = req.params;
      const authContext = extractAuthContext(req);
      const userId = authContext.userId;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'Authentication required', req);
        return;
      }

      const { title, displayName, playOnDate, artworkUrl, genres, tags, status } = req.body;

      const hasUpdates = [title, displayName, playOnDate, artworkUrl, genres, tags, status].some(v => v !== undefined);
      if (!hasUpdates) {
        ServiceErrors.badRequest(res, 'No valid fields to update', req);
        return;
      }

      const existing = await this.db.execute(sql`
        SELECT t.id, t.user_id, t.visibility
        FROM mus_tracks t
        WHERE t.id = ${trackId} AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
        LIMIT 1
      `);

      if (!existing.rows || existing.rows.length === 0) {
        ServiceErrors.notFound(res, 'Track', req);
        return;
      }

      const track = existing.rows[0] as { id: string; user_id: string; visibility: string };
      const accessCtx = buildContentAccessContext(authContext, [], TIER_IDS.GUEST);

      if (!canEditContent({ ownerId: track.user_id, visibility: track.visibility }, accessCtx)) {
        ServiceErrors.forbidden(res, 'Access denied', req);
        return;
      }

      const updateParts = this.buildTrackUpdateParts(req.body);

      const setClauses = updateParts.reduce((acc, part, i) => (i === 0 ? part : sql`${acc}, ${part}`));

      const result = await this.db.execute(sql`
        UPDATE mus_tracks
        SET ${setClauses}
        WHERE id = ${trackId}
        RETURNING id, title, artwork_url, file_url as audio_url, duration, play_on_date
      `);

      logger.info('Track updated', { trackId, visibility: track.visibility, updatedBy: userId });

      this.getUserLibraryUseCase.clearUserCache(userId);

      sendSuccess(res, result.rows?.[0] || { trackId });
    } catch (error) {
      logger.error('Update Track - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update track', req);
      return;
    }
  }

  async bulkUpdateCreatorName(req: Request, res: Response): Promise<void> {
    try {
      const displayName = req.body.displayName;
      const { userId } = extractAuthContext(req);

      logger.debug('Bulk Update Creator Name - Request received', {
        displayName,
        userId,
      });

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      if (displayName === undefined) {
        ServiceErrors.badRequest(res, 'displayName is required', req);
        return;
      }

      const result = await this.db.execute(sql`
        UPDATE mus_tracks t
        SET 
          metadata = jsonb_set(COALESCE(t.metadata, '{}'::jsonb), '{displayName}', ${JSON.stringify(displayName || '')}::jsonb),
          updated_at = NOW()
        WHERE t.user_id = ${userId}
          AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
          AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
        RETURNING t.id
      `);

      const updatedCount = result.rows?.length || 0;
      logger.info('Bulk Update Creator Name - Tracks updated', {
        userId,
        displayName,
        updatedCount,
      });

      this.getUserLibraryUseCase.clearUserCache(userId);

      sendSuccess(res, {
        updatedCount,
        displayName: displayName || 'You',
      });
    } catch (error) {
      logger.error('Bulk Update Creator Name - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update tracks', req);
      return;
    }
  }

  async updateTrackArtwork(req: Request, res: Response): Promise<void> {
    try {
      const { trackId } = req.params;
      const { artworkUrl } = req.body;
      const { userId } = extractAuthContext(req);

      logger.debug('Update Track Artwork - Request received', { trackId, userId, artworkUrl });

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      if (!artworkUrl || typeof artworkUrl !== 'string') {
        ServiceErrors.badRequest(res, 'artworkUrl is required', req);
        return;
      }

      const result = await libraryOperationsService.updateTrackArtwork(trackId, userId, artworkUrl);

      if (!result.success) {
        ServiceErrors.notFound(res, result.error || 'Track', req);
        return;
      }

      this.getUserLibraryUseCase.clearUserCache(userId);

      sendSuccess(res, { trackId, artworkUrl, oldArtworkUrl: result.oldArtworkUrl });
    } catch (error) {
      logger.error('Update Track Artwork - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update track artwork', req);
      return;
    }
  }

  async updateSyncedLyrics(req: Request, res: Response): Promise<void> {
    try {
      const { trackId } = req.params;
      const { hasSyncedLyrics, lyricsId } = req.body;
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';

      logger.debug('Update Synced Lyrics Flag - Request received', {
        trackId,
        hasSyncedLyrics,
        lyricsId,
        requestId,
      });

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID is required', req);
        return;
      }

      if (typeof hasSyncedLyrics !== 'boolean') {
        ServiceErrors.badRequest(res, 'hasSyncedLyrics must be a boolean', req);
        return;
      }

      const result = await this.db.execute(sql`
        UPDATE mus_tracks
        SET has_synced_lyrics = ${hasSyncedLyrics},
            updated_at = NOW()
        WHERE id = ${trackId}
        RETURNING id, title, has_synced_lyrics
      `);

      if (!result.rows || result.rows.length === 0) {
        logger.warn('Update Synced Lyrics Flag - Track not found', { trackId, requestId });
        ServiceErrors.notFound(res, 'Track', req);
        return;
      }

      const updatedTrack = result.rows[0];
      logger.info('Update Synced Lyrics Flag - Flag updated successfully', {
        trackId,
        title: updatedTrack.title,
        hasSyncedLyrics: updatedTrack.has_synced_lyrics,
        requestId,
      });

      sendSuccess(res, {
        trackId: updatedTrack.id,
        hasSyncedLyrics: updatedTrack.has_synced_lyrics,
      });
    } catch (error) {
      logger.error('Update Synced Lyrics Flag - Error', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to update synced lyrics flag', req);
      return;
    }
  }

  async getEnabledSchedules(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, []);
  }

  private parseVisibilityQuery(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const v = value.toLowerCase();
    if (isContentPubliclyAccessible(v) || isContentPersonal(v) || v === VISIBILITY_FILTER.USER) return v;
    return undefined;
  }

  private validateTrackInput(body: Record<string, unknown>): { error?: string } {
    const { albumId, title, fileUrl, duration } = body;
    if (!albumId || typeof albumId !== 'string') {
      return { error: 'albumId is required' };
    }
    if (!title || typeof title !== 'string') {
      return { error: 'Title is required and must be a string' };
    }
    if (!fileUrl || typeof fileUrl !== 'string') {
      return { error: 'fileUrl is required and must be a string' };
    }
    if (!duration || typeof duration !== 'number') {
      return { error: 'duration is required and must be a number' };
    }
    return {};
  }

  private buildTrackInsertValues(
    body: Record<string, unknown>,
    userId: string,
    trackId: string,
    resolvedDisplayName: string,
    genresArray: string[],
    tagsArray: string[],
    visibility: string
  ): Record<string, unknown> {
    const {
      albumId,
      title,
      fileUrl,
      artworkUrl,
      duration,
      trackNumber,
      language,
      lyricsId,
      hasSyncedLyrics,
      fileSize,
      mimeType,
      quality,
    } = body;
    return {
      id: trackId,
      albumId,
      title: (title as string).trim(),
      userId,
      duration,
      fileUrl: (fileUrl as string).trim(),
      artworkUrl: artworkUrl && typeof artworkUrl === 'string' ? artworkUrl.trim() : null,
      genres: genresArray,
      tags: tagsArray,
      trackNumber: typeof trackNumber === 'number' ? trackNumber : null,
      language: typeof language === 'string' ? language : 'en',
      lyricsId: typeof lyricsId === 'string' ? lyricsId : null,
      hasSyncedLyrics: hasSyncedLyrics === true,
      status: isContentPubliclyAccessible(visibility) ? TRACK_LIFECYCLE.PUBLISHED : TRACK_LIFECYCLE.ACTIVE,
      visibility,
      quality: typeof quality === 'string' ? quality : 'standard',
      fileSize: typeof fileSize === 'number' ? fileSize : 0,
      mimeType: typeof mimeType === 'string' ? mimeType : 'audio/mpeg',
      playCount: 0,
      generatedByUserId: userId,
      metadata: { displayName: resolvedDisplayName },
    };
  }

  private filterStringArray(arr: unknown[]): string[] {
    return arr.filter((v: unknown): v is string => typeof v === 'string');
  }

  private resolvePlayOnDate(playOnDate: unknown): Date | null | undefined {
    if (playOnDate === undefined) return undefined;
    if (playOnDate === null) return null;
    return playOnDate ? new Date(playOnDate as string) : undefined;
  }

  private buildTrackUpdateParts(body: Record<string, unknown>): ReturnType<typeof sql>[] {
    const { title, artworkUrl, status, genres, tags, playOnDate } = body;
    const updateParts: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];

    if (title && typeof title === 'string') {
      updateParts.push(sql`title = ${title.trim()}`);
    }
    if (artworkUrl !== undefined) {
      updateParts.push(sql`artwork_url = ${artworkUrl && typeof artworkUrl === 'string' ? artworkUrl.trim() : null}`);
    }
    if (status && typeof status === 'string' && VALID_TRACK_STATUSES.includes(status)) {
      updateParts.push(sql`status = ${status}`);
    }
    if (genres && Array.isArray(genres)) {
      updateParts.push(sql`genres = ${this.filterStringArray(genres)}::text[]`);
    }
    if (tags && Array.isArray(tags)) {
      updateParts.push(sql`tags = ${this.filterStringArray(tags)}::text[]`);
    }
    const parsedDate = this.resolvePlayOnDate(playOnDate);
    if (parsedDate !== undefined) {
      updateParts.push(sql`play_on_date = ${parsedDate}`);
    }

    return updateParts;
  }
}
