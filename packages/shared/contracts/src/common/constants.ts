/**
 * Centralized Platform Constants
 *
 * Single Source of Truth for all shared constants across services.
 * Import from @aiponge/shared-contracts instead of defining locally.
 */

// =============================================================================
// APP CONSTANTS
// =============================================================================

export const APP = {
  NAME: 'aiponge',
  DEFAULT_DISPLAY_NAME: '',
  ALBUM_NAME: 'aiponge Music',
} as const;

// =============================================================================
// INFRASTRUCTURE CONSTANTS
// =============================================================================

export const INFRASTRUCTURE = {
  MAX_RETRIES: 3,
  MAX_RETRIES_STARTUP: 5,
  MAX_RETRIES_LIGHTWEIGHT: 1,
  NO_RETRY: 0,
  DEFAULT_TIMEOUT_MS: 30000,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_RESET_MS: 30000,
} as const;

// =============================================================================
// CACHE CONSTANTS
// =============================================================================

export const CACHE = {
  MAX_SIZE: 1000,
  DEFAULT_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  SHORT_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MEDIUM_TTL_MS: 60 * 60 * 1000, // 1 hour
  LONG_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

// =============================================================================
// RATE LIMITING CONSTANTS
// =============================================================================

export const RATE_LIMIT = {
  MIN_RETRY_DELAY_MS: 5000,
  MAX_RETRY_DELAY_MS: 60000,
  DEFAULT_WINDOW_MS: 60000,
  DEFAULT_MAX_REQUESTS: 100,
} as const;

// =============================================================================
// CONTENT LIMITS
// =============================================================================

export const CONTENT_LIMITS = {
  MAX_PREFERENCES_LENGTH: 2000,
  MAX_TITLE_LENGTH: 100,
  MAX_PROMPT_LENGTH: 500,
  MAX_DESCRIPTION_LENGTH: 5000,
  MAX_LYRICS_LENGTH: 10000,
} as const;

// =============================================================================
// GENERATION LIMITS
// =============================================================================

export const GENERATION_LIMITS = {
  MAX_ENTRIES_PER_ALBUM: 20,
  MAX_TRACKS_PER_ALBUM: 20,
  MAX_CHAPTERS_PER_BOOK: 50,
  MAX_ILLUSTRATIONS_PER_ENTRY: 10,
  PARALLEL_TRACK_LIMIT: 3,
} as const;

// =============================================================================
// PAGINATION DEFAULTS
// =============================================================================

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
  DEFAULT_OFFSET: 0,
} as const;

// =============================================================================
// LYRICS FORMATTING
// =============================================================================

export const LYRICS_FORMAT = {
  MAX_CHARS_PER_LINE: 42,
  MIN_WORDS_PER_LINE: 2,
  MAX_INTRO_SCAN_SECONDS: 30,
} as const;

// =============================================================================
// AUDIO PROCESSING
// =============================================================================

export const AUDIO = {
  SILENCE_THRESHOLD_DB: -30,
  MIN_SILENCE_DURATION: 0.5,
  DEFAULT_SAMPLE_RATE: 44100,
} as const;

// =============================================================================
// RECENT EVENTS / LOGGING
// =============================================================================

export const EVENTS = {
  MAX_RECENT_EVENTS: 1000,
  MAX_LOG_ENTRIES: 10000,
} as const;

// =============================================================================
// IMAGE GENERATION TYPES
// =============================================================================

export const IMAGE_TYPES = {
  ALBUM_ARTWORK: 'album-artwork',
  TRACK_ARTWORK: 'track-artwork',
  PLAYLIST_ARTWORK: 'playlist-artwork',
  BOOK_COVER_ARTWORK: 'book-cover-artwork',
} as const;

export type ImageType = (typeof IMAGE_TYPES)[keyof typeof IMAGE_TYPES];

export const IMAGE_TYPE_VALUES = Object.values(IMAGE_TYPES) as ImageType[];

export const VALID_IMAGE_TYPES: readonly ImageType[] = IMAGE_TYPE_VALUES;

export const IMAGE_TYPE_TEMPLATE_MAP: Record<ImageType, string> = {
  [IMAGE_TYPES.ALBUM_ARTWORK]: 'album-artwork',
  [IMAGE_TYPES.TRACK_ARTWORK]: 'album-artwork',
  [IMAGE_TYPES.PLAYLIST_ARTWORK]: 'playlist-artwork',
  [IMAGE_TYPES.BOOK_COVER_ARTWORK]: 'book-cover-artwork',
} as const;

export function isValidImageType(type: string): type is ImageType {
  return IMAGE_TYPE_VALUES.includes(type as ImageType);
}

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export const FEATURE_FLAGS = {
  CDN_CACHE_HEADERS: 'cdn_cache_headers',
  STATIC_METADATA_ENDPOINTS: 'static_metadata_endpoints',
  ADMIN_USE_PRECOMPUTED: 'admin_use_precomputed',
  ASYNC_GENERATION: 'async_generation',
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];
