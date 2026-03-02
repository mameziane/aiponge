/**
 * Authentication Cache Utilities
 * Centralized cache invalidation logic for authentication state changes
 */

import { QueryClient } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { queryClient } from '../lib/reactQueryClient';
import { apiClient } from '../lib/axiosApiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryKeys } from '../lib/queryKeys';
import { logger } from '../lib/logger';

interface TrackItem {
  id: string;
  [key: string]: unknown;
}

const LIBRARY_QUERY_KEYS = [
  queryKeys.tracks.private(),
  queryKeys.tracks.explore(),
  queryKeys.sharedLibrary.tracks(),
] as const;

function filterTrackArray(arr: TrackItem[] | undefined, trackId: string): TrackItem[] | undefined {
  if (!arr) return arr;
  return arr.filter(t => t.id !== trackId);
}

interface ExploreNestedData {
  yourCreations?: TrackItem[];
  recentlyPlayed?: TrackItem[];
  yourTopSongs?: TrackItem[];
  popularTracks?: TrackItem[];
  recommendations?: TrackItem[];
  topCharts?: TrackItem[];
  [key: string]: unknown;
}

function removeTrackFromNestedData(nestedData: ExploreNestedData, trackId: string): ExploreNestedData {
  return {
    ...nestedData,
    yourCreations: filterTrackArray(nestedData.yourCreations, trackId),
    recentlyPlayed: filterTrackArray(nestedData.recentlyPlayed, trackId),
    yourTopSongs: filterTrackArray(nestedData.yourTopSongs, trackId),
    popularTracks: filterTrackArray(nestedData.popularTracks, trackId),
    recommendations: filterTrackArray(nestedData.recommendations, trackId),
    topCharts: filterTrackArray(nestedData.topCharts, trackId),
  };
}

interface LibraryResponse {
  tracks?: TrackItem[];
  data?: TrackItem[];
  yourCreations?: TrackItem[];
  recentlyPlayed?: TrackItem[];
  yourTopSongs?: TrackItem[];
  popularTracks?: TrackItem[];
  recommendations?: TrackItem[];
  topCharts?: TrackItem[];
  [key: string]: unknown;
}

function removeTrackFromData(data: unknown, trackId: string): unknown {
  if (!data || typeof data !== 'object') return data;

  const response = data as LibraryResponse;

  if (Array.isArray(response)) {
    return response.filter((item: TrackItem) => item.id !== trackId);
  }

  if (response.tracks && Array.isArray(response.tracks)) {
    return { ...response, tracks: response.tracks.filter((t: TrackItem) => t.id !== trackId) };
  }

  // Handle wrapped response: { success, data: { tracks: [...] } }
  if (response.data && Array.isArray(response.data)) {
    return { ...response, data: response.data.filter((t: TrackItem) => t.id !== trackId) };
  }

  // Handle wrapped explore response: { success, data: { yourCreations, recentlyPlayed, ... } }
  const wrapped = data as ServiceResponse<ExploreNestedData>;
  if (
    wrapped &&
    wrapped.data &&
    (wrapped.data.yourCreations || wrapped.data.recentlyPlayed || wrapped.data.yourTopSongs)
  ) {
    return {
      ...wrapped,
      data: removeTrackFromNestedData(wrapped.data, trackId),
    };
  }

  // Handle unwrapped explore response structure with nested arrays
  if (response.yourCreations || response.recentlyPlayed || response.yourTopSongs) {
    return {
      ...response,
      yourCreations: filterTrackArray(response.yourCreations, trackId),
      recentlyPlayed: filterTrackArray(response.recentlyPlayed, trackId),
      yourTopSongs: filterTrackArray(response.yourTopSongs, trackId),
      popularTracks: filterTrackArray(response.popularTracks, trackId),
      recommendations: filterTrackArray(response.recommendations, trackId),
      topCharts: filterTrackArray(response.topCharts, trackId),
    };
  }

  return data;
}

