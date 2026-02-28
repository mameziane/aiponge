/**
 * Centralized React Query Wrappers
 *
 * These wrappers automatically apply friendly error handling for backend unavailability.
 * All new queries and mutations should use these instead of raw useQuery/useMutation.
 *
 * Benefits:
 * - Automatic friendly "Service temporarily unavailable" messages when backend is down
 * - Consistent error logging with correlation IDs
 * - Centralized error handling prevents raw technical errors from reaching users
 * - Built-in response normalization for API responses
 * - Configurable query configurations (standard, fresh, cache-first)
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  useQuery,
  useMutation,
  UseQueryOptions,
  UseMutationOptions,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { useToast } from '@/hooks/ui/use-toast';
import { logError, getTranslatedFriendlyMessage, serializeError } from '../../utils/errorSerialization';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/axiosApiClient';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { normalizeApiResponse, type TracksResponse } from '../../lib/apiResponseUtils';
import { STANDARD_QUERY_CONFIG, FRESH_QUERY_CONFIG, CACHE_FIRST_CONFIG } from '../../lib/queryConfig';
import type { TranslationFn } from '../../types/common.types';

/**
 * Get friendly error message for any error type with translation support
 * Returns a function that takes an error and returns the translated message
 */
export function useGetFriendlyMessage() {
  const { t } = useTranslation();

  return useCallback(
    (error: unknown): string => {
      const serialized = serializeError(error);
      return getTranslatedFriendlyMessage(serialized, t);
    },
    [t]
  );
}

/**
 * Get friendly error message for any error type with translation support
 * For use in non-hook contexts (callbacks, error handlers) where t is already available
 */
export function getFriendlyMessage(
  error: unknown,
  t: (key: string | string[], options?: Record<string, unknown>) => string
): string {
  const serialized = serializeError(error);
  return getTranslatedFriendlyMessage(serialized, t);
}

/**
 * Hook to handle query errors with friendly messages
 * Use this with the error/isError from useQuery to display friendly messages
 *
 * NOTE: TanStack Query v5 doesn't support onError for queries directly.
 * Use this hook alongside useQuery to show friendly error toasts when needed.
 *
 * @example
 * const { data, isLoading, error, isError } = useQuery({ queryKey: [...] });
 * useQueryErrorHandler(error, isError, 'Music Library');
 */
export function useQueryErrorHandler(
  error: unknown,
  isError: boolean,
  context: string,
  options?: {
    showErrorToast?: boolean;
    customErrorTitle?: string;
  }
) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const handledErrorRef = useRef<unknown>(null);

  useEffect(() => {
    if (isError && error && handledErrorRef.current !== error) {
      handledErrorRef.current = error;
      logError(error, context, 'query');

      if (options?.showErrorToast !== false) {
        const friendlyMessage = getFriendlyMessage(error, t);
        toast({
          title: options?.customErrorTitle || t('common.loadFailed', 'Failed to load'),
          description: friendlyMessage,
          variant: 'destructive',
        });
      }
    }

    if (!isError) {
      handledErrorRef.current = null;
    }
  }, [isError, error, context, options?.showErrorToast, options?.customErrorTitle, toast, t]);
}

/**
 * Wrapper for useMutation with automatic friendly error handling
 *
 * Automatically intercepts errors and shows user-friendly messages for:
 * - Backend unavailable (ECONNREFUSED, network errors)
 * - Timeouts
 * - 5xx server errors
 *
 * @example
 * const mutation = useAppMutation({
 *   mutationFn: async (data) => apiRequest('/api/v1/app/generate', { method: 'POST', body: data }),
 *   context: 'Music Generation',
 *   onSuccess: (data) => { ... },
 * });
 */
export function useAppMutation<TData = unknown, TError = unknown, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext> & {
    context?: string;
    endpoint?: string;
    showErrorToast?: boolean;
    customErrorTitle?: string;
  }
): UseMutationResult<TData, TError, TVariables, TContext> {
  const { toast } = useToast();
  const { t } = useTranslation();

  const {
    context = 'Operation',
    endpoint = 'unknown',
    showErrorToast = true,
    customErrorTitle,
    onError: userOnError,
    ...mutationOptions
  } = options;

  return useMutation({
    ...mutationOptions,
    meta: { ...mutationOptions.meta, handledByAppQuery: true, context },
    onError: (error, variables, ctx) => {
      logError(error, context, endpoint);

      if (showErrorToast) {
        const friendlyMessage = getFriendlyMessage(error, t);
        toast({
          title: customErrorTitle || t('common.operationFailed', 'Operation failed'),
          description: friendlyMessage,
          variant: 'destructive',
        });
      }

      if (userOnError) {
        (userOnError as (error: TError, variables: TVariables, context: TContext | undefined) => void)(
          error,
          variables,
          ctx
        );
      }
    },
  });
}

