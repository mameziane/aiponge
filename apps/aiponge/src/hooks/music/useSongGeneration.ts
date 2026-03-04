/**
 * Song Generation Hook
 * Handles the entire music generation lifecycle:
 * - Mutation to start generation (builds request with AI-analyzed preferences)
 * - Smooth time-based progress animation (easeOutQuad)
 * - Polling for completion status (lyrics streaming, track completion)
 * - Quota error detection and upgrade modal
 * - Cache invalidation on completion
 */

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';
import { useToast } from '../ui/use-toast';
import { useAuthState } from '../auth/useAuthState';
import { logger } from '../../lib/logger';
import { useTranslation } from '../../i18n';
import { useAppReview } from '../system/useAppReview';
import { getFriendlyMessage } from '../system/useAppQuery';
import { logError } from '../../utils/errorSerialization';
import { CONFIG } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { useIsLibrarian } from '../admin/useAdminQuery';
import { useTrackGenerationStore } from '../../stores';
import { invalidateOnEvent } from '../../lib/cacheManager';
import type { MusicPreferencesAnalysis } from './musicPreferencesAnalyzer';

// ─── Constants ──────────────────────────────────────────────────────

// Smooth progress interpolation - total duration and easing curve
const SMOOTH_PROGRESS = {
  START: 2,
  TARGET: 95,
  DURATION_MS: 120000, // 2 minutes total expected generation time
  UPDATE_INTERVAL_MS: 300,
} as const;

const PROGRESS = {
  INITIAL: 2,
  COMPLETE: 100,
  MAX_POLLING: 98,
  LYRICS_READY: 35,
} as const;

const POLLING = {
  MAX_ATTEMPTS: 60,
  COMPLETION_DELAY_MS: 1000,
} as const;

const QUOTA_ERROR_CODES = [
  'USAGE_LIMIT_EXCEEDED',
  'SUBSCRIPTION_LIMIT_EXCEEDED',
  'QUOTA_EXCEEDED',
  'INSUFFICIENT_CREDITS',
  'PAYMENT_REQUIRED',
];

// ─── Types ──────────────────────────────────────────────────────────

interface SongGenerationResponse {
  success: boolean;
  audioUrl?: string;
  error?: string;
}

type MusicGenerationApiResponse = ServiceResponse<{
  requestId?: string;
  songRequestId?: string;
  audioUrl?: string;
  queuePosition?: number;
  estimatedWaitSeconds?: number;
}>;

type SongRequestProgressResponse = ServiceResponse<{
  id: string;
  userId: string;
  status: string;
  phase: string;
  percentComplete: number;
  trackTitle?: string | null;
  artworkUrl?: string | null;
  trackId?: string | null;
  lyrics?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}>;

type PrivateTracksResponse = ServiceResponse<{
  tracks?: Array<{
    id: string;
    entryId?: string;
    audioUrl?: string;
    artworkUrl?: string | null;
    title?: string | null;
    displayName?: string | null;
  }>;
}>;

interface MusicGenerationRequest {
  userId: string | undefined;
  entryId?: string;
  entryContent?: string;
  chapterId?: string;
  lyricsId?: string;
  musicType: string;
  prompt?: string;
  quality: string;
  priority: string;
  negativeTags?: string;
  styleWeight?: number;
  style?: string;
  genre?: string;
  mood?: string;
  culturalStyle?: string;
  instrumentType?: string;
  vocalGender?: 'f' | 'm';
  language?: string;
  targetLanguages?: string[];
  isBilingual?: boolean;
  artworkUrl?: string;
  pictureContext?: string;
  sourceEntryId?: string;
  sourceText?: string;
  sourceReference?: string;
  sourceBookTitle?: string;
}

// ─── Utility ────────────────────────────────────────────────────────

