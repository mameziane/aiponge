/**
 * Music Event Subscriber
 * Handles cross-service events from user-service
 * Uses platform-core EventSubscriber for idempotent processing and automatic retries
 */

import { eq } from 'drizzle-orm';
import {
  createEventSubscriber,
  type StandardEvent,
  type EventHandler,
  serializeError,
  signUserIdHeader,
  createServiceHttpClient,
} from '@aiponge/platform-core';
import { getLogger, getServiceUrl } from '../../config/service-urls';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import {
  albums,
  tracks,
  playlists,
  favoriteTracks,
  favoriteAlbums,
  followedCreators,
  recentlyPlayed,
  trackFeedback,
  streamSessions,
  streamAnalytics,
  lyrics,
  albumRequests,
  songRequests,
  musicAnalytics,
  playlistFollowers,
  playlistLikes,
  playlistActivities,
} from '../../schema/music-schema';
import { UserServiceClient } from '../clients/UserServiceClient';

const logger = getLogger('music-event-subscriber');

type EventSubscriber = ReturnType<typeof createEventSubscriber>;

interface CreatorMemberData {
  memberId: string;
  creatorId: string;
}

interface EntryDeletedData {
  entryId: string;
  userId: string;
  chapterId: string;
  bookId?: string;
}

interface ChapterDeletedData {
  chapterId: string;
  userId: string;
  bookId: string;
}

interface UserDeletedData {
  userId: string;
}

async function handleCreatorFollowed(_event: StandardEvent, data: CreatorMemberData): Promise<void> {
  logger.info('Received creator_member.followed event', { memberId: data.memberId });
  UserServiceClient.invalidateAccessibleCreatorsCache(data.memberId);
}

async function handleCreatorUnfollowed(_event: StandardEvent, data: CreatorMemberData): Promise<void> {
  logger.info('Received creator_member.unfollowed event', { memberId: data.memberId });
  UserServiceClient.invalidateAccessibleCreatorsCache(data.memberId);
}

async function handleEntryDeleted(_event: StandardEvent, data: EntryDeletedData): Promise<void> {
  const db = getDatabase();
  const { entryId } = data;
  logger.info('Received user.library.entry.deleted event', { entryId });

  try {
    await db.update(lyrics).set({ entryId: null }).where(eq(lyrics.entryId, entryId));
  } catch (error) {
    logger.warn('Failed to nullify entry_id in lyrics', { entryId, error: serializeError(error) });
  }
  try {
    await db.update(songRequests).set({ entryId: null }).where(eq(songRequests.entryId, entryId));
  } catch (error) {
    logger.warn('Failed to nullify entry_id in songRequests', { entryId, error: serializeError(error) });
  }
  logger.info('Nullified stale entry_id references', { entryId });
}

async function handleChapterDeleted(_event: StandardEvent, data: ChapterDeletedData): Promise<void> {
  const db = getDatabase();
  const { chapterId } = data;
  logger.info('Received user.library.chapter.deleted event', { chapterId });

  try {
    await db.update(albums).set({ chapterId: null }).where(eq(albums.chapterId, chapterId));
  } catch (error) {
    logger.warn('Failed to nullify chapter_id in albums', { chapterId, error: serializeError(error) });
  }
  try {
    await db.update(albumRequests).set({ chapterId: null }).where(eq(albumRequests.chapterId, chapterId));
  } catch (error) {
    logger.warn('Failed to nullify chapter_id in albumRequests', { chapterId, error: serializeError(error) });
  }
  logger.info('Nullified stale chapter_id references', { chapterId });
}

