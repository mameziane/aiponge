/**
 * Music Service - Unified Schema
 * Complete music domain schema consolidation
 * All tables use 'mus_' prefix for clear service boundaries
 */

import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  serial as _serial,
  decimal,
  index,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { ContentVisibilitySchema } from '@aiponge/shared-contracts/common';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';

// ===== MUSIC CATALOG DOMAIN =====

// Albums Table
export const albums = pgTable(
  'mus_albums',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: varchar('title').notNull(),
    userId: uuid('user_id').notNull(),
    description: text('description'),
    genres: text('genres')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    artworkUrl: varchar('artwork_url'),
    releaseDate: timestamp('release_date'),
    type: varchar('type').notNull(), // album, single, ep, compilation'
    totalTracks: integer('total_tracks').notNull().default(0),
    totalDuration: integer('total_duration').notNull().default(0), // in seconds'
    isExplicit: boolean('is_explicit').notNull().default(false),
    visibility: varchar('visibility', { length: 20 }).notNull().default(CONTENT_VISIBILITY.PERSONAL), // Content visibility: personal, shared, public
    chapterId: uuid('chapter_id'), // Reference to originating chapter (cross-service, nullable for Singles albums)
    mood: varchar('mood', { length: 100 }), // Emotional context (unified from user albums)
    status: varchar('status').notNull(), // draft, published, archived'
    playCount: integer('play_count').notNull().default(0),
    metadata: jsonb('metadata').notNull().default({}), // Includes chapterSnapshot for fallback
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_users_user').on(table.userId),
    index('idx_albums_status').on(table.status),
    index('idx_albums_user_status').on(table.userId, table.status),
    index('idx_albums_visibility').on(table.visibility),
    index('idx_albums_visibility_status').on(table.visibility, table.status),
    index('idx_albums_created_at').on(table.createdAt),
    index('idx_albums_release_date').on(table.releaseDate),
    uniqueIndex('idx_albums_singles_unique')
      .on(table.userId, table.title, table.visibility)
      .where(sql`visibility = ${CONTENT_VISIBILITY.SHARED} AND title = 'aiponge Singles'`),
    uniqueIndex('idx_albums_chapter_unique')
      .on(table.chapterId)
      .where(sql`visibility = ${CONTENT_VISIBILITY.SHARED} AND chapter_id IS NOT NULL`),
    index('idx_mus_albums_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// Tracks Table
export const tracks = pgTable(
  'mus_tracks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: varchar('title').notNull(),
    userId: uuid('user_id').notNull(),
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }), // Shared tracks MUST belong to an album
    duration: integer('duration').notNull(), // in seconds'
    fileUrl: varchar('file_url').notNull(),
    artworkUrl: varchar('artwork_url'),
    lyricsId: uuid('lyrics_id').references(() => lyrics.id, { onDelete: 'set null' }), // Reference to shared lyrics table (mus_lyrics)
    hasSyncedLyrics: boolean('has_synced_lyrics').notNull().default(false), // True when lyrics have synced_lines timestamps
    genres: text('genres')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    trackNumber: integer('track_number'),
    generationNumber: integer('generation_number').notNull().default(1), // Regeneration version - allows multiple generations of tracks for same album
    status: varchar('status').notNull(), // CHECK constraint: draft, processing, active, deleted, published, archived, removed
    quality: varchar('quality').notNull(), // lossless, high, medium, low'
    fileSize: integer('file_size').notNull(), // in bytes'
    mimeType: varchar('mime_type').notNull(),
    visibility: varchar('visibility', { length: 20 }).notNull().default(CONTENT_VISIBILITY.PERSONAL),
    isExplicit: boolean('is_explicit').notNull().default(false),
    playCount: integer('play_count').notNull().default(0),
    likeCount: integer('like_count').notNull().default(0),
    language: varchar('language').notNull().default('en'), // ISO 639-1 language code (e.g., 'en', 'es', 'fr')
    variantGroupId: uuid('variant_group_id'), // Links same song across different languages (for multi-language album generation)
    sourceType: varchar('source_type', { length: 50 }).notNull().default('generated'), // uploaded, generated (unified from user tracks)
    generationRequestId: uuid('generation_request_id'),
    playOnDate: timestamp('play_on_date'), // Date when track should be auto-played in Radio mode (unified from user tracks)
    sourceUserTrackId: uuid('source_user_track_id'), // Link back to original personal track when promoted to shared library
    generatedByUserId: uuid('generated_by_user_id'), // User who generated this track
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_tracks_user').on(table.userId),
    index('idx_tracks_album').on(table.albumId),
    index('idx_tracks_status').on(table.status),
    index('idx_tracks_album_status').on(table.albumId, table.status),
    index('idx_tracks_visibility').on(table.visibility),
    index('idx_tracks_visibility_status').on(table.visibility, table.status),
    index('idx_tracks_variant_group').on(table.variantGroupId),
    index('idx_tracks_language').on(table.language),
    index('idx_tracks_created_at').on(table.createdAt),
    index('idx_tracks_generated_by').on(table.generatedByUserId),
    index('idx_mus_tracks_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// ===== PLAYLIST DOMAIN =====

// Playlists Table
export const playlists = pgTable(
  'mus_playlists',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar('name').notNull(),
    description: text('description'),
    userId: uuid('user_id'), // owner (nullable for system playlists)
    visibility: varchar('visibility', { length: 20 }).notNull().default(CONTENT_VISIBILITY.PERSONAL), // Content visibility: personal, shared, public
    artworkUrl: varchar('artwork_url'),
    totalDuration: integer('total_duration').default(0), // in seconds
    playCount: integer('play_count').default(0),
    likeCount: integer('like_count').default(0),
    followerCount: integer('follower_count').default(0),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    category: varchar('category'), // user, featured, algorithm
    mood: varchar('mood'),
    genre: varchar('genre'),
    status: varchar('status', { length: 50 }).notNull().default('active'), // CHECK constraint: active, archived, deleted
    playlistType: varchar('playlist_type').notNull().default('manual'), // manual, smart, hybrid
    isSystem: boolean('is_system').default(false), // system-defined smart playlists
    icon: varchar('icon', { length: 10 }), // emoji icon for smart playlists
    color: varchar('color', { length: 20 }), // hex color for smart playlists
    smartKey: varchar('smart_key', { length: 50 }), // unique key for system smart playlists (e.g., 'calm', 'energy')
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_playlists_visibility_status_category').on(table.visibility, table.status, table.category),
    index('idx_playlists_user_status').on(table.userId, table.status),
    index('idx_playlists_user_smart_key').on(table.userId, table.smartKey),
    index('idx_mus_playlists_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// Playlist Tracks Table (junction table with ordering)
export const playlistTracks = pgTable(
  'mus_playlist_tracks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id').notNull(),
    position: integer('position').notNull(),
    addedBy: uuid('added_by').notNull(), // user who added the track'
    addedAt: timestamp('added_at').defaultNow().notNull(),
    playCount: integer('play_count').default(0),
    lastPlayedAt: timestamp('last_played_at'),
    metadata: jsonb('metadata').default({}),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_mus_playlist_tracks_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// Playlist Followers Table
export const playlistFollowers = pgTable('mus_playlist_followers', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playlistId: uuid('playlist_id')
    .notNull()
    .references(() => playlists.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  followedAt: timestamp('followed_at').defaultNow().notNull(),
});

// Playlist Likes Table
export const playlistLikes = pgTable(
  'mus_playlist_likes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    likedAt: timestamp('liked_at').defaultNow().notNull(),
  },
  table => [uniqueIndex('mus_playlist_likes_playlist_user_unique').on(table.playlistId, table.userId)]
);

// Playlist Activities Table
export const playlistActivities = pgTable('mus_playlist_activities', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playlistId: uuid('playlist_id')
    .notNull()
    .references(() => playlists.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  action: varchar('action').notNull(), // created, track_added, track_removed, etc.'
  details: jsonb('details').default({}),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// ===== USER LIBRARY DOMAIN =====

// Favorite Tracks Table
export const favoriteTracks = pgTable(
  'mus_favorite_tracks',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    trackId: uuid('track_id').notNull(),
    addedAt: timestamp('added_at', { mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    playCount: integer('play_count').default(0),
    lastPlayedAt: timestamp('last_played_at', { mode: 'string' }),
    rating: integer('rating'),
    notes: text('notes'),
    tags: jsonb('tags').default([]),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_favorite_tracks_user_added').on(table.userId, table.addedAt),
    index('idx_favorite_tracks_user_track').on(table.userId, table.trackId),
    index('idx_mus_favorite_tracks_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// Favorite Albums Table
export const favoriteAlbums = pgTable(
  'mus_favorite_albums',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    albumId: uuid('album_id').notNull(),
    addedAt: timestamp('added_at', { mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    playCount: integer('play_count').default(0),
    lastPlayedAt: timestamp('last_played_at', { mode: 'string' }),
    rating: integer('rating'),
    completionRate: varchar('completion_rate', { length: 10 }).default('0'),
    favoriteTrackIds: jsonb('favorite_track_ids').default([]),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_mus_favorite_albums_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// Followed Creators Table (relationship-based content access)
// Renamed from mus_favorite_artists to mus_followed_creators
export const followedCreators = pgTable(
  'mus_followed_creators',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    creatorId: uuid('creator_id').notNull(),
    addedAt: timestamp('added_at', { mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    playCount: integer('play_count').default(0),
    lastPlayedAt: timestamp('last_played_at', { mode: 'string' }),
    rating: integer('rating'),
    notificationsEnabled: boolean('notifications_enabled').default(true),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_followed_creators_user').on(table.userId),
    index('idx_followed_creators_creator').on(table.creatorId),
    uniqueIndex('idx_followed_creators_user_creator').on(table.userId, table.creatorId),
    index('idx_mus_followed_creators_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// Recently Played Table
export const recentlyPlayed = pgTable(
  'mus_recently_played',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    trackId: uuid('track_id').notNull(),
    albumId: uuid('album_id'),
    playedAt: timestamp('played_at', { mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    duration: integer('duration'),
    completionRate: varchar('completion_rate', { length: 10 }).default('0'),
    context: jsonb('context').default({}),
    deviceType: varchar('device_type', { length: 255 }),
    sessionId: varchar('session_id', { length: 255 }),
  },
  table => [
    index('idx_recently_played_user_played').on(table.userId, table.playedAt),
    index('idx_recently_played_track').on(table.trackId),
  ]
);

// All content now uses unified mus_albums and mus_tracks with visibility column (personal/shared/public).
// User Track Schedules are managed through user-service's usr_reminders table.

// Track Feedback Table (user feedback on generated music helpfulness)
export const trackFeedback = pgTable(
  'mus_track_feedback',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    trackId: uuid('track_id').notNull(),
    userTrackId: uuid('user_track_id'),
    generationRequestId: uuid('generation_request_id'),
    wasHelpful: boolean('was_helpful').notNull(),
    context: text('context'),
    submittedAt: timestamp('submitted_at', { mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_track_feedback_user_track_unique').on(table.userId, table.trackId),
    index('idx_track_feedback_track').on(table.trackId),
    index('idx_track_feedback_helpful').on(table.wasHelpful),
    index('idx_mus_track_feedback_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// ===== STREAMING DOMAIN =====

// Stream Sessions Table
export const streamSessions = pgTable('mus_stream_sessions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull(),
  trackId: uuid('track_id').notNull(),
  deviceId: varchar('device_id'),
  sessionType: varchar('session_type').notNull(), // on_demand, radio, playlist'
  quality: varchar('quality').notNull(), // auto, low, medium, high, lossless'
  bitrate: integer('bitrate'), // actual bitrate used'
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  duration: integer('duration').default(0), // in seconds'
  bytesStreamed: integer('bytes_streamed').default(0),
  bufferEvents: integer('buffer_events').default(0),
  skipCount: integer('skip_count').default(0),
  pauseCount: integer('pause_count').default(0),
  seekCount: integer('seek_count').default(0),
  status: varchar('status').notNull(), // active, paused, completed, aborted'
  clientInfo: jsonb('client_info').default({}), // browser, app version, etc.'
  networkInfo: jsonb('network_info').default({}), // connection type, speed'
  errors: jsonb('errors').default([]),
  metadata: jsonb('metadata').default({}),
});

// Stream Analytics Table
export const streamAnalytics = pgTable('mus_stream_analytics', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  date: timestamp('date').notNull(), // aggregation date (daily)'
  trackId: uuid('track_id').notNull(),
  userId: uuid('user_id'),
  deviceType: varchar('device_type'),
  country: varchar('country'),
  region: varchar('region'),

  // Aggregated metrics
  totalPlays: integer('total_plays').default(0),
  totalDuration: integer('total_duration').default(0), // in seconds'
  uniqueListeners: integer('unique_listeners').default(0),
  averageCompletion: decimal('average_completion'), // 0.0 to 1.0'
  skipRate: decimal('skip_rate'), // 0.0 to 1.0'

  // Quality metric
  averageBitrate: integer('average_bitrate'),
  bufferEvents: integer('buffer_events').default(0),
  qualityAdaptations: integer('quality_adaptations').default(0),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ===== LYRICS DOMAIN =====

// Shared Library Lyrics Table (system-owned, curated content)
// Named 'lyrics' to match 'tracks' pattern (shared library = un-prefixed)
export const lyrics = pgTable(
  'mus_lyrics',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(), // Owner of the lyrics
    entryId: uuid('entry_id'), // Reference to source entry (cross-service to user-service, unified from user lyrics)
    visibility: varchar('visibility', { length: 20 }).notNull().default(CONTENT_VISIBILITY.PERSONAL), // Content visibility: personal, shared, public
    content: text('content').notNull(), // The generated lyrics with structure tags
    syncedLines: jsonb('synced_lines'), // Time-synchronized lyrics: Array<{ startTime: number, endTime: number, text: string, type?: string }>
    timedLyricsJson: jsonb('timed_lyrics_json'), // Raw MusicAPI.ai timeline response for karaoke-style sync
    clipId: varchar('clip_id', { length: 100 }), // MusicAPI.ai clip ID for fetching lyrics timeline
    title: varchar('title', { length: 255 }), // Song title
    style: varchar('style', { length: 100 }), // Musical style (pop, rock, etc.)
    mood: varchar('mood', { length: 100 }), // Mood of the lyrics
    language: varchar('language', { length: 10 }).default('en'), // ISO 639-1 language code
    themes: text('themes')
      .array()
      .default(sql`'{}'::text[]`), // Thematic elements
    hasStructureTags: boolean('has_structure_tags').default(true), // Whether lyrics have [Verse], [Chorus] tags
    aiProvider: varchar('ai_provider', { length: 50 }), // AI provider that generated lyrics
    aiModel: varchar('ai_model', { length: 50 }), // Specific model used
    generationPrompt: text('generation_prompt'), // Original prompt used for generation
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('mus_lyrics_user_id_idx').on(table.userId),
    index('mus_lyrics_entry_id_idx').on(table.entryId),
    index('mus_lyrics_visibility_idx').on(table.visibility),
    index('mus_lyrics_language_idx').on(table.language),
    index('mus_lyrics_created_at_idx').on(table.createdAt),
    index('mus_lyrics_clip_id_idx').on(table.clipId),
    index('idx_mus_lyrics_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// All lyrics now use unified mus_lyrics with visibility column (personal/shared/public).

// ===== RELATIONS =====

export const albumsRelations = relations(albums, ({ many }) => ({
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  album: one(albums, {
    fields: [tracks.albumId],
    references: [albums.id],
  }),
  lyrics: one(lyrics, {
    fields: [tracks.lyricsId],
    references: [lyrics.id],
  }),
}));

export const playlistsRelations = relations(playlists, ({ many }) => ({
  tracks: many(playlistTracks),
}));

export const playlistTracksRelations = relations(playlistTracks, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistTracks.playlistId],
    references: [playlists.id],
  }),
}));

// Lyrics relations (unified mus_lyrics)
export const lyricsRelations = relations(lyrics, ({ many }) => ({
  tracks: many(tracks),
}));

// ===== TYPE EXPORTS =====

export type Album = typeof albums.$inferSelect;
export type NewAlbum = typeof albums.$inferInsert;

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;

export type Playlist = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;

export type PlaylistTrack = typeof playlistTracks.$inferSelect;
export type NewPlaylistTrack = typeof playlistTracks.$inferInsert;

export type StreamSession = typeof streamSessions.$inferSelect;
export type NewStreamSession = typeof streamSessions.$inferInsert;

export type StreamAnalytics = typeof streamAnalytics.$inferSelect;
export type NewStreamAnalytics = typeof streamAnalytics.$inferInsert;

// NOTE: UserLibrary types removed (Feb 2026) - table dropped

export type FavoriteTrack = typeof favoriteTracks.$inferSelect;
export type NewFavoriteTrack = typeof favoriteTracks.$inferInsert;

export type FavoriteAlbum = typeof favoriteAlbums.$inferSelect;
export type NewFavoriteAlbum = typeof favoriteAlbums.$inferInsert;

export type FollowedCreator = typeof followedCreators.$inferSelect;
export type NewFollowedCreator = typeof followedCreators.$inferInsert;

export type RecentlyPlayedTrack = typeof recentlyPlayed.$inferSelect;
export type NewRecentlyPlayedTrack = typeof recentlyPlayed.$inferInsert;

// Lyrics Types (unified mus_lyrics)
export type Lyrics = typeof lyrics.$inferSelect;
export type NewLyrics = typeof lyrics.$inferInsert;

// Playlist Extension Types
export type PlaylistFollower = typeof playlistFollowers.$inferSelect;
export type NewPlaylistFollower = typeof playlistFollowers.$inferInsert;

export type PlaylistLike = typeof playlistLikes.$inferSelect;
export type NewPlaylistLike = typeof playlistLikes.$inferInsert;

export type PlaylistActivity = typeof playlistActivities.$inferSelect;
export type NewPlaylistActivity = typeof playlistActivities.$inferInsert;

// ===== MUSIC GENERATION DOMAIN =====

// Album Generation Requests Table (for background job tracking)
export const albumRequests = pgTable(
  'mus_album_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    chapterId: uuid('chapter_id'), // Reference to originating chapter (cross-service)
    chapterTitle: varchar('chapter_title', { length: 500 }),
    bookId: uuid('book_id'), // Reference to originating book (cross-service)
    bookTitle: varchar('book_title', { length: 500 }),
    status: varchar('status', { length: 50 }).notNull().default('queued'), // queued, processing, completed, partial, failed, cancelled
    phase: varchar('phase', { length: 50 }).notNull().default('queued'), // queued, validating, creating_album, generating_track, generating_artwork, finalizing, completed, failed
    subPhase: varchar('sub_phase', { length: 50 }), // lyrics, artwork, audio, storing, saving - granular progress within generating_track phase
    totalTracks: integer('total_tracks').notNull().default(0),
    currentTrack: integer('current_track').notNull().default(0),
    successfulTracks: integer('successful_tracks').notNull().default(0),
    failedTracks: integer('failed_tracks').notNull().default(0),
    percentComplete: integer('percent_complete').notNull().default(0),
    languageMode: varchar('language_mode', { length: 20 }).notNull().default('single'), // single, all
    targetLanguages: text('target_languages')
      .array()
      .default(sql`ARRAY[]::text[]`),
    generatedLanguages: text('generated_languages')
      .array()
      .default(sql`ARRAY[]::text[]`),
    failedLanguages: text('failed_languages')
      .array()
      .default(sql`ARRAY[]::text[]`),
    trackResults: jsonb('track_results').default([]), // Array of TrackGenerationResult
    errorMessage: text('error_message'),
    reservationId: varchar('reservation_id', { length: 100 }), // Credit reservation ID
    creditCost: integer('credit_cost').notNull().default(0),
    albumId: uuid('album_id'), // Pre-created album ID for shared library content (mus_albums.id)
    visibility: varchar('visibility', { length: 20 }).notNull().default(CONTENT_VISIBILITY.PERSONAL), // Content visibility: personal, shared, public
    requestPayload: jsonb('request_payload').default({}), // Full original request for retry capability
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_mus_album_requests_user_id').on(table.userId),
    index('idx_mus_album_requests_status').on(table.status),
    index('idx_mus_album_requests_created_at').on(table.createdAt),
    index('idx_mus_album_requests_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// Song Generation Requests Table (for tracking single-song generation progress)
export const songRequests = pgTable(
  'mus_song_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    entryId: uuid('entry_id'), // Reference to originating entry (cross-service)
    status: varchar('status', { length: 50 }).notNull().default('queued'), // queued, processing, completed, failed
    phase: varchar('phase', { length: 50 }).notNull().default('queued'), // queued, fetching_content, generating_lyrics, generating_artwork, generating_music, saving, completed, failed
    percentComplete: integer('percent_complete').notNull().default(0),
    visibility: varchar('visibility', { length: 20 }).notNull().default(CONTENT_VISIBILITY.PERSONAL), // Content visibility: personal, shared, public
    errorMessage: text('error_message'),
    artworkError: text('artwork_error'), // Stores artwork generation failure reason (non-fatal)
    trackId: uuid('track_id'), // Resulting track ID (unified mus_tracks table)
    trackTitle: varchar('track_title', { length: 500 }),
    artworkUrl: text('artwork_url'),
    streamingUrl: text('streaming_url'), // Early playback URL (available ~10s, before CDN download completes)
    requestPayload: jsonb('request_payload').default({}), // Full original request
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_mus_song_requests_user_id').on(table.userId),
    index('idx_mus_song_requests_status').on(table.status),
    index('idx_mus_song_requests_created_at').on(table.createdAt),
    index('idx_mus_song_requests_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

export type SongRequest = typeof songRequests.$inferSelect;
export type NewSongRequest = typeof songRequests.$inferInsert;

// ===== AUDIO PROCESSING DOMAIN =====

// Audio Processing Jobs Table
export const audioProcessingJobs = pgTable(
  'mus_audio_jobs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    musicResultId: uuid('music_result_id'),
    jobType: varchar('job_type', { length: 100 }).notNull(), // "normalize", "master", "effects", "convert", "enhance"
    processingType: varchar('processing_type', { length: 100 }).notNull(), // More specific processing operation
    status: varchar('status', { length: 50 }).notNull().default('pending'), // "pending", "processing", "completed", "failed"
    priority: varchar('priority', { length: 50 }).notNull().default('normal'), // "low", "normal", "high", "urgent"
    inputUrl: text('input_url').notNull(),
    outputUrl: text('output_url'),
    inputFormat: varchar('input_format', { length: 20 }),
    outputFormat: varchar('output_format', { length: 20 }),
    parameters: jsonb('parameters').default({}), // Processing parameters
    progressPercentage: integer('progress_percentage').default(0),
    processingTimeMs: integer('processing_time_ms'),
    fileSize: integer('file_size'), // Output file size
    qualityScore: decimal('quality_score', { precision: 3, scale: 2 }),
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_mus_audio_jobs_result_id').on(table.musicResultId),
    index('idx_mus_audio_jobs_status').on(table.status),
    index('idx_mus_audio_jobs_type').on(table.jobType),
    index('idx_mus_audio_jobs_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// ===== MUSIC ANALYTICS DOMAIN =====

// Music Analytics Table (for usage tracking and insights)
export const musicAnalytics = pgTable(
  'mus_analytics',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    musicResultId: uuid('music_result_id'),
    eventType: varchar('event_type', { length: 100 }).notNull(), // "play", "download", "like", "share", "skip"
    eventData: jsonb('event_data').default({}), // Event-specific data
    sessionId: varchar('session_id', { length: 255 }),
    deviceType: varchar('device_type', { length: 100 }), // "mobile", "desktop", "tablet"
    location: varchar('location', { length: 200 }), // Geographic location
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    metadata: jsonb('metadata').default({}),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    index('idx_mus_analytics_user_id').on(table.userId),
    index('idx_mus_analytics_event_type').on(table.eventType),
    index('idx_mus_analytics_timestamp').on(table.timestamp),
    index('idx_mus_analytics_active')
      .on(table.id)
      .where(sql`deleted_at IS NULL`),
  ]
);

// ===== ZOD SCHEMAS =====

// Insert schemas (for validation)
export const insertAudioProcessingJobSchema = createInsertSchema(audioProcessingJobs, {
  inputUrl: z.string().url(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
}).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });

export const insertTrackFeedbackSchema = createInsertSchema(trackFeedback, {
  userId: z.string().uuid(),
  trackId: z.string().uuid(),
  userTrackId: z.string().uuid().optional(),
  generationRequestId: z.string().uuid().optional(),
  wasHelpful: z.boolean(),
  context: z.string().max(500).optional(),
}).omit({ id: true, submittedAt: true });

// Lyrics schema (unified mus_lyrics)
export const insertLyricsSchema = createInsertSchema(lyrics, {
  userId: z.string().uuid(),
  entryId: z.string().uuid().optional().nullable(),
  visibility: ContentVisibilitySchema.optional(),
  content: z.string().min(1),
  title: z.string().max(255).optional().nullable(),
  style: z.string().max(100).optional().nullable(),
  mood: z.string().max(100).optional().nullable(),
  language: z.string().max(10).optional().nullable(),
  themes: z.array(z.string()).optional().nullable(),
  aiProvider: z.string().max(50).optional().nullable(),
  aiModel: z.string().max(50).optional().nullable(),
  generationPrompt: z.string().optional().nullable(),
}).omit({ id: true, createdAt: true, updatedAt: true });

// Select schemas (for TypeScript types)
export const selectAudioProcessingJobSchema = createSelectSchema(audioProcessingJobs);
export const selectMusicAnalyticsSchema = createSelectSchema(musicAnalytics);
export const selectTrackFeedbackSchema = createSelectSchema(trackFeedback);
export const selectLyricsSchema = createSelectSchema(lyrics);

// ===== TYPE EXPORTS =====

export type AlbumRequest = typeof albumRequests.$inferSelect;
export type NewAlbumRequest = typeof albumRequests.$inferInsert;

export type AudioProcessingJob = typeof audioProcessingJobs.$inferSelect;
export type NewAudioProcessingJob = z.infer<typeof insertAudioProcessingJobSchema>;

export type MusicAnalytics = typeof musicAnalytics.$inferSelect;
export type NewMusicAnalytics = typeof musicAnalytics.$inferInsert;

export type TrackFeedback = typeof trackFeedback.$inferSelect;
export type NewTrackFeedback = z.infer<typeof insertTrackFeedbackSchema>;

// ===== ENUMS FOR TYPE SAFETY =====

export const MusicType = {
  SONG: 'song',
  INSTRUMENTAL: 'instrumental',
  JINGLE: 'jingle',
  BACKGROUND: 'background',
  SOUNDTRACK: 'soundtrack',
  LOOP: 'loop',
} as const;

export const MusicStyle = {
  POP: 'pop',
  ROCK: 'rock',
  CLASSICAL: 'classical',
  JAZZ: 'jazz',
  ELECTRONIC: 'electronic',
  HIP_HOP: 'hip_hop',
  COUNTRY: 'country',
  FOLK: 'folk',
  BLUES: 'blues',
  REGGAE: 'reggae',
} as const;

export const MusicMood = {
  HAPPY: 'happy',
  SAD: 'sad',
  ENERGETIC: 'energetic',
  CALM: 'calm',
  ROMANTIC: 'romantic',
  MYSTERIOUS: 'mysterious',
  UPLIFTING: 'uplifting',
  MELANCHOLIC: 'melancholic',
  AGGRESSIVE: 'aggressive',
  PEACEFUL: 'peaceful',
} as const;

export const RequestStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const AudioFormat = {
  MP3: 'mp3',
  WAV: 'wav',
  FLAC: 'flac',
  AAC: 'aac',
  OGG: 'ogg',
} as const;

export const RepeatType = {
  ONCE: 'once',
  YEARLY: 'yearly',
  MONTHLY: 'monthly',
  WEEKLY: 'weekly',
} as const;