function extractQuotaError(error: unknown): {
  isQuotaError: boolean;
  limit: number;
  resetDate: string | null;
} {
  const fallback = { isQuotaError: false, limit: 0, resetDate: null };
  if (!error || typeof error !== 'object') return fallback;

  const err = error as {
    response?: { status?: number; data?: Record<string, unknown> };
    data?: Record<string, unknown>;
    code?: string;
    limit?: number;
    resetAt?: string;
    usage?: { limit?: number };
  };

  const rawData = (err.response?.data || err.data || {}) as Record<string, unknown>;
  const structuredError = (rawData.error || {}) as Record<string, unknown>;
  const details = (structuredError.details || {}) as Record<string, unknown>;

  const errorCode = (structuredError.code as string) || (rawData.code as string) || err.code;
  const httpStatus = err.response?.status;

  // Primary signal: HTTP 402 means quota/payment issue
  // Fallback: check error codes for backward compatibility
  const isQuotaError = httpStatus === 402 || (typeof errorCode === 'string' && QUOTA_ERROR_CODES.includes(errorCode));

  if (!isQuotaError) return fallback;

  const subscription = (details.subscription || {}) as { usage?: { limit?: number }; resetAt?: string };
  const subscriptionUsage = subscription.usage || (rawData.usage as { limit?: number }) || err.usage || {};

  const limit = subscriptionUsage.limit || (rawData.limit as number) || err.limit || 0;

  const resetAt = subscription.resetAt || (rawData.resetAt as string) || err.resetAt;
  const resetDate = resetAt ? new Date(resetAt).toLocaleDateString() : null;

  return { isQuotaError: true, limit, resetDate };
}

// ─── Hook Parameters ────────────────────────────────────────────────

export interface UseSongGenerationParams {
  /** Current entry content */
  selectedEntryContent: string;
  /** Current entry ID */
  selectedEntryId: string | null;
  /** Current entry artwork URL */
  selectedEntryArtworkUrl: string | null;
  /** Current entry chapter ID */
  selectedEntryChapterId: string | null;
  /** AI-analyzed preferences from profile */
  preferencesAnalysis: MusicPreferencesAnalysis | null;
  /** Current lyrics ID to reuse if available */
  generatedLyricsId: string | null;
  /** Setter for generated lyrics (from useLyricsCache) */
  setGeneratedLyrics: (lyrics: string) => void;
  /** Setter for generated lyrics ID */
  setGeneratedLyricsId: (id: string | null) => void;
  /** Setter for generated song title */
  setGeneratedSongTitle: (title: string | null) => void;
  /** Setter for last generated track ID (from useEntryTracks) */
  setLastGeneratedTrackId: (id: string | null) => void;
  /** Invalidate entries cache after deletion */
  invalidateEntries: () => void;
  /** Shared ref: active generation request ID (written here, read by useLyricsCache) */
  activeRequestIdRef: React.MutableRefObject<string | null>;
  /** Shared ref: active generation entry ID (written here, read by useLyricsCache) */
  activeEntryIdRef: React.MutableRefObject<string | null>;
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useSongGeneration({
  selectedEntryContent,
  selectedEntryId,
  selectedEntryArtworkUrl,
  selectedEntryChapterId,
  preferencesAnalysis,
  generatedLyricsId,
  setGeneratedLyrics,
  setGeneratedLyricsId,
  setGeneratedSongTitle,
  setLastGeneratedTrackId,
  activeRequestIdRef,
  activeEntryIdRef,
}: UseSongGenerationParams) {
  const [songGenerationProgress, setSongGenerationProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const musicGenStartTimeRef = React.useRef<number | null>(null);
  const smoothProgressIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const cacheInvalidationTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingActiveRef = React.useRef<string | null>(null); // tracks active polling ID to prevent duplicates
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [estimatedWaitSeconds, setEstimatedWaitSeconds] = useState<number | null>(null);
  const [usageLimitModal, setUsageLimitModal] = useState<{
    visible: boolean;
    limit?: number;
    resetDate?: string;
  }>({ visible: false });

  // isGenerating is derived from activeRequestIdRef for reliable lifecycle tracking
  const [isActiveGeneration, setIsActiveGeneration] = useState(false);

  const isLibrarian = useIsLibrarian();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { userId } = useAuthState();
  const { maybeRequestReviewAfterPositiveAction } = useAppReview();

  // Store onSuccess callback ref for navigation after successful generation start
  const onGenerationStartRef = React.useRef<(() => void) | null>(null);

  // ─── Smooth Progress Animation ──────────────────────────────────

  React.useEffect(() => {
    if (isActiveGeneration && musicGenStartTimeRef.current) {
      if (smoothProgressIntervalRef.current) {
        clearInterval(smoothProgressIntervalRef.current);
        smoothProgressIntervalRef.current = null;
      }

      const startTime = musicGenStartTimeRef.current;

      const calculateProgress = () => {
        const elapsed = Date.now() - startTime;
        const progressRange = SMOOTH_PROGRESS.TARGET - SMOOTH_PROGRESS.START;
        const tVal = Math.min(elapsed / SMOOTH_PROGRESS.DURATION_MS, 1);
        const easedT = tVal * (2 - tVal); // easeOutQuad
        return Math.round(SMOOTH_PROGRESS.START + progressRange * easedT);
      };

      setSongGenerationProgress(calculateProgress());

      smoothProgressIntervalRef.current = setInterval(() => {
        setSongGenerationProgress(calculateProgress());
      }, SMOOTH_PROGRESS.UPDATE_INTERVAL_MS);
    } else {
      if (smoothProgressIntervalRef.current) {
        clearInterval(smoothProgressIntervalRef.current);
        smoothProgressIntervalRef.current = null;
      }
    }

    return () => {
      if (smoothProgressIntervalRef.current) {
        clearInterval(smoothProgressIntervalRef.current);
        smoothProgressIntervalRef.current = null;
      }
    };
  }, [isActiveGeneration]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (smoothProgressIntervalRef.current) {
        clearInterval(smoothProgressIntervalRef.current);
        smoothProgressIntervalRef.current = null;
      }
      if (cacheInvalidationTimeoutRef.current) {
        clearTimeout(cacheInvalidationTimeoutRef.current);
        cacheInvalidationTimeoutRef.current = null;
      }
      musicGenStartTimeRef.current = null;
      pollingActiveRef.current = null; // prevent stale polling after unmount
    };
  }, [smoothProgressIntervalRef, cacheInvalidationTimeoutRef]);

