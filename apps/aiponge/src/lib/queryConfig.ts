/**
 * Shared React Query Configuration
 * Centralized query options to eliminate duplication across hooks
 */

import { UseQueryOptions, keepPreviousData } from '@tanstack/react-query';
import { QUERY_STALE_TIME, QUERY_GC_TIME } from '../constants/appConfig';

/**
 * Standard query configuration for data that changes infrequently
 * Used for: library data, playlists, user profiles
 * keepPreviousData: eliminates flash of empty content during refetches
 */
export const STANDARD_QUERY_CONFIG = {
  retry: 1,
  staleTime: QUERY_STALE_TIME.long,
  gcTime: QUERY_GC_TIME.default,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  throwOnError: false,
  placeholderData: keepPreviousData,
} as const;

/**
 * Fresh query configuration for data that changes frequently
 * Used for: explore feed, recently played, real-time data
 * keepPreviousData: eliminates flash of empty content during refetches
 */
export const FRESH_QUERY_CONFIG = {
  retry: 1,
  staleTime: QUERY_STALE_TIME.medium,
  gcTime: QUERY_GC_TIME.default,
  refetchOnMount: true,
  refetchOnWindowFocus: false,
  throwOnError: false,
  placeholderData: keepPreviousData,
} as const;

/**
 * Cache-first query configuration for static data
 * Used for: credit policies, app config, static content
 */
export const CACHE_FIRST_CONFIG = {
  retry: 1,
  staleTime: Infinity, // Never goes stale
  gcTime: Infinity, // Keep in cache indefinitely
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  throwOnError: false,
} as const;
