/**
 * DrizzleLibraryRepository
 * User library repository using injected Drizzle database connection
 * Migrated from PostgreSQLLibraryRepository to use DI pattern
 *
 * Use usr_creator_members in user-service for following creators.
 */

import { eq, and, desc, sql, count, isNull } from 'drizzle-orm';
import { MusicError } from '../../application/errors';
import { getLogger } from '../../config/service-urls';
import { errorMessage } from '@aiponge/platform-core';
import { favoriteTracks, favoriteAlbums, recentlyPlayed } from '../../schema/music-schema';
import {
  ILibraryRepository,
  FavoriteTrack,
  FavoriteAlbum,
  RecentlyPlayedTrack,
} from '../repositories/ILibraryRepository';
import type { DatabaseConnection } from './DatabaseConnectionFactory';

const logger = getLogger('music-service-drizzle-library-repository');

export class DrizzleLibraryRepository implements ILibraryRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // NOTE: getUserLibrary, createUserLibrary, updateUserLibrary, updateLibraryStats removed (Feb 2026)
  // Stats are now computed on-the-fly from source tables

  async getFavoriteTracks(userId: string, limit = 50, offset = 0): Promise<FavoriteTrack[]> {
    try {
      return await this.db
        .select()
        .from(favoriteTracks)
        .where(and(eq(favoriteTracks.userId, userId), isNull(favoriteTracks.deletedAt)))
        .orderBy(desc(favoriteTracks.addedAt))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);
    } catch (error) {
      logger.error('Failed to fetch favorite tracks', {
        operation: 'getFavoriteTracks',
        userId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to fetch favorite tracks', error instanceof Error ? error : undefined);
    }
  }

  async addFavoriteTrack(userId: string, trackId: string): Promise<FavoriteTrack> {
    try {
      const existing = await this.db
        .select()
        .from(favoriteTracks)
        .where(
          and(eq(favoriteTracks.userId, userId), eq(favoriteTracks.trackId, trackId), isNull(favoriteTracks.deletedAt))
        )
        .limit(1);

      if (existing[0]) {
        return existing[0];
      }

      const [result] = await this.db
        .insert(favoriteTracks)
        .values({
          userId,
          trackId,
          playCount: 0,
          tags: [],
        })
        .returning();

      logger.info('Favorite track added', { userId, trackId });
      return result;
    } catch (error) {
      logger.error('Failed to add favorite track', {
        operation: 'addFavoriteTrack',
        userId,
        trackId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to add favorite track', error instanceof Error ? error : undefined);
    }
  }

  async removeFavoriteTrack(userId: string, trackId: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(favoriteTracks)
        .where(and(eq(favoriteTracks.userId, userId), eq(favoriteTracks.trackId, trackId)))
        .returning();

      if (result.length > 0) {
        logger.info('Favorite track removed', { userId, trackId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to remove favorite track', {
        operation: 'removeFavoriteTrack',
        userId,
        trackId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to remove favorite track', error instanceof Error ? error : undefined);
    }
  }

  async isFavoriteTrack(userId: string, trackId: string): Promise<boolean> {
    try {
      const result = await this.db
        .select({ count: count() })
        .from(favoriteTracks)
        .where(
          and(eq(favoriteTracks.userId, userId), eq(favoriteTracks.trackId, trackId), isNull(favoriteTracks.deletedAt))
        );

      return result[0]?.count > 0;
    } catch (error) {
      logger.error('Failed to check favorite track', {
        operation: 'isFavoriteTrack',
        userId,
        trackId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to check favorite track', error instanceof Error ? error : undefined);
    }
  }

  async updateTrackRating(userId: string, trackId: string, rating: number): Promise<void> {
    try {
      await this.db
        .update(favoriteTracks)
        .set({ rating })
        .where(
          and(eq(favoriteTracks.userId, userId), eq(favoriteTracks.trackId, trackId), isNull(favoriteTracks.deletedAt))
        );
    } catch (error) {
      logger.error('Failed to update track rating', {
        operation: 'updateTrackRating',
        userId,
        trackId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to update track rating', error instanceof Error ? error : undefined);
    }
  }

  async getFavoriteAlbums(userId: string, limit = 50, offset = 0): Promise<FavoriteAlbum[]> {
    try {
      return await this.db
        .select()
        .from(favoriteAlbums)
        .where(and(eq(favoriteAlbums.userId, userId), isNull(favoriteAlbums.deletedAt)))
        .orderBy(desc(favoriteAlbums.addedAt))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);
    } catch (error) {
      logger.error('Failed to fetch favorite albums', {
        operation: 'getFavoriteAlbums',
        userId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to fetch favorite albums', error instanceof Error ? error : undefined);
    }
  }

  async addFavoriteAlbum(userId: string, albumId: string): Promise<FavoriteAlbum> {
    try {
      const existing = await this.db
        .select()
        .from(favoriteAlbums)
        .where(
          and(eq(favoriteAlbums.userId, userId), eq(favoriteAlbums.albumId, albumId), isNull(favoriteAlbums.deletedAt))
        )
        .limit(1);

      if (existing[0]) {
        return existing[0];
      }

      const [result] = await this.db
        .insert(favoriteAlbums)
        .values({
          userId,
          albumId,
          playCount: 0,
          completionRate: '0',
          favoriteTrackIds: [],
        })
        .returning();

      logger.info('Favorite album added', { userId, albumId });
      return result;
    } catch (error) {
      logger.error('Failed to add favorite album', {
        operation: 'addFavoriteAlbum',
        userId,
        albumId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to add favorite album', error instanceof Error ? error : undefined);
    }
  }

  async removeFavoriteAlbum(userId: string, albumId: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(favoriteAlbums)
        .where(and(eq(favoriteAlbums.userId, userId), eq(favoriteAlbums.albumId, albumId)))
        .returning();

      if (result.length > 0) {
        logger.info('Favorite album removed', { userId, albumId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to remove favorite album', {
        operation: 'removeFavoriteAlbum',
        userId,
        albumId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to remove favorite album', error instanceof Error ? error : undefined);
    }
  }

  async isFavoriteAlbum(userId: string, albumId: string): Promise<boolean> {
    try {
      const result = await this.db
        .select({ count: count() })
        .from(favoriteAlbums)
        .where(
          and(eq(favoriteAlbums.userId, userId), eq(favoriteAlbums.albumId, albumId), isNull(favoriteAlbums.deletedAt))
        );

      return result[0]?.count > 0;
    } catch (error) {
      logger.error('Failed to check favorite album', {
        operation: 'isFavoriteAlbum',
        userId,
        albumId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to check favorite album', error instanceof Error ? error : undefined);
    }
  }

  async getRecentlyPlayed(userId: string, limit = 50): Promise<RecentlyPlayedTrack[]> {
    try {
      return await this.db
        .select()
        .from(recentlyPlayed)
        .where(eq(recentlyPlayed.userId, userId))
        .orderBy(desc(recentlyPlayed.playedAt))
        .limit(Math.min(limit || 20, 100));
    } catch (error) {
      logger.error('Failed to fetch recently played', {
        operation: 'getRecentlyPlayed',
        userId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to fetch recently played', error instanceof Error ? error : undefined);
    }
  }

  async addRecentlyPlayed(track: Omit<RecentlyPlayedTrack, 'id' | 'playedAt'>): Promise<void> {
    try {
      await this.db.insert(recentlyPlayed).values(track as typeof recentlyPlayed.$inferInsert);

      const cutoffEntries = await this.db
        .select({ playedAt: recentlyPlayed.playedAt })
        .from(recentlyPlayed)
        .where(eq(recentlyPlayed.userId, track.userId))
        .orderBy(desc(recentlyPlayed.playedAt))
        .limit(1)
        .offset(99);

      if (cutoffEntries.length > 0) {
        await this.db
          .delete(recentlyPlayed)
          .where(
            and(eq(recentlyPlayed.userId, track.userId), sql`${recentlyPlayed.playedAt} < ${cutoffEntries[0].playedAt}`)
          );
      }
    } catch (error) {
      logger.error('Failed to add recently played', {
        operation: 'addRecentlyPlayed',
        userId: track.userId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to add recently played track', error instanceof Error ? error : undefined);
    }
  }

  async clearRecentlyPlayed(userId: string): Promise<void> {
    try {
      await this.db.delete(recentlyPlayed).where(eq(recentlyPlayed.userId, userId));
      logger.info('Recently played cleared', { userId });
    } catch (error) {
      logger.error('Failed to clear recently played', {
        operation: 'clearRecentlyPlayed',
        userId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to clear recently played', error instanceof Error ? error : undefined);
    }
  }

  async updateFavoriteTrackTags(userId: string, trackId: string, tags: string[]): Promise<void> {
    try {
      await this.db
        .update(favoriteTracks)
        .set({ tags })
        .where(
          and(eq(favoriteTracks.userId, userId), eq(favoriteTracks.trackId, trackId), isNull(favoriteTracks.deletedAt))
        );
      logger.info('Favorite track tags updated', { userId, trackId, tagCount: tags.length });
    } catch (error) {
      logger.error('Failed to update favorite track tags', {
        operation: 'updateFavoriteTrackTags',
        userId,
        trackId,
        error: errorMessage(error),
      });
      throw MusicError.internalError(
        'Failed to update favorite track tags',
        error instanceof Error ? error : undefined
      );
    }
  }

  async updateFavoriteAlbumEngagement(userId: string, albumId: string): Promise<void> {
    try {
      await this.db
        .update(favoriteAlbums)
        .set({
          playCount: sql`COALESCE(${favoriteAlbums.playCount}, 0) + 1`,
          lastPlayedAt: new Date().toISOString(),
        })
        .where(
          and(eq(favoriteAlbums.userId, userId), eq(favoriteAlbums.albumId, albumId), isNull(favoriteAlbums.deletedAt))
        );
      logger.info('Favorite album engagement updated', { userId, albumId });
    } catch (error) {
      logger.error('Failed to update favorite album engagement', {
        operation: 'updateFavoriteAlbumEngagement',
        userId,
        albumId,
        error: errorMessage(error),
      });
      throw MusicError.internalError(
        'Failed to update favorite album engagement',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getLibraryStats(userId: string): Promise<{
    totalTracks: number;
    totalAlbums: number;
    totalPlayTime: number;
  }> {
    try {
      // Compute stats on-the-fly from favorite tables
      const [trackCount] = await this.db
        .select({ count: count() })
        .from(favoriteTracks)
        .where(and(eq(favoriteTracks.userId, userId), isNull(favoriteTracks.deletedAt)));

      const [albumCount] = await this.db
        .select({ count: count() })
        .from(favoriteAlbums)
        .where(and(eq(favoriteAlbums.userId, userId), isNull(favoriteAlbums.deletedAt)));

      return {
        totalTracks: trackCount?.count || 0,
        totalAlbums: albumCount?.count || 0,
        totalPlayTime: 0, // Would need stream session aggregation
      };
    } catch (error) {
      logger.error('Failed to fetch library stats', {
        operation: 'getLibraryStats',
        userId,
        error: errorMessage(error),
      });
      throw MusicError.internalError('Failed to fetch library stats', error instanceof Error ? error : undefined);
    }
  }
}