/**
 * Helper to wrap existing onError handlers with friendly message handling
 * Use this for gradual migration of existing hooks
 *
 * @example
 * onError: wrapErrorHandler(toast, t, 'Music Generation', (error) => {
 *   // Your existing custom logic
 *   setGenerationError(true);
 * }),
 */
export function wrapErrorHandler(
  toast: ReturnType<typeof useToast>['toast'],
  t: TranslationFn,
  context: string,
  customHandler?: (error: unknown) => void,
  options?: {
    showToast?: boolean;
    customTitle?: string;
  }
) {
  return (error: unknown) => {
    logError(error, context, 'unknown', undefined);

    if (options?.showToast !== false) {
      const friendlyMessage = getFriendlyMessage(error, t);
      toast({
        title:
          options?.customTitle ||
          t('common.operationFailed', { defaultValue: 'Operation failed' } as Record<string, unknown>),
        description: friendlyMessage,
        variant: 'destructive',
      });
    }

    if (customHandler) {
      customHandler(error);
    }
  };
}

/**
 * Query configuration presets
 */
export type QueryConfigPreset = 'standard' | 'fresh' | 'cache-first';

const QUERY_CONFIG_MAP = {
  standard: STANDARD_QUERY_CONFIG,
  fresh: FRESH_QUERY_CONFIG,
  'cache-first': CACHE_FIRST_CONFIG,
} as const;

/**
 * Request configuration for API calls
 */
export interface ApiRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Options for useApiQuery hook
 */
export interface UseApiQueryOptions<TData, TTransformed = TData, TError = Error> {
  endpoint: string;
  queryKey?: readonly unknown[];
  enabled?: boolean;
  configPreset?: QueryConfigPreset;
  context?: string;
  showErrorToast?: boolean;
  customErrorTitle?: string;
  normalize?: boolean;
  select?: (data: TData) => TTransformed;
  silentError?: boolean;
  fallbackData?: TData;
  queryOptions?: Omit<UseQueryOptions<TData, TError, TTransformed>, 'queryKey' | 'queryFn' | 'select'>;
  requestConfig?: ApiRequestConfig;
}

/**
 * Extended return type for useApiQuery - preserves full TanStack Query result
 */
export type UseApiQueryResult<TData, TError = Error> = UseQueryResult<TData, TError> & {
  usedFallback: boolean;
};

/**
 * Centralized API query hook with automatic error handling
 *
 * Replaces the common pattern of:
 * ```
 * const { data, isLoading } = useQuery({
 *   queryKey: [...],
 *   queryFn: async () => {
 *     try {
 *       const result = await apiRequest(endpoint);
 *       return normalizeApiResponse(result);
 *     } catch (err) {
 *       createQueryErrorHandler(toast, context, endpoint, title, t)(err);
 *       throw err;
 *     }
 *   },
 *   ...STANDARD_QUERY_CONFIG,
 * });
 * ```
 *
 * With:
 * ```
 * const { data, isLoading } = useApiQuery<MyType>({
 *   endpoint: '/api/v1/app/library/private',
 *   context: 'My Music',
 * });
 * ```
 *
 * @example Basic usage
 * const { data, isLoading, isError } = useApiQuery<TracksResponse>({
 *   endpoint: '/api/v1/app/library/private',
 *   context: 'My Music Library',
 * });
 *
 * @example With custom query key (for dynamic endpoints)
 * const { data } = useApiQuery<PlaylistTracks>({
 *   endpoint: `/api/v1/app/playlists/${playlistId}/tracks`,
 *   queryKey: ['/api/v1/app/playlists', playlistId, 'tracks'],
 *   context: 'Playlist Tracks',
 *   enabled: !!playlistId,
 * });
 *
 * @example With data transformation
 * const { data: tracks } = useApiQuery<TracksResponse, Track[]>({
 *   endpoint: '/api/v1/app/library/private',
 *   context: 'My Music',
 *   select: (response) => response.data?.tracks || [],
 * });
 *
 * @example With fresh config (for frequently changing data)
 * const { data } = useApiQuery<ExploreData>({
 *   endpoint: '/api/v1/app/explore',
 *   context: 'Explore Feed',
 *   configPreset: 'fresh',
 * });
 *
 * @example Silent errors (for background operations)
 * const { data } = useApiQuery<AnalyticsData>({
 *   endpoint: '/api/v1/app/analytics',
 *   context: 'Background Analytics',
 *   silentError: true,
 * });
 */
