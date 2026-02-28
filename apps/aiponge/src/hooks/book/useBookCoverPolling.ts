import { useEffect, useRef } from 'react';

interface UseBookCoverPollingOptions {
  hasBookData: boolean;
  currentCoverUrl: string | null | undefined;
  refetch: () => void;
  maxAttempts?: number;
  intervalMs?: number;
}

export function useBookCoverPolling({
  hasBookData,
  currentCoverUrl,
  refetch,
  maxAttempts = 8,
  intervalMs = 5000,
}: UseBookCoverPollingOptions) {
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount = useRef(0);

  useEffect(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }

    if (!hasBookData) return;

    if (currentCoverUrl) {
      pollCount.current = 0;
      return;
    }

    if (pollCount.current < maxAttempts) {
      pollRef.current = setTimeout(() => {
        pollCount.current += 1;
        refetch();
      }, intervalMs);
    }

    return () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasBookData, currentCoverUrl, refetch, maxAttempts, intervalMs]);
}
