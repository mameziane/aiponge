/**
 * Track Generation Store
 * Zustand store for tracking background single track generation progress
 * Mirrors albumGenerationStore pattern but simpler for single tracks
 */

import { logger } from '../lib/logger';
import { queryClient } from '../lib/reactQueryClient';
import { forceRefreshExplore } from '../auth/cacheUtils';
import { invalidateOnEvent } from '../lib/cacheManager';
import { createGenerationStore, type BaseGenerationProgress, type GenerationStore } from './createGenerationStore';

export interface TrackCompletionEvent {
  id: string;
  status: 'completed' | 'failed';
  trackTitle?: string | null;
  trackId?: string | null;
  artworkUrl?: string | null;
  errorMessage?: string | null;
  wasPlayingPreview?: boolean;
  previewPosition?: number;
}

type TrackGenerationEventListener = (event: TrackCompletionEvent) => void;

class TrackGenerationEventEmitter {
  private listeners: TrackGenerationEventListener[] = [];

  subscribe(listener: TrackGenerationEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(type: 'complete', event: TrackCompletionEvent): void {
    this.listeners.forEach(listener => listener(event));
  }
}

export const trackGenerationEvents = new TrackGenerationEventEmitter();

interface StreamingPreviewState {
  requestId: string | null;
  streamingUrl: string | null;
  currentPosition: number;
}

const streamingPreviewState: StreamingPreviewState = {
  requestId: null,
  streamingUrl: null,
  currentPosition: 0,
};

export function setStreamingPreviewPlaying(requestId: string, streamingUrl: string): void {
  streamingPreviewState.requestId = requestId;
  streamingPreviewState.streamingUrl = streamingUrl;
  streamingPreviewState.currentPosition = 0;
  logger.debug('Streaming preview started', { requestId });
}

export function updatePreviewPosition(requestId: string, position: number): void {
  if (streamingPreviewState.requestId === requestId) {
    streamingPreviewState.currentPosition = position;
  }
}

export function clearStreamingPreviewPlaying(requestId: string): void {
  if (streamingPreviewState.requestId === requestId) {
    streamingPreviewState.requestId = null;
    streamingPreviewState.streamingUrl = null;
    streamingPreviewState.currentPosition = 0;
    logger.debug('Streaming preview cleared', { requestId });
  }
}

export function isStreamingPreviewPlaying(requestId: string): boolean {
  return streamingPreviewState.requestId === requestId;
}

export function getPreviewPosition(): number {
  return streamingPreviewState.currentPosition;
}

export interface TrackGenerationProgress extends BaseGenerationProgress {
  trackTitle?: string | null;
  artworkUrl?: string | null;
  trackId?: string | null;
  lyrics?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  entryContent?: string;
  streamingUrl?: string | null;
}

interface StartTrackGenerationOptions {
  entryContent?: string;
  artworkUrl?: string;
}

const { store, completedRequestIds } = createGenerationStore<TrackGenerationProgress>({
  name: 'TrackGeneration',
  pollInterval: 5000,
  apiEndpoint: '/api/v1/app/music/song-requests',
  activeEndpoint: '/api/v1/app/music/song-requests/active',
  cacheEventType: 'TRACK_GENERATION_COMPLETED',

  isActive: progress => progress.status === 'queued' || progress.status === 'processing',

  createInitialProgress: (requestId: string, options?: StartTrackGenerationOptions): TrackGenerationProgress => ({
    id: requestId,
    userId: '',
    status: 'queued',
    phase: 'queued',
    percentComplete: 0,
    entryContent: options?.entryContent,
    artworkUrl: options?.artworkUrl,
  }),

  mergeProgress: (existing, update) => ({
    ...update,
    entryContent: existing?.entryContent,
    artworkUrl: existing?.artworkUrl,
    streamingUrl: update.streamingUrl || existing?.streamingUrl,
  }),

  onCompleted: (requestId, progress, get, set, completedIds) => {
    logger.info('[TrackGeneration] Generation finished', {
      id: progress.id,
      status: progress.status,
      trackId: progress.trackId,
    });

    set(state => ({
      activeGenerations: {
        ...state.activeGenerations,
        [requestId]: {
          ...state.activeGenerations[requestId],
          status: 'processing' as const,
          phase: 'finalizing',
          percentComplete: 100,
        },
      },
    }));

    const wasPlayingPreview = isStreamingPreviewPlaying(progress.id);
    const previewPosition = wasPlayingPreview ? getPreviewPosition() : 0;
    logger.info('Track generation completed, checking preview state', {
      requestId: progress.id,
      trackId: progress.trackId,
      wasPlayingPreview,
      previewPosition,
      streamingPreviewState: streamingPreviewState.requestId,
    });

    if (wasPlayingPreview) {
      clearStreamingPreviewPlaying(progress.id);
    }

    const emitCompletionEvent = () => {
      trackGenerationEvents.emit('complete', {
        id: progress.id,
        status: progress.status as 'completed' | 'failed',
        trackTitle: progress.trackTitle,
        trackId: progress.trackId,
        artworkUrl: progress.artworkUrl,
        errorMessage: progress.errorMessage,
        wasPlayingPreview,
        previewPosition,
      });
    };

    const generationId = progress.id;

    Promise.all([
      forceRefreshExplore(),
      (async () => invalidateOnEvent(queryClient, { type: 'TRACK_GENERATION_COMPLETED' }))(),
    ])
      .then(() => {
        if (completedIds.has(generationId)) {
          logger.debug('[TrackGeneration] Generation already finalized, skipping duplicate completion', {
            id: generationId,
          });
          return;
        }
        completedIds.set(generationId, Date.now());

        logger.debug('[TrackGeneration] All caches invalidated (with gateway bypass), removing draft');
        set(state => {
          if (!state.activeGenerations[generationId]) return state;
          const newGens = { ...state.activeGenerations };
          delete newGens[generationId];
          return { activeGenerations: newGens };
        });

        emitCompletionEvent();
      })
      .catch(error => {
        logger.warn('[TrackGeneration] Cache refresh failed, emitting completion anyway', { error });

        if (completedIds.has(generationId)) return;
        completedIds.set(generationId, Date.now());

        set(state => {
          if (!state.activeGenerations[generationId]) return state;
          const newGens = { ...state.activeGenerations };
          delete newGens[generationId];
          return { activeGenerations: newGens };
        });
        emitCompletionEvent();
      });
  },

  onClearGeneration: (id, completedIds) => {
    if (id) {
      completedIds.delete(id);
    } else {
      completedIds.clear();
    }
  },
});

export const useTrackGenerationStore = store;

export function isRequestCompleted(requestId: string): boolean {
  const timestamp = completedRequestIds.get(requestId);
  if (!timestamp) return false;
  const COMPLETED_ID_TTL_MS = 5 * 60 * 1000;
  if (Date.now() - timestamp > COMPLETED_ID_TTL_MS) {
    completedRequestIds.delete(requestId);
    return false;
  }
  return true;
}

export const isTrackGenerationActive = (status?: string): boolean => {
  return status === 'queued' || status === 'processing';
};

export const selectTrackActiveGenerations = (state: GenerationStore<TrackGenerationProgress>) =>
  state.activeGenerations;
export const selectTrackCheckActiveGenerations = (state: GenerationStore<TrackGenerationProgress>) =>
  state.checkActiveGenerations;
export const selectTrackIsPolling = (state: GenerationStore<TrackGenerationProgress>) => state.isPolling;
export const selectTrackIsPendingGeneration = (state: GenerationStore<TrackGenerationProgress>) =>
  state.isPendingGeneration;
export const selectTrackStartGeneration = (state: GenerationStore<TrackGenerationProgress>) => state.startGeneration;
export const selectTrackSetPendingGeneration = (state: GenerationStore<TrackGenerationProgress>) =>
  state.setPendingGeneration;
