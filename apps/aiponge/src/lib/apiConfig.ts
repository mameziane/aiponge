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
 * Get API Gateway URL based on environment
 *
 * Priority order:
 * 1. EXPO_PUBLIC_API_URL environment variable (production override)
 * 2. Auto-detect based on current hostname (browser)
 * 3. Fallback to localhost for local development
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

    // Production domain
    if (hostname.includes('aiponge.com') || hostname.includes('aiponge.app')) {
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
  // 3. React Native / Expo - fallback to localhost
  else {
    detectedUrl = 'http://localhost:8080';
    source = 'Fallback';
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
 * Normalize media URL by replacing internal/localhost hostnames with the
 * external API Gateway URL and converting relative URLs to absolute URLs.
 *
 * Handles three problematic patterns from the backend:
 * 1. localhost URLs (local dev): http://localhost:8080/uploads/...
 * 2. Railway internal URLs (production): http://api-gateway.railway.internal:8080/uploads/...
 * 3. Relative URLs: /uploads/...
 */
export function normalizeMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  // Already an absolute URL (starts with http:// or https://)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const apiUrl = getApiGatewayUrl();

    // Replace localhost with external gateway URL
    if (url.includes('localhost')) {
      return url.replace(/http:\/\/localhost(?::\d+)?/, apiUrl);
    }

    // Replace Railway internal DNS with external gateway URL
    // Backend services resolve api-gateway as *.railway.internal which mobile can't reach
    if (url.includes('.railway.internal')) {
      return url.replace(/https?:\/\/[^/]*\.railway\.internal(?::\d+)?/, apiUrl);
    }

    return url;
  }

  // Relative URL (starts with /) - prepend base API URL
  if (url.startsWith('/')) {
    const apiUrl = getApiGatewayUrl();
    return `${apiUrl}${url}`;
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
