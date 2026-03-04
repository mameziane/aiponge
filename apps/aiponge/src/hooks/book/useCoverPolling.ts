/**
 * Cover Polling Hook
 * Polls for book cover illustrations that are generated asynchronously.
 * When books without covers are detected, polls at regular intervals
 * until covers appear or the max poll count is reached.
 */

import { useEffect, useRef } from 'react';

interface UseCoverPollingOptions {
  /** Array of books to check for missing covers */
  books: Array<{ coverIllustrationUrl?: string }>;
  /** Function to refetch the book list */
  refetch: () => void;
  /** Maximum number of poll attempts (default: 6) */
  maxPolls?: number;
  /** Interval between polls in milliseconds (default: 5000) */
  intervalMs?: number;
}

export function useCoverPolling({ books, refetch, maxPolls = 6, intervalMs = 5000 }: UseCoverPollingOptions) {
  const coverPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverPollCountRef = useRef(0);

  useEffect(() => {
    if (coverPollRef.current) {
      clearTimeout(coverPollRef.current);
      coverPollRef.current = null;
    }

    const hasBooksWithoutCovers = books.some(book => !book.coverIllustrationUrl);

    if (hasBooksWithoutCovers && coverPollCountRef.current < maxPolls) {
      coverPollRef.current = setTimeout(() => {
        coverPollCountRef.current += 1;
        refetch();
      }, intervalMs);
    } else if (!hasBooksWithoutCovers) {
      // Reset counter when all covers are loaded
      coverPollCountRef.current = 0;
    }

    return () => {
      if (coverPollRef.current) {
        clearTimeout(coverPollRef.current);
        coverPollRef.current = null;
      }
    };
  }, [books, refetch, maxPolls, intervalMs]);
}