  // ─── Helper: Reset Generation State ─────────────────────────────

  const resetGenerationState = React.useCallback(() => {
    setCurrentPhase(null);
    setSongGenerationProgress(0);
    musicGenStartTimeRef.current = null;
    pollingActiveRef.current = null;
    setIsActiveGeneration(false);
    activeRequestIdRef.current = null;
    activeEntryIdRef.current = null;
  }, []);

  const clearGeneratedContent = React.useCallback(() => {
    setGeneratedLyrics('');
    setGeneratedSongTitle(null);
  }, [setGeneratedLyrics, setGeneratedSongTitle]);

  // ─── Polling ────────────────────────────────────────────────────

  const pollForSongCompletion = async (pollingId: string) => {
    // Guard: prevent duplicate polling loops for the same or different request
    if (pollingActiveRef.current) {
      logger.warn('Polling already active, skipping duplicate', {
        existingId: pollingActiveRef.current,
        requestedId: pollingId,
      });
      return;
    }
    pollingActiveRef.current = pollingId;

    const maxAttempts = POLLING.MAX_ATTEMPTS;
    let attempts = 0;

    const checkStatus = async () => {
      // Abort if this polling loop was superseded or component unmounted
      if (pollingActiveRef.current !== pollingId) return;

      try {
        const response = (await apiRequest(
          `/api/v1/app/music/song-requests/${pollingId}`
        )) as SongRequestProgressResponse;

        if (response.success && response.data) {
          const { status, phase, lyrics, trackId, trackTitle, artworkUrl, errorMessage } = response.data;

          setCurrentPhase(phase);

          // Set lyrics for typewriter animation as soon as available
          if (lyrics && lyrics.trim().length > 0) {
            setGeneratedLyrics(lyrics);
          }

          // Set song title when available (for 3-stage typewriter)
          if (trackTitle && trackTitle.trim().length > 0) {
            setGeneratedSongTitle(trackTitle);
          }

          if (status === 'completed' && trackId) {
            setCurrentPhase(null);
            setSongGenerationProgress(PROGRESS.COMPLETE);
            musicGenStartTimeRef.current = null;
            pollingActiveRef.current = null;
            setIsActiveGeneration(false);
            activeRequestIdRef.current = null;
            activeEntryIdRef.current = null;

            const newTrack = {
              id: trackId,
              entryId: selectedEntryId,
              audioUrl: undefined,
              artworkUrl: artworkUrl ?? undefined,
              title: trackTitle ?? t('common.generatedSong'),
            };

            if (trackId) {
              setLastGeneratedTrackId(trackId);
            }

            // Optimistically add the new track to cache (for non-librarians)
            if (!isLibrarian) {
              queryClient.setQueryData(['/api/v1/app/library/private'], (old: PrivateTracksResponse | undefined) => {
                if (!old?.data?.tracks) {
                  return { success: true, data: { tracks: [newTrack] } };
                }
                if (old.data.tracks.some((t: { id?: string }) => t.id === newTrack.id)) {
                  return old;
                }
                return { ...old, data: { ...old.data, tracks: [newTrack, ...old.data.tracks] } };
              });
            }

            // Use centralized cache invalidation with slight delay to ensure backend commit
            if (cacheInvalidationTimeoutRef.current) {
              clearTimeout(cacheInvalidationTimeoutRef.current);
            }
            cacheInvalidationTimeoutRef.current = setTimeout(() => {
              invalidateOnEvent(queryClient, {
                type: 'TRACK_CREATED',
                entryId: selectedEntryId || undefined,
                isLibrarian,
              });
              cacheInvalidationTimeoutRef.current = null;
            }, 500);

            if (isLibrarian) {
              logger.info('Shared library track generated', { trackId: newTrack.id });
            }

            maybeRequestReviewAfterPositiveAction();

            setTimeout(() => {
              setSongGenerationProgress(0);
            }, POLLING.COMPLETION_DELAY_MS);
            return;
          } else if (status === 'failed') {
            resetGenerationState();
            invalidateOnEvent(queryClient, { type: 'CREDITS_CHANGED' });
            toast({
              title: t('hooks.musicGeneration.generationFailed'),
              description: errorMessage || t('hooks.musicGeneration.songGenerationError'),
              variant: 'destructive',
            });
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, CONFIG.ui.polling.statusCheckMs);
        } else {
          resetGenerationState();
          toast({
            title: t('hooks.musicGeneration.generationTimeout'),
            description: t('hooks.musicGeneration.generationTimeoutDescription'),
            variant: 'destructive',
          });
        }
      } catch (error) {
        const isAuthError =
          error &&
          typeof error === 'object' &&
          (('code' in error && error.code === 'UNAUTHORIZED') || ('statusCode' in error && error.statusCode === 401));

        if (isAuthError) {
          logger.debug('Song status check cancelled (user logged out)', { error });
        } else {
          logger.error('Error checking song status', error);
        }
        resetGenerationState();
      }
    };

    checkStatus();
  };

