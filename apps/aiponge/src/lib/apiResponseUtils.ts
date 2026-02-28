/**
 * API Response Utilities
 * Shared utilities for normalizing and extracting data from API responses
 *
 * Standard backend envelope: { success: true, data: T, timestamp: string }
 * All backend services use ServiceResponse<T> from @aiponge/shared-contracts.
 */

import type { ServiceResponse } from '@aiponge/shared-contracts';
import { normalizeTracks } from './apiConfig';

/** @deprecated Use ServiceResponse<T> from @aiponge/shared-contracts instead */
export type WrappedResponse<T> = ServiceResponse<T>;

export interface TracksResponse<T = unknown> {
  tracks: T[];
  total: number;
  source?: string;
}

export function normalizeApiResponse<T extends TracksResponse>(result: ServiceResponse<T>): ServiceResponse<T> {
  if (result && result.data && Array.isArray(result.data.tracks)) {
    return {
      ...result,
      data: {
        ...result.data,
        tracks: normalizeTracks(result.data.tracks as Array<{ audioUrl?: string | null; artworkUrl?: string | null }>),
      },
    };
  }
  return result;
}

export function extractTracks<T>(response: ServiceResponse<TracksResponse<T>> | null | undefined): T[] {
  if (!response) return [];
  if (response.data && Array.isArray(response.data.tracks)) {
    return response.data.tracks;
  }
  return [];
}

export function extractTotal(response: ServiceResponse<TracksResponse> | null | undefined): number {
  if (!response) return 0;
  if (response.data && typeof response.data.total === 'number') {
    return response.data.total;
  }
  return 0;
}

export function unwrapResponse<T extends object>(response: ServiceResponse<T>): T | undefined {
  return response.data;
}