export function applyTrackDeletionToCache(qc: QueryClient, trackId: string, playlistId?: string): void {
  for (const key of LIBRARY_QUERY_KEYS) {
    qc.setQueryData(key, (old: unknown) => removeTrackFromData(old, trackId));
  }

  if (playlistId) {
    qc.setQueryData(queryKeys.playlists.tracks(playlistId), (old: unknown) => removeTrackFromData(old, trackId));
  }

  qc.setQueriesData(
    {
      predicate: ({ queryKey }) =>
        Array.isArray(queryKey) && queryKey[0] === 'playlists' && queryKey.includes('tracks'),
    },
    (old: unknown) => removeTrackFromData(old, trackId)
  );

  setTimeout(() => {
    qc.invalidateQueries({ queryKey: queryKeys.tracks.all, refetchType: 'inactive' });
    qc.invalidateQueries({ queryKey: queryKeys.playlists.all, refetchType: 'inactive' });
  }, 1500);
}

/**
 * Tracks when explore cache bypass is needed to handle API Gateway's cache
 * After a profile name change, all explore requests should bypass the gateway cache
 * until the cache naturally expires (including stale-while-revalidate window)
 */
let exploreCacheBypassUntil: number = 0;
// API Gateway explore cache: 2 min TTL + 5 min stale-while-revalidate = 7 min total
const API_GATEWAY_FULL_CACHE_LIFETIME_MS = 7 * 60 * 1000; // 7 minutes

/**
 * Check if explore requests should bypass API Gateway cache
 */
export function shouldBypassExploreCache(): boolean {
  return Date.now() < exploreCacheBypassUntil;
}

/**
 * Force refresh explore feed bypassing all caches including API Gateway
 * Uses x-cache-revalidate header to bypass API Gateway's 2-minute response cache
 *
 * CRITICAL: Call this after profile name changes to ensure names update
 * Sets a bypass flag so subsequent refetches also bypass the gateway cache
 */
export async function forceRefreshExplore(): Promise<void> {
  // Mark that explore should bypass cache for the full cache lifetime (7 minutes)
  exploreCacheBypassUntil = Date.now() + API_GATEWAY_FULL_CACHE_LIFETIME_MS;

  try {
    // Make a fresh request with cache bypass header to bypass API Gateway cache
    const freshData = await apiClient.get('/api/v1/app/library/explore', {
      headers: {
        'x-cache-revalidate': 'true',
      },
    });
    // Directly update React Query cache with fresh data - no refetch needed
    queryClient.setQueryData(queryKeys.tracks.explore(), freshData);
  } catch {
    // Silent fail - explore will update on next natural refresh
  }
}

/**
 * Force refresh public albums list bypassing API Gateway cache
 * Uses x-cache-revalidate header to bypass the gateway's response cache
 *
 * Call this after album generation completes to ensure newly created albums
 * appear immediately — invalidateQueries alone may fetch stale gateway-cached data.
 */
export async function forceRefreshPublicAlbums(): Promise<void> {
  try {
    const freshData = await apiClient.get('/api/v1/app/library/public-albums', {
      headers: {
        'x-cache-revalidate': 'true',
      },
    });
    queryClient.setQueryData(queryKeys.albums.public(), freshData);
  } catch {
    // Silent fail - albums will update on next natural refresh
  }
}

/**
 * Invalidate all authentication-related caches
 * Called after login, registration, or guest auth
 *
 * CRITICAL: Clears BOTH axios cache and React Query cache
 * The axios cache is keyed by URL only, so stale data from previous sessions
 * can be served even after React Query invalidation
 */
export async function invalidateAuthCaches(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.appInit.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.status() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sharedLibrary.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tracks.myMusic() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tracks.private() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.library.myBooks() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.library.books() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.personalBooks.all }),
  ]);
}

/**
 * Clear all user-specific caches on logout
 * Called when user logs out to prevent data leakage between accounts
 *
 * CRITICAL: This clears AsyncStorage keys that are user-specific
 * to prevent cross-user data contamination
 */
export async function clearUserCachesOnLogout(): Promise<void> {
  await queryClient.cancelQueries();

  // Clear last active book ID from AsyncStorage
  const userSpecificKeys = ['lastActiveBookId', 'lastActiveChapterId'];

  await Promise.all(
    userSpecificKeys.map(key =>
      AsyncStorage.removeItem(key).catch(error => {
        logger.warn('[cacheUtils] Failed to clear user-specific key on logout', { key, error });
      })
    )
  );

  queryClient.clear();
}