  // ─── Generation Mutation ────────────────────────────────────────

  const generateSongMutation = useMutation({
    mutationFn: async (params?: {
      culturalLanguages?: string[];
      lyricsId?: string | null;
      artworkUrl?: string;
      pictureContext?: string;
      sourceEntryId?: string;
      sourceText?: string;
      sourceReference?: string;
      sourceBookTitle?: string;
      negativeTags?: string;
      styleWeight?: number;
      vocalGender?: 'f' | 'm' | null;
      instruments?: string[];
      genre?: string;
    }) => {
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const selectedCulturalLanguages = params?.culturalLanguages;
      const isBilingual = selectedCulturalLanguages && selectedCulturalLanguages.length === 2;

      const isPictureMode = !!params?.artworkUrl;
      const isSourceMode = !!params?.sourceEntryId && !!params?.sourceText;

      const generateRequest: MusicGenerationRequest = {
        userId,
        entryId: isPictureMode || isSourceMode ? undefined : selectedEntryId || undefined,
        entryContent: isPictureMode || isSourceMode ? undefined : selectedEntryContent || undefined,
        chapterId: isPictureMode || isSourceMode ? undefined : selectedEntryChapterId || undefined,
        lyricsId: params?.lyricsId || undefined,
        musicType: 'song',
        prompt: undefined,
        quality: 'standard',
        priority: 'normal',
        negativeTags: params?.negativeTags || undefined,
        styleWeight: params?.styleWeight !== undefined && params.styleWeight !== 0.5 ? params.styleWeight : undefined,
        vocalGender: params?.vocalGender || undefined,
        artworkUrl: isPictureMode
          ? params?.artworkUrl
          : isSourceMode
            ? undefined
            : selectedEntryArtworkUrl || undefined,
        language:
          selectedCulturalLanguages && selectedCulturalLanguages.length > 0
            ? selectedCulturalLanguages[0]
            : i18n.language?.split('-')[0] || 'en',
        targetLanguages: selectedCulturalLanguages,
        isBilingual,
        pictureContext: params?.pictureContext,
        sourceEntryId: params?.sourceEntryId,
        sourceText: params?.sourceText,
        sourceReference: params?.sourceReference,
        sourceBookTitle: params?.sourceBookTitle,
      };

      if (params?.genre && params.genre.trim().length > 0) {
        generateRequest.genre = params.genre.trim();
      }

      // ✅ Add AI-analyzed preferences for additional style/mood/cultural hints
      if (preferencesAnalysis && preferencesAnalysis.rawPreferences) {
        const validStyles = preferencesAnalysis.styles?.filter(
          (s): s is string => typeof s === 'string' && s.trim().length > 0
        );
        const validGenres = preferencesAnalysis.genres?.filter(
          (g): g is string => typeof g === 'string' && g.trim().length > 0
        );
        const validMoods = preferencesAnalysis.moods?.filter(
          (m): m is string => typeof m === 'string' && m.trim().length > 0
        );
        const validCulturalStyles = preferencesAnalysis.culturalStyles?.filter(
          (c): c is string => typeof c === 'string' && c.trim().length > 0
        );

        if (validStyles && validStyles.length > 0) {
          generateRequest.style = validStyles.join(', ');
        }
        if (!generateRequest.genre && validGenres && validGenres.length > 0) {
          generateRequest.genre = validGenres.join(', ');
        }
        if (validMoods && validMoods.length > 0) {
          generateRequest.mood = validMoods.join(', ');
        }
        if (validCulturalStyles && validCulturalStyles.length > 0) {
          generateRequest.culturalStyle = validCulturalStyles.join(', ');
        }
      }

      const validInstruments = [...(params?.instruments || []), ...(preferencesAnalysis?.instruments || [])].filter(
        (i): i is string => typeof i === 'string' && i.trim().length > 0
      );
      const allInstruments = [...new Set(validInstruments)];
      if (allInstruments.length > 0) {
        generateRequest.instrumentType = allInstruments.join(', ');
      }

      logger.debug('Sending music generation request', {
        genre: generateRequest.genre,
        vocalGender: generateRequest.vocalGender,
        instrumentType: generateRequest.instrumentType,
        style: generateRequest.style,
        mood: generateRequest.mood,
        request: generateRequest,
      });

      const response = (await apiRequest('/api/v1/app/music/generate', {
        method: 'POST',
        data: generateRequest,
        headers: { 'Content-Type': 'application/json' },
        timeout: CONFIG.api.generationTimeoutMs,
      })) as MusicGenerationApiResponse;

      return {
        success: response.success,
        requestId: response.data?.requestId,
        songRequestId: response.data?.songRequestId,
        audioUrl: response.data?.audioUrl,
        queuePosition: response.data?.queuePosition,
        estimatedWaitSeconds: response.data?.estimatedWaitSeconds,
        error: response.error?.message,
      } as SongGenerationResponse & {
        requestId?: string;
        songRequestId?: string;
        queuePosition?: number;
        estimatedWaitSeconds?: number;
      };
    },
    onSuccess: (
      data: SongGenerationResponse & {
        requestId?: string;
        songRequestId?: string;
        queuePosition?: number;
        estimatedWaitSeconds?: number;
      }
    ) => {
      const pollingId = data.songRequestId || data.requestId;
      if (data.success && pollingId) {
        setCurrentPhase(null);
        setSongGenerationProgress(PROGRESS.INITIAL);
        musicGenStartTimeRef.current = Date.now();
        setIsActiveGeneration(true);

        activeRequestIdRef.current = pollingId;
        activeEntryIdRef.current = selectedEntryId;

        useTrackGenerationStore.getState().startGeneration(pollingId, {
          entryContent: selectedEntryContent,
          artworkUrl: generateSongMutation.variables?.artworkUrl,
        });

        clearGeneratedContent();

        setQueuePosition(data.queuePosition ?? null);
        setEstimatedWaitSeconds(data.estimatedWaitSeconds ?? null);

        invalidateOnEvent(queryClient, { type: 'CREDITS_CHANGED' });

        if (onGenerationStartRef.current) {
          onGenerationStartRef.current();
          onGenerationStartRef.current = null;
        }

        pollForSongCompletion(pollingId);
      } else {
        resetGenerationState();
        clearGeneratedContent();
        invalidateOnEvent(queryClient, { type: 'CREDITS_CHANGED' });

        toast({
          title: t('hooks.musicGeneration.songGenerationFailed'),
          description: data.error || t('common.unknownError'),
          variant: 'destructive',
        });
      }
    },
    onError: (error: unknown) => {
      resetGenerationState();

      useTrackGenerationStore.getState().setPendingGeneration(false);

      clearGeneratedContent();
      invalidateOnEvent(queryClient, { type: 'CREDITS_CHANGED' });

      const quotaInfo = extractQuotaError(error);

      if (quotaInfo.isQuotaError) {
        logger.info('Quota/credit limit reached, showing upgrade modal');
        setUsageLimitModal({
          visible: true,
          limit: quotaInfo.limit,
          resetDate: quotaInfo.resetDate || t('common.nextMonth'),
        });
      } else {
        logger.error('[FRONTEND] Music generation failed', error, {
          errorType: error?.constructor?.name,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined,
          selectedEntryId,
          selectedEntryContentLength: selectedEntryContent?.length,
        });
        logError(error, 'Song Generation', '/api/v1/app/music/generate');
        toast({
          title: t('hooks.musicGeneration.songGenerationFailed'),
          description: getFriendlyMessage(error, t),
          variant: 'destructive',
        });
      }
    },
  });

