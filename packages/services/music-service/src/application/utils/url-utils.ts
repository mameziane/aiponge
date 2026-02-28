/**
 * URL Utilities - Convert relative URLs to absolute URLs
 * This eliminates the need for client-side URL normalization
 */

import { getLogger, getServiceUrl } from '../../config/service-urls';

const logger = getLogger('music-service-url-utils');

/**
 * Detect Replit external domain from environment variables
 * Matches frontend detection logic for consistency
 */
function detectReplitDomain(): string | null {
  // Priority 1: REPLIT_DOMAINS (most reliable in production)
  if (process.env.REPLIT_DOMAINS) {
    return process.env.REPLIT_DOMAINS;
  }

  // Priority 2: REPLIT_DEV_DOMAIN (fallback)
  if (process.env.REPLIT_DEV_DOMAIN) {
    return process.env.REPLIT_DEV_DOMAIN;
  }

  return null;
}

/**
 * Get API Gateway URL with Replit domain detection for mobile device access
 * When running in Replit, returns external domain instead of localhost
 */
function getExternalApiGatewayUrl(): string {
  // Try to get Replit external domain
  const replitDomain = detectReplitDomain();

  if (replitDomain) {
    // Use HTTPS for external Replit domains
    const gatewayUrl = `https://${replitDomain}`;
    logger.debug('Using Replit external domain for URLs: {}', { data0: gatewayUrl });
    return gatewayUrl;
  }

  // Fallback to local service URL config for local development
  return getServiceUrl('api-gateway');
}

/**
 * Convert relative URL to absolute URL using API Gateway
 * Returns absolute URL if already absolute, or prepends API Gateway URL if relative
 *
 * When running in Replit, uses the external domain for mobile device access.
 * Otherwise, uses localhost for local development.
 */
export function toAbsoluteUrl(relativeUrl: string | null | undefined): string | undefined {
  if (!relativeUrl) return undefined;

  // If already absolute, return as-is
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }

  // Get API Gateway URL with Replit domain detection
  try {
    const apiGatewayUrl = getExternalApiGatewayUrl();
    const absoluteUrl = `${apiGatewayUrl}${relativeUrl}`;
    logger.debug('Converted URL: {} -> {}', { data0: relativeUrl, data1: absoluteUrl });
    return absoluteUrl;
  } catch (error) {
    logger.error('Failed to get API Gateway URL for URL normalization', { error });
    // Fallback: return relative URL (client can still normalize if needed)
    return relativeUrl;
  }
}

/**
 * Normalize a track object by converting its media URLs to absolute URLs
 * Generic function that works with any object containing audioUrl/artworkUrl fields
 */
export function normalizeTrackUrls<T extends Record<string, unknown>>(track: T): T {
  const normalized = { ...track };

  // Convert audioUrl if it exists
  if ('audioUrl' in normalized && normalized.audioUrl && typeof normalized.audioUrl === 'string') {
    (normalized as Record<string, unknown>).audioUrl = toAbsoluteUrl(normalized.audioUrl);
  }

  // Convert artworkUrl if it exists
  if ('artworkUrl' in normalized && normalized.artworkUrl && typeof normalized.artworkUrl === 'string') {
    (normalized as Record<string, unknown>).artworkUrl = toAbsoluteUrl(normalized.artworkUrl);
  }

  return normalized;
}

/**
 * Normalize a collection of tracks by converting their media URLs to absolute URLs
 */
export function normalizeTrackCollection<T extends Record<string, unknown>>(tracks: T[]): T[] {
  return tracks.map(normalizeTrackUrls);
}
