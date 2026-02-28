/**
 * ExploreFeedService - Optimized explore feed with single-query execution
 *
 * Performance optimization: Combines 8 separate SQL queries into a single
 * CTE-based query returning JSON aggregates, reducing DB round-trips from 8 to 1.
 *
 * Original: 8 parallel queries = 8 DB connections, 8 network round trips
 * Optimized: 1 CTE query = 1 DB connection, 1 network round trip
 */

import { getLogger } from '../../config/service-urls';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { sql } from 'drizzle-orm';
import { normalizeKeys } from '../utils/data-utils';
import { normalizeTrackCollection } from '../utils/url-utils';
import { APP, CONTENT_VISIBILITY, TRACK_LIFECYCLE, PLAYLIST_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = getLogger('explore-feed-service');

export interface ExploreTrack {
  id: string;
  title: string;
  artworkUrl?: string | null;
  audioUrl?: string | null;
  duration?: number | null;
  genres?: string[] | null;
  tags?: string[] | null;
  displayName?: string;
  playCount?: number;
  likeCount?: number;
  lyricsId?: string | null;
  hasSyncedLyrics?: boolean;
  sourceType?: string;
  createdAt?: string;
  playedAt?: string;
  isUserCreation?: boolean;
  rank?: number;
}

export interface ExplorePlaylist {
  id: string;
  title: string;
  description?: string | null;
  artworkUrl?: string | null;
  totalTracks?: number;
  totalDuration?: number;
  category?: string | null;
  mood?: string | null;
  genre?: string | null;
}

export interface ExploreFeedData {
  recentlyPlayed: ExploreTrack[];
  yourCreations: ExploreTrack[];
  yourTopSongs: ExploreTrack[];
  featuredPlaylists: ExplorePlaylist[];
  popularTracks: ExploreTrack[];
  topCharts: ExploreTrack[];
  recommendations: ExploreTrack[];
  worksInProgress: ExploreTrack[];
}

interface ExploreFeedRow {
  recently_played: Record<string, unknown>[] | null;
  your_creations: Record<string, unknown>[] | null;
  your_top_songs: Record<string, unknown>[] | null;
  featured_playlists: Record<string, unknown>[] | null;
  popular_tracks: Record<string, unknown>[] | null;
  top_charts: Record<string, unknown>[] | null;
  recommendations: Record<string, unknown>[] | null;
  works_in_progress: Record<string, unknown>[] | null;
}

export interface ExploreFeedOptions {
  accessibleCreatorIds?: string[];
}

/**
 * Fetch explore feed using a single optimized CTE query
 * Returns all 8 sections in one database call
 *
 * @param userId - Current user's ID
 * @param options - Optional configuration including accessibleCreatorIds for visibility filtering
 */
export async function fetchExploreFeedOptimized(
  userId: string,
  options?: ExploreFeedOptions
): Promise<ExploreFeedData> {
  const db = getDatabase();
  const accessibleCreatorIds = options?.accessibleCreatorIds || [];

  logger.debug('ExploreFeed - Fetching with optimized single-query', {
    userId,
    accessibleCreatorCount: accessibleCreatorIds.length,
  });
  const startTime = Date.now();

  // Convert JS array to PostgreSQL array literal format: ARRAY['id1','id2']::uuid[]
  // Empty array becomes ARRAY[]::uuid[] which PostgreSQL handles correctly
  const pgArrayLiteral =
    accessibleCreatorIds.length > 0
      ? `ARRAY[${accessibleCreatorIds.map(id => `'${id}'`).join(',')}]::uuid[]`
      : 'ARRAY[]::uuid[]';

  try {
    const result = await db.execute(sql`
      WITH 
      -- Accessible creator IDs for visibility filtering (includes librarians + followed creators)
      accessible_creators AS (
        SELECT unnest(${sql.raw(pgArrayLiteral)}) as creator_id
      ),
      -- Recently Played - unique tracks ordered by most recent play
      recent_plays_raw AS (
        SELECT 
          rp.track_id,
          rp.played_at,
          ROW_NUMBER() OVER (PARTITION BY rp.track_id ORDER BY rp.played_at DESC) as rn
        FROM mus_recently_played rp
        WHERE rp.user_id = ${userId}
      ),
      recently_played AS (
        SELECT json_agg(row_to_json(t)) as data FROM (
          SELECT
            t.id,
            t.title,
            t.artwork_url,
            t.file_url as audio_url,
            t.duration,
            t.genres,
            t.tags,
            t.lyrics_id,
            t.has_synced_lyrics,
            t.source_type,
            t.created_at,
            recent.played_at,
            CASE WHEN t.visibility = ${CONTENT_VISIBILITY.PERSONAL} THEN true ELSE false END as is_user_creation,
            CASE
              WHEN t.visibility = ${CONTENT_VISIBILITY.PERSONAL} THEN 'You'
              ELSE COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), '')
            END as display_name
          FROM recent_plays_raw recent
          JOIN mus_tracks t ON recent.track_id = t.id
          WHERE recent.rn = 1
            AND t.status IN (${TRACK_LIFECYCLE.PUBLISHED}, ${TRACK_LIFECYCLE.ACTIVE})
            AND (t.visibility = ${CONTENT_VISIBILITY.PUBLIC} OR t.visibility = ${CONTENT_VISIBILITY.SHARED} OR (t.visibility = ${CONTENT_VISIBILITY.PERSONAL} AND t.user_id = ${userId}))
          ORDER BY recent.played_at DESC
          LIMIT 10
        ) t
      ),
      
      -- Your Creations - user tracks from unified mus_tracks (personal visibility) PLUS shared library tracks generated by user
      your_creations AS (
        SELECT json_agg(row_to_json(t)) as data FROM (
          SELECT * FROM (
            -- User's personal tracks from unified mus_tracks
            SELECT 
              t2.id, t2.title, t2.artwork_url, t2.file_url as audio_url,
              t2.duration as duration, t2.source_type, t2.created_at,
              t2.metadata, t2.lyrics_id, t2.has_synced_lyrics,
              t2.genres, t2.tags,
              'You' as display_name,
              CASE WHEN t2.lyrics_id IS NOT NULL THEN true ELSE false END as has_lyrics_id,
              'user' as track_source
            FROM mus_tracks t2
            JOIN mus_albums a2 ON t2.album_id = a2.id
            WHERE t2.user_id = ${userId}
              AND a2.visibility = ${CONTENT_VISIBILITY.PERSONAL}
              AND t2.status = ${TRACK_LIFECYCLE.ACTIVE}
            UNION ALL
            -- Shared library tracks generated by this user (for librarians)
            SELECT 
              t.id, t.title, t.artwork_url, t.file_url as audio_url,
              t.duration as duration, 'generated' as source_type, t.created_at,
              t.metadata, t.lyrics_id, t.has_synced_lyrics,
              t.genres, t.tags,
              COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), '') as display_name,
              CASE WHEN t.lyrics_id IS NOT NULL THEN true ELSE false END as has_lyrics_id,
              'shared' as track_source
            FROM mus_tracks t
            WHERE t.generated_by_user_id = ${userId}
              AND t.status = ${TRACK_LIFECYCLE.PUBLISHED}
          ) combined
          ORDER BY created_at DESC
          LIMIT 20
        ) t
      ),
      
      -- Your Top Songs - most played user creations (unified mus_tracks)
      your_top_songs AS (
        SELECT json_agg(row_to_json(t)) as data FROM (
          SELECT 
            t.id, t.title, t.artwork_url,
            t.file_url as audio_url, t.duration as duration,
            t.source_type, t.created_at, t.has_synced_lyrics,
            t.genres, t.tags, t.lyrics_id,
            'You' as display_name,
            COUNT(rp.id) as play_count
          FROM mus_tracks t
          LEFT JOIN mus_recently_played rp ON rp.track_id = t.id
          WHERE t.user_id = ${userId}
            AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
            AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
          GROUP BY t.id
          HAVING COUNT(rp.id) > 0
          ORDER BY COUNT(rp.id) DESC, t.created_at DESC
          LIMIT 10
        ) t
      ),
      
      -- Featured Playlists - public/shared playlists with actual track counts
      featured_playlists AS (
        SELECT json_agg(row_to_json(t)) as data FROM (
          SELECT 
            p.id, p.name as title, p.description,
            p.artwork_url as artwork_url,
            COALESCE(pt_count.actual_count, 0) as total_tracks,
            p.total_duration, p.category, p.mood, p.genre
          FROM mus_playlists p
          LEFT JOIN (
            SELECT playlist_id, COUNT(*) as actual_count
            FROM mus_playlist_tracks
            GROUP BY playlist_id
          ) pt_count ON pt_count.playlist_id = p.id
          WHERE p.visibility IN (${CONTENT_VISIBILITY.PUBLIC}, ${CONTENT_VISIBILITY.SHARED})
            AND p.status = ${PLAYLIST_LIFECYCLE.ACTIVE}
            AND p.category IN ('featured', 'algorithm')
          ORDER BY p.follower_count DESC, p.created_at DESC
          LIMIT 10
        ) t
      ),
      
      -- Popular Tracks - most played public/shared tracks (visibility-filtered)
      -- PUBLIC tracks visible to everyone; SHARED tracks only from accessible creators
      popular_tracks AS (
        SELECT json_agg(row_to_json(t)) as data FROM (
          SELECT 
            t.id, t.title, t.artwork_url, t.file_url as audio_url,
            t.duration, t.play_count, t.lyrics_id, t.has_synced_lyrics,
            t.genres, t.tags,
            COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), '') as display_name
          FROM mus_tracks t
          WHERE t.status = ${TRACK_LIFECYCLE.PUBLISHED}
            AND (
              t.visibility = ${CONTENT_VISIBILITY.PUBLIC}
              OR (t.visibility = ${CONTENT_VISIBILITY.SHARED} AND t.user_id IN (SELECT creator_id FROM accessible_creators))
            )
          ORDER BY t.play_count DESC, t.created_at DESC
          LIMIT 20
        ) t
      ),
      
      -- Top Charts - overall top tracks (combined play + like score, visibility-filtered)
      -- PUBLIC tracks visible to everyone; SHARED tracks only from accessible creators
      top_charts AS (
        SELECT json_agg(row_to_json(t)) as data FROM (
          SELECT 
            t.id, t.title, t.artwork_url, t.file_url as audio_url,
            t.duration, t.play_count, t.like_count, t.lyrics_id,
            t.has_synced_lyrics, t.genres, t.tags,
            COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), '') as display_name
          FROM mus_tracks t
          WHERE t.status = ${TRACK_LIFECYCLE.PUBLISHED}
            AND (
              t.visibility = ${CONTENT_VISIBILITY.PUBLIC}
              OR (t.visibility = ${CONTENT_VISIBILITY.SHARED} AND t.user_id IN (SELECT creator_id FROM accessible_creators))
            )
          ORDER BY (t.play_count * 0.7 + COALESCE(t.like_count, 0) * 0.3) DESC, t.created_at DESC
          LIMIT 20
        ) t
      ),
      
      -- Recommendations - personalized based on listening history (excludes recently played, visibility-filtered)
      -- PUBLIC tracks visible to everyone; SHARED tracks only from accessible creators
      user_played_tracks AS (
        SELECT DISTINCT track_id 
        FROM mus_recently_played 
        WHERE user_id = ${userId}
        LIMIT 1000
      ),
      candidate_tracks AS (
        SELECT t.id, t.title, t.artwork_url, t.file_url as audio_url,
          t.duration, t.play_count, t.lyrics_id, t.has_synced_lyrics,
          t.genres, t.tags,
          COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), '') as display_name
        FROM mus_tracks t
        WHERE t.status = ${TRACK_LIFECYCLE.PUBLISHED}
          AND NOT EXISTS (SELECT 1 FROM user_played_tracks upt WHERE upt.track_id = t.id)
          AND (
            t.visibility = ${CONTENT_VISIBILITY.PUBLIC}
            OR (t.visibility = ${CONTENT_VISIBILITY.SHARED} AND t.user_id IN (SELECT creator_id FROM accessible_creators))
          )
        ORDER BY t.play_count DESC, t.created_at DESC
        LIMIT 100
      ),
      recommendations AS (
        SELECT json_agg(row_to_json(t)) as data FROM (
          SELECT * FROM candidate_tracks
          ORDER BY hashtext(id::text || ${userId} || CURRENT_DATE::text)
          LIMIT 15
        ) t
      ),
      
      -- Works in Progress - draft/processing tracks (unified mus_tracks)
      works_in_progress AS (
        SELECT json_agg(row_to_json(t)) as data FROM (
          SELECT 
            t.id, t.title, t.artwork_url, t.duration as duration,
            t.status, t.source_type, t.created_at, t.updated_at, t.metadata,
            t.has_synced_lyrics, t.genres, t.tags
          FROM mus_tracks t
          WHERE t.user_id = ${userId}
            AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
            AND t.status IN (${TRACK_LIFECYCLE.DRAFT}, ${TRACK_LIFECYCLE.PROCESSING})
          ORDER BY t.updated_at DESC
          LIMIT 10
        ) t
      )
      
      -- Final selection: all sections as JSON columns
      SELECT 
        (SELECT data FROM recently_played) as recently_played,
        (SELECT data FROM your_creations) as your_creations,
        (SELECT data FROM your_top_songs) as your_top_songs,
        (SELECT data FROM featured_playlists) as featured_playlists,
        (SELECT data FROM popular_tracks) as popular_tracks,
        (SELECT data FROM top_charts) as top_charts,
        (SELECT data FROM recommendations) as recommendations,
        (SELECT data FROM works_in_progress) as works_in_progress
    `);

    const elapsed = Date.now() - startTime;
    const row = result.rows?.[0] as unknown as ExploreFeedRow | undefined;

    if (!row) {
      logger.warn('ExploreFeed - No data returned from query', { userId, elapsed });
      return emptyFeed();
    }

    const rp = (row.recently_played || []) as Record<string, unknown>[];
    const yc = (row.your_creations || []) as Record<string, unknown>[];
    const yts = (row.your_top_songs || []) as Record<string, unknown>[];
    const fp = (row.featured_playlists || []) as Record<string, unknown>[];
    const pt = (row.popular_tracks || []) as Record<string, unknown>[];
    const tc = (row.top_charts || []) as Record<string, unknown>[];
    const rec = (row.recommendations || []) as Record<string, unknown>[];
    const wip = (row.works_in_progress || []) as Record<string, unknown>[];

    const feed: ExploreFeedData = {
      recentlyPlayed: normalizeTrackCollection(normalizeKeys<Record<string, unknown>[]>(rp)) as unknown as ExploreTrack[],
      yourCreations: normalizeTrackCollection(normalizeKeys<Record<string, unknown>[]>(yc)) as unknown as ExploreTrack[],
      yourTopSongs: normalizeTrackCollection(normalizeKeys<Record<string, unknown>[]>(yts)) as unknown as ExploreTrack[],
      featuredPlaylists: normalizeKeys<Record<string, unknown>[]>(fp) as unknown as ExplorePlaylist[],
      popularTracks: normalizeTrackCollection(normalizeKeys<Record<string, unknown>[]>(pt)) as unknown as ExploreTrack[],
      topCharts: normalizeTrackCollection(
        tc.map((track, index) => {
          const normalized = normalizeKeys<Record<string, unknown>>(track);
          return { ...normalized, rank: index + 1 };
        })
      ) as unknown as ExploreTrack[],
      recommendations: normalizeTrackCollection(normalizeKeys<Record<string, unknown>[]>(rec)) as unknown as ExploreTrack[],
      worksInProgress: normalizeTrackCollection(normalizeKeys<Record<string, unknown>[]>(wip)) as unknown as ExploreTrack[],
    };

    logger.info('ExploreFeed - Optimized query completed', {
      userId,
      elapsed,
      sections: {
        recentlyPlayed: feed.recentlyPlayed.length,
        yourCreations: feed.yourCreations.length,
        yourTopSongs: feed.yourTopSongs.length,
        featuredPlaylists: feed.featuredPlaylists.length,
        popularTracks: feed.popularTracks.length,
        topCharts: feed.topCharts.length,
        recommendations: feed.recommendations.length,
        worksInProgress: feed.worksInProgress.length,
      },
    });

    return feed;
  } catch (error) {
    const err = error as Error & {
      code?: string;
      detail?: string;
      hint?: string;
      position?: string;
      where?: string;
      schema?: string;
      table?: string;
      column?: string;
      constraint?: string;
      cause?: Error;
    };

    // Log all PostgreSQL error properties for debugging
    logger.error('ExploreFeed - Optimized query failed', {
      userId,
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
      where: err.where,
      schema: err.schema,
      table: err.table,
      column: err.column,
      constraint: err.constraint,
      cause: err.cause?.message,
      stack: err.stack,
      // Also log raw error in case it has different structure
      rawError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });
    throw error;
  }
}

function emptyFeed(): ExploreFeedData {
  return {
    recentlyPlayed: [],
    yourCreations: [],
    yourTopSongs: [],
    featuredPlaylists: [],
    popularTracks: [],
    topCharts: [],
    recommendations: [],
    worksInProgress: [],
  };
}
