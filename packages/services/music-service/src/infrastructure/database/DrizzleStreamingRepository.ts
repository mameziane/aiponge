/**
 * DrizzleStreamingRepository
 * Streaming sessions repository using injected Drizzle database connection
 * Migrated from PostgreSQLStreamingRepository
 */

import { eq, and, desc, sql, between } from 'drizzle-orm';
import { streamSessions, streamAnalytics, type StreamSession, type NewStreamSession } from '../../schema/music-schema';
import { getLogger } from '../../config/service-urls';
import type { DatabaseConnection } from './DatabaseConnectionFactory';

const logger = getLogger('music-service-drizzle-streaming-repository');

export interface SessionInteractionMetrics {
  skipCount?: number;
  pauseCount?: number;
  seekCount?: number;
}

export interface IStreamingRepository {
  createSession(session: NewStreamSession): Promise<StreamSession>;
  getSession(sessionId: string): Promise<StreamSession | null>;
  updateSession(sessionId: string, updates: Partial<StreamSession>): Promise<void>;
  endSession(sessionId: string, endData: { duration: number; bytesStreamed: number }): Promise<void>;
  incrementSessionInteractions(sessionId: string, metrics: SessionInteractionMetrics): Promise<void>;
  getActiveSessions(userId?: string): Promise<StreamSession[]>;
  getStreamingStats(
    trackId: string,
    date?: Date
  ): Promise<{
    totalStreams: number;
    totalDuration: number;
    uniqueListeners: number;
    averageCompletion: number;
  }>;
  getTrackEngagementStats(
    trackId: string,
    days?: number
  ): Promise<{
    totalStreams: number;
    avgSkipRate: number;
    avgPauseCount: number;
    avgSeekCount: number;
    completionRate: number;
  }>;
  getUserStreamingStats(userId: string, days?: number): Promise<unknown>;
}

export class DrizzleStreamingRepository implements IStreamingRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createSession(sessionData: NewStreamSession): Promise<StreamSession> {
    const [session] = await this.db
      .insert(streamSessions)
      .values({
        ...sessionData,
        id: sessionData.id || crypto.randomUUID(),
        startedAt: new Date(),
        status: 'active',
      })
      .returning();

