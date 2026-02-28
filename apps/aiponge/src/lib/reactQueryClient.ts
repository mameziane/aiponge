/**
 * React Query Client Instance
 * SINGLE SHARED INSTANCE for both React hooks and non-React code (e.g., auth store)
 *
 * CRITICAL: This must be the ONLY QueryClient instance in the entire app.
 * Both QueryClientProvider and direct invalidation calls use this same instance.
 *
 * Global error handlers catch ALL query/mutation errors and display
 * user-friendly messages. Queries using useApiQuery/useAppMutation set
 * meta.handledByAppQuery=true to skip the global handler (they handle
 * errors themselves).
 *
 * Network Resilience:
 * - Queries: smart retry with exponential backoff (1s → 2s → 4s), skip retry on 4xx
 * - Mutations: retry is OFF by default (to prevent double-writes on non-idempotent ops);
 *   opt-in per mutation via meta: { retryOnNetworkError: true }
 * - Online manager: wired to NetInfo (uses isInternetReachable when available) so queries
 *   auto-pause offline, auto-refetch on reconnect
 * - refetchOnReconnect: stale queries automatically refresh when connection is restored
 */

import { QueryClient, QueryCache, MutationCache, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { QUERY_STALE_TIME } from '../constants/appConfig';
import { handleGlobalQueryError, handleGlobalMutationError } from './globalErrorHandler';

onlineManager.setEventListener(setOnline =>
  NetInfo.addEventListener(state => {
    const reachable = state.isInternetReachable;
    setOnline(reachable != null ? reachable : !!state.isConnected);
  })
);

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      handleGlobalQueryError(error, query.meta as Record<string, unknown> | undefined);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      handleGlobalMutationError(error, mutation.meta as Record<string, unknown> | undefined);
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403 || status === 404 || status === 409 || status === 422) {
          return false;
        }
        if (status === 503 || status === 502) {
          return failureCount < 3;
        }
        return failureCount < 3;
      },
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
      staleTime: QUERY_STALE_TIME.default,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
    },
  },
});
