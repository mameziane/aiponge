/**
 * Albums API Contracts
 *
 * Zod schemas for album endpoints.
 */

import { z } from 'zod';
import { ServiceResponseSchema, ContentVisibilitySchema } from '../common/index.js';
import { TrackSchema } from './tracks.js';
import { AlbumLifecycleSchema } from '../common/content-lifecycle.js';
export type { AlbumLifecycleStatus as AlbumStatus } from '../common/content-lifecycle.js';

export const AlbumTypeSchema = z.enum(['album', 'single', 'ep', 'compilation']);
export type AlbumType = z.infer<typeof AlbumTypeSchema>;

export const AlbumStatusSchema = AlbumLifecycleSchema;

// =============================================================================
// ALBUM SCHEMA
// =============================================================================

export const AlbumSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    userId: z.string(),
    displayName: z.string().optional(), // Display name stored in metadata
    description: z.string().nullable().optional(),
    genres: z.array(z.string()).optional(),
    artworkUrl: z.string().nullable().optional(),
    releaseDate: z.string().nullable().optional(),
    type: AlbumTypeSchema.or(z.string()),
    totalTracks: z.number().optional(),
    totalDuration: z.number().optional(),
    isExplicit: z.boolean().optional(),
    visibility: ContentVisibilitySchema.optional(),
    chapterId: z.string().nullable().optional(),
    status: AlbumStatusSchema.or(z.string()),
    playCount: z.number().optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type Album = z.infer<typeof AlbumSchema>;

// =============================================================================
// USER ALBUM SCHEMA
// =============================================================================

export const UserAlbumSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    title: z.string(),
    displayName: z.string().optional(), // Display name stored in metadata
    description: z.string().nullable().optional(),
    artworkUrl: z.string().nullable().optional(),
    chapterId: z.string().nullable().optional(),
    bookId: z.string().nullable().optional(),
    totalTracks: z.number().optional(),
    totalDuration: z.number().optional(),
    status: z.string().optional(),
    playCount: z.number().optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type UserAlbum = z.infer<typeof UserAlbumSchema>;

// =============================================================================
// ALBUM WITH TRACKS SCHEMA
// =============================================================================

export const AlbumWithTracksSchema = AlbumSchema.extend({
  tracks: z.array(TrackSchema).optional(),
});
export type AlbumWithTracks = z.infer<typeof AlbumWithTracksSchema>;

// =============================================================================
// ALBUM RESPONSE SCHEMAS
// =============================================================================

export const AlbumResponseSchema = ServiceResponseSchema(AlbumSchema);
export type AlbumResponse = z.infer<typeof AlbumResponseSchema>;

export const AlbumWithTracksResponseSchema = ServiceResponseSchema(AlbumWithTracksSchema);
export type AlbumWithTracksResponse = z.infer<typeof AlbumWithTracksResponseSchema>;

export const AlbumsListDataSchema = z.object({
  albums: z.array(AlbumSchema),
  total: z.number().optional(),
});
export type AlbumsListData = z.infer<typeof AlbumsListDataSchema>;

export const AlbumsListResponseSchema = ServiceResponseSchema(AlbumsListDataSchema);
export type AlbumsListResponse = z.infer<typeof AlbumsListResponseSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export function validateAlbumResponse(response: unknown): {
  valid: boolean;
  data?: AlbumResponse;
  error?: string;
} {
  const result = AlbumResponseSchema.safeParse(response);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, error: result.error.message };
}

export function extractAlbumFromResponse(response: unknown): Album | null {
  const result = AlbumResponseSchema.safeParse(response);
  if (result.success && result.data.success && result.data.data) {
    return result.data.data;
  }
  return null;
}

export function extractAlbumsFromResponse(response: unknown): Album[] {
  const result = AlbumsListResponseSchema.safeParse(response);
  if (result.success && result.data.success && result.data.data) {
    return result.data.data.albums;
  }
  return [];
}

export function formatAlbumDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }
  return `${minutes} min`;
}

export function getAlbumDisplayType(type: string): string {
  const typeMap: Record<string, string> = {
    album: 'Album',
    single: 'Single',
    ep: 'EP',
    compilation: 'Compilation',
  };
  return typeMap[type] || type;
}
