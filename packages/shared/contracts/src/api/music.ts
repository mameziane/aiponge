/**
 * Music API Contracts
 *
 * Zod schemas for music generation endpoints.
 * These contracts ensure type-safe communication between frontend and backend.
 */

import { z } from 'zod';
import { ServiceResponseSchema, ContentVisibilitySchema } from '../common/index.js';

// =============================================================================
// SONG REQUEST PHASE ENUM
// =============================================================================

export const SongRequestPhaseSchema = z.enum([
  'queued',
  'fetching_content',
  'generating_lyrics',
  'generating_artwork',
  'generating_music',
  'saving',
  'completed',
  'failed',
]);
export type SongRequestPhase = z.infer<typeof SongRequestPhaseSchema>;

// =============================================================================
// SONG REQUEST PROGRESS SCHEMA
// =============================================================================

export const SongRequestProgressSchema = z.object({
  id: z.string(),
  userId: z.string(),
  entryId: z.string().nullable().optional(),
  status: z.string(),
  phase: SongRequestPhaseSchema,
  percentComplete: z.number().min(0).max(100),
  visibility: ContentVisibilitySchema.optional(),
  errorMessage: z.string().nullable().optional(),
  artworkError: z.string().nullable().optional(),
  trackId: z.string().nullable().optional(),
  trackTitle: z.string().nullable().optional(),
  artworkUrl: z.string().nullable().optional(),
  streamingUrl: z.string().nullable().optional(),
  lyrics: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});
export type SongRequestProgress = z.infer<typeof SongRequestProgressSchema>;

// =============================================================================
// SONG GENERATION REQUEST SCHEMA — re-exported from input-schemas (single source of truth)
// =============================================================================

export {
  MusicGenerateSchema as SongGenerationRequestSchema,
  type MusicGenerateInput as SongGenerationRequest,
} from './input-schemas.js';

// =============================================================================
// SONG GENERATION RESPONSE SCHEMAS (using ServiceResponseSchema pattern)
// =============================================================================

export const SongGenerationDataSchema = z.object({
  requestId: z.string(),
  status: z.string(),
  message: z.string().optional(),
  creditsUsed: z.number().optional(),
  creditsRemaining: z.number().optional(),
});
export type SongGenerationData = z.infer<typeof SongGenerationDataSchema>;

export const SongGenerationResponseSchema = ServiceResponseSchema(SongGenerationDataSchema);
export type SongGenerationResponse = z.infer<typeof SongGenerationResponseSchema>;

// =============================================================================
// SONG PROGRESS RESPONSE SCHEMAS (using ServiceResponseSchema pattern)
// =============================================================================

export const SongProgressResponseSchema = ServiceResponseSchema(SongRequestProgressSchema.nullable());
export type SongProgressResponse = z.infer<typeof SongProgressResponseSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate a song generation response
 */
export function validateSongGenerationResponse(response: unknown): {
  valid: boolean;
  data?: SongGenerationResponse;
  error?: string;
} {
  const result = SongGenerationResponseSchema.safeParse(response);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, error: result.error.message };
}

/**
 * Validate a song progress response
 */
export function validateSongProgressResponse(response: unknown): {
  valid: boolean;
  data?: SongProgressResponse;
  error?: string;
} {
  const result = SongProgressResponseSchema.safeParse(response);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, error: result.error.message };
}

/**
 * Extract song progress from API response with validation
 */
export function extractSongProgressFromResponse(response: unknown): SongRequestProgress | null {
  const result = SongProgressResponseSchema.safeParse(response);
  if (result.success && result.data.success && result.data.data) {
    return result.data.data;
  }
  return null;
}

/**
 * Check if a song generation response indicates success
 */
export function isSongGenerationSuccess(response: SongGenerationResponse): boolean {
  return response.success === true && response.data !== undefined;
}

/**
 * Get the request ID from a successful song generation response
 */
export function getRequestIdFromResponse(response: unknown): string | null {
  const result = SongGenerationResponseSchema.safeParse(response);
  if (result.success && result.data.success && result.data.data?.requestId) {
    return result.data.data.requestId;
  }
  return null;
}
