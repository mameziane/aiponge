import express from 'express';
import { PlayTrackUseCase, GetTrackUseCase } from '../../application/use-cases';
import { getLogger } from '../../config/service-urls';
import { serializeError, extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
const { sendSuccess, ServiceErrors } = getResponseHelpers();
import { getMusicVisibilityService } from '../../application/services/MusicVisibilityService';
import { getMusicAccessRepository } from '../../infrastructure/database/MusicAccessRepository';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import {
  recentlyPlayed,
  tracks,
  albums,
  favoriteTracks,
  favoriteAlbums,
  streamSessions,
} from '../../schema/music-schema';
import { eq, and, sql, isNull } from 'drizzle-orm';

const logger = getLogger('streaming-routes');

const router = express.Router();

interface StreamingDependencies {
  playTrackUseCase?: PlayTrackUseCase;
  getTrackUseCase?: GetTrackUseCase;
}

const dependencies: StreamingDependencies = {};

export function initializeStreamingRoutes(deps: StreamingDependencies): void {
  dependencies.playTrackUseCase = deps.playTrackUseCase;
  dependencies.getTrackUseCase = deps.getTrackUseCase;
}

router.post('/play', (req, res) => {
  const { userId, trackId, deviceId, quality } = req.body;
  const { userId: authUserId } = extractAuthContext(req);

  if (!authUserId) {
    ServiceErrors.badRequest(res, 'User ID is required', req);
    return;
  }

  logger.info('Starting playback', {
    trackId,
    userId: authUserId,
  });

  sendSuccess(res, {
    streamUrl: `/api/streaming/stream/${trackId}`,
    sessionId: `session_${Date.now()}`,
    quality: quality || 'medium',
  });
});

router.get('/stream/:trackId', async (req, res) => {
  const { trackId } = req.params;
  const { userId } = extractAuthContext(req);

  logger.info('Streaming track', {
    trackId,
    userId,
  });

  if (!userId) {
    ServiceErrors.badRequest(res, 'User ID is required', req);
    return;
  }

  try {
    const visibilityService = getMusicVisibilityService();
    const accessRepo = getMusicAccessRepository();
    const { accessibleCreatorIds } = await visibilityService.resolveAccessibleCreatorIds(userId);
    const track = await accessRepo.getAccessibleTrackForStreaming(trackId, userId, accessibleCreatorIds);

    if (!track || !track.file_url) {
      ServiceErrors.notFound(res, 'Track file', req);
      return;
    }

    sendSuccess(res, {
      streamUrl: track.file_url,
    });
  } catch (error) {
    logger.error('Error streaming track', {
      error: serializeError(error),
    });
    ServiceErrors.notFound(res, 'Track', req);
  }
});

router.post('/record-play', async (req, res) => {
  const { userId } = extractAuthContext(req);

  if (!userId) {
    ServiceErrors.unauthorized(res, 'User ID is required', req);
    return;
  }

  const {
    trackId,
    albumId,
    duration,
    completionRate,
    context,
    deviceType,
    sessionId,
    sessionType,
    skipCount,
    pauseCount,
    seekCount,
    networkInfo,
  } = req.body;

  if (!trackId || typeof trackId !== 'string') {
    ServiceErrors.badRequest(res, 'trackId is required', req);
    return;
  }

  if (completionRate != null && (typeof completionRate !== 'number' || completionRate < 0 || completionRate > 1)) {
    ServiceErrors.badRequest(res, 'completionRate must be a number between 0 and 1', req);
    return;
  }

  if (duration != null && typeof duration !== 'number') {
    ServiceErrors.badRequest(res, 'duration must be a number', req);
    return;
  }

  if (context != null && typeof context !== 'object') {
    ServiceErrors.badRequest(res, 'context must be an object', req);
    return;
  }

  try {
    const db = getDatabase();

    await db.insert(recentlyPlayed).values({
      userId,
      trackId,
      albumId: albumId ?? null,
      duration: duration ?? null,
      completionRate: String(completionRate ?? 0),
      context: context ?? {},
      deviceType: deviceType ?? null,
      sessionId: sessionId ?? null,
    });

    try {
      await db.insert(streamSessions).values({
        userId,
        trackId,
        sessionType: sessionType || 'on_demand',
        quality: 'medium',
        status: 'completed',
        duration: duration || 0,
        skipCount: skipCount || 0,
        pauseCount: pauseCount || 0,
        seekCount: seekCount || 0,
        networkInfo: networkInfo || {},
        deviceId: deviceType || null,
        startedAt: new Date(),
        endedAt: new Date(),
      });
    } catch (sessionErr) {
      logger.warn('Failed to create stream session (non-critical)', {
        error: sessionErr instanceof Error ? sessionErr.message : String(sessionErr),
      });
    }

    const cutoffEntries = await db
      .select({ playedAt: recentlyPlayed.playedAt })
      .from(recentlyPlayed)
      .where(eq(recentlyPlayed.userId, userId))
      .orderBy(sql`${recentlyPlayed.playedAt} DESC`)
      .limit(1)
      .offset(99);

    if (cutoffEntries.length > 0) {
      await db
        .delete(recentlyPlayed)
        .where(and(eq(recentlyPlayed.userId, userId), sql`${recentlyPlayed.playedAt} < ${cutoffEntries[0].playedAt}`));
    }

    await db
      .update(tracks)
      .set({ playCount: sql`COALESCE(${tracks.playCount}, 0) + 1`, updatedAt: new Date() })
      .where(eq(tracks.id, trackId));

    if (albumId) {
      await db
        .update(albums)
        .set({ playCount: sql`COALESCE(${albums.playCount}, 0) + 1`, updatedAt: new Date() })
        .where(eq(albums.id, albumId));
    }

    const [isFav] = await db
      .select({ id: favoriteTracks.id })
      .from(favoriteTracks)
      .where(
        and(eq(favoriteTracks.userId, userId), eq(favoriteTracks.trackId, trackId), isNull(favoriteTracks.deletedAt))
      )
      .limit(1);

    if (isFav) {
      await db
        .update(favoriteTracks)
        .set({
          playCount: sql`COALESCE(${favoriteTracks.playCount}, 0) + 1`,
          lastPlayedAt: new Date().toISOString(),
        })
        .where(
          and(eq(favoriteTracks.userId, userId), eq(favoriteTracks.trackId, trackId), isNull(favoriteTracks.deletedAt))
        );
    }

    if (albumId) {
      const [isFavAlbum] = await db
        .select({ id: favoriteAlbums.id })
        .from(favoriteAlbums)
        .where(
          and(eq(favoriteAlbums.userId, userId), eq(favoriteAlbums.albumId, albumId), isNull(favoriteAlbums.deletedAt))
        )
        .limit(1);

      if (isFavAlbum) {
        await db
          .update(favoriteAlbums)
          .set({
            playCount: sql`COALESCE(${favoriteAlbums.playCount}, 0) + 1`,
            lastPlayedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(favoriteAlbums.userId, userId),
              eq(favoriteAlbums.albumId, albumId),
              isNull(favoriteAlbums.deletedAt)
            )
          );
      }
    }

    // Update followed creator play tracking
    try {
      const [trackCreator] = await db
        .select({ userId: tracks.userId })
        .from(tracks)
        .where(eq(tracks.id, trackId))
        .limit(1);

      if (trackCreator?.userId && trackCreator.userId !== userId) {
        await db.execute(sql`
          UPDATE mus_followed_creators
          SET play_count = COALESCE(play_count, 0) + 1,
              last_played_at = NOW()
          WHERE user_id = ${userId} AND creator_id = ${trackCreator.userId}
        `);
      }
    } catch (creatorErr) {
      logger.warn('Failed to update followed creator play count (non-critical)', {
        error: creatorErr instanceof Error ? creatorErr.message : String(creatorErr),
      });
    }

    logger.info('Track play recorded', {
      userId,
      trackId,
      completionRate,
      deviceType,
      sessionId,
      isFavorite: !!isFav,
    });

    sendSuccess(res, { message: 'Play recorded' });
  } catch (error) {
    logger.error('Failed to record track play', { error: serializeError(error) });
    ServiceErrors.internal(res, 'Failed to record play', undefined, req);
  }
});

export default router;