  // ─── Public API ─────────────────────────────────────────────────

  const generateSong = (
    culturalLanguages?: string[],
    options?: {
      artworkUrl?: string;
      pictureContext?: string;
      sourceEntryId?: string;
      sourceText?: string;
      sourceReference?: string;
      sourceBookTitle?: string;
      onGenerationStart?: () => void;
      styleWeight?: number;
      negativeTags?: string;
      vocalGender?: 'f' | 'm' | null;
      instruments?: string[];
      genre?: string;
    }
  ) => {
    logger.debug('Generating song from entry', {
      lyricsId: generatedLyricsId,
      culturalLanguages,
      isBilingual: culturalLanguages && culturalLanguages.length === 2,
      isLibrarian,
      isPictureMode: !!options?.artworkUrl,
      isSourceMode: !!options?.sourceEntryId,
      genre: options?.genre,
      vocalGender: options?.vocalGender,
      instruments: options?.instruments,
      negativeTags: options?.negativeTags,
      styleWeight: options?.styleWeight,
    });

    onGenerationStartRef.current = options?.onGenerationStart || null;

    useTrackGenerationStore.getState().setPendingGeneration(true);

    generateSongMutation.mutate({
      culturalLanguages,
      lyricsId: generatedLyricsId,
      artworkUrl: options?.artworkUrl,
      pictureContext: options?.pictureContext,
      sourceEntryId: options?.sourceEntryId,
      sourceText: options?.sourceText,
      sourceReference: options?.sourceReference,
      sourceBookTitle: options?.sourceBookTitle,
      styleWeight: options?.styleWeight,
      negativeTags: options?.negativeTags,
      vocalGender: options?.vocalGender,
      instruments: options?.instruments,
      genre: options?.genre,
    });
  };

  return {
    songGenerationProgress,
    currentPhase,
    queuePosition,
    estimatedWaitSeconds,
    preferencesAnalysis: null as MusicPreferencesAnalysis | null, // Provided by facade
    usageLimitModal,
    setUsageLimitModal,
    isGeneratingSong: generateSongMutation.isPending,
    generateSong,
    songError: generateSongMutation.error,
  };
}
