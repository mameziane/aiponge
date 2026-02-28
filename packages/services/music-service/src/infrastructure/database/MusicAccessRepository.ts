import { getDatabase } from './DatabaseConnectionFactory';
import { sql } from 'drizzle-orm';
import { getLogger } from '../../config/service-urls';
import { MusicVisibilityService } from '../../application/services/MusicVisibilityService';
import {
  APP,
  CONTENT_VISIBILITY,
  TRACK_LIFECYCLE,
  ALBUM_LIFECYCLE,
  encodeCursor,
  decodeCursor,
} from '@aiponge/shared-contracts';

const logger = getLogger('music-access-repository');

export interface TrackFilters {
  search?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
  status?: string[];
}

export interface AlbumFilters {
  search?: string;
  limit?: number;
  offset?: number;
  status?: string;
  userId?: string;
}

export interface CatalogFilters {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AccessibleTrackRow {
  id: string;
  title: string;
  file_url: string;
  artwork_url: string | null;
  duration: number;
  track_number: number | null;
  play_count: number;
  language: string;
  user_id: string;
  album_id: string;
  visibility: string;
  status: string;
  lyrics_id: string | null;
  has_synced_lyrics: boolean;
  generation_number: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  album_user_id?: string;
}

export interface AccessibleAlbumRow {
  id: string;
  title: string;
  user_id: string;
  description: string | null;
  genres: string[];
  artwork_url: string | null;
  release_date: string | null;
  type: string;
  total_tracks: number;
  total_duration: number;
  is_explicit: boolean;
  visibility: string;
  chapter_id: string | null;
  mood: string | null;
  status: string;
  play_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AccessiblePlaylistRow {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  visibility: string;
  artwork_url: string | null;
  total_duration: number;
  play_count: number;
  like_count: number;
  follower_count: number;
  tags: unknown;
  category: string | null;
  mood: string | null;
  genre: string | null;
  status: string;
  playlist_type: string | null;
  is_system: boolean;
  icon: string | null;
  color: string | null;
  smart_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PublicAlbumRow {
  id: string;
  title: string;
  artwork_url: string | null;
  release_type: string;
  status: string;
  total_tracks: number;
  release_date: string | null;
  created_at: string;
  updated_at: string;
  display_name: string;
  cover_artwork_url: string | null;
  track_count: number;
}

export interface PublicAlbumTrackRow {
  id: string;
  title: string;
  file_url: string;
  artwork_url: string | null;
  duration: number;
  track_number: number | null;
  play_count: number;
  language: string;
  display_name: string;
  lyrics_id: string | null;
  lyrics_content: string | null;
  lyrics_synced_lines: unknown;
  has_synced_lyrics: boolean;
}

export class MusicAccessRepository {
  private db = getDatabase();

  async getAccessibleTrack(
    trackId: string,
    userId: string,
    accessibleCreatorIds: string[]
  ): Promise<AccessibleTrackRow | null> {
    const accessCondition = MusicVisibilityService.buildTrackAccessCondition(userId, accessibleCreatorIds);

    const result = await this.db.execute(sql`
      SELECT t.id, t.title, t.file_url, t.artwork_url, t.duration, t.track_number, t.play_count, t.language, t.user_id, t.album_id, t.visibility, t.status, t.lyrics_id, t.has_synced_lyrics, t.generation_number, t.metadata, t.created_at, t.updated_at, a.user_id as album_user_id
      FROM mus_tracks t
      LEFT JOIN mus_albums a ON t.album_id = a.id
      WHERE t.id = ${trackId}::uuid AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
        AND ${accessCondition}
      LIMIT 1
    `);

    return (result.rows?.[0] as unknown as AccessibleTrackRow) || null;
  }

  async getAccessibleTrackForStreaming(
    trackId: string,
    userId: string,
    accessibleCreatorIds: string[]
  ): Promise<{ id: string; file_url: string; user_id: string; visibility: string; album_user_id: string } | null> {
    const accessCondition = MusicVisibilityService.buildTrackAccessCondition(userId, accessibleCreatorIds);

    const result = await this.db.execute(sql`
      SELECT t.id, t.file_url, t.user_id, t.visibility,
             a.user_id as album_user_id
      FROM mus_tracks t
      LEFT JOIN mus_albums a ON t.album_id = a.id
      WHERE t.id = ${trackId}::uuid AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
        AND ${accessCondition}
      LIMIT 1
    `);

    return (
      (result.rows?.[0] as {
        id: string;
        file_url: string;
        user_id: string;
        visibility: string;
        album_user_id: string;
      }) || null
    );
  }

  async getAccessibleTrackForTimingAnalysis(
    trackId: string,
    userId: string,
    accessibleCreatorIds: string[]
  ): Promise<{
    id: string;
    title: string;
    file_url: string;
    lyrics_id: string | null;
    user_id: string;
    album_id: string;
    visibility: string;
  } | null> {
    const accessCondition = MusicVisibilityService.buildTrackAccessCondition(userId, accessibleCreatorIds);

    const result = await this.db.execute(sql`
      SELECT t.id, t.title, t.file_url, t.lyrics_id, t.user_id, t.album_id, t.visibility
      FROM mus_tracks t
      WHERE t.id = ${trackId}
        AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
        AND ${accessCondition}
      LIMIT 1
    `);

    return (
      (result.rows?.[0] as {
        id: string;
        title: string;
        file_url: string;
        lyrics_id: string | null;
        user_id: string;
        album_id: string;
        visibility: string;
      }) || null
    );
  }

  async getAccessibleTrackForPlay(
    trackId: string,
    userId: string,
    accessibleCreatorIds: string[]
  ): Promise<{ id: string; user_id: string; album_id: string; visibility: string } | null> {
    const accessCondition = MusicVisibilityService.buildTrackAccessCondition(userId, accessibleCreatorIds);

    const result = await this.db.execute(sql`
      SELECT t.id, t.user_id, t.album_id, t.visibility
      FROM mus_tracks t
      WHERE t.id = ${trackId}
        AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
        AND ${accessCondition}
      LIMIT 1
    `);

    return (result.rows?.[0] as { id: string; user_id: string; album_id: string; visibility: string }) || null;
  }

  async searchAccessibleTracks(
    userId: string,
    accessibleCreatorIds: string[],
    filters: TrackFilters
  ): Promise<{ tracks: AccessibleTrackRow[]; nextCursor: string | null; hasMore: boolean }> {
    const accessCondition = MusicVisibilityService.buildTrackAccessCondition(userId, accessibleCreatorIds);
    const limit = filters.limit || 20;
    const search = filters.search?.trim() || '';

    interface TrackCursor {
      playCount: number;
      id: string;
    }
    const decoded = filters.cursor ? decodeCursor<TrackCursor>(filters.cursor) : null;

    const cursorCondition = decoded
      ? sql`AND (COALESCE(t.play_count, 0), t.id) < (${decoded.playCount}, ${decoded.id})`
      : sql``;

    const searchCondition = search
      ? sql`AND to_tsvector('english', t.title) @@ plainto_tsquery('english', ${search})`
      : sql``;

    const result = await this.db.execute(sql`
      SELECT t.id, t.title, t.file_url, t.artwork_url, t.duration, t.track_number, t.play_count, t.language, t.user_id, t.album_id, t.visibility, t.status, t.lyrics_id, t.has_synced_lyrics, t.generation_number, t.metadata, t.created_at, t.updated_at
      FROM mus_tracks t
      WHERE t.status = ${TRACK_LIFECYCLE.PUBLISHED}
        ${searchCondition}
        AND ${accessCondition}
        ${cursorCondition}
      ORDER BY COALESCE(t.play_count, 0) DESC, t.id DESC
      LIMIT ${limit + 1}
    `);

    const rows = result.rows || [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1] as unknown as AccessibleTrackRow | undefined;
    const nextCursor =
      hasMore && lastItem ? encodeCursor({ playCount: lastItem.play_count ?? 0, id: lastItem.id }) : null;

    return { tracks: items as unknown as AccessibleTrackRow[], nextCursor, hasMore };
  }

  async getAccessibleAlbum(
    albumId: string,
    userId: string,
    accessibleCreatorIds: string[]
  ): Promise<AccessibleAlbumRow | null> {
    const accessCondition = MusicVisibilityService.buildAlbumAccessCondition(userId, accessibleCreatorIds);

    const result = await this.db.execute(sql`
      SELECT id, title, user_id, description, genres, artwork_url, release_date, type, total_tracks, total_duration, is_explicit, visibility, chapter_id, mood, status, play_count, metadata, created_at, updated_at FROM mus_albums
      WHERE id = ${albumId}::uuid
        AND ${accessCondition}
      LIMIT 1
    `);

    return (result.rows?.[0] as unknown as AccessibleAlbumRow) || null;
  }

  async getAccessibleAlbums(
    userId: string,
    accessibleCreatorIds: string[],
    filters: AlbumFilters
  ): Promise<AccessibleAlbumRow[]> {
    const limit = filters.limit || 20;
    const offset = filters.offset || 0;

    if (filters.userId) {
      if (filters.userId === userId) {
        const result = await this.db.execute(sql`
          SELECT id, title, user_id, description, genres, artwork_url, release_date, type, total_tracks, total_duration, is_explicit, visibility, chapter_id, mood, status, play_count, metadata, created_at, updated_at FROM mus_albums
          WHERE user_id = ${filters.userId} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `);
        return (result.rows || []) as unknown as AccessibleAlbumRow[];
      }

      const result = await this.db.execute(sql`
        SELECT id, title, user_id, description, genres, artwork_url, release_date, type, total_tracks, total_duration, is_explicit, visibility, chapter_id, mood, status, play_count, metadata, created_at, updated_at FROM mus_albums
        WHERE user_id = ${filters.userId}
          AND deleted_at IS NULL
          AND (visibility = ${CONTENT_VISIBILITY.SHARED} OR visibility = ${CONTENT_VISIBILITY.PUBLIC})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
      return (result.rows || []) as unknown as AccessibleAlbumRow[];
    }

    const accessCondition = MusicVisibilityService.buildAlbumAccessCondition(userId, accessibleCreatorIds);

    const result = await this.db.execute(sql`
      SELECT id, title, user_id, description, genres, artwork_url, release_date, type, total_tracks, total_duration, is_explicit, visibility, chapter_id, mood, status, play_count, metadata, created_at, updated_at FROM mus_albums
      WHERE ${accessCondition}
      ORDER BY play_count DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    return (result.rows || []) as unknown as AccessibleAlbumRow[];
  }

  async getAccessibleAlbumTracks(
    albumId: string,
    userId: string,
    accessibleCreatorIds: string[]
  ): Promise<AccessibleTrackRow[] | null> {
    const album = await this.getAccessibleAlbum(albumId, userId, accessibleCreatorIds);
    if (!album) {
      return null;
    }

    const tracksResult = await this.db.execute(sql`
      SELECT t.id, t.title, t.file_url, t.artwork_url, t.duration, t.track_number, t.play_count, t.language, t.user_id, t.album_id, t.visibility, t.status, t.lyrics_id, t.has_synced_lyrics, t.generation_number, t.metadata, t.created_at, t.updated_at FROM mus_tracks t
      WHERE t.album_id = ${albumId}::uuid AND t.status IN (${TRACK_LIFECYCLE.ACTIVE}, ${TRACK_LIFECYCLE.PUBLISHED})
      ORDER BY t.track_number, t.created_at
    `);

    return (tracksResult.rows || []) as unknown as AccessibleTrackRow[];
  }

  async getAccessiblePlaylist(playlistId: string, userId: string): Promise<AccessiblePlaylistRow | null> {
    const result = await this.db.execute(sql`
      SELECT id, name, description, user_id, visibility, artwork_url, total_duration, play_count, like_count, follower_count, tags, category, mood, genre, status, playlist_type, is_system, icon, color, smart_key, metadata, created_at, updated_at FROM mus_playlists WHERE id = ${playlistId}::uuid
        AND (
          user_id = ${userId}
          OR visibility IN (${CONTENT_VISIBILITY.PUBLIC}, ${CONTENT_VISIBILITY.SHARED})
        )
      LIMIT 1
    `);

    return (result.rows?.[0] as unknown as AccessiblePlaylistRow) || null;
  }

  async getCatalogTracks(
    librarianIds: string[],
    filters: CatalogFilters
  ): Promise<{ tracks: AccessibleTrackRow[]; total: number }> {
    const limit = filters.limit || 20;
    const offset = filters.offset || 0;
    const search = filters.search || '';
    const catalogAccessCondition = MusicVisibilityService.buildTrackAccessCondition('', librarianIds);

    const tracksResult = await this.db.execute(sql`
      SELECT t.id, t.title, t.file_url, t.artwork_url, t.duration, t.track_number, t.play_count, t.language, t.user_id, t.album_id, t.visibility, t.status, t.lyrics_id, t.has_synced_lyrics, t.generation_number, t.metadata, t.created_at, t.updated_at
      FROM mus_tracks t
      WHERE t.status = ${TRACK_LIFECYCLE.PUBLISHED}
        AND ${catalogAccessCondition}
        ${search ? sql`AND to_tsvector('english', t.title) @@ plainto_tsquery('english', ${search})` : sql``}
        AND (COALESCE(t.album_id::text, ''), COALESCE(t.track_number, 0), t.generation_number) IN (
          SELECT COALESCE(album_id::text, ''), COALESCE(track_number, 0), MAX(generation_number)
          FROM mus_tracks WHERE status = ${TRACK_LIFECYCLE.PUBLISHED}
          GROUP BY COALESCE(album_id::text, ''), COALESCE(track_number, 0)
        )
      ORDER BY t.play_count DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const countResult = await this.db.execute(sql`
      SELECT COUNT(*)::int as total
      FROM mus_tracks t
      WHERE t.status = ${TRACK_LIFECYCLE.PUBLISHED}
        AND ${catalogAccessCondition}
        ${search ? sql`AND to_tsvector('english', t.title) @@ plainto_tsquery('english', ${search})` : sql``}
        AND (COALESCE(t.album_id::text, ''), COALESCE(t.track_number, 0), t.generation_number) IN (
          SELECT COALESCE(album_id::text, ''), COALESCE(track_number, 0), MAX(generation_number)
          FROM mus_tracks WHERE status = ${TRACK_LIFECYCLE.PUBLISHED}
          GROUP BY COALESCE(album_id::text, ''), COALESCE(track_number, 0)
        )
    `);

    return {
      tracks: (tracksResult.rows || []) as unknown as AccessibleTrackRow[],
      total: Number((countResult.rows[0] as Record<string, unknown>)?.total ?? 0),
    };
  }

  async getPublicAlbums(
    librarianIds: string[],
    filters: CatalogFilters & { search?: string }
  ): Promise<{ albums: PublicAlbumRow[]; total: number }> {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const search = filters.search;
    const accessCondition = MusicVisibilityService.buildAlbumAccessCondition('', librarianIds, 'a');

    const result = await this.db.execute(sql`
      SELECT
        a.id,
        a.title,
        a.artwork_url,
        a.type as release_type,
        a.status,
        a.total_tracks,
        a.release_date,
        a.created_at,
        a.updated_at,
        COALESCE(NULLIF(NULLIF(a.metadata->>'displayName', ''), 'aiponge'), '') as display_name,
        COALESCE(a.artwork_url, (
          SELECT t.artwork_url
          FROM mus_tracks t
          WHERE t.album_id = a.id AND t.artwork_url IS NOT NULL AND t.status = ${TRACK_LIFECYCLE.PUBLISHED}
            AND (COALESCE(t.track_number, 0), t.generation_number) IN (
              SELECT COALESCE(track_number, 0), MAX(generation_number)
              FROM mus_tracks WHERE album_id = a.id AND status = ${TRACK_LIFECYCLE.PUBLISHED}
              GROUP BY COALESCE(track_number, 0)
            )
          ORDER BY t.track_number ASC, t.created_at ASC
          LIMIT 1
        )) as cover_artwork_url,
        (SELECT COUNT(*)::int FROM mus_tracks t WHERE t.album_id = a.id AND t.status = ${TRACK_LIFECYCLE.PUBLISHED}
          AND (COALESCE(t.track_number, 0), t.generation_number) IN (
            SELECT COALESCE(track_number, 0), MAX(generation_number)
            FROM mus_tracks WHERE album_id = a.id AND status = ${TRACK_LIFECYCLE.PUBLISHED}
            GROUP BY COALESCE(track_number, 0)
          )) as track_count
      FROM mus_albums a
      WHERE ${accessCondition} AND a.status = ${ALBUM_LIFECYCLE.PUBLISHED}
        AND (SELECT COUNT(*) FROM mus_tracks t WHERE t.album_id = a.id AND t.status = ${TRACK_LIFECYCLE.PUBLISHED}
          AND (COALESCE(t.track_number, 0), t.generation_number) IN (
            SELECT COALESCE(track_number, 0), MAX(generation_number)
            FROM mus_tracks WHERE album_id = a.id AND status = ${TRACK_LIFECYCLE.PUBLISHED}
            GROUP BY COALESCE(track_number, 0)
          )) > 0
      ${search ? sql`AND to_tsvector('english', a.title) @@ plainto_tsquery('english', ${search})` : sql``}
      ORDER BY a.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const countResult = await this.db.execute(sql`
      SELECT COUNT(*)::int as total
      FROM mus_albums a
      WHERE ${accessCondition} AND a.status = ${ALBUM_LIFECYCLE.PUBLISHED}
        AND (SELECT COUNT(*) FROM mus_tracks t WHERE t.album_id = a.id AND t.status = ${TRACK_LIFECYCLE.PUBLISHED}
          AND (COALESCE(t.track_number, 0), t.generation_number) IN (
            SELECT COALESCE(track_number, 0), MAX(generation_number)
            FROM mus_tracks WHERE album_id = a.id AND status = ${TRACK_LIFECYCLE.PUBLISHED}
            GROUP BY COALESCE(track_number, 0)
          )) > 0
      ${search ? sql`AND to_tsvector('english', a.title) @@ plainto_tsquery('english', ${search})` : sql``}
    `);

    return {
      albums: (result.rows || []) as unknown as PublicAlbumRow[],
      total: Number((countResult.rows[0] as Record<string, unknown>)?.total ?? 0),
    };
  }

  async getPublicAlbumWithTracks(
    albumId: string,
    librarianIds: string[]
  ): Promise<{ album: PublicAlbumRow; tracks: PublicAlbumTrackRow[] } | null> {
    const accessCondition = MusicVisibilityService.buildAlbumAccessCondition('', librarianIds, 'a');

    const albumResult = await this.db.execute(sql`
      SELECT
        a.id,
        a.title,
        COALESCE(a.artwork_url, (
          SELECT t.artwork_url
          FROM mus_tracks t
          WHERE t.album_id = a.id AND t.artwork_url IS NOT NULL AND t.status = ${TRACK_LIFECYCLE.PUBLISHED}
            AND (COALESCE(t.track_number, 0), t.generation_number) IN (
              SELECT COALESCE(track_number, 0), MAX(generation_number)
              FROM mus_tracks WHERE album_id = a.id AND status = ${TRACK_LIFECYCLE.PUBLISHED}
              GROUP BY COALESCE(track_number, 0)
            )
          ORDER BY t.track_number ASC, t.created_at ASC
          LIMIT 1
        )) as cover_artwork_url,
        a.type as release_type,
        a.status,
        a.total_tracks,
        a.release_date,
        a.created_at,
        a.updated_at,
        COALESCE(NULLIF(NULLIF(a.metadata->>'displayName', ''), 'aiponge'), '') as display_name,
        (SELECT COUNT(*)::int FROM mus_tracks t WHERE t.album_id = a.id AND t.status = ${TRACK_LIFECYCLE.PUBLISHED}
          AND (COALESCE(t.track_number, 0), t.generation_number) IN (
            SELECT COALESCE(track_number, 0), MAX(generation_number)
            FROM mus_tracks WHERE album_id = a.id AND status = ${TRACK_LIFECYCLE.PUBLISHED}
            GROUP BY COALESCE(track_number, 0)
          )) as published_track_count
      FROM mus_albums a
      WHERE a.id = ${albumId} AND ${accessCondition} AND a.status = ${ALBUM_LIFECYCLE.PUBLISHED}
      LIMIT 1
    `);

    if (!albumResult.rows || albumResult.rows.length === 0) {
      return null;
    }

    const tracksResult = await this.db.execute(sql`
      SELECT
        t.id,
        t.title,
        t.file_url,
        t.artwork_url,
        t.duration,
        t.track_number,
        t.play_count,
        t.language,
        COALESCE(NULLIF(NULLIF(t.metadata->>'displayName', ''), 'aiponge'), '') as display_name,
        t.lyrics_id,
        l.content as lyrics_content,
        l.synced_lines as lyrics_synced_lines,
        t.has_synced_lyrics
      FROM mus_tracks t
      LEFT JOIN mus_lyrics l ON t.lyrics_id = l.id
      WHERE t.album_id = ${albumId} AND t.status = ${TRACK_LIFECYCLE.PUBLISHED}
        AND (COALESCE(t.track_number, 0), t.generation_number) IN (
          SELECT COALESCE(track_number, 0), MAX(generation_number)
          FROM mus_tracks WHERE album_id = ${albumId} AND status = ${TRACK_LIFECYCLE.PUBLISHED}
          GROUP BY COALESCE(track_number, 0)
        )
      ORDER BY t.track_number ASC, t.created_at ASC
    `);

    return {
      album: albumResult.rows[0] as unknown as PublicAlbumRow,
      tracks: (tracksResult.rows || []) as unknown as PublicAlbumTrackRow[],
    };
  }
}

let defaultInstance: MusicAccessRepository | null = null;

export function getMusicAccessRepository(): MusicAccessRepository {
  if (!defaultInstance) {
    defaultInstance = new MusicAccessRepository();
  }
  return defaultInstance;
}
