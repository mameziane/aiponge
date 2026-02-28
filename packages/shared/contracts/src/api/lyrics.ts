/**
 * Lyrics API Contracts
 *
 * Zod schemas for lyrics endpoints including synced lyrics for karaoke display.
 */

import { z } from 'zod';
import { ServiceResponseSchema } from '../common/index.js';

// =============================================================================
// SYNCED LINE SCHEMA (for karaoke-style display)
// =============================================================================

export const SyncedLineSchema = z
  .object({
    text: z.string(),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    startMs: z.number().optional(),
    endMs: z.number().optional(),
    type: z.string().optional(),
  })
  .passthrough();
export type SyncedLine = z.infer<typeof SyncedLineSchema>;

// =============================================================================
// LYRICS SCHEMA
// =============================================================================

export const LyricsSchema = z
  .object({
    id: z.string(),
    userId: z.string().nullable().optional(), // Creator of the lyrics
    content: z.string(),
    syncedLines: z.array(SyncedLineSchema).nullable().optional(),
    synced_lines: z.array(SyncedLineSchema).nullable().optional(),
    timedLyricsJson: z.unknown().nullable().optional(),
    clipId: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    style: z.string().nullable().optional(),
    mood: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    themes: z.array(z.string()).nullable().optional(),
    hasStructureTags: z.boolean().optional(),
    aiProvider: z.string().nullable().optional(),
    aiModel: z.string().nullable().optional(),
    generationPrompt: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type Lyrics = z.infer<typeof LyricsSchema>;

// =============================================================================
// USER LYRICS SCHEMA (user-owned lyrics)
// =============================================================================

export const UserLyricsSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    entryId: z.string().nullable().optional(),
    content: z.string(),
    syncedLines: z.array(SyncedLineSchema).nullable().optional(),
    title: z.string().nullable().optional(),
    style: z.string().nullable().optional(),
    mood: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    themes: z.array(z.string()).nullable().optional(),
    usageCount: z.number().optional(),
    aiProvider: z.string().nullable().optional(),
    aiModel: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type UserLyrics = z.infer<typeof UserLyricsSchema>;

// =============================================================================
// LYRICS RESPONSE SCHEMAS
// =============================================================================

export const LyricsResponseSchema = ServiceResponseSchema(LyricsSchema);
export type LyricsResponse = z.infer<typeof LyricsResponseSchema>;

export const UserLyricsResponseSchema = ServiceResponseSchema(UserLyricsSchema);
export type UserLyricsResponse = z.infer<typeof UserLyricsResponseSchema>;

export const LyricsListDataSchema = z.object({
  lyrics: z.array(LyricsSchema),
  total: z.number().optional(),
});
export type LyricsListData = z.infer<typeof LyricsListDataSchema>;

export const LyricsListResponseSchema = ServiceResponseSchema(LyricsListDataSchema);
export type LyricsListResponse = z.infer<typeof LyricsListResponseSchema>;

// =============================================================================
// LYRICS GENERATION REQUEST SCHEMA
// =============================================================================

export const GenerateLyricsRequestSchema = z
  .object({
    userId: z.string().uuid().optional(),
    entryId: z.string().uuid().optional(),
    content: z.string().max(10000).optional(),
    style: z.string().max(100).optional(),
    mood: z.string().max(100).optional(),
    language: z.string().max(10).optional(),
    genre: z.string().max(100).optional(),
    title: z.string().max(255).optional(),
  })
  .passthrough();
export type GenerateLyricsRequest = z.infer<typeof GenerateLyricsRequestSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export function validateLyricsResponse(response: unknown): {
  valid: boolean;
  data?: LyricsResponse;
  error?: string;
} {
  const result = LyricsResponseSchema.safeParse(response);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, error: result.error.message };
}

export function extractLyricsFromResponse(response: unknown): Lyrics | null {
  const result = LyricsResponseSchema.safeParse(response);
  if (result.success && result.data.success && result.data.data) {
    return result.data.data;
  }
  return null;
}

export function extractSyncedLines(lyrics: Lyrics): SyncedLine[] {
  return lyrics.syncedLines || lyrics.synced_lines || [];
}

export function hasSyncedLyrics(lyrics: Lyrics): boolean {
  const lines = extractSyncedLines(lyrics);
  return (
    lines.length > 0 &&
    lines.some(
      line =>
        (line.startTime !== undefined && line.endTime !== undefined) ||
        (line.startMs !== undefined && line.endMs !== undefined)
    )
  );
}
