/**
 * API Configuration Utilities
 * Provides environment-aware API Gateway URL
 *
 * All public API endpoints use the versioned prefix /api/v1/.
 * Use API_VERSION_PREFIX when constructing API paths to ensure
 * consistency with the gateway's routing convention.
 */

import { logger } from './logger';

export const API_VERSION_PREFIX = '/api/v1';

// Cache the API URL to prevent recalculation and excessive logging
let cachedApiUrl: string | null = null;
let hasLoggedApiUrl = false;

/**
 * Detect Replit public URL from environment variables
 * Replit exposes REPL_SLUG and REPL_OWNER which can be used to construct the public URL
 */
const detectReplitUrl = (): string | null => {
  if (typeof process !== 'undefined' && process.env) {
    const replSlug = process.env.REPL_SLUG;
    const replOwner = process.env.REPL_OWNER;

    if (replSlug && replOwner) {
      return `https://${replSlug}.${replOwner}.repl.co`;
    }
  }
  return null;
};

/**
 * Get API Gateway URL based on environment
 *
 * Priority order:
 * 1. EXPO_PUBLIC_API_URL environment variable (production override)
 * 2. Auto-detect based on current hostname (Replit dev URLs)
 * 3. Detect from Replit environment variables (REPL_SLUG + REPL_OWNER)
 * 4. Fallback to localhost for local development
 */
export const getApiGatewayUrl = (): string => {
  // Return cached URL if available
  if (cachedApiUrl) {
    return cachedApiUrl;
  }

  let detectedUrl: string;
  let source: string;

  // 1. Check for explicit environment variable (production/staging)
  if (process.env.EXPO_PUBLIC_API_URL) {
    detectedUrl = process.env.EXPO_PUBLIC_API_URL;
    source = 'EXPO_PUBLIC_API_URL';
  }
  // 2. Browser environment - auto-detect based on hostname
  else if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;

    // Replit preview URL pattern
    if (hostname.includes('.repl.co') || hostname.includes('.replit.dev')) {
      detectedUrl = window.location.origin;
      source = 'Browser (Replit)';
    }
    // Production domain
    else if (hostname.includes('aiponge.com') || hostname.includes('aiponge.app')) {
      detectedUrl = window.location.origin;
      source = 'Browser (Production)';
    }
    // Local development
    else if (hostname === 'localhost' || hostname === '127.0.0.1') {
      detectedUrl = 'http://localhost:8080';
      source = 'Browser (Localhost)';
    }
    // Unknown hostname
    else {
      detectedUrl = 'http://localhost:8080';
      source = 'Browser (Fallback)';
    }
  }
  // 3. React Native / Expo - Detect from Replit environment
  else {
    const replitUrl = detectReplitUrl();
    if (replitUrl) {
      detectedUrl = replitUrl;
      source = 'Replit Env Vars';
    } else {
      detectedUrl = 'http://localhost:8080';
      source = 'Fallback';
    }
  }

  // Cache the result
  cachedApiUrl = detectedUrl;

  // Log only once during app initialization
  if (!hasLoggedApiUrl) {
    logger.debug('API Gateway URL configured', { url: detectedUrl, source });
    hasLoggedApiUrl = true;
  }

  return detectedUrl;
};

/**
 * Get full API URL by appending path to gateway URL
 */
export const getApiUrl = (path: string): string => {
  const baseUrl = getApiGatewayUrl();
  return path.startsWith('http') ? path : `${baseUrl}${path}`;
};

/**
 * Normalize media URL by replacing localhost with the external API Gateway URL
 * and converting relative URLs to absolute URLs
 * This ensures media URLs work on mobile devices even if backend returns localhost or relative paths
 */
export function normalizeMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  // Already an absolute URL (starts with http:// or https://)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // If it contains localhost, replace with external gateway URL
    if (url.includes('localhost')) {
      const apiUrl = getApiGatewayUrl();
      const normalized = url.replace(/http:\/\/localhost(?::\d+)?/, apiUrl);
      return normalized;
    }
    return url;
  }

  // Relative URL (starts with /) - prepend base API URL
  if (url.startsWith('/')) {
    const apiUrl = getApiGatewayUrl();
    const normalized = `${apiUrl}${url}`;
    return normalized;
  }

  // Other formats - return as-is
  return url;
}

/**
 * Normalize track object by converting localhost URLs to external URLs
 * and converting snake_case fields to camelCase
 */
export function normalizeTrack<T extends { audioUrl?: string | null; artworkUrl?: string | null }>(track: T): T {
  const rawTrack = track as Record<string, unknown>;
  return {
    ...track,
    audioUrl: normalizeMediaUrl(track.audioUrl) || track.audioUrl,
    artworkUrl: normalizeMediaUrl(track.artworkUrl) || track.artworkUrl,
    lyricsId: rawTrack.lyricsId ?? rawTrack.lyrics_id ?? undefined,
    hasSyncedLyrics: rawTrack.hasSyncedLyrics ?? rawTrack.has_synced_lyrics ?? undefined,
    displayName: rawTrack.displayName ?? rawTrack.display_name ?? undefined,
    playCount: rawTrack.playCount ?? rawTrack.play_count ?? undefined,
    sourceType: rawTrack.sourceType ?? rawTrack.source_type ?? undefined,
    createdAt: rawTrack.createdAt ?? rawTrack.created_at ?? undefined,
  } as T;
}

/**
 * Normalize array of tracks
 */
export function normalizeTracks<T extends { audioUrl?: string | null; artworkUrl?: string | null }>(tracks: T[]): T[] {
  return tracks.map(normalizeTrack);
}
