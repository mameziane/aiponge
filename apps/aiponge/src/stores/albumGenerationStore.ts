/**
 * Album Generation Store
 * Zustand store for tracking background album generation progress
 * Supports multiple simultaneous album generations
 */

import { CONTENT_VISIBILITY, isContentPubliclyAccessible, type ContentVisibility } from '@aiponge/shared-contracts';
import { logger } from '../lib/logger';
import { queryClient } from '../lib/reactQueryClient';
import { invalidateOnEvent } from '../lib/cacheManager';
import { forceRefreshExplore, forceRefreshPublicAlbums } from '../auth/cacheUtils';
import { createGenerationStore, type BaseGenerationProgress, type GenerationStore } from './createGenerationStore';

export interface AlbumGenerationProgress extends BaseGenerationProgress {
  totalTracks: number;
  currentTrack: number;
  successfulTracks: number;
  failedTracks: number;
  targetLanguages: string[];
  chapterTitle?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  albumId?: string | null;
  albumTitle?: string | null;
  visibility?: ContentVisibility;
}

interface StartGenerationOptions {
  albumId?: string;
  albumTitle?: string;
  visibility?: ContentVisibility;
}

const { store } = createGenerationStore<AlbumGenerationProgress>({
  name: 'AlbumGeneration',
  pollInterval: 10000,
  apiEndpoint: '/api/v1/app/music/album-requests',
  activeEndpoint: '/api/v1/app/music/album-requests/active/all',
  cacheEventType: 'ALBUM_GENERATION_COMPLETED',

  isActive: progress => progress.status === 'queued' || progress.status === 'processing',

  createInitialProgress: (requestId: string, options?: StartGenerationOptions): AlbumGenerationProgress => {
    logger.info('[AlbumGeneration] Starting polling for album', {
      albumRequestId: requestId,
      albumId: options?.albumId,
      albumTitle: options?.albumTitle,
    });
    return {
      id: requestId,
      userId: '',
      status: 'queued',
      phase: 'queued',
      totalTracks: 0,
      currentTrack: 0,
      successfulTracks: 0,
      failedTracks: 0,
      percentComplete: 0,
      targetLanguages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      albumId: options?.albumId || null,
      albumTitle: options?.albumTitle || null,
      visibility: options?.visibility,
    };
  },

  mergeProgress: (existing, update) => {
    const effectiveVisibility = isContentPubliclyAccessible(existing?.visibility || '')
      ? CONTENT_VISIBILITY.SHARED
      : (update.visibility ?? existing?.visibility);

    return {
      ...update,
      targetLanguages: update.targetLanguages ?? existing?.targetLanguages ?? [],
      albumId: update.albumId ?? existing?.albumId ?? null,
      albumTitle: update.albumTitle ?? existing?.albumTitle ?? null,
      visibility: effectiveVisibility,
    };
  },

  onCompleted: (_requestId, progress) => {
    logger.info('[AlbumGeneration] Generation finished', {
      id: progress.id,
      status: progress.status,
      successfulTracks: progress.successfulTracks,
      failedTracks: progress.failedTracks,
    });
    invalidateOnEvent(queryClient, { type: 'ALBUM_GENERATION_COMPLETED' });
    invalidateOnEvent(queryClient, { type: 'CREDITS_CHANGED' });

    // Bypass API gateway cache with direct fetches — invalidateOnEvent alone may
    // return stale gateway-cached data that doesn't include the newly created album.
    forceRefreshExplore();
    forceRefreshPublicAlbums();
    logger.debug('[AlbumGeneration] Invalidated album + credits caches and refreshed explore + albums');

    // Follow-up invalidation: gateway cache may still be warm after the first pass.
    setTimeout(() => {
      logger.debug('[AlbumGeneration] Delayed follow-up cache invalidation');
      invalidateOnEvent(queryClient, { type: 'ALBUM_GENERATION_COMPLETED' });
      forceRefreshPublicAlbums();
    }, 3000);
  },
});

export const useAlbumGenerationStore = store;

export const isGenerationActive = (status?: string): boolean => {
  return status === 'queued' || status === 'processing';
};

export const selectAlbumActiveGenerations = (state: GenerationStore<AlbumGenerationProgress>) =>
  state.activeGenerations;
export const selectAlbumCheckActiveGenerations = (state: GenerationStore<AlbumGenerationProgress>) =>
  state.checkActiveGenerations;
export const selectAlbumIsPolling = (state: GenerationStore<AlbumGenerationProgress>) => state.isPolling;
export const selectAlbumIsPendingGeneration = (state: GenerationStore<AlbumGenerationProgress>) =>
  state.isPendingGeneration;
