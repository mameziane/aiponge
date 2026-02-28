import { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { type DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import { GetUserLibraryUseCase } from '../../application/use-cases/library/GetUserLibraryUseCase';
import { libraryOperationsService } from '../../application/services/LibraryOperationsService';
import { getLogger, createServiceHttpClient } from '../../config/service-urls';
import { serializeError, extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
import { USER_ROLES, type UserRole, CONTENT_VISIBILITY, TRACK_LIFECYCLE } from '@aiponge/shared-contracts';

const { sendSuccess, ServiceErrors } = getResponseHelpers();
const internalHttpClient = createServiceHttpClient('internal');
const logger = getLogger('music-service-library-engagement-controller');

export class EngagementController {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly getUserLibraryUseCase: GetUserLibraryUseCase
  ) {}

  async getLikedTracks(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      const result = await this.db.execute(sql`
        SELECT track_id
        FROM mus_favorite_tracks
        WHERE user_id = ${userId}
      `);

      const likedTrackIds = result.rows.map((row: Record<string, unknown>) => row.track_id);

      sendSuccess(res, { likedTrackIds });
    } catch (error) {
      logger.error('Liked Tracks - Error fetching liked tracks', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch liked tracks', req);
      return;
    }
  }

  async likeTrack(req: Request, res: Response): Promise<void> {
    try {
      const { trackId } = req.params;
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID is required', req);
        return;
      }

      const existingLike = await this.db.execute(sql`
        SELECT id FROM mus_favorite_tracks
        WHERE user_id = ${userId} AND track_id = ${trackId}
      `);

      if (existingLike.rows && existingLike.rows.length > 0) {
        sendSuccess(res, { message: 'Track already liked', alreadyLiked: true });
        return;
      }

      await this.db.execute(sql`
        INSERT INTO mus_favorite_tracks (id, user_id, track_id, added_at)
        VALUES (gen_random_uuid(), ${userId}, ${trackId}, NOW())
      `);

      await this.db.execute(sql`
        UPDATE mus_tracks
        SET like_count = COALESCE(like_count, 0) + 1,
            updated_at = NOW()
        WHERE id = ${trackId}
      `);

      logger.info('Like Track - User liked track', { userId, trackId });

      sendSuccess(res, { message: 'Track liked' });
    } catch (error) {
      logger.error('Like Track - Error liking track', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to like track', req);
      return;
    }
  }

  async unlikeTrack(req: Request, res: Response): Promise<void> {
    try {
      const { trackId } = req.params;
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID is required', req);
        return;
      }

      const deleteResult = await this.db.execute(sql`
        DELETE FROM mus_favorite_tracks
        WHERE user_id = ${userId} AND track_id = ${trackId}
        RETURNING id
      `);

      if (!deleteResult.rows || deleteResult.rows.length === 0) {
        sendSuccess(res, { message: 'Track was not liked', wasNotLiked: true });
        return;
      }

      await this.db.execute(sql`
        UPDATE mus_tracks
        SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0),
            updated_at = NOW()
        WHERE id = ${trackId}
      `);

      logger.info('Unlike Track - User unliked track', { userId, trackId });

      sendSuccess(res, { message: 'Track unliked' });
    } catch (error) {
      logger.error('Unlike Track - Error unliking track', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to unlike track', req);
      return;
    }
  }

  async getActivityCalendar(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const { startDate, endDate } = req.query;

      const end = endDate ? new Date(endDate as string) : new Date();
      const start = startDate ? new Date(startDate as string) : new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);

      logger.debug('Activity Calendar - Fetching for user', {
        userId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });

      const tracksCreatedResult = await this.db.execute(sql`
        SELECT 
          DATE(t.created_at) as date,
          COUNT(*)::int as count
        FROM mus_tracks t
        WHERE t.user_id = ${userId}::uuid
          AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
          AND t.created_at >= ${start.toISOString()}::timestamp
          AND t.created_at <= ${end.toISOString()}::timestamp
          AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
        GROUP BY DATE(t.created_at)
        ORDER BY date
      `);

      const tracksListenedResult = await this.db.execute(sql`
        SELECT 
          DATE(played_at) as date,
          COUNT(*)::int as count
        FROM mus_recently_played
        WHERE user_id = ${userId}::uuid
          AND played_at >= ${start.toISOString()}::timestamp
          AND played_at <= ${end.toISOString()}::timestamp
        GROUP BY DATE(played_at)
        ORDER BY date
      `);

      const futureEnd = new Date(end.getTime() + 90 * 24 * 60 * 60 * 1000);
      const tracksScheduledResult = await this.db.execute(sql`
        SELECT 
          DATE(t.play_on_date) as date,
          COUNT(*)::int as count
        FROM mus_tracks t
        WHERE t.user_id = ${userId}::uuid
          AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
          AND t.play_on_date IS NOT NULL
          AND t.play_on_date >= ${start.toISOString()}::timestamp
          AND t.play_on_date <= ${futureEnd.toISOString()}::timestamp
          AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
        GROUP BY DATE(t.play_on_date)
        ORDER BY date
      `);

      const createdByDate = new Map<string, number>();
      const listenedByDate = new Map<string, number>();
      const scheduledByDate = new Map<string, number>();

      for (const row of tracksCreatedResult.rows as { date: string; count: number }[]) {
        const dateStr = new Date(row.date).toISOString().split('T')[0];
        createdByDate.set(dateStr, row.count);
      }

      for (const row of tracksListenedResult.rows as { date: string; count: number }[]) {
        const dateStr = new Date(row.date).toISOString().split('T')[0];
        listenedByDate.set(dateStr, row.count);
      }

      for (const row of tracksScheduledResult.rows as { date: string; count: number }[]) {
        const dateStr = new Date(row.date).toISOString().split('T')[0];
        scheduledByDate.set(dateStr, row.count);
      }

      const allDates = new Set([
        ...Array.from(createdByDate.keys()),
        ...Array.from(listenedByDate.keys()),
        ...Array.from(scheduledByDate.keys()),
      ]);
      const activities: Array<{
        date: string;
        tracksCreated: number;
        tracksListened: number;
        tracksScheduled: number;
      }> = [];

      Array.from(allDates).forEach(date => {
        activities.push({
          date,
          tracksCreated: createdByDate.get(date) || 0,
          tracksListened: listenedByDate.get(date) || 0,
          tracksScheduled: scheduledByDate.get(date) || 0,
        });
      });

      activities.sort((a, b) => a.date.localeCompare(b.date));

      const totalTracksCreated = activities.reduce((sum, a) => sum + a.tracksCreated, 0);
      const totalTracksListened = activities.reduce((sum, a) => sum + a.tracksListened, 0);
      const totalTracksScheduled = activities.reduce((sum, a) => sum + a.tracksScheduled, 0);

      logger.info('Activity Calendar - Success for user', {
        userId,
        activeDays: activities.length,
        totalTracksCreated,
        totalTracksListened,
        totalTracksScheduled,
      });

      sendSuccess(res, {
        activities,
        summary: {
          totalTracksCreated,
          totalTracksListened,
          totalTracksScheduled,
          activeDays: activities.length,
          firstActivityDate: activities.length > 0 ? activities[0].date : null,
          lastActivityDate: activities.length > 0 ? activities[activities.length - 1].date : null,
        },
      });
    } catch (error) {
      logger.error('Activity Calendar - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to fetch activity data', req);
      return;
    }
  }

  async getActivityDay(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const { date } = req.params;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const targetDate = new Date(date);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);

      logger.debug('Activity Day - Fetching details', { date, userId });

      const createdTracksResult = await this.db.execute(sql`
        SELECT 
          t.id,
          t.title,
          t.artwork_url as "artworkUrl",
          t.file_url as "fileUrl",
          t.lyrics_id as "lyricsId",
          t.duration as "duration",
          t.created_at as "createdAt"
        FROM mus_tracks t
        WHERE t.user_id = ${userId}::uuid
          AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
          AND t.created_at >= ${targetDate.toISOString()}::timestamp
          AND t.created_at < ${nextDate.toISOString()}::timestamp
          AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
        ORDER BY t.created_at DESC
      `);

      const listenedTracksResult = await this.db.execute(sql`
        SELECT 
          rp.track_id as "trackId",
          rp.played_at as "playedAt",
          rp.duration,
          COALESCE(t.title, 'Unknown Track') as title,
          t.artwork_url as "artworkUrl",
          t.file_url as "fileUrl",
          t.lyrics_id as "lyricsId"
        FROM mus_recently_played rp
        LEFT JOIN mus_tracks t ON rp.track_id = t.id
        WHERE rp.user_id = ${userId}::uuid
          AND rp.played_at >= ${targetDate.toISOString()}::timestamp
          AND rp.played_at < ${nextDate.toISOString()}::timestamp
        ORDER BY rp.played_at DESC
      `);

      const scheduledTracksResult = await this.db.execute(sql`
        SELECT 
          t.id,
          t.title,
          t.artwork_url as "artworkUrl",
          t.file_url as "fileUrl",
          t.lyrics_id as "lyricsId",
          t.duration as "duration",
          t.play_on_date as "playOnDate",
          NULL as "repeatType",
          NULL as "scheduleId"
        FROM mus_tracks t
        WHERE t.user_id = ${userId}::uuid
          AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
          AND t.play_on_date IS NOT NULL
          AND DATE(t.play_on_date) = DATE(${targetDate.toISOString()}::timestamp)
          AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
        ORDER BY t.play_on_date DESC
      `);

      sendSuccess(res, {
        date,
        tracksCreated: createdTracksResult.rows,
        tracksListened: listenedTracksResult.rows,
        tracksScheduled: scheduledTracksResult.rows,
      });
    } catch (error) {
      logger.error('Activity Day - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to fetch day activity', req);
      return;
    }
  }

  async shareToPublic(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const { trackId } = req.body;

      logger.info('Share to Public - Request received', { trackId, userId });

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID required', req);
        return;
      }

      const result = await libraryOperationsService.shareUserTrackToPublicLibrary(trackId, userId);

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Failed to share track', req);
        return;
      }

      this.getUserLibraryUseCase.clearUserCache(userId);

      sendSuccess(res, { sharedTrackId: result.sharedTrackId });
    } catch (error) {
      logger.error('Share to Public - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to share track', req);
      return;
    }
  }

  async unshareFromPublic(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const { trackId } = req.params;

      logger.info('Unshare from Public - Request received', { trackId, userId });

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID required', req);
        return;
      }

      const result = await libraryOperationsService.unshareUserTrackFromPublicLibrary(trackId, userId);

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Failed to unshare track', req);
        return;
      }

      this.getUserLibraryUseCase.clearUserCache(userId);

      sendSuccess(res, { deletedTrackId: result.deletedTrackId });
    } catch (error) {
      logger.error('Unshare from Public - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to unshare track', req);
      return;
    }
  }

  async adminDeleteSharedTrack(req: Request, res: Response): Promise<void> {
    try {
      const { userId: adminUserId } = extractAuthContext(req);
      const { trackId } = req.params;

      logger.info('Admin Delete Shared Track - Request received', { trackId, adminUserId });

      if (!adminUserId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const { getServiceUrl } = await import('@aiponge/platform-core');
      const userServiceUrl = getServiceUrl('user-service');
      const userResponse = await internalHttpClient.getWithResponse<{ success?: boolean; user?: { role?: string } }>(
        `${userServiceUrl}/api/auth/me`,
        {
          headers: { 'x-user-id': adminUserId, Authorization: req.headers.authorization || '' },
          timeout: 30000,
        }
      );
      const userData = userResponse.data;
      const userRole = userData.user?.role;

      logger.info('Admin Delete Shared Track - Role check', {
        adminUserId,
        role: userRole,
        responseStatus: userResponse.status,
      });

      const normalizedAdminRole = userRole?.toLowerCase() as UserRole;
      if (normalizedAdminRole !== USER_ROLES.ADMIN) {
        logger.warn('Admin Delete Shared Track - Non-admin attempted access', { adminUserId, actualRole: userRole });
        ServiceErrors.forbidden(res, 'Admin access required', req);
        return;
      }

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID required', req);
        return;
      }

      const result = await libraryOperationsService.deleteSharedTrack(trackId, adminUserId);

      if (!result.success) {
        ServiceErrors.notFound(res, result.error || 'Shared track', req);
        return;
      }

      sendSuccess(res, { message: 'Track deleted from shared library', trackId: result.trackId });
    } catch (error) {
      logger.error('Admin Delete Shared Track - Failed', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to delete track', req);
      return;
    }
  }

  async adminMoveToPublic(req: Request, res: Response): Promise<void> {
    try {
      const { userId: adminUserId } = extractAuthContext(req);
      const { trackId } = req.body;

      logger.info('Admin Move to Public - Request received', { trackId, adminUserId });

      if (!adminUserId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const { getServiceUrl } = await import('@aiponge/platform-core');
      const userServiceUrl = getServiceUrl('user-service');
      const userResponse = await internalHttpClient.getWithResponse<{ success?: boolean; user?: { role?: string } }>(
        `${userServiceUrl}/api/auth/me`,
        {
          headers: { 'x-user-id': adminUserId, Authorization: req.headers.authorization || '' },
          timeout: 30000,
        }
      );
      const userData = userResponse.data;
      const userRole = userData.user?.role;

      logger.info('Admin Move to Public - Role check', {
        adminUserId,
        role: userRole,
        responseStatus: userResponse.status,
      });

      const normalizedMoveRole = userRole?.toLowerCase() as UserRole;
      if (normalizedMoveRole !== USER_ROLES.ADMIN) {
        logger.warn('Admin Move to Public - Non-admin attempted access', { adminUserId, actualRole: userRole });
        ServiceErrors.forbidden(res, 'Admin access required', req);
        return;
      }

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID required', req);
        return;
      }

      const result = await libraryOperationsService.moveUserTrackToPublicLibrary(trackId, adminUserId);

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Failed to move track', req);
        return;
      }

      sendSuccess(res, { sharedTrackId: result.sharedTrackId });
    } catch (error) {
      logger.error('Admin Move to Public - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to move track', req);
      return;
    }
  }

  async getLikedAlbums(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      const result = await this.db.execute(sql`
        SELECT album_id
        FROM mus_favorite_albums
        WHERE user_id = ${userId}
      `);

      const likedAlbumIds = result.rows.map((row: Record<string, unknown>) => row.album_id);

      sendSuccess(res, { likedAlbumIds });
    } catch (error) {
      logger.error('Liked Albums - Error fetching liked albums', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch liked albums', req);
      return;
    }
  }

  async likeAlbum(req: Request, res: Response): Promise<void> {
    try {
      const { albumId } = req.params;
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      if (!albumId) {
        ServiceErrors.badRequest(res, 'Album ID is required', req);
        return;
      }

      const existingLike = await this.db.execute(sql`
        SELECT id FROM mus_favorite_albums
        WHERE user_id = ${userId} AND album_id = ${albumId}
      `);

      if (existingLike.rows && existingLike.rows.length > 0) {
        sendSuccess(res, { message: 'Album already liked', alreadyLiked: true });
        return;
      }

      await this.db.execute(sql`
        INSERT INTO mus_favorite_albums (id, user_id, album_id, added_at)
        VALUES (gen_random_uuid(), ${userId}, ${albumId}, NOW())
      `);

      logger.info('Like Album - User liked album', { userId, albumId });

      sendSuccess(res, { message: 'Album liked' });
    } catch (error) {
      logger.error('Like Album - Error liking album', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to like album', req);
      return;
    }
  }

  async unlikeAlbum(req: Request, res: Response): Promise<void> {
    try {
      const { albumId } = req.params;
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      if (!albumId) {
        ServiceErrors.badRequest(res, 'Album ID is required', req);
        return;
      }

      const deleteResult = await this.db.execute(sql`
        DELETE FROM mus_favorite_albums
        WHERE user_id = ${userId} AND album_id = ${albumId}
        RETURNING id
      `);

      if (!deleteResult.rows || deleteResult.rows.length === 0) {
        sendSuccess(res, { message: 'Album was not liked', wasNotLiked: true });
        return;
      }

      logger.info('Unlike Album - User unliked album', { userId, albumId });

      sendSuccess(res, { message: 'Album unliked' });
    } catch (error) {
      logger.error('Unlike Album - Error unliking album', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to unlike album', req);
      return;
    }
  }

  async updateFavoriteTags(req: Request, res: Response): Promise<void> {
    try {
      const { trackId } = req.params;
      const { userId } = extractAuthContext(req);
      const { tags } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      if (!trackId) {
        ServiceErrors.badRequest(res, 'Track ID is required', req);
        return;
      }

      if (!Array.isArray(tags)) {
        ServiceErrors.badRequest(res, 'tags must be an array of strings', req);
        return;
      }

      const validTags = tags
        .filter((t: unknown) => typeof t === 'string' && t.trim().length > 0)
        .map((t: string) => t.trim());

      if (validTags.length > 50) {
        ServiceErrors.badRequest(res, 'Maximum 50 tags allowed', req);
        return;
      }

      const existing = await this.db.execute(sql`
        SELECT id FROM mus_favorite_tracks
        WHERE user_id = ${userId} AND track_id = ${trackId} AND deleted_at IS NULL
      `);

      if (!existing.rows || existing.rows.length === 0) {
        ServiceErrors.notFound(res, 'Favorite track', req);
        return;
      }

      await this.db.execute(sql`
        UPDATE mus_favorite_tracks
        SET tags = ${JSON.stringify(validTags)}::jsonb
        WHERE user_id = ${userId} AND track_id = ${trackId} AND deleted_at IS NULL
      `);

      logger.info('Favorite track tags updated', { userId, trackId, tagCount: validTags.length });

      sendSuccess(res, { tags: validTags });
    } catch (error) {
      logger.error('Update Favorite Tags - Error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update favorite tags', req);
      return;
    }
  }

  async getFollowedCreators(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      const result = await this.db.execute(sql`
        SELECT creator_id
        FROM mus_followed_creators
        WHERE user_id = ${userId}
      `);

      const followedCreatorIds = result.rows.map((row: Record<string, unknown>) => row.creator_id);

      sendSuccess(res, { followedCreatorIds });
    } catch (error) {
      logger.error('Followed Creators - Error fetching followed creators', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to fetch followed creators', req);
      return;
    }
  }

  async followCreator(req: Request, res: Response): Promise<void> {
    try {
      const { creatorId } = req.params;
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      if (!creatorId) {
        ServiceErrors.badRequest(res, 'Creator ID is required', req);
        return;
      }

      const existingFollow = await this.db.execute(sql`
        SELECT id FROM mus_followed_creators
        WHERE user_id = ${userId} AND creator_id = ${creatorId}
      `);

      if (existingFollow.rows && existingFollow.rows.length > 0) {
        sendSuccess(res, { message: 'Already following creator', alreadyFollowing: true });
        return;
      }

      await this.db.execute(sql`
        INSERT INTO mus_followed_creators (id, user_id, creator_id, added_at)
        VALUES (gen_random_uuid(), ${userId}, ${creatorId}, NOW())
      `);

      logger.info('Follow Creator - User followed creator', { userId, creatorId });

      sendSuccess(res, { message: 'Now following creator' });
    } catch (error) {
      logger.error('Follow Creator - Error following creator', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to follow creator', req);
      return;
    }
  }

  async unfollowCreator(req: Request, res: Response): Promise<void> {
    try {
      const { creatorId } = req.params;
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      if (!creatorId) {
        ServiceErrors.badRequest(res, 'Creator ID is required', req);
        return;
      }

      const deleteResult = await this.db.execute(sql`
        DELETE FROM mus_followed_creators
        WHERE user_id = ${userId} AND creator_id = ${creatorId}
        RETURNING id
      `);

      if (!deleteResult.rows || deleteResult.rows.length === 0) {
        sendSuccess(res, { message: 'Was not following creator', wasNotFollowing: true });
        return;
      }

      logger.info('Unfollow Creator - User unfollowed creator', { userId, creatorId });

      sendSuccess(res, { message: 'Unfollowed creator' });
    } catch (error) {
      logger.error('Unfollow Creator - Error unfollowing creator', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to unfollow creator', req);
      return;
    }
  }

  async updateFavoriteTrack(req: Request, res: Response): Promise<void> {
    try {
      const { trackId } = req.params;
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      const { rating, notes, tags } = req.body;

      if (
        rating !== undefined &&
        (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating))
      ) {
        ServiceErrors.badRequest(res, 'Rating must be an integer between 1 and 5', req);
        return;
      }

      if (notes !== undefined && typeof notes !== 'string') {
        ServiceErrors.badRequest(res, 'Notes must be a string', req);
        return;
      }

      if (tags !== undefined && (!Array.isArray(tags) || tags.length > 50)) {
        ServiceErrors.badRequest(res, 'Tags must be an array with max 50 items', req);
        return;
      }

      if (rating === undefined && notes === undefined && tags === undefined) {
        ServiceErrors.badRequest(res, 'At least one field (rating, notes, tags) is required', req);
        return;
      }

      const parts = [];
      if (rating !== undefined) parts.push(sql`rating = ${rating}`);
      if (notes !== undefined) parts.push(sql`notes = ${notes}`);
      if (tags !== undefined) parts.push(sql`tags = ${JSON.stringify(tags)}::jsonb`);
      parts.push(sql`updated_at = NOW()`);

      const setClause = sql.join(parts, sql`, `);

      const updateResult = await this.db.execute(sql`
        UPDATE mus_favorite_tracks
        SET ${setClause}
        WHERE user_id = ${userId} AND track_id = ${trackId} AND deleted_at IS NULL
      `);

      if (!updateResult.rowCount || updateResult.rowCount === 0) {
        ServiceErrors.notFound(res, 'Favorite track', req);
        return;
      }

      logger.info('Updated favorite track metadata', {
        userId,
        trackId,
        hasRating: rating !== undefined,
        hasNotes: notes !== undefined,
        hasTags: tags !== undefined,
      });

      sendSuccess(res, { message: 'Favorite track updated' });
    } catch (error) {
      logger.error('Failed to update favorite track', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update favorite track', req);
      return;
    }
  }

  async updateFavoriteAlbum(req: Request, res: Response): Promise<void> {
    try {
      const { albumId } = req.params;
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      const { rating, favoriteTrackIds } = req.body;

      if (
        rating !== undefined &&
        (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating))
      ) {
        ServiceErrors.badRequest(res, 'Rating must be an integer between 1 and 5', req);
        return;
      }

      if (favoriteTrackIds !== undefined) {
        if (!Array.isArray(favoriteTrackIds)) {
          ServiceErrors.badRequest(res, 'favoriteTrackIds must be an array', req);
          return;
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!favoriteTrackIds.every((id: unknown) => typeof id === 'string' && uuidRegex.test(id))) {
          ServiceErrors.badRequest(res, 'Each favoriteTrackId must be a valid UUID', req);
          return;
        }
      }

      if (rating === undefined && favoriteTrackIds === undefined) {
        ServiceErrors.badRequest(res, 'At least one field (rating, favoriteTrackIds) is required', req);
        return;
      }

      const parts = [];
      if (rating !== undefined) parts.push(sql`rating = ${rating}`);
      if (favoriteTrackIds !== undefined)
        parts.push(sql`favorite_track_ids = ${JSON.stringify(favoriteTrackIds)}::jsonb`);
      parts.push(sql`updated_at = NOW()`);

      const setClause = sql.join(parts, sql`, `);

      const updateResult = await this.db.execute(sql`
        UPDATE mus_favorite_albums
        SET ${setClause}
        WHERE user_id = ${userId} AND album_id = ${albumId} AND deleted_at IS NULL
      `);

      if (!updateResult.rowCount || updateResult.rowCount === 0) {
        ServiceErrors.notFound(res, 'Favorite album', req);
        return;
      }

      logger.info('Updated favorite album metadata', {
        userId,
        albumId,
        hasRating: rating !== undefined,
        hasFavoriteTrackIds: favoriteTrackIds !== undefined,
      });

      sendSuccess(res, { message: 'Favorite album updated' });
    } catch (error) {
      logger.error('Failed to update favorite album', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update favorite album', req);
      return;
    }
  }

  async updateFollowedCreatorRating(req: Request, res: Response): Promise<void> {
    try {
      const { creatorId } = req.params;
      const { userId } = extractAuthContext(req);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID is required', req);
        return;
      }

      const { rating } = req.body;

      if (rating === undefined) {
        ServiceErrors.badRequest(res, 'Rating is required', req);
        return;
      }

      if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        ServiceErrors.badRequest(res, 'Rating must be an integer between 1 and 5', req);
        return;
      }

      const updateResult = await this.db.execute(sql`
        UPDATE mus_followed_creators
        SET rating = ${rating}
        WHERE user_id = ${userId} AND creator_id = ${creatorId}
      `);

      if (!updateResult.rowCount || updateResult.rowCount === 0) {
        ServiceErrors.notFound(res, 'Followed creator', req);
        return;
      }

      logger.info('Updated followed creator rating', { userId, creatorId, rating });

      sendSuccess(res, { message: 'Creator rating updated' });
    } catch (error) {
      logger.error('Failed to update creator rating', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update creator rating', req);
      return;
    }
  }
}