    logger.info('Stream session created', { sessionId: session.id, trackId: session.trackId });
    return session;
  }

  async getSession(sessionId: string): Promise<StreamSession | null> {
    const result = await this.db.select().from(streamSessions).where(eq(streamSessions.id, sessionId)).limit(1);

    return result[0] || null;
  }

  async updateSession(sessionId: string, updates: Partial<StreamSession>): Promise<void> {
    await this.db.update(streamSessions).set(updates).where(eq(streamSessions.id, sessionId));
  }

  async endSession(sessionId: string, endData: { duration: number; bytesStreamed: number }): Promise<void> {
    await this.db
      .update(streamSessions)
      .set({
        endedAt: new Date(),
        duration: endData.duration,
        bytesStreamed: endData.bytesStreamed,
        status: 'completed',
      })
      .where(eq(streamSessions.id, sessionId));

    const session = await this.getSession(sessionId);
    if (session) {
      await this.updateStreamingAnalytics(session);
      logger.info('Stream session ended', { sessionId, duration: endData.duration });
    }
  }

  async incrementSessionInteractions(sessionId: string, metrics: SessionInteractionMetrics): Promise<void> {
    const setClauses: Record<string, unknown> = {};
    if (metrics.skipCount) {
      setClauses.skipCount = sql`COALESCE(${streamSessions.skipCount}, 0) + ${metrics.skipCount}`;
    }
    if (metrics.pauseCount) {
      setClauses.pauseCount = sql`COALESCE(${streamSessions.pauseCount}, 0) + ${metrics.pauseCount}`;
    }
    if (metrics.seekCount) {
      setClauses.seekCount = sql`COALESCE(${streamSessions.seekCount}, 0) + ${metrics.seekCount}`;
    }

    if (Object.keys(setClauses).length > 0) {
      await this.db.update(streamSessions).set(setClauses).where(eq(streamSessions.id, sessionId));
    }
  }

  async getTrackEngagementStats(
    trackId: string,
    days: number = 30
  ): Promise<{
    totalStreams: number;
    avgSkipRate: number;
    avgPauseCount: number;
    avgSeekCount: number;
    completionRate: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.db
      .select({
        totalStreams: sql<number>`count(*)`.as('total_streams'),
        avgSkipCount: sql<number>`COALESCE(avg(${streamSessions.skipCount}), 0)`.as('avg_skip_count'),
        avgPauseCount: sql<number>`COALESCE(avg(${streamSessions.pauseCount}), 0)`.as('avg_pause_count'),
        avgSeekCount: sql<number>`COALESCE(avg(${streamSessions.seekCount}), 0)`.as('avg_seek_count'),
        totalWithSkips: sql<number>`count(*) FILTER (WHERE ${streamSessions.skipCount} > 0)`.as('total_with_skips'),
        totalCompleted: sql<number>`count(*) FILTER (WHERE ${streamSessions.status} = 'completed')`.as(
          'total_completed'
        ),
      })
      .from(streamSessions)
      .where(and(eq(streamSessions.trackId, trackId), between(streamSessions.startedAt, startDate, new Date())));

    const stats = result[0];
    const total = Number(stats?.totalStreams) || 0;

    return {
      totalStreams: total,
      avgSkipRate: total > 0 ? Number(stats.totalWithSkips) / total : 0,
      avgPauseCount: Number(stats?.avgPauseCount) || 0,
      avgSeekCount: Number(stats?.avgSeekCount) || 0,
      completionRate: total > 0 ? Number(stats.totalCompleted) / total : 0,
    };
  }

  async getActiveSessions(userId?: string): Promise<StreamSession[]> {
    if (userId) {
      return await this.db
        .select()
        .from(streamSessions)
        .where(and(eq(streamSessions.status, 'active'), eq(streamSessions.userId, userId)))
        .orderBy(desc(streamSessions.startedAt));
    }
    return await this.db
      .select()
      .from(streamSessions)
      .where(eq(streamSessions.status, 'active'))
      .orderBy(desc(streamSessions.startedAt));
  }

  async getStreamingStats(
    trackId: string,
    date?: Date
  ): Promise<{
    totalStreams: number;
    totalDuration: number;
    uniqueListeners: number;
    averageCompletion: number;
  }> {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await this.db
      .select({
        totalStreams: sql<number>`count(*)`.as('total_streams'),
        totalDuration: sql<number>`coalesce(sum(${streamSessions.duration}), 0)`.as('total_duration'),
        uniqueListeners: sql<number>`count(distinct ${streamSessions.userId})`.as('unique_listeners'),
        averageCompletion: sql<number>`0`.as('average_completion'),
      })
      .from(streamSessions)
      .where(and(eq(streamSessions.trackId, trackId), between(streamSessions.startedAt, startOfDay, endOfDay)));

    return (
      result[0] || {
        totalStreams: 0,
        totalDuration: 0,
        uniqueListeners: 0,
        averageCompletion: 0,
      }
    );
  }

  async getUserStreamingStats(userId: string, days: number = 30): Promise<unknown> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.db
      .select({
        totalStreams: sql<number>`count(*)`.as('total_streams'),
        totalDuration: sql<number>`coalesce(sum(${streamSessions.duration}), 0)`.as('total_duration'),
        uniqueTracks: sql<number>`count(distinct ${streamSessions.trackId})`.as('unique_tracks'),
      })
      .from(streamSessions)
      .where(and(eq(streamSessions.userId, userId), between(streamSessions.startedAt, startDate, new Date())));

    return (
      result[0] || {
        totalStreams: 0,
        totalDuration: 0,
        uniqueTracks: 0,
      }
    );
  }

  private async updateStreamingAnalytics(session: StreamSession): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const wasSkipped = (session.skipCount || 0) > 0;

    const existing = await this.db
      .select()
      .from(streamAnalytics)
      .where(and(eq(streamAnalytics.trackId, session.trackId), eq(streamAnalytics.date, today)))
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0];
      const newTotalPlays = (current.totalPlays || 0) + 1;
      const currentSkipCount = Math.round(Number(current.skipRate || 0) * (current.totalPlays || 0));
      const newSkipRate = String((currentSkipCount + (wasSkipped ? 1 : 0)) / newTotalPlays);

      await this.db
        .update(streamAnalytics)
        .set({
          totalPlays: newTotalPlays,
          totalDuration: (current.totalDuration || 0) + (session.duration || 0),
          skipRate: newSkipRate,
        })
        .where(eq(streamAnalytics.id, current.id));
    } else {
      await this.db.insert(streamAnalytics).values({
        id: crypto.randomUUID(),
        date: today,
        trackId: session.trackId,
        userId: session.userId,
        deviceType: null,
        country: null,
        region: null,
        totalPlays: 1,
        totalDuration: session.duration || 0,
        uniqueListeners: 1,
        averageCompletion: null,
        skipRate: wasSkipped ? '1' : '0',
        averageBitrate: session.bitrate,
        bufferEvents: session.bufferEvents || 0,
        qualityAdaptations: 0,
      });
    }
  }
}
