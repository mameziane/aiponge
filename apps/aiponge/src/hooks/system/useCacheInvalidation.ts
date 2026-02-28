/**
 * Cache Invalidation Hook
 *
 * Provides easy access to the centralized cache invalidation system.
 * Use this hook in components/other hooks to trigger cache invalidations.
 *
 * Usage:
 *   const { invalidate } = useCacheInvalidation();
 *
 *   // After a mutation succeeds:
 *   invalidate({ type: 'BOOK_DELETED', bookId: id });
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { invalidateOnEvent, invalidateOnEvents, CacheEvent } from '../../lib/cacheManager';

export function useCacheInvalidation() {
  const queryClient = useQueryClient();

  const invalidate = useCallback((event: CacheEvent) => invalidateOnEvent(queryClient, event), [queryClient]);

  const invalidateMany = useCallback((events: CacheEvent[]) => invalidateOnEvents(queryClient, events), [queryClient]);

  return { invalidate, invalidateMany };
}

export type { CacheEvent };
