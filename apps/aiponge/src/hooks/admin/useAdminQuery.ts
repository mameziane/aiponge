/**
 * Admin Query Factory Hook
 *
 * Consolidates the repeated pattern across 15+ admin hooks:
 * - isAdmin check from useAuthStore
 * - useQuery with apiClient.get
 * - Standard refetch/stale time configurations
 *
 * This eliminates ~300 lines of duplicated boilerplate.
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { USER_ROLES, type ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { useAuthStore, selectUserAndRole } from '../../auth/store';
import { useShallow } from 'zustand/react/shallow';
import { ADMIN_QUERY } from '../../constants/appConfig';
import { queryKeys } from '../../lib/queryKeys';

/**
 * Cache configuration presets for different admin data types.
 * Centralizes magic numbers that were scattered across 15+ hooks.
 */
export const ADMIN_CACHE_CONFIG = {
  /** Real-time metrics: circuit breakers, errors, monitoring (15s/5s) */
  REALTIME: { refetchInterval: ADMIN_QUERY.refetchInterval.realtime, staleTime: ADMIN_QUERY.staleTime.fast },
  /** Frequently updated: health, services (30s/10-15s) */
  FREQUENT: { refetchInterval: ADMIN_QUERY.refetchInterval.fast, staleTime: ADMIN_QUERY.staleTime.normal },
  /** Standard admin data: providers, diagnostics (60s/30s) */
  STANDARD: { refetchInterval: ADMIN_QUERY.refetchInterval.normal, staleTime: ADMIN_QUERY.staleTime.slow },
  /** Slow-changing metrics: credits, product metrics (120-300s/60-180s) */
  SLOW: { refetchInterval: ADMIN_QUERY.refetchInterval.slow, staleTime: ADMIN_QUERY.staleTime.background },
  /** Very slow: product analytics (5min/3min) */
  ANALYTICS: { refetchInterval: 300000, staleTime: 180000 },
  /** Static data: categories, templates (no refetch, 5min stale) */
  STATIC: { refetchInterval: undefined, staleTime: 300000 },
} as const;

export type CachePreset = keyof typeof ADMIN_CACHE_CONFIG;

export interface UseAdminQueryOptions<TOutput, TRaw = TOutput> {
  /** The API endpoint to fetch (e.g., '/api/v1/admin/health-overview') */
  endpoint: string;
  /**
   * Query key - defaults to [endpoint] if not provided.
   * Use array for parameterized queries: [endpoint, params]
   */
  queryKey?: readonly unknown[];
  /** Cache preset from ADMIN_CACHE_CONFIG */
  cachePreset?: CachePreset;
  /** Override refetchInterval (ms). Takes precedence over cachePreset. */
  refetchInterval?: number;
  /** Override staleTime (ms). Takes precedence over cachePreset. */
  staleTime?: number;
  /** Additional enabled condition (isAdmin is always checked) */
  enabled?: boolean;
  /** Custom select transform to map raw API response to desired output type */
  select?: (data: TRaw) => TOutput;
  /** React Query options passthrough */
  queryOptions?: Partial<UseQueryOptions<TRaw, Error, TOutput>>;
}

/**
 * Factory hook for admin queries.
 *
 * Replaces the repeated pattern:
 * ```ts
 * const { user } = useAuthStore();
 * const isAdmin = user?.role === USER_ROLES.ADMIN;
 * return useQuery({
 *   queryKey: [endpoint],
 *   queryFn: async () => {
 *     const response = await apiClient.get<ApiResponse<T>>(endpoint);
 *     return response.data;
 *   },
 *   enabled: isAdmin,
 *   refetchInterval: X,
 *   staleTime: Y,
 * });
 * ```
 *
 * @example
 * // Simple usage with cache preset
 * const healthQuery = useAdminQuery<HealthOverview>({
 *   endpoint: '/api/v1/admin/health-overview',
 *   cachePreset: 'FREQUENT',
 * });
 *
 * @example
 * // With custom query key for parameterized queries
 * const errorsQuery = useAdminQuery<RecentErrorsResponse>({
 *   endpoint: `/api/v1/admin/recent-errors?${queryString}`,
 *   queryKey: ['/api/v1/admin/recent-errors', query],
 *   cachePreset: 'REALTIME',
 * });
 */
export function useAdminQuery<TOutput, TRaw = TOutput>({
  endpoint,
  queryKey,
  cachePreset = 'STANDARD',
  refetchInterval,
  staleTime,
  enabled = true,
  select,
  queryOptions,
}: UseAdminQueryOptions<TOutput, TRaw>) {
  const { user, roleVerified } = useAuthStore(useShallow(selectUserAndRole));
  const isAdmin = roleVerified && user?.role === USER_ROLES.ADMIN;

  const cacheConfig = ADMIN_CACHE_CONFIG[cachePreset];
  const finalRefetchInterval = refetchInterval ?? cacheConfig.refetchInterval;
  const finalStaleTime = staleTime ?? cacheConfig.staleTime;

  const resolvedQueryKey = queryKey ? [...queryKeys.admin.all, ...queryKey] : [...queryKeys.admin.all, endpoint];

  return useQuery<TRaw, Error, TOutput>({
    queryKey: resolvedQueryKey,
    queryFn: async () => {
      const response = await apiClient.get<ServiceResponse<TRaw>>(endpoint);
      if (!response.success) {
        throw new Error('API request failed');
      }
      return response.data as TRaw;
    },
    enabled: isAdmin && enabled,
    refetchInterval: finalRefetchInterval,
    staleTime: finalStaleTime,
    select,
    ...queryOptions,
  });
}

/**
 * Hook to check if current user is admin.
 * Extracted for reuse in mutations and other components.
 * Only returns true when role has been verified from server to prevent stale role usage.
 */
export function useIsAdmin(): boolean {
  const { user, roleVerified } = useAuthStore(useShallow(selectUserAndRole));
  return roleVerified && user?.role === USER_ROLES.ADMIN;
}

/**
 * Hook to check if current user is librarian or admin.
 * Librarians can manage shared library content and generate multi-language albums.
 * Only returns true when role has been verified from server to prevent stale role usage.
 */
export function useIsLibrarian(): boolean {
  const { user, roleVerified } = useAuthStore(useShallow(selectUserAndRole));
  return roleVerified && (user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.LIBRARIAN);
}

/**
 * Hook to check if current user is librarian or admin, with loading state.
 * Returns { isLibrarian, isLoading } to handle role verification pending state.
 *
 * Note: The role check doesn't require roleVerified because:
 * 1. If the user has librarian/admin role in cache, it came from a previous successful login
 * 2. The backend still validates permissions, so even if role is manipulated client-side,
 *    the actual operation will fail server-side
 * 3. We only show loading if the user is NOT yet a librarian/admin (to give time for refresh)
 */
export function useIsLibrarianWithLoading(): { isLibrarian: boolean; isLoading: boolean } {
  const { user, roleVerified } = useAuthStore(useShallow(selectUserAndRole));
  const hasPrivilegedRole = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.LIBRARIAN;

  return {
    isLibrarian: hasPrivilegedRole,
    // Only show loading if role isn't privileged AND we haven't verified yet
    // This allows privileged users immediate access while non-privileged users
    // get a brief loading state to allow role refresh to complete
    isLoading: !hasPrivilegedRole && !roleVerified,
  };
}
