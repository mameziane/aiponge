/**
 * Admin Metrics Controller
 * Provides music-related product metrics for admin dashboard
 * Uses controller-helpers wrapper for consistent response patterns
 */

import { Request, Response } from 'express';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '../../config/service-urls';
import { sql } from 'drizzle-orm';
import { createControllerHelpers, serializeError, getResponseHelpers } from '@aiponge/platform-core';
import { CONTENT_VISIBILITY, TRACK_LIFECYCLE } from '@aiponge/shared-contracts';
const { ServiceErrors } = getResponseHelpers();

const logger = getLogger('admin-metrics-controller');

const metricsErrorHandler = (res: Response, error: unknown, message: string, req?: Request) => {
  logger.error(message, { error: serializeError(error) });
  ServiceErrors.internal(res, message, error instanceof Error ? error : undefined, req);
};

const { executeSimple } = createControllerHelpers('music-service', metricsErrorHandler);

export interface MusicServiceMetrics {
  activation: {
    avgTimeToFirstSongSeconds: number | null;
    firstSongCompletionRate: number | null;
    usersWithSongs: number;
  };
  engagement: {
    songsPerActiveUserPerMonth: number | null;
    songReturnRate: number | null;
    activeUsersWithMusic: number;
    totalSongsThisMonth: number;
  };
  featureUsage: {
    trackAlarmUsageRate: number | null;
    downloadsPerUser: number | null;
    usersWithAlarms: number;
    usersWithDownloads: number;
  };
  summary: {
    totalSongsGenerated: number;
    totalPlayCount: number;
    totalUserTracks: number;
  };
  generatedAt: string;
}

export interface ReplayRateMetrics {
  weeklyReplayRate: number | null;
  distribution: {
    onePlay: number;
    twoPlays: number;
    threePlusPlays: number;
  };
  totalListeners: number;
  loyalListeners: number;
  topReplayedTracks: Array<{
    trackId: string;
    trackTitle: string;
    userId: string;
    replayCount: number;
  }>;
  avgPlaysPerTrack: number | null;
  periodDays: number;
  generatedAt: string;
}