async function handleUserDeleted(_event: StandardEvent, data: UserDeletedData): Promise<void> {
  const db = getDatabase();
  const { userId } = data;
  const now = new Date();
  logger.info('Received user.deleted event', { userId });

  let audioUrls: string[] = [];
  let artworkUrls: string[] = [];
  try {
    const tracksToDelete = await db
      .select({ fileUrl: tracks.fileUrl, artworkUrl: tracks.artworkUrl })
      .from(tracks)
      .where(eq(tracks.userId, userId));
    audioUrls = tracksToDelete.filter(t => t.fileUrl).map(t => t.fileUrl as string);
    artworkUrls = tracksToDelete.filter(t => t.artworkUrl).map(t => t.artworkUrl as string);
  } catch (error) {
    logger.warn('Failed to extract asset URLs before user deletion', { userId, error: serializeError(error) });
  }

  const softDelete = async (table: unknown, tableName: string) => {
    try {
      const t = table as typeof tracks;
      if ('deletedAt' in (table as Record<string, unknown>)) {
        await db.update(t).set({ deletedAt: now } as never).where(eq(t.userId, userId));
      } else {
        await db.delete(t).where(eq(t.userId, userId));
      }
      logger.debug(`Cleaned ${tableName} for deleted user`, { userId });
    } catch (error) {
      logger.warn(`Failed to clean ${tableName}`, { userId, error: serializeError(error) });
    }
  };

  await softDelete(trackFeedback, 'trackFeedback');
  await softDelete(recentlyPlayed, 'recentlyPlayed');
  await softDelete(favoriteTracks, 'favoriteTracks');
  await softDelete(favoriteAlbums, 'favoriteAlbums');
  await softDelete(followedCreators, 'followedCreators');
  await softDelete(playlistFollowers, 'playlistFollowers');
  await softDelete(playlistLikes, 'playlistLikes');
  await softDelete(playlistActivities, 'playlistActivities');
  await softDelete(streamSessions, 'streamSessions');
  await softDelete(streamAnalytics, 'streamAnalytics');
  await softDelete(musicAnalytics, 'musicAnalytics');
  await softDelete(songRequests, 'songRequests');
  await softDelete(albumRequests, 'albumRequests');
  await softDelete(lyrics, 'lyrics');
  await softDelete(tracks, 'tracks');
  await softDelete(playlists, 'playlists');
  await softDelete(albums, 'albums');

  const allAssetUrls = [...audioUrls, ...artworkUrls];
  if (allAssetUrls.length > 0) {
    try {
      const storageServiceUrl = getServiceUrl('storage-service');
      const internalClient = createServiceHttpClient('internal');
      const response = await internalClient.deleteWithResponse(`${storageServiceUrl}/api/users/${userId}/files`, {
        headers: { ...signUserIdHeader(userId) },
        data: { additionalAssetUrls: allAssetUrls },
        timeout: 30000,
      });
      logger.info('Storage cleanup notification sent for deleted user', {
        userId,
        assetCount: allAssetUrls.length,
        storageResponse: response.status,
      });
    } catch (error) {
      logger.warn('Failed to notify storage-service for user file cleanup (non-blocking)', {
        userId,
        assetCount: allAssetUrls.length,
        error: serializeError(error),
      });
    }
  }

  logger.info('Music data cleanup completed for deleted user', { userId });
}

let subscriber: EventSubscriber | null = null;

export async function startMusicEventSubscriber(): Promise<void> {
  if (subscriber) return;

  subscriber = createEventSubscriber('music-service')
    .register({
      eventType: 'user.creator_member.followed',
      handler: handleCreatorFollowed as EventHandler,
    })
    .register({
      eventType: 'user.creator_member.unfollowed',
      handler: handleCreatorUnfollowed as EventHandler,
    })
    .register({
      eventType: 'user.library.entry.deleted',
      handler: handleEntryDeleted as EventHandler,
      maxRetries: 3,
    })
    .register({
      eventType: 'user.library.chapter.deleted',
      handler: handleChapterDeleted as EventHandler,
      maxRetries: 3,
    })
    .register({
      eventType: 'user.deleted',
      handler: handleUserDeleted as EventHandler,
      maxRetries: 5,
      retryDelayMs: 2000,
    });

  await subscriber.start();
  logger.debug('Music event subscriber started');
}

export async function stopMusicEventSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.shutdown();
    subscriber = null;
  }
}

export function isMusicEventSubscriberReady(): boolean {
  return subscriber !== null;
}
