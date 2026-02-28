/**
 * Book Generator Hook
 * React hook for AI-powered book blueprint generation (Paid tier feature)
 *
 * Generates a book blueprint (structure with chapters/entries) that can be
 * converted to real Book entities. The bookTypeId parameter drives all behavior.
 * Used by both users (for personal journals) and librarians (for shared library books).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { useSubscriptionData } from '../../contexts/SubscriptionContext';
import { useIsLibrarianWithLoading } from '../admin/useAdminQuery';

export interface Source {
  author: string;
  work?: string;
}

export interface GeneratedEntry {
  prompt: string;
  type: string;
  content?: string;
  sources?: Source[];
  tags?: string[];
  themes?: string[];
}

export interface GeneratedChapter {
  title: string;
  description: string;
  order: number;
  entries: GeneratedEntry[];
}

export interface GeneratedBookBlueprint {
  title: string;
  subtitle?: string;
  description: string;
  category?: string;
  language?: string;
  chapters: GeneratedChapter[];
}

export type DepthLevel = 'brief' | 'standard' | 'deep';

export interface BookGenerationRequest {
  primaryGoal: string;
  language?: string;
  tone?: 'supportive' | 'challenging' | 'neutral';
  depthLevel?: DepthLevel;
  bookTypeId?: string;
}

export interface ChapterProgress {
  title: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface GenerationProgress {
  phase: 'outline' | 'chapters';
  totalChapters: number;
  completedChapters: number;
  bookTitle?: string;
  chapters: ChapterProgress[];
}

type RequestStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed';

interface BookGenerationState {
  requestId: string | null;
  status: RequestStatus;
  blueprint: GeneratedBookBlueprint | null;
  usedSystemPrompt: string | null;
  usedUserPrompt: string | null;
  error: string | null;
  progress: GenerationProgress | null;
}

interface UseBookGeneratorResult {
  status: RequestStatus;
  blueprint: GeneratedBookBlueprint | null;
  usedSystemPrompt: string | null;
  usedUserPrompt: string | null;
  error: string | null;
  progress: GenerationProgress | null;
  canGenerate: boolean;
  roleLoading: boolean;
  generating: boolean;
  generateBook: (request: BookGenerationRequest) => Promise<string | null>;
  regenerateBook: () => Promise<string | null>;
  reset: () => void;
}

const POLL_INTERVAL = 1000;

const MAX_POLL_TIME_BY_DEPTH: Record<DepthLevel, number> = {
  brief: 180_000,
  standard: 300_000,
  deep: 600_000,
};

export function useBookGenerator(): UseBookGeneratorResult {
  const { tierConfig } = useSubscriptionData();
  const { isLibrarian: isLibrarianOrAdmin, isLoading: roleLoading } = useIsLibrarianWithLoading();
  const [state, setState] = useState<BookGenerationState>({
    requestId: null,
    status: 'idle',
    blueprint: null,
    usedSystemPrompt: null,
    usedUserPrompt: null,
    error: null,
    progress: null,
  });

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const depthLevelRef = useRef<DepthLevel>('standard');

  const cleanup = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const pollStatus = useCallback(async (requestId: string): Promise<void> => {
    const maxPollTime = MAX_POLL_TIME_BY_DEPTH[depthLevelRef.current];
    if (Date.now() - pollStartTimeRef.current > maxPollTime) {
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: 'Generation timed out. Please try again.',
      }));
      return;
    }

    try {
      const response = await apiClient.get<{
        success: boolean;
        data?: {
          requestId: string;
          status: RequestStatus;
          blueprint?: GeneratedBookBlueprint;
          usedSystemPrompt?: string;
          usedUserPrompt?: string;
          error?: string;
          progress?: GenerationProgress;
        };
      }>(`/api/v1/app/books/generate/${requestId}`);

      const data = response?.data;

      if (!data) {
        throw new Error('Invalid response');
      }

      if (data.status === 'completed') {
        if (data.blueprint) {
          setState(prev => ({
            ...prev,
            status: 'completed',
            blueprint: data.blueprint!,
            usedSystemPrompt: data.usedSystemPrompt || null,
            usedUserPrompt: data.usedUserPrompt || null,
            error: null,
            progress: null,
          }));
        } else {
          setState(prev => ({
            ...prev,
            status: 'failed',
            error: 'Generation completed but blueprint data is missing',
          }));
        }
      } else if (data.status === 'failed') {
        setState(prev => ({
          ...prev,
          status: 'failed',
          error: data.error || 'Generation failed',
          progress: null,
        }));
      } else if (data.status === 'pending' || data.status === 'processing') {
        setState(prev => ({
          ...prev,
          status: data.status as RequestStatus,
          progress: data.progress || prev.progress,
        }));

        pollTimeoutRef.current = setTimeout(() => {
          pollStatus(requestId);
        }, POLL_INTERVAL);
      }
    } catch (err) {
      logger.error('Poll status error', err);
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: 'Failed to check generation status',
      }));
    }
  }, []);

  const generateBook = useCallback(
    async (request: BookGenerationRequest): Promise<string | null> => {
      cleanup();
      depthLevelRef.current = request.depthLevel || 'standard';

      setState(prev => ({
        ...prev,
        status: 'pending',
        blueprint: null,
        error: null,
        requestId: null,
        progress: null,
      }));

      try {
        const response = await apiClient.post<{
          success: boolean;
          data?: { requestId: string; status: string };
          error?: string;
          requiresPremium?: boolean;
        }>('/api/v1/app/books/generate', {
          primaryGoal: request.primaryGoal,
          language: request.language,
          tone: request.tone,
          depthLevel: request.depthLevel,
          bookTypeId: request.bookTypeId,
        });

        if (!response?.success) {
          setState(prev => ({
            ...prev,
            status: 'failed',
            error: response?.error || 'Failed to create generation request',
          }));
          return null;
        }

        const requestId = response.data?.requestId;

        if (!requestId) {
          throw new Error('No request ID returned');
        }

        setState(prev => ({
          ...prev,
          requestId,
          status: 'processing',
        }));

        pollStartTimeRef.current = Date.now();
        pollTimeoutRef.current = setTimeout(() => {
          pollStatus(requestId);
        }, POLL_INTERVAL);

        return requestId;
      } catch (err) {
        logger.error('Generate book blueprint error', err);
        setState(prev => ({
          ...prev,
          status: 'failed',
          error: 'Failed to generate book blueprint',
        }));
        return null;
      }
    },
    [cleanup, pollStatus]
  );

  const regenerateBook = useCallback(async (): Promise<string | null> => {
    const currentRequestId = state.requestId;

    if (!currentRequestId) {
      setState(prev => ({
        ...prev,
        error: 'No blueprint to regenerate',
      }));
      return null;
    }

    cleanup();

    setState(prev => ({
      ...prev,
      status: 'pending',
      blueprint: null,
      error: null,
      progress: null,
    }));

    try {
      const response = await apiClient.post<{
        success: boolean;
        data?: { requestId: string; status: string };
        error?: string;
      }>(`/api/v1/app/books/generate/${currentRequestId}/regenerate`);

      if (!response?.success) {
        setState(prev => ({
          ...prev,
          status: 'failed',
          error: response?.error || 'Failed to regenerate blueprint',
        }));
        return null;
      }

      const newRequestId = response.data?.requestId;

      if (!newRequestId) {
        throw new Error('No request ID returned');
      }

      setState(prev => ({
        ...prev,
        requestId: newRequestId,
        status: 'processing',
      }));

      pollStartTimeRef.current = Date.now();
      pollTimeoutRef.current = setTimeout(() => {
        pollStatus(newRequestId);
      }, POLL_INTERVAL);

      return newRequestId;
    } catch (err) {
      logger.error('Regenerate blueprint error', err);
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: 'Failed to regenerate blueprint',
      }));
      return null;
    }
  }, [state.requestId, cleanup, pollStatus]);

  const reset = useCallback(() => {
    cleanup();
    setState({
      requestId: null,
      status: 'idle',
      blueprint: null,
      usedSystemPrompt: null,
      usedUserPrompt: null,
      error: null,
      progress: null,
    });
  }, [cleanup]);

  const canGenerate = tierConfig.canCreateCustomBooks || isLibrarianOrAdmin;

  return {
    status: state.status,
    blueprint: state.blueprint,
    usedSystemPrompt: state.usedSystemPrompt,
    usedUserPrompt: state.usedUserPrompt,
    error: state.error,
    progress: state.progress,
    canGenerate,
    roleLoading,
    generating: state.status === 'pending' || state.status === 'processing',
    generateBook,
    regenerateBook,
    reset,
  };
}
