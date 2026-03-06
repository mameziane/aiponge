/**
 * Wellness Generate Hook
 * Mutation for POST /generate + polling for GET /status/:sessionId
 * Follows useSongGeneration.ts polling pattern with smooth progress.
 */

import { useState, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 90; // 3 minutes max

export interface WellnessFirstTrack {
  prompt: string;
  mood: string;
  genre: string;
  style: string;
}

interface GenerateRequest {
  sessionId: string;
  firstTrack: WellnessFirstTrack;
}

interface GenerateResponse {
  sessionId: string;
  requestId: string;
}

export interface PreviewTrack {
  id: string;
  title: string;
  genre?: string;
  mood?: string;
  duration?: number;
  streamUrl?: string;
  artworkUrl?: string;
  status: string;
  visibility: string;
}

interface StatusResponse {
  status: 'processing' | 'completed' | 'failed';
  phase?: string;
  percentComplete: number;
  previewTrack: PreviewTrack | null;
  errorMessage?: string;
}

export function useWellnessGenerate() {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<string | null>(null);
  const [previewTrack, setPreviewTrack] = useState<PreviewTrack | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const pollingActiveRef = useRef<string | null>(null);

  const pollForCompletion = useCallback(async (sessionId: string) => {
    if (pollingActiveRef.current) return;
    pollingActiveRef.current = sessionId;

    let attempts = 0;
    const checkStatus = async () => {
      if (pollingActiveRef.current !== sessionId) return;

      try {
        const response = await apiRequest<StatusResponse>(`/api/v1/app/wellness/status/${sessionId}`);

        if (!response) return;

        setProgress(response.percentComplete ?? 0);
        setPhase(response.phase ?? null);

        if (response.status === 'completed' && response.previewTrack) {
          setPreviewTrack(response.previewTrack);
          setProgress(100);
          setIsGenerating(false);
          pollingActiveRef.current = null;
          return;
        }

        if (response.status === 'failed') {
          setGenerateError(response.errorMessage || 'Generation failed');
          setIsGenerating(false);
          pollingActiveRef.current = null;
          return;
        }

        attempts++;
        if (attempts < MAX_POLL_ATTEMPTS) {
          setTimeout(checkStatus, POLL_INTERVAL_MS);
        } else {
          setGenerateError('Generation timed out');
          setIsGenerating(false);
          pollingActiveRef.current = null;
        }
      } catch {
        setGenerateError('Failed to check generation status');
        setIsGenerating(false);
        pollingActiveRef.current = null;
      }
    };

    checkStatus();
  }, []);

  const generateMutation = useMutation({
    mutationFn: async (request: GenerateRequest) => {
      const response = await apiRequest<GenerateResponse>('/api/v1/app/wellness/generate', {
        method: 'POST',
        data: request,
      });
      return response;
    },
    onSuccess: data => {
      if (data?.sessionId) {
        setIsGenerating(true);
        setProgress(0);
        setPhase('initializing');
        setPreviewTrack(null);
        setGenerateError(null);
        pollForCompletion(data.sessionId);
      }
    },
    onError: error => {
      setGenerateError(error instanceof Error ? error.message : 'Generation failed');
    },
  });

  const resetGeneration = useCallback(() => {
    pollingActiveRef.current = null;
    setProgress(0);
    setPhase(null);
    setPreviewTrack(null);
    setIsGenerating(false);
    setGenerateError(null);
  }, []);

  return {
    generate: generateMutation.mutate,
    generateAsync: generateMutation.mutateAsync,
    progress,
    phase,
    previewTrack,
    isGenerating,
    error: generateError,
    isPending: generateMutation.isPending,
    resetGeneration,
  };
}
