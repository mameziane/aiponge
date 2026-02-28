/**
 * Get User Library Use Case
 * Fetches both shared library tracks and user-uploaded private tracks
 */

import { getDatabase } from '@infrastructure/database/DatabaseConnectionFactory';
import { tracks } from '@schema/music-schema';
import { eq, sql, and, or } from 'drizzle-orm';
import { getLogger } from '@config/service-urls';
import { toAbsoluteUrl } from '../../utils/url-utils';
import { LibraryError } from '../../errors';
import {
  CACHE,
  APP,
  LIBRARY_SOURCE,
  CONTENT_VISIBILITY,
  TRACK_LIFECYCLE,
  type LibrarySource,
} from '@aiponge/shared-contracts';

const logger = getLogger('music-service-getuserlibraryusecase');

// Simple in-memory cache for library queries (30 second TTL)
interface CacheEntry {
  data: GetUserLibraryResponse;
  timestamp: number;
}
const libraryCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30000; // 30 seconds
const MAX_CACHE_SIZE = CACHE.MAX_SIZE;

// Evict expired entries periodically
function evictExpiredCacheEntries(): void {
  const now = Date.now();
  for (const [key, entry] of libraryCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      libraryCache.delete(key);
    }
  }
  // If still over limit, remove oldest entries
  if (libraryCache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(libraryCache.keys()).slice(0, libraryCache.size - MAX_CACHE_SIZE);
    keysToDelete.forEach(k => libraryCache.delete(k));
  }
}

/**
 * Invalidate library cache for a specific user
 * Called when user's display name is updated to ensure fresh data is returned
 */
export function invalidateUserLibraryCache(userId: string): void {
  let deletedCount = 0;
  for (const key of libraryCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      libraryCache.delete(key);
      deletedCount++;
    }
  }
  if (deletedCount > 0) {
    logger.info('Invalidated library cache for user', { userId, deletedCount });
  }
}

/**
 * Clear entire library cache
 * Use sparingly - only for system-wide updates
 */
export function clearLibraryCache(): void {
  const size = libraryCache.size;
  libraryCache.clear();
  logger.info('Cleared entire library cache', { clearedCount: size });
}

export { LibrarySource };

export interface GetUserLibraryRequest {
  userId: string;
  source?: LibrarySource; // Filter by shared, private, or all tracks (defaults to 'shared')
  section?: 'favorites' | 'recent' | 'downloads' | 'playlists';
  limit?: number;
  offset?: number;
  search?: string; // Search query for track title (case-insensitive)
  genre?: string; // Filter by genre (case-insensitive substring match)
  language?: string; // Filter by lyrics language (ISO 639-1 code: 'en', 'fr', 'es', etc.)
  userLanguages?: string[]; // Array of languages to include (for multi-language shared library: user's preferred + English)
}

export interface GetUserLibraryResponse {
  userId: string;
  source: LibrarySource;
  section: string;
  items: LibraryItem[];
  totalCount: number;
  hasMore: boolean;
  statistics: LibraryStatistics;
}

export interface LibraryItem {
  id: string;
  type: 'track' | 'album' | 'creator' | 'playlist';
  title: string;
  displayName?: string;
  duration?: number; // Duration in seconds
  artworkUrl?: string; // Changed from coverUrl to match frontend expectations
  audioUrl?: string;
  addedAt: Date;
  lastPlayed?: Date;
  playCount?: number;
  isPrivate?: boolean; // Flag to indicate private vs shared track
  lyricsId?: string; // Reference to lyrics for generated tracks
  hasSyncedLyrics?: boolean; // True when lyrics have time-synchronized lines
  genres?: string[]; // Array of genre strings (e.g., ['pop', 'electronic'])
  tags?: string[]; // Array of tag strings
  playOnDate?: string | null; // Date when track should be auto-played in Radio mode
  language?: string; // ISO 639-1 language code for lyrics (e.g., 'en', 'fr', 'es')
  entryId?: string; // Reference to the entry that generated this track
}

export interface LibraryStatistics {
  totalFavorites: number;
  totalPlaylists: number;
  totalDownloads: number;
  recentlyPlayed: number;
  totalListeningTime: number;
}