export class AdminMetricsController {
  async getReplayRate(req: Request, res: Response): Promise<void> {
    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to get replay rate metrics',
      execute: async () => {
        const db = getDatabase();
        const days = parseInt(req.query.days as string) || 7;

        const result = await db.execute(sql`
          WITH play_counts AS (
            SELECT 
              rp.user_id,
              rp.track_id,
              COUNT(*) as plays
            FROM mus_recently_played rp
            JOIN mus_tracks t ON rp.track_id = t.id
            WHERE rp.played_at >= NOW() - MAKE_INTERVAL(days => ${days})
            AND t.source_type = 'generated'
            AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
            GROUP BY rp.user_id, rp.track_id
          ),
          user_max_plays AS (
            SELECT 
              user_id,
              MAX(plays) as max_plays
            FROM play_counts
            GROUP BY user_id
          ),
          top_replayed AS (
            SELECT 
              pc.track_id,
              t.title as track_title,
              pc.user_id,
              pc.plays as replay_count
            FROM play_counts pc
            JOIN mus_tracks t ON pc.track_id = t.id
            WHERE pc.plays >= 3
            ORDER BY pc.plays DESC
            LIMIT 10
          )
          SELECT
            (SELECT COUNT(*) FROM user_max_plays) as total_listeners,
            (SELECT COUNT(*) FROM user_max_plays WHERE max_plays = 1) as one_play_users,
            (SELECT COUNT(*) FROM user_max_plays WHERE max_plays = 2) as two_play_users,
            (SELECT COUNT(*) FROM user_max_plays WHERE max_plays >= 3) as three_plus_users,
            (SELECT COALESCE(AVG(plays), 0) FROM play_counts) as avg_plays_per_track,
            (SELECT json_agg(row_to_json(tr)) FROM top_replayed tr) as top_tracks
        `);

        const row = (
          result as unknown as Array<{
            total_listeners: string;
            one_play_users: string;
            two_play_users: string;
            three_plus_users: string;
            avg_plays_per_track: string;
            top_tracks: Array<{ track_id: string; track_title: string; user_id: string; replay_count: number }> | null;
          }>
        )[0];

        const totalListeners = parseInt(row?.total_listeners || '0', 10);
        const onePlay = parseInt(row?.one_play_users || '0', 10);
        const twoPlays = parseInt(row?.two_play_users || '0', 10);
        const threePlus = parseInt(row?.three_plus_users || '0', 10);

        const metrics: ReplayRateMetrics = {
          weeklyReplayRate: totalListeners > 0 ? threePlus / totalListeners : null,
          distribution: { onePlay, twoPlays, threePlusPlays: threePlus },
          totalListeners,
          loyalListeners: threePlus,
          topReplayedTracks: (row?.top_tracks || []).map(t => ({
            trackId: t.track_id,
            trackTitle: t.track_title || 'Untitled',
            userId: t.user_id,
            replayCount: t.replay_count,
          })),
          avgPlaysPerTrack: parseFloat(row?.avg_plays_per_track || '0') || null,
          periodDays: days,
          generatedAt: new Date().toISOString(),
        };

        return { success: true, data: metrics };
      },
      skipSuccessCheck: true,
    });
  }

  async getProductMetrics(req: Request, res: Response): Promise<void> {
    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to get music product metrics',
      execute: async () => {
        const db = getDatabase();

        const [activationMetrics, engagementMetrics, featureUsageMetrics, summaryMetrics] = await Promise.all([
          this.getActivationMetrics(db),
          this.getEngagementMetrics(db),
          this.getFeatureUsageMetrics(db),
          this.getSummaryMetrics(db),
        ]);

        const metrics: MusicServiceMetrics = {
          activation: activationMetrics,
          engagement: engagementMetrics,
          featureUsage: featureUsageMetrics,
          summary: summaryMetrics,
          generatedAt: new Date().toISOString(),
        };

        return {
          success: true,
          data: metrics,
          timestamp: new Date().toISOString(),
        };
      },
      skipSuccessCheck: true,
    });
  }

  private async getActivationMetrics(db: ReturnType<typeof getDatabase>) {
    try {
      const result = await db.execute(sql`
        WITH first_songs AS (
          SELECT 
            t.user_id,
            MIN(t.created_at) as first_song_at
          FROM mus_tracks t
          WHERE t.source_type = 'generated' AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
          GROUP BY t.user_id
        ),
        first_song_plays AS (
          SELECT 
            t.user_id,
            rp.completion_rate
          FROM first_songs fs
          JOIN mus_tracks t ON fs.user_id = t.user_id AND t.created_at = fs.first_song_at
          LEFT JOIN mus_recently_played rp ON t.id = rp.track_id::uuid AND rp.user_id = t.user_id
        )
        SELECT 
          (SELECT COUNT(DISTINCT t.user_id) FROM mus_tracks t WHERE t.source_type = 'generated' AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}) as users_with_songs,
          (SELECT COUNT(*) FILTER (WHERE CAST(completion_rate AS FLOAT) >= 0.8) FROM first_song_plays) as completed_first_songs,
          (SELECT COUNT(*) FROM first_song_plays) as total_first_songs
      `);

      const row = (
        result as unknown as Array<{
          users_with_songs: string;
          completed_first_songs: string;
          total_first_songs: string;
        }>
      )[0];
      const usersWithSongs = parseInt(row?.users_with_songs || '0', 10);
      const completedFirstSongs = parseInt(row?.completed_first_songs || '0', 10);
      const totalFirstSongs = parseInt(row?.total_first_songs || '0', 10);

      return {
        avgTimeToFirstSongSeconds: null,
        firstSongCompletionRate: totalFirstSongs > 0 ? completedFirstSongs / totalFirstSongs : null,
        usersWithSongs,
      };
    } catch (error) {
      logger.warn('Failed to get activation metrics', { error });
      return { avgTimeToFirstSongSeconds: null, firstSongCompletionRate: null, usersWithSongs: 0 };
    }
  }

  private async getEngagementMetrics(db: ReturnType<typeof getDatabase>) {
    try {
      const result = await db.execute(sql`
        WITH monthly_songs AS (
          SELECT 
            t.user_id,
            COUNT(*) as songs_this_month
          FROM mus_tracks t
          WHERE t.created_at >= NOW() - INTERVAL '30 days'
          AND t.source_type = 'generated'
          AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
          GROUP BY t.user_id
        ),
        return_listens AS (
          SELECT 
            user_id,
            track_id,
            COUNT(*) as listen_count
          FROM mus_recently_played
          WHERE played_at >= NOW() - INTERVAL '30 days'
          GROUP BY user_id, track_id
          HAVING COUNT(*) > 1
        )
        SELECT 
          (SELECT COALESCE(AVG(songs_this_month), 0) FROM monthly_songs) as avg_songs_per_user,
          (SELECT COUNT(DISTINCT user_id) FROM monthly_songs) as active_users,
          (SELECT SUM(songs_this_month) FROM monthly_songs) as total_songs,
          (SELECT COUNT(DISTINCT user_id) FROM return_listens) as users_with_returns,
          (SELECT COUNT(DISTINCT user_id) FROM mus_recently_played WHERE played_at >= NOW() - INTERVAL '30 days') as total_listening_users
      `);

      const row = (
        result as unknown as Array<{
          avg_songs_per_user: string;
          active_users: string;
          total_songs: string;
          users_with_returns: string;
          total_listening_users: string;
        }>
      )[0];

      const activeUsers = parseInt(row?.active_users || '0', 10);
      const usersWithReturns = parseInt(row?.users_with_returns || '0', 10);
      const totalListeningUsers = parseInt(row?.total_listening_users || '0', 10);

      return {
        songsPerActiveUserPerMonth: parseFloat(row?.avg_songs_per_user || '0'),
        songReturnRate: totalListeningUsers > 0 ? usersWithReturns / totalListeningUsers : null,
        activeUsersWithMusic: activeUsers,
        totalSongsThisMonth: parseInt(row?.total_songs || '0', 10),
      };
    } catch (error) {
      logger.warn('Failed to get engagement metrics', { error });
      return {
        songsPerActiveUserPerMonth: null,
        songReturnRate: null,
        activeUsersWithMusic: 0,
        totalSongsThisMonth: 0,
      };
    }
  }

  private async getFeatureUsageMetrics(db: ReturnType<typeof getDatabase>) {
    try {
      const result = await db.execute(sql`
        SELECT 
          (SELECT COUNT(DISTINCT t.user_id) FROM mus_tracks t WHERE t.status = ${TRACK_LIFECYCLE.ACTIVE} AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}) as total_users_with_tracks
      `);

      const row = (
        result as unknown as Array<{
          total_users_with_tracks: string;
        }>
      )[0];

      const totalUsersWithTracks = parseInt(row?.total_users_with_tracks || '0', 10);

      return {
        trackAlarmUsageRate: null,
        downloadsPerUser: null,
        usersWithAlarms: 0,
        usersWithDownloads: 0,
      };
    } catch (error) {
      logger.warn('Failed to get feature usage metrics', { error });
      return { trackAlarmUsageRate: null, downloadsPerUser: null, usersWithAlarms: 0, usersWithDownloads: 0 };
    }
  }

  private async getSummaryMetrics(db: ReturnType<typeof getDatabase>) {
    try {
      const result = await db.execute(sql`
        SELECT 
          (SELECT COUNT(*) FROM mus_tracks WHERE source_type = 'generated') as total_generated,
          (SELECT COALESCE(SUM(t.play_count), 0) FROM mus_tracks t WHERE t.visibility = ${CONTENT_VISIBILITY.PERSONAL}) as total_play_count,
          (SELECT COUNT(*) FROM mus_tracks t WHERE t.status = ${TRACK_LIFECYCLE.ACTIVE} AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}) as total_user_tracks
      `);

      const row = (
        result as unknown as Array<{
          total_generated: string;
          total_play_count: string;
          total_user_tracks: string;
        }>
      )[0];

      return {
        totalSongsGenerated: parseInt(row?.total_generated || '0', 10),
        totalPlayCount: parseInt(row?.total_play_count || '0', 10),
        totalUserTracks: parseInt(row?.total_user_tracks || '0', 10),
      };
    } catch (error) {
      logger.warn('Failed to get summary metrics', { error });
      return { totalSongsGenerated: 0, totalPlayCount: 0, totalUserTracks: 0 };
    }
  }
}

export const adminMetricsController = new AdminMetricsController();
