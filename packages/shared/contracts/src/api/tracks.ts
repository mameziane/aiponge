/**
 * Tracks API Contracts
 *
 * Zod schemas for track/music playback endpoints.
 */

import { z } from 'zod';
import { ServiceResponseSchema, ContentVisibilitySchema } from '../common/index.js';
import { TrackLifecycleSchema, TRACK_LIFECYCLE } from '../common/content-lifecycle.js';
export type { TrackLifecycleStatus as TrackStatus } from '../common/content-lifecycle.js';

export const TrackStatusSchema = TrackLifecycleSchema;

// =============================================================================
// TRACK QUALITY ENUM
// =============================================================================

export const TrackQualitySchema = z.enum(['lossless', 'high', 'medium', 'low']);
export type TrackQuality = z.infer<typeof TrackQualitySchema>;

// =============================================================================
// TRACK SCHEMA (shared library tracks)
// =============================================================================

export const TrackSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    userId: z.string(),
    displayName: z.string().optional(), // Display name stored in metadata
    albumId: z.string(),
    albumTitle: z.string().optional(),
    duration: z.number(),
    fileUrl: z.string(),
    artworkUrl: z.string().nullable().optional(),
    lyricsId: z.string().nullable().optional(),
    hasSyncedLyrics: z.boolean().optional(),
    genres: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    trackNumber: z.number().nullable().optional(),
    generationNumber: z.number().optional(),
    status: TrackStatusSchema.or(z.string()),
    quality: TrackQualitySchema.or(z.string()),
    fileSize: z.number().optional(),
    mimeType: z.string().optional(),
    isExplicit: z.boolean().optional(),
    playCount: z.number().optional(),
    likeCount: z.number().optional(),
    language: z.string().optional(),
    variantGroupId: z.string().nullable().optional(),
    sourceUserTrackId: z.string().nullable().optional(),
    generatedByUserId: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type Track = z.infer<typeof TrackSchema>;

// =============================================================================
// USER TRACK SCHEMA (user-owned tracks)
// =============================================================================

export const UserTrackSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    displayName: z.string().optional(), // Display name stored in metadata
    trackNumber: z.number().nullable().optional(),
    title: z.string(),
    duration: z.number(),
    fileUrl: z.string(),
    artworkUrl: z.string().nullable().optional(),
    lyricsId: z.string().nullable().optional(),
    entryId: z.string().nullable().optional(),
    chapterId: z.string().nullable().optional(),
    hasSyncedLyrics: z.boolean().optional(),
    genre: z.string().nullable().optional(),
    mood: z.string().nullable().optional(),
    style: z.string().nullable().optional(),
    language: z.string().optional(),
    status: z.string().optional(),
    quality: z.string().optional(),
    fileSize: z.number().optional(),
    mimeType: z.string().optional(),
    playCount: z.number().optional(),
    likeCount: z.number().optional(),
    visibility: ContentVisibilitySchema.optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type UserTrack = z.infer<typeof UserTrackSchema>;

// =============================================================================
// TRACK RESPONSE SCHEMAS
// =============================================================================

export const TrackResponseSchema = ServiceResponseSchema(TrackSchema);
export type TrackResponse = z.infer<typeof TrackResponseSchema>;

export const UserTrackResponseSchema = ServiceResponseSchema(UserTrackSchema);
export type UserTrackResponse = z.infer<typeof UserTrackResponseSchema>;

export const TracksListDataSchema = z.object({
  tracks: z.array(TrackSchema),
  total: z.number().optional(),
});
export type TracksListData = z.infer<typeof TracksListDataSchema>;

export const TracksListResponseSchema = ServiceResponseSchema(TracksListDataSchema);
export type TracksListResponse = z.infer<typeof TracksListResponseSchema>;

export const UserTracksListDataSchema = z.object({
  tracks: z.array(UserTrackSchema),
  total: z.number().optional(),
});
export type UserTracksListData = z.infer<typeof UserTracksListDataSchema>;

export const UserTracksListResponseSchema = ServiceResponseSchema(UserTracksListDataSchema);
export type UserTracksListResponse = z.infer<typeof UserTracksListResponseSchema>;

// =============================================================================
// TRACK WITH LYRICS (for playback with synced lyrics)
// =============================================================================

import { SyncedLineSchema } from './lyrics.js';

export const TrackWithLyricsSchema = TrackSchema.extend({
  lyrics: z
    .object({
      id: z.string(),
      content: z.string(),
      syncedLines: z.array(SyncedLineSchema).nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type TrackWithLyrics = z.infer<typeof TrackWithLyricsSchema>;

export const TrackWithLyricsResponseSchema = ServiceResponseSchema(TrackWithLyricsSchema);
export type TrackWithLyricsResponse = z.infer<typeof TrackWithLyricsResponseSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export function validateTrackResponse(response: unknown): {
  valid: boolean;
  data?: TrackResponse;
  error?: string;
} {
  const result = TrackResponseSchema.safeParse(response);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, error: result.error.message };
}

export function extractTrackFromResponse(response: unknown): Track | null {
  const result = TrackResponseSchema.safeParse(response);
  if (result.success && result.data.success && result.data.data) {
    return result.data.data;
  }
  return null;
}

export function extractTracksFromResponse(response: unknown): Track[] {
  const result = TracksListResponseSchema.safeParse(response);
  if (result.success && result.data.success && result.data.data) {
    return result.data.data.tracks;
  }
  return [];
}

export function isTrackPlayable(track: Track | UserTrack): boolean {
  return (
    Boolean(track.fileUrl) && (track.status === TRACK_LIFECYCLE.ACTIVE || track.status === TRACK_LIFECYCLE.PUBLISHED)
  );
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
