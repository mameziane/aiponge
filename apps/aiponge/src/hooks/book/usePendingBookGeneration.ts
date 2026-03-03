/**
 * Resumes polling for a book generation started during onboarding.
 * Reads the requestId from AsyncStorage and polls the generation status endpoint.
 * Clears AsyncStorage when settled (completed/failed).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import {
  getPendingBookGeneration,
  clearPendingBookGeneration,
  type PendingBookGeneration,
} from '../../utils/pendingBookGeneration';
import type { GeneratedBookBlueprint, GenerationProgress } from './useBookGenerator';

type PendingStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed';

export interface UsePendingBookGenerationResult {
  isPending: boolean;
  progress: GenerationProgress | null;
  bookTypeId: string | null;
  status: PendingStatus;
  blueprint: GeneratedBookBlueprint | null;
  error: string | null;
  clear: () => void;
}

const POLL_INTERVAL = 1500;
const MAX_POLL_TIME = 180_000; // 3 min (brief depth)

export function usePendingBookGeneration(): UsePendingBookGenerationResult {
  const [status, setStatus] = useState<PendingStatus>('idle');
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [blueprint, setBlueprint] = useState<GeneratedBookBlueprint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookTypeId, setBookTypeId] = useState<string | null>(null);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    cleanup();
    clearPendingBookGeneration();
    setStatus('idle');
    setProgress(null);
    setBlueprint(null);
    setError(null);
    setBookTypeId(null);
  }, [cleanup]);

  const pollStatus = useCallback(async (requestId: string) => {
    if (!mountedRef.current) return;

    if (Date.now() - pollStartRef.current > MAX_POLL_TIME) {
      setStatus('failed');
      setError('Generation timed out');
      await clearPendingBookGeneration();
      return;
    }

    try {
      const response = await apiClient.get<{
        success: boolean;
        data?: {
          status: PendingStatus;
          blueprint?: GeneratedBookBlueprint;
          error?: string;
          progress?: GenerationProgress;
        };
      }>(`/api/v1/app/books/generate/${requestId}`);

      if (!mountedRef.current) return;

      const data = response?.data;
      if (!data) {
        pollTimeoutRef.current = setTimeout(() => pollStatus(requestId), POLL_INTERVAL);
        return;
      }

      if (data.status === 'completed' && data.blueprint) {
        setStatus('completed');
        setBlueprint(data.blueprint);
        setProgress(null);
        await clearPendingBookGeneration();
      } else if (data.status === 'failed') {
        setStatus('failed');
        setError(data.error || 'Generation failed');
        setProgress(null);
        await clearPendingBookGeneration();
      } else {
        setStatus(data.status);
        if (data.progress) setProgress(data.progress);
        pollTimeoutRef.current = setTimeout(() => pollStatus(requestId), POLL_INTERVAL);
      }
    } catch (err) {
      logger.error('Pending book generation poll error', err);
      if (mountedRef.current) {
        pollTimeoutRef.current = setTimeout(() => pollStatus(requestId), POLL_INTERVAL * 2);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      const pending = await getPendingBookGeneration();
      if (!pending || !mountedRef.current) return;

      setBookTypeId(pending.bookTypeId);
      setStatus('processing');
      pollStartRef.current = Date.now();
      pollStatus(pending.requestId);
    }

    init();

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [pollStatus, cleanup]);

  const isPending = status === 'pending' || status === 'processing';

  return { isPending, progress, bookTypeId, status, blueprint, error, clear };
}
