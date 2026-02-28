/**
 * DrizzlePlaylistRepository
 * Playlist repository using injected Drizzle database connection
 * Migrated from PostgreSQLPlaylistRepository with proper typing
 */

import { eq, and, desc, count, sql, inArray, like, isNull } from 'drizzle-orm';
import { errorMessage } from '@aiponge/platform-core';
import {
  playlists,
  playlistTracks,
  playlistFollowers,
  playlistActivities,
  type Playlist,
  type NewPlaylist,
  type PlaylistTrack,
  type NewPlaylistTrack,
} from '../../schema/music-schema';
import { getLogger } from '../../config/service-urls';
import type { DatabaseConnection } from './DatabaseConnectionFactory';
import { CONTENT_VISIBILITY, PLAYLIST_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = getLogger('music-service-drizzle-playlist-repository');

export interface IPlaylistRepository {
  createPlaylist(playlist: NewPlaylist): Promise<Playlist>;
  getPlaylistById(id: string): Promise<Playlist | null>;
  getPlaylistsByUser(userId: string): Promise<Playlist[]>;
  updatePlaylist(id: string, updates: Partial<Playlist>): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  addTrackToPlaylist(playlistId: string, track: NewPlaylistTrack): Promise<void>;
  removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void>;
  reorderPlaylistTracks(playlistId: string, trackIds: string[]): Promise<void>;
  getPlaylistTracks(playlistId: string): Promise<PlaylistTrack[]>;
  followPlaylist(playlistId: string, userId: string): Promise<void>;
  unfollowPlaylist(playlistId: string, userId: string): Promise<void>;
  searchPlaylists(query: string, limit?: number): Promise<Playlist[]>;
  getPublicPlaylists(limit?: number): Promise<Playlist[]>;
  getTrendingPlaylists(limit?: number): Promise<Playlist[]>;
}

export class DrizzlePlaylistRepository implements IPlaylistRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createPlaylist(playlistData: NewPlaylist): Promise<Playlist> {
    const [playlist] = await this.db
      .insert(playlists)
      .values({
        ...playlistData,
        id: playlistData.id || crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (playlist.userId) {
      await this.recordActivity({
        playlistId: playlist.id,
        userId: playlist.userId,
        activityType: 'created',
        details: { name: playlist.name },
      });
    }

    logger.info('Playlist created', { id: playlist.id, name: playlist.name });
    return playlist;
  }

  async getPlaylistById(id: string): Promise<Playlist | null> {
    const result = await this.db
      .select()
      .from(playlists)
      .where(and(eq(playlists.id, id), eq(playlists.status, PLAYLIST_LIFECYCLE.ACTIVE), isNull(playlists.deletedAt)))
      .limit(1);

    return result[0] || null;
  }

  async getPlaylistsByUser(userId: string): Promise<Playlist[]> {
    logger.debug('getPlaylistsByUser called', { userId });
    const result = await this.db
      .select()
      .from(playlists)
      .where(
        and(eq(playlists.userId, userId), eq(playlists.status, PLAYLIST_LIFECYCLE.ACTIVE), isNull(playlists.deletedAt))
      )
      .orderBy(desc(playlists.updatedAt));

    logger.debug('Query returned playlists', { userId, count: result.length });
    return result;
  }

  async updatePlaylist(id: string, updates: Partial<Playlist>): Promise<void> {
    await this.db
      .update(playlists)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(playlists.id, id), isNull(playlists.deletedAt)));

    const playlist = await this.getPlaylistById(id);
    if (playlist && playlist.userId) {
      await this.recordActivity({
        playlistId: id,
        userId: playlist.userId,
        activityType: 'updated',
        details: updates,
      });
    }
  }

  async deletePlaylist(id: string): Promise<void> {
    const playlist = await this.getPlaylistById(id);

    await this.db
      .update(playlists)
      .set({
        status: PLAYLIST_LIFECYCLE.DELETED,
        updatedAt: new Date(),
      })
      .where(and(eq(playlists.id, id), isNull(playlists.deletedAt)));

    if (playlist && playlist.userId) {
      await this.recordActivity({
        playlistId: id,
        userId: playlist.userId,
        activityType: 'deleted',
        details: {},
      });
    }
    logger.info('Playlist deleted', { id });
  }

  async addTrackToPlaylist(playlistId: string, trackData: NewPlaylistTrack): Promise<void> {
    const [maxPosition] = await this.db
      .select({ maxPos: sql<number>`COALESCE(MAX(position), 0)` })
      .from(playlistTracks)
      .where(and(eq(playlistTracks.playlistId, playlistId), isNull(playlistTracks.deletedAt)));

    await this.db.insert(playlistTracks).values({
      ...trackData,
      playlistId,
      position: maxPosition.maxPos + 1,
      addedAt: new Date(),
    });

    await this.db
      .update(playlists)
      .set({ updatedAt: new Date() })
      .where(and(eq(playlists.id, playlistId), isNull(playlists.deletedAt)));

    await this.recordActivity({
      playlistId,
      userId: trackData.addedBy,
      activityType: 'track_added',
      entityType: 'track',
      entityId: trackData.trackId,
      details: { trackId: trackData.trackId },
    });

    logger.info('Track added to playlist', { playlistId, trackId: trackData.trackId });
  }

  async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    const [removedTrack] = await this.db
      .delete(playlistTracks)
      .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)))
      .returning();

    if (removedTrack) {
      await this.db
        .update(playlistTracks)
        .set({
          position: sql`position - 1`,
        })
        .where(and(eq(playlistTracks.playlistId, playlistId), sql`position > ${removedTrack.position}`));

      await this.db
        .update(playlists)
        .set({ updatedAt: new Date() })
        .where(and(eq(playlists.id, playlistId), isNull(playlists.deletedAt)));

      logger.info('Track removed from playlist', { playlistId, trackId });
    }
  }

  async reorderPlaylistTracks(playlistId: string, trackIds: string[]): Promise<void> {
    for (let i = 0; i < trackIds.length; i++) {
      await this.db
        .update(playlistTracks)
        .set({ position: i + 1 })
        .where(
          and(
            eq(playlistTracks.playlistId, playlistId),
            eq(playlistTracks.trackId, trackIds[i]),
            isNull(playlistTracks.deletedAt)
          )
        );
    }

    await this.db
      .update(playlists)
      .set({ updatedAt: new Date() })
      .where(and(eq(playlists.id, playlistId), isNull(playlists.deletedAt)));
  }

  async getPlaylistTracks(playlistId: string): Promise<PlaylistTrack[]> {
    return await this.db
      .select()
      .from(playlistTracks)
      .where(and(eq(playlistTracks.playlistId, playlistId), isNull(playlistTracks.deletedAt)))
      .orderBy(playlistTracks.position);
  }

  async followPlaylist(playlistId: string, userId: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(playlistFollowers)
      .where(and(eq(playlistFollowers.playlistId, playlistId), eq(playlistFollowers.userId, userId)))
      .limit(1);

    if (!existing[0]) {
      await this.db.insert(playlistFollowers).values({
        playlistId,
        userId,
        followedAt: new Date(),
      });

      await this.db
        .update(playlists)
        .set({
          followerCount: sql`COALESCE(${playlists.followerCount}, 0) + 1`,
        })
        .where(and(eq(playlists.id, playlistId), isNull(playlists.deletedAt)));

      logger.info('Playlist followed', { playlistId, userId });
    }
  }

  async unfollowPlaylist(playlistId: string, userId: string): Promise<void> {
    const result = await this.db
      .delete(playlistFollowers)
      .where(and(eq(playlistFollowers.playlistId, playlistId), eq(playlistFollowers.userId, userId)))
      .returning();

    if (result.length > 0) {
      await this.db
        .update(playlists)
        .set({
          followerCount: sql`GREATEST(COALESCE(${playlists.followerCount}, 0) - 1, 0)`,
        })
        .where(and(eq(playlists.id, playlistId), isNull(playlists.deletedAt)));

      logger.info('Playlist unfollowed', { playlistId, userId });
    }
  }

  async searchPlaylists(query: string, limit = 20): Promise<Playlist[]> {
    return await this.db
      .select()
      .from(playlists)
      .where(
        and(
          eq(playlists.status, PLAYLIST_LIFECYCLE.ACTIVE),
          eq(playlists.visibility, CONTENT_VISIBILITY.SHARED),
          like(playlists.name, `%${query}%`),
          isNull(playlists.deletedAt)
        )
      )
      .orderBy(desc(playlists.followerCount))
      .limit(Math.min(limit || 20, 100));
  }

  async getPublicPlaylists(limit = 20): Promise<Playlist[]> {
    return this.getSharedPlaylists(limit);
  }

  async getSharedPlaylists(limit = 20): Promise<Playlist[]> {
    return await this.db
      .select()
      .from(playlists)
      .where(
        and(
          eq(playlists.status, PLAYLIST_LIFECYCLE.ACTIVE),
          eq(playlists.visibility, CONTENT_VISIBILITY.SHARED),
          isNull(playlists.deletedAt)
        )
      )
      .orderBy(desc(playlists.followerCount))
      .limit(Math.min(limit || 20, 100));
  }

  async getTrendingPlaylists(limit = 10): Promise<Playlist[]> {
    return await this.db
      .select()
      .from(playlists)
      .where(
        and(
          eq(playlists.status, PLAYLIST_LIFECYCLE.ACTIVE),
          eq(playlists.visibility, CONTENT_VISIBILITY.SHARED),
          isNull(playlists.deletedAt)
        )
      )
      .orderBy(desc(playlists.playCount), desc(playlists.followerCount))
      .limit(Math.min(limit || 20, 100));
  }

  private async recordActivity(activity: {
    playlistId: string;
    userId: string;
    activityType: string;
    entityType?: string;
    entityId?: string;
    details?: unknown;
  }): Promise<void> {
    try {
      await this.db.insert(playlistActivities).values({
        playlistId: activity.playlistId,
        userId: activity.userId,
        action: activity.activityType,
        details: activity.details || {},
      } as typeof playlistActivities.$inferInsert);
    } catch (error) {
      logger.warn('Failed to record playlist activity', { error: errorMessage(error) });
    }
  }
}
