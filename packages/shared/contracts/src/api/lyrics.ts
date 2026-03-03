/**
 * Lyrics API Contracts
 *
 * Zod schemas for lyrics endpoints including synced lyrics for karaoke display.
 * Canonical types and utilities — import from here instead of defining locally.
 */

import { z } from 'zod';
import { ServiceResponseSchema } from '../common/index.js';

// =============================================================================
// SYNCED WORD SCHEMA (for word-level karaoke highlighting)
// =============================================================================

export const SyncedWordSchema = z.object({
  word: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  confidence: z.number().optional(),
});
export type SyncedWord = z.infer<typeof SyncedWordSchema>;

// =============================================================================
// SYNCED LINE SCHEMA (for karaoke-style display)
// =============================================================================

export const LYRICS_LINE_TYPES = ['line', 'section', 'backing', 'instrumental'] as const;
export type LyricsLineType = (typeof LYRICS_LINE_TYPES)[number];

export const SyncedLineSchema = z
  .object({
    text: z.string(),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    startMs: z.number().optional(),
    endMs: z.number().optional(),
    type: z.enum(LYRICS_LINE_TYPES).optional(),
    words: z.array(SyncedWordSchema).optional(),
  })
  .passthrough();
export type SyncedLine = z.infer<typeof SyncedLineSchema>;

// =============================================================================
// LYRICS DISPLAY UTILITIES
// =============================================================================

/** Get line start time in seconds — handles both startTime (s) and startMs (ms) formats */
export function getLineStartSeconds(line: SyncedLine): number {
  if (line.startTime !== undefined) return line.startTime;
  if (line.startMs !== undefined) return line.startMs / 1000;
  return 0;
}

/** Get line end time in seconds — handles both endTime (s) and endMs (ms) formats */
export function getLineEndSeconds(line: SyncedLine): number {
  if (line.endTime !== undefined) return line.endTime;
  if (line.endMs !== undefined) return line.endMs / 1000;
  return 0;
}

/** Get word start time in seconds */
export function getWordStartSeconds(word: SyncedWord): number {
  return word.startTime;
}

/** Get word end time in seconds */
export function getWordEndSeconds(word: SyncedWord): number {
  return word.endTime;
}

/** Returns true if text is a section header like [Verse], [Chorus] */
export function isSectionHeader(text: string): boolean {
  return /^\[.*\]$/.test(text.trim());
}

/** Returns true if text contains an inline section marker like "Hello [Verse 2] world" */
export function containsSectionHeader(text: string): boolean {
  return /\[.*?\]/.test(text);
}

/** Removes all bracketed content from text, e.g. "[Verse 1] Hello" → "Hello" */
export function stripBracketedContent(text: string): string {
  return text.replace(/\[.*?\]/g, '').trim();
}

/** Returns true if a synced line should be displayed (filters section headers, instrumentals) */
export function isDisplayableLyricsLine(line: SyncedLine): boolean {
  if (line.type === 'section' || line.type === 'instrumental') return false;
  const trimmed = line.text.trim();
  if (isSectionHeader(trimmed)) return false;
  return stripBracketedContent(trimmed).length > 0;
}

/** Filters plain-text lyrics content, removing section headers and empty lines */
export function filterSectionHeadersFromContent(content: string): string {
  return content
    .split('\n')
    .map(line => stripBracketedContent(line))
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Binary search for the active line index given a time in seconds.
 * Returns the index of the line that contains the given time, or -1 if none.
 * Lines must be sorted by startTime (ascending).
 */
export function findActiveLineByTime(lines: SyncedLine[], timeSeconds: number): number {
  if (!lines || lines.length === 0) return -1;

  let left = 0;
  let right = lines.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const lineStart = getLineStartSeconds(lines[mid]);
    const lineEnd = getLineEndSeconds(lines[mid]);

    if (timeSeconds >= lineStart && timeSeconds < lineEnd) {
      return mid;
    } else if (timeSeconds < lineStart) {
      right = mid - 1;
    } else {
      result = mid;
      left = mid + 1;
    }
  }

  // Check if we're still within the last candidate line's range
  if (
    result >= 0 &&
    timeSeconds >= getLineStartSeconds(lines[result]) &&
    timeSeconds < getLineEndSeconds(lines[result])
  ) {
    return result;
  }

  return -1;
}

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
