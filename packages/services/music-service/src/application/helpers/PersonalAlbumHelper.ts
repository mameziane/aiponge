import { getLogger } from '../../config/service-urls';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { albums } from '../../schema/music-schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { CONTENT_VISIBILITY, ALBUM_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = getLogger('music-service:personal-album-helper');

export const PERSONAL_ALBUM_TITLE = 'My Songs';
export const PERSONAL_ALBUM_TYPE = 'compilation' as const;

export interface PersonalAlbumInfo {
  albumId: string;
  userId: string;
  isNew: boolean;
}

export async function getOrCreatePersonalAlbumForUser(userId: string): Promise<PersonalAlbumInfo> {
  const db = getDatabase();

  const existingAlbum = await db
    .select({ id: albums.id })
    .from(albums)
    .where(
      and(
        eq(albums.userId, userId),
        eq(albums.title, PERSONAL_ALBUM_TITLE),
        eq(albums.visibility, CONTENT_VISIBILITY.PERSONAL)
      )
    )
    .limit(1);

  if (existingAlbum.length > 0) {
    logger.debug('Found existing personal album', {
      albumId: existingAlbum[0].id,
      userId,
    });
    return {
      albumId: existingAlbum[0].id,
      userId,
      isNew: false,
    };
  }

  const albumId = uuidv4();

  try {
    await db.insert(albums).values({
      id: albumId,
      title: PERSONAL_ALBUM_TITLE,
      userId,
      description: 'Your personal songs collection',
      type: PERSONAL_ALBUM_TYPE,
      status: ALBUM_LIFECYCLE.PUBLISHED,
      visibility: CONTENT_VISIBILITY.PERSONAL,
      totalTracks: 0,
      totalDuration: 0,
      genres: [],
      metadata: {
        isSystemAlbum: true,
        purpose: 'personal-collection',
        autoCreated: true,
      },
    } as typeof albums.$inferInsert);

    logger.info('Created personal album for user', {
      albumId,
      userId,
    });

    return {
      albumId,
      userId,
      isNew: true,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('unique')) {
      logger.debug('Personal album created by concurrent request, fetching existing');
      const retryAlbum = await db
        .select({ id: albums.id })
        .from(albums)
        .where(
          and(
            eq(albums.userId, userId),
            eq(albums.title, PERSONAL_ALBUM_TITLE),
            eq(albums.visibility, CONTENT_VISIBILITY.PERSONAL)
          )
        )
        .limit(1);

      if (retryAlbum.length > 0) {
        return {
          albumId: retryAlbum[0].id,
          userId,
          isNew: false,
        };
      }
    }

    logger.error('Failed to create personal album', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
