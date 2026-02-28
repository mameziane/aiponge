/**
 * Playlists API Contracts
 *
 * Zod schemas for playlist endpoints.
 */

import { z } from 'zod';
import { ServiceResponseSchema, ContentVisibilitySchema } from '../common/index.js';
import { TrackSchema } from './tracks.js';
import { PlaylistLifecycleSchema } from '../common/content-lifecycle.js';
export type { PlaylistLifecycleStatus as PlaylistStatus } from '../common/content-lifecycle.js';

export const PlaylistTypeSchema = z.enum(['manual', 'smart', 'hybrid']);
export type PlaylistType = z.infer<typeof PlaylistTypeSchema>;

export const PlaylistStatusSchema = PlaylistLifecycleSchema;

// =============================================================================
// PLAYLIST CATEGORY ENUM
// =============================================================================

export const PlaylistCategorySchema = z.enum(['user', 'featured', 'algorithm']);
export type PlaylistCategory = z.infer<typeof PlaylistCategorySchema>;

// =============================================================================
// PLAYLIST SCHEMA
// =============================================================================

export const PlaylistSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    userId: z.string().nullable().optional(),
    visibility: ContentVisibilitySchema.optional(),
    artworkUrl: z.string().nullable().optional(),
    totalDuration: z.number().optional(),
    playCount: z.number().optional(),
    likeCount: z.number().optional(),
    followerCount: z.number().optional(),
    tags: z.array(z.string()).optional(),
    category: PlaylistCategorySchema.or(z.string()).nullable().optional(),
    mood: z.string().nullable().optional(),
    genre: z.string().nullable().optional(),
    status: PlaylistStatusSchema.or(z.string()).optional(),
    playlistType: PlaylistTypeSchema.or(z.string()).optional(),
    isSystem: z.boolean().optional(),
    icon: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    smartKey: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type Playlist = z.infer<typeof PlaylistSchema>;

// =============================================================================
// PLAYLIST TRACK SCHEMA (junction with ordering)
// =============================================================================

export const PlaylistTrackSchema = z
  .object({
    id: z.string().optional(),
    playlistId: z.string(),
    trackId: z.string(),
    position: z.number().optional(),
    addedAt: z.string().optional(),
    addedBy: z.string().nullable().optional(),
    track: TrackSchema.optional(),
  })
  .passthrough();
export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;

// =============================================================================
// PLAYLIST WITH TRACKS SCHEMA
// =============================================================================

export const PlaylistWithTracksSchema = PlaylistSchema.extend({
  tracks: z.array(PlaylistTrackSchema.or(TrackSchema)).optional(),
  trackCount: z.number().optional(),
});
export type PlaylistWithTracks = z.infer<typeof PlaylistWithTracksSchema>;

// =============================================================================
// SMART PLAYLIST SCHEMA
// =============================================================================

export const SmartPlaylistSchema = PlaylistSchema.extend({
  smartKey: z.string(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isSystem: z.literal(true).optional(),
});
export type SmartPlaylist = z.infer<typeof SmartPlaylistSchema>;

// =============================================================================
// PLAYLIST RESPONSE SCHEMAS
// =============================================================================

export const PlaylistResponseSchema = ServiceResponseSchema(PlaylistSchema);
export type PlaylistResponse = z.infer<typeof PlaylistResponseSchema>;

export const PlaylistWithTracksResponseSchema = ServiceResponseSchema(PlaylistWithTracksSchema);
export type PlaylistWithTracksResponse = z.infer<typeof PlaylistWithTracksResponseSchema>;

export const PlaylistsListDataSchema = z.object({
  playlists: z.array(PlaylistSchema),
  total: z.number().optional(),
});
export type PlaylistsListData = z.infer<typeof PlaylistsListDataSchema>;

export const PlaylistsListResponseSchema = ServiceResponseSchema(PlaylistsListDataSchema);
export type PlaylistsListResponse = z.infer<typeof PlaylistsListResponseSchema>;

export const SmartPlaylistsListDataSchema = z.object({
  playlists: z.array(SmartPlaylistSchema),
});
export type SmartPlaylistsListData = z.infer<typeof SmartPlaylistsListDataSchema>;

export const SmartPlaylistsListResponseSchema = ServiceResponseSchema(SmartPlaylistsListDataSchema);
export type SmartPlaylistsListResponse = z.infer<typeof SmartPlaylistsListResponseSchema>;

// =============================================================================
// PLAYLIST MUTATION SCHEMAS
// =============================================================================

export const CreatePlaylistRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  visibility: ContentVisibilitySchema.optional(),
  artworkUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  mood: z.string().max(100).optional(),
  genre: z.string().max(100).optional(),
  category: z.enum(['user', 'featured', 'algorithm']).optional(),
  icon: z.string().max(10).optional(),
  color: z
    .string()
    .max(20)
    .regex(/^#[0-9a-fA-F]{3,8}$/, 'Must be a valid hex color')
    .optional(),
  playlistType: z.enum(['manual', 'smart', 'hybrid']).optional(),
});
export type CreatePlaylistRequest = z.infer<typeof CreatePlaylistRequestSchema>;

export const UpdatePlaylistRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  visibility: ContentVisibilitySchema.optional(),
  artworkUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string()).optional(),
  mood: z.string().max(100).nullable().optional(),
  genre: z.string().max(100).nullable().optional(),
  category: z.enum(['user', 'featured', 'algorithm']).nullable().optional(),
  icon: z.string().max(10).nullable().optional(),
  color: z
    .string()
    .max(20)
    .regex(/^#[0-9a-fA-F]{3,8}$/, 'Must be a valid hex color')
    .nullable()
    .optional(),
  playlistType: z.enum(['manual', 'smart', 'hybrid']).nullable().optional(),
});
export type UpdatePlaylistRequest = z.infer<typeof UpdatePlaylistRequestSchema>;

export const AddTrackToPlaylistRequestSchema = z.object({
  trackId: z.string().uuid(),
  position: z.number().int().min(0).optional(),
});
export type AddTrackToPlaylistRequest = z.infer<typeof AddTrackToPlaylistRequestSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export function validatePlaylistResponse(response: unknown): {
  valid: boolean;
  data?: PlaylistResponse;
  error?: string;
} {
  const result = PlaylistResponseSchema.safeParse(response);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, error: result.error.message };
}

export function extractPlaylistFromResponse(response: unknown): Playlist | null {
  const result = PlaylistResponseSchema.safeParse(response);
  if (result.success && result.data.success && result.data.data) {
    return result.data.data;
  }
  return null;
}

export function extractPlaylistsFromResponse(response: unknown): Playlist[] {
  const result = PlaylistsListResponseSchema.safeParse(response);
  if (result.success && result.data.success && result.data.data) {
    return result.data.data.playlists;
  }
  return [];
}

export function isSmartPlaylist(playlist: Playlist): boolean {
  return playlist.playlistType === 'smart' || Boolean(playlist.smartKey);
}

export function isSystemPlaylist(playlist: Playlist): boolean {
  return Boolean(playlist.isSystem);
}

export function formatPlaylistDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }
  return `${minutes} min`;
}