export function useApiQuery<TData, TTransformed = TData, TError = Error>(
  options: UseApiQueryOptions<TData, TTransformed, TError>
): UseApiQueryResult<TTransformed, TError> {
  const { toast } = useToast();
  const { t } = useTranslation();
  const handledErrorRef = useRef<unknown>(null);
  const usedFallbackRef = useRef(false);

  const {
    endpoint,
    queryKey,
    enabled = true,
    configPreset = 'standard',
    context = 'API Query',
    showErrorToast = true,
    customErrorTitle,
    normalize = false,
    select,
    silentError = false,
    fallbackData,
    queryOptions,
    requestConfig,
  } = options;

  const queryConfig = QUERY_CONFIG_MAP[configPreset];

  const buildEndpoint = useCallback(() => {
    if (!requestConfig?.params) return endpoint;
    const params = new URLSearchParams();
    Object.entries(requestConfig.params).forEach(([key, value]) => {
      if (value !== undefined) {
        params.append(key, String(value));
      }
    });
    const paramString = params.toString();
    return paramString ? `${endpoint}?${paramString}` : endpoint;
  }, [endpoint, requestConfig?.params]);

  const effectiveQueryKey = useMemo(
    () => queryKey ?? [endpoint, requestConfig?.params],
    [queryKey, endpoint, requestConfig?.params]
  );

  // Combine user-provided enabled with endpoint validity check
  // Query is disabled if endpoint is empty (prevents requests with undefined IDs)
  const isEndpointValid = Boolean(endpoint && endpoint.length > 0);
  const effectiveEnabled = enabled && isEndpointValid;

  const queryResult = useQuery<TData, TError, TTransformed>({
    queryKey: effectiveQueryKey,
    queryFn: async (): Promise<TData> => {
      usedFallbackRef.current = false;
      const fullEndpoint = buildEndpoint();

      // Safety guard: prevent API calls with empty endpoints
      if (!fullEndpoint) {
        throw new Error(`Invalid endpoint: ${fullEndpoint}`);
      }

      try {
        const requestOptions: Record<string, unknown> = {};
        if (requestConfig?.method) {
          requestOptions.method = requestConfig.method;
        }
        if (requestConfig?.body) {
          requestOptions.body = requestConfig.body;
        }
        if (requestConfig?.headers) {
          requestOptions.headers = requestConfig.headers;
        }

        const result = (await apiRequest(
          fullEndpoint,
          Object.keys(requestOptions).length > 0 ? requestOptions : undefined
        )) as TData;

        if (normalize && result && typeof result === 'object') {
          const resultObj = result as Record<string, unknown>;
          const hasTracksField =
            'tracks' in result ||
            ('data' in result &&
              resultObj.data &&
              typeof resultObj.data === 'object' &&
              'tracks' in (resultObj.data as object));
          if (hasTracksField) {
            try {
              return normalizeApiResponse(result as unknown as ServiceResponse<TracksResponse>) as TData;
            } catch {
              return result;
            }
          }
        }
        return result;
      } catch (err) {
        if (fallbackData !== undefined) {
          logError(err, context, fullEndpoint);
          usedFallbackRef.current = true;
          return fallbackData;
        }
        throw err;
      }
    },
    enabled: effectiveEnabled,
    select,
    meta: { ...queryOptions?.meta, handledByAppQuery: true, context },
    ...queryConfig,
    ...queryOptions,
  });

  const { error, isError } = queryResult;

  useEffect(() => {
    if (isError && error && !silentError && handledErrorRef.current !== error) {
      handledErrorRef.current = error;
      logError(error, context, endpoint);

      if (showErrorToast) {
        // as unknown: error is typed as Error but getFriendlyMessage accepts unknown for flexibility
        const friendlyMessage = getFriendlyMessage(error as unknown, t);
        toast({
          title: customErrorTitle || t('common.loadFailed', 'Failed to load'),
          description: friendlyMessage,
          variant: 'destructive',
        });
      }
    }

    if (!isError) {
      handledErrorRef.current = null;
    }
  }, [isError, error, context, endpoint, showErrorToast, customErrorTitle, silentError, toast, t]);

  return {
    ...queryResult,
    usedFallback: usedFallbackRef.current,
  };
}

/**
 * Hook for building dynamic query keys with proper cache invalidation
 *
 * @example
 * const queryKey = useQueryKey('/api/v1/app/playlists', playlistId, 'tracks');
 * // Returns: ['/api/v1/app/playlists', 'abc123', 'tracks']
 */
export function useQueryKey(...segments: (string | number | null | undefined)[]): readonly unknown[] {
  const key = JSON.stringify(segments);
  return useMemo(() => segments.filter((s): s is string | number => s != null), [key]);
}