interface UserTrackRow {
  id: string;
  title: string;
  file_url: string | null;
  artwork_url: string | null;
  duration: number | null;
  source_type: string;
  lyrics_id: string | null;
  has_synced_lyrics: boolean | null;
  genres: string[] | null;
  tags: string[] | null;
  play_on_date: string | null;
  created_at: string;
  updated_at: string;
  display_name: string | null;
  entry_id: string | null; // Joined from music requests table
}

interface CountRow {
  count: number;
}

export class GetUserLibraryUseCase {
  /**
   * Clear cache for a specific user
   * Called when user's library is modified (e.g., track deleted)
   */
  clearUserCache(userId: string): void {
    const keysToDelete: string[] = [];

    // Find all cache entries for this user
    for (const key of libraryCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    }

    // Delete all matching entries
    for (const key of keysToDelete) {
      libraryCache.delete(key);
    }

    logger.debug('Cleared {} library cache entries for user {}', {
      data0: keysToDelete.length,
      data1: userId,
    });
  }

  async execute(request: GetUserLibraryRequest): Promise<GetUserLibraryResponse> {
    try {
      const source: LibrarySource = request.source || LIBRARY_SOURCE.SHARED; // Default to shared tracks

      // Check cache first to prevent duplicate executions
      const userLangsKey = request.userLanguages?.sort().join(',') || '';
      const cacheKey = `${request.userId}:${source}:${request.section || 'favorites'}:${request.limit || 200}:${request.offset || 0}:${request.search || ''}:${request.genre || ''}:${request.language || ''}:${userLangsKey}`;
      const cached = libraryCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.debug('Returning cached library for user {} (source: {})', {
          data0: request.userId,
          data1: source,
        });
        return cached.data;
      }

      logger.info('Fetching library for user {}, source: {}, section: {}', {
        data0: request.userId,
        data1: source,
        data2: request.section || 'favorites',
      });

      const db = getDatabase();
      const limit = request.limit || 200;
      const offset = request.offset || 0;
      const allItems: LibraryItem[] = [];
      let totalSharedCount = 0;
      let totalPrivateCount = 0;

      // Query 1: Get shared tracks from mus_tracks (if source is 'shared' or 'all')
      // OPTIMIZED: For 'shared' only, use database-level pagination for performance
      // For 'all', fetch all to properly merge and sort before pagination
      if (source === LIBRARY_SOURCE.SHARED || source === LIBRARY_SOURCE.ALL) {
        try {
          // Build WHERE conditions array
          const whereConditions = [eq(tracks.status, TRACK_LIFECYCLE.PUBLISHED)];

          // Add search filter (title only - displayName is in metadata)
          if (request.search) {
            whereConditions.push(
              sql`to_tsvector('english', ${tracks.title}) @@ plainto_tsquery('english', ${request.search})`
            );
          }

          // Add genre filter (JSONB array contains match - case insensitive)
          // COALESCE handles null genres to prevent runtime errors
          if (request.genre) {
            whereConditions.push(
              sql`EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(${tracks.genres}, '[]'::jsonb)) AS genre
                WHERE LOWER(genre) LIKE LOWER(${'%' + request.genre + '%'})
              )`
            );
          }

          // Add language filter (exact match on ISO 639-1 code)
          if (request.language) {
            whereConditions.push(sql`${tracks.language} = ${request.language}`);
          }

          // Add multi-language filter: show tracks matching any of the user's preferred languages
          // This is used for shared library to show user's language + always include English
          if (request.userLanguages && request.userLanguages.length > 0) {
            // Build OR conditions for each language to match (e.g., 'en-US' OR 'es-ES')
            const languageConditions = request.userLanguages.map(lang => sql`${tracks.language} = ${lang}`);
            whereConditions.push(or(...languageConditions)!);
          }

          // Get total count first for proper pagination metadata
          const countQuery = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(tracks)
            .where(and(...whereConditions));
          totalSharedCount = countQuery[0]?.count || 0;

          // For 'shared' mode, apply database-level pagination
          // For 'all' mode, fetch all shared tracks to merge with private tracks
          const queryBuilder = db
            .select({
              id: tracks.id,
              title: tracks.title,
              userId: tracks.userId,
              duration: tracks.duration,
              fileUrl: tracks.fileUrl,
              artworkUrl: tracks.artworkUrl,
              lyricsId: tracks.lyricsId,
              hasSyncedLyrics: tracks.hasSyncedLyrics,
              genres: tracks.genres,
              tags: tracks.tags,
              language: tracks.language,
              createdAt: tracks.createdAt,
              playCount: tracks.playCount,
              metadata: tracks.metadata,
            })
            .from(tracks)
            .where(and(...whereConditions))
            .orderBy(sql`${tracks.createdAt} DESC`);

          // Apply pagination only for 'shared' mode (not for 'all')
          const sharedTracksQuery =
            source === LIBRARY_SOURCE.SHARED ? await queryBuilder.limit(limit).offset(offset) : await queryBuilder;

          logger.debug('Found {} shared tracks (total: {}, limit: {}, offset: {})', {
            data0: sharedTracksQuery.length,
            data1: totalSharedCount,
            data2: limit,
            data3: offset,
          });

          // Transform shared tracks to LibraryItem format with absolute URLs
          const sharedItems: LibraryItem[] = sharedTracksQuery.map(track => ({
            id: track.id,
            type: 'track' as const,
            title: track.title,
            displayName: (track.metadata as { displayName?: string })?.displayName || '',
            duration: track.duration,
            artworkUrl: toAbsoluteUrl(track.artworkUrl),
            audioUrl: toAbsoluteUrl(track.fileUrl),
            addedAt: track.createdAt || new Date(),
            playCount: track.playCount || 0,
            isPrivate: false,
            lyricsId: track.lyricsId || undefined,
            hasSyncedLyrics: track.hasSyncedLyrics || false,
            genres: (track.genres as string[]) || [],
            tags: (track.tags as string[]) || [],
            language: track.language || 'en',
          }));

          allItems.push(...sharedItems);
        } catch (error) {
          logger.error('Error fetching shared tracks', { error });
        }
      }

      // Query 2: Get user's personal tracks from unified mus_tracks (with album visibility filter)
      // ALSO includes shared library tracks generated by this user (for librarians)
      // OPTIMIZED: For 'private' only, use database-level pagination for performance
      // For 'all', fetch all to properly merge and sort before pagination
      if (source === LIBRARY_SOURCE.PRIVATE || source === LIBRARY_SOURCE.ALL) {
        try {
          // Build WHERE conditions dynamically
          const searchFilter = request.search ? sql`AND LOWER(title) LIKE LOWER(${'%' + request.search + '%'})` : sql``;

          const genreFilter = request.genre
            ? sql`AND EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(genres, '[]'::jsonb)) AS genre
                WHERE LOWER(genre) LIKE LOWER(${'%' + request.genre + '%'})
              )`
            : sql``;

          // Get total count first for proper pagination metadata
          // Uses UNION to count both personal tracks AND shared tracks generated by user
          const countQuery = await db.execute(sql`
            SELECT COUNT(*)::int as count FROM (
              SELECT t.id FROM mus_tracks t
              WHERE t.user_id = ${request.userId}
              AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
              AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
              UNION ALL
              SELECT t.id FROM mus_tracks t
              WHERE t.generated_by_user_id = ${request.userId}
              AND t.visibility = ${CONTENT_VISIBILITY.SHARED}
              AND t.status = ${TRACK_LIFECYCLE.PUBLISHED}
            ) combined
          `);
          totalPrivateCount = (countQuery.rows[0] as unknown as CountRow | undefined)?.count || 0;

          // For 'private' mode, apply database-level pagination
          // For 'all' mode, fetch all private tracks to merge with shared tracks
          const paginationSql = source === LIBRARY_SOURCE.PRIVATE ? sql`LIMIT ${limit} OFFSET ${offset}` : sql``;

          // UNION query: personal tracks + shared library tracks generated by user (for librarians)
          const userTracksQuery = await db.execute(sql`
            SELECT * FROM (
              SELECT 
                t.id, t.title, t.file_url, t.artwork_url, t.duration, 
                t.source_type, t.lyrics_id, t.has_synced_lyrics, 
                t.genres, t.tags, t.play_on_date, t.created_at, t.updated_at, 
                COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), 'You') as display_name,
                t.metadata->>'entryId' as entry_id,
                'user' as track_source
              FROM mus_tracks t
              WHERE t.user_id = ${request.userId}
              AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
              AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
              UNION ALL
              SELECT 
                t.id, t.title, t.file_url, t.artwork_url, t.duration,
                'generated' as source_type, t.lyrics_id, t.has_synced_lyrics,
                t.genres, t.tags, NULL as play_on_date, t.created_at, t.updated_at,
                COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), '') as display_name,
                NULL as entry_id,
                'shared' as track_source
              FROM mus_tracks t
              WHERE t.generated_by_user_id = ${request.userId}
              AND t.visibility = ${CONTENT_VISIBILITY.SHARED}
              AND t.status = ${TRACK_LIFECYCLE.PUBLISHED}
            ) combined
            ${searchFilter}
            ${genreFilter}
            ORDER BY created_at DESC
            ${paginationSql}
          `);

          interface UserTrackRowExtended extends UserTrackRow {
            track_source?: string;
          }

          const userRows = (userTracksQuery.rows || []) as unknown as UserTrackRowExtended[];
          logger.debug('Found {} user creations ({} personal, {} shared library)', {
            data0: userRows.length,
            data1: userRows.filter(r => r.track_source === 'user').length,
            data2: userRows.filter(r => r.track_source === 'shared').length,
          });

          // Transform user tracks to LibraryItem format with absolute URLs
          const userItems: LibraryItem[] = userRows.map(row => ({
            id: row.id,
            type: 'track' as const,
            title: row.title,
            displayName: row.display_name || 'You',
            duration: row.duration ?? undefined,
            artworkUrl: toAbsoluteUrl(row.artwork_url),
            audioUrl: toAbsoluteUrl(row.file_url),
            addedAt: new Date(row.created_at),
            playCount: 0,
            isPrivate: row.track_source === 'user', // Shared library tracks are not private
            lyricsId: row.lyrics_id ?? undefined,
            hasSyncedLyrics: row.has_synced_lyrics ?? false,
            genres: row.genres ?? [],
            tags: row.tags ?? [],
            playOnDate: row.play_on_date ?? null,
            entryId: row.entry_id ?? undefined, // Link to originating entry
          }));

          allItems.push(...userItems);
        } catch (error) {
          logger.error('Error fetching user tracks', { error });
        }
      }

      // Calculate true total count across all sources
      const totalCount =
        source === LIBRARY_SOURCE.ALL
          ? totalSharedCount + totalPrivateCount
          : source === LIBRARY_SOURCE.SHARED
            ? totalSharedCount
            : totalPrivateCount;

      // For 'all' mode, we need to merge and sort, then paginate in memory
      // For 'shared' or 'private', pagination was already applied at database level
      let paginatedItems: LibraryItem[];

      if (source === LIBRARY_SOURCE.ALL) {
        // Sort all items by addedAt (most recent first)
        allItems.sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
        // Apply pagination to merged results
        paginatedItems = allItems.slice(offset, offset + limit);
      } else {
        // Already paginated at database level, just sort
        allItems.sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
        paginatedItems = allItems;
      }

      // Calculate total listening time from ALL tracks (for statistics)
      const totalDuration = allItems.reduce((sum, item) => sum + (item.duration || 0), 0);

      // Calculate statistics
      const statistics: LibraryStatistics = {
        totalFavorites: totalCount,
        totalPlaylists: 0,
        totalDownloads: totalCount,
        recentlyPlayed: totalCount,
        totalListeningTime: totalDuration,
      };

      logger.info('Library retrieved for user {}', {
        data0: request.userId,
      });

      const response: GetUserLibraryResponse = {
        userId: request.userId,
        source: source,
        section: request.section || 'favorites',
        items: paginatedItems,
        totalCount: totalCount,
        hasMore: offset + limit < totalCount,
        statistics,
      };

      // Cache the response
      libraryCache.set(cacheKey, {
        data: response,
        timestamp: Date.now(),
      });

      // Cleanup old/expired cache entries (keep cache size bounded)
      if (libraryCache.size > MAX_CACHE_SIZE / 2) {
        evictExpiredCacheEntries();
      }

      return response;
    } catch (error) {
      logger.error('Failed to get user library', { error });
      throw LibraryError.internalError(
        `Failed to get user library: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}
