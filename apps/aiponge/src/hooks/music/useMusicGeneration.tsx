import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, apiClient } from '../../lib/axiosApiClient';
import { useToast } from '../ui/use-toast';
import { useFocusEffect } from 'expo-router';
import { analyzeMusicPreferences, MusicPreferencesAnalysis } from './musicPreferencesAnalyzer';
import { useAuthState } from '../auth/useAuthState';
import { logger } from '../../lib/logger';
import { useProfile } from '../profile/useProfile';
import { useEntriesSimple } from '../book/useUnifiedLibrary';
import type { Entry } from '../../types/profile.types';

const ENTRIES_QUERY_KEY = ['library', 'entries'];
import { useTranslation } from '../../i18n';
import { useAppReview } from '../system/useAppReview';
import { wrapErrorHandler, getFriendlyMessage } from '../system/useAppQuery';
import { logError } from '../../utils/errorSerialization';
import { CONFIG, QUERY_STALE_TIME } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { useIsLibrarian } from '../admin/useAdminQuery';
import { useTrackGenerationStore } from '../../stores';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';

export type { Entry };

// Smooth progress interpolation - total duration and easing curve
// Instead of relying on phase detection (which can miss fast phases),
// we interpolate smoothly from start to near-completion over expected total time
const SMOOTH_PROGRESS = {
  START: 2,
  TARGET: 95, // Max before completion (leave room for completion jump)
  DURATION_MS: 120000, // 2 minutes total expected generation time
  UPDATE_INTERVAL_MS: 300,
} as const;

const PROGRESS = {
  INITIAL: 2,
  COMPLETE: 100,
  MAX_POLLING: 98,
  LYRICS_READY: 35, // Backend emits lyrics at ~35%
} as const;

// Polling configuration constants
const POLLING = {
  MAX_ATTEMPTS: 60,
  COMPLETION_DELAY_MS: 1000,
} as const;

/** @deprecated Use ServiceResponse directly */
export type EntriesResponse = ServiceResponse<{
  entries: Entry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}>;

export interface LyricsResponse {
  success: boolean;
  lyrics?: string;
  error?: string;
}

export interface GeneratedTrack {
  id?: string;
  audioUrl?: string;
  title?: string;
}

export interface SongGenerationResponse {
  success: boolean;
  audioUrl?: string;
  error?: string;
}

interface ProfilePreferences {
  musicPreferences?: string;
  musicInstruments?: string[];
  vocalGender?: 'f' | 'm' | null;
  [key: string]: unknown;
}

type ExistingLyricsResponse = ServiceResponse<{ id: string; content: string; createdAt: string } | null>;

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

// Context for setting entry state atomically
// All fields are optional for partial updates - unspecified fields preserve current value
export interface EntryContextUpdate {
  content?: string;
  id?: string | null;
  chapterId?: string | null;
  artworkUrl?: string | null;
}

// Full context for initial setting (all fields required except chapterId/artworkUrl)
export interface EntryContext {
  content: string;
  id: string | null;
  chapterId?: string | null;
  artworkUrl?: string | null;
}

const QUOTA_ERROR_CODES = [
  'USAGE_LIMIT_EXCEEDED',
  'SUBSCRIPTION_LIMIT_EXCEEDED',
  'QUOTA_EXCEEDED',
  'INSUFFICIENT_CREDITS',
  'PAYMENT_REQUIRED',
];

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

  const isQuotaError = (typeof errorCode === 'string' && QUOTA_ERROR_CODES.includes(errorCode)) || httpStatus === 402;

  if (!isQuotaError) return fallback;

  const subscription = (details.subscription || {}) as { usage?: { limit?: number }; resetAt?: string };
  const subscriptionUsage = subscription.usage || (rawData.usage as { limit?: number }) || err.usage || {};

  const limit = subscriptionUsage.limit || (rawData.limit as number) || err.limit || 0;

  const resetAt = subscription.resetAt || (rawData.resetAt as string) || err.resetAt;
  const resetDate = resetAt ? new Date(resetAt).toLocaleDateString() : null;

  return { isQuotaError: true, limit, resetDate };
}

export function useMusicGeneration() {
  const [selectedEntryContent, _setSelectedEntryContent] = useState('');
  const [selectedEntryIdState, _setSelectedEntryIdState] = useState<string | null>(null);
  const [selectedEntryArtworkUrl, _setSelectedEntryArtworkUrl] = useState<string | null>(null);
  const [selectedEntryChapterId, _setSelectedEntryChapterId] = useState<string | null>(null);
  const [generatedLyrics, _setGeneratedLyrics] = useState('');
  const generatedLyricsRef = React.useRef(''); // Ref to track latest lyrics for closure access

  // Track active generation request to prevent stale lyrics from overwriting fresh ones
  const activeRequestIdRef = React.useRef<string | null>(null);
  const activeEntryIdRef = React.useRef<string | null>(null);

  // Unified setter to ensure entry content, ID, chapterId, and artworkUrl stay in sync
  // Accepts partial updates - unspecified fields preserve their current value
  // This prevents race conditions where content and ID could diverge
  const updateEntryContext = React.useCallback((update: EntryContextUpdate) => {
    if (update.content !== undefined) _setSelectedEntryContent(update.content);
    if (update.id !== undefined) _setSelectedEntryIdState(update.id);
    if (update.chapterId !== undefined) _setSelectedEntryChapterId(update.chapterId);
    if (update.artworkUrl !== undefined) _setSelectedEntryArtworkUrl(update.artworkUrl);
  }, []);

  // Full setter for when you want to set ALL fields (e.g., selecting a new entry)
  const setEntryContext = React.useCallback((ctx: EntryContext) => {
    _setSelectedEntryContent(ctx.content);
    _setSelectedEntryIdState(ctx.id);
    _setSelectedEntryChapterId(ctx.chapterId ?? null);
    _setSelectedEntryArtworkUrl(ctx.artworkUrl ?? null);
  }, []);

  // Primary individual setters - prefer updateEntryContext for new code
  const setSelectedEntry = _setSelectedEntryContent;
  const setSelectedEntryId = _setSelectedEntryIdState;
  const setSelectedEntryArtworkUrlSetter = _setSelectedEntryArtworkUrl;
  const setSelectedEntryChapterIdSetter = _setSelectedEntryChapterId;

  // Wrapper to keep state and ref in sync (for closure access in polling)
  const setGeneratedLyrics = React.useCallback((lyrics: string) => {
    generatedLyricsRef.current = lyrics;
    _setGeneratedLyrics(lyrics);
  }, []);

  const [generatedLyricsId, setGeneratedLyricsId] = useState<string | null>(null);
  const [generatedSongTitle, setGeneratedSongTitle] = useState<string | null>(null);
  // Track ID of most recently generated track (for feedback prompts & guest conversion)
  // The actual track data comes from entryTracks (single source of truth)
  const [lastGeneratedTrackId, setLastGeneratedTrackId] = useState<string | null>(null);
  const [songGenerationProgress, setSongGenerationProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const musicGenStartTimeRef = React.useRef<number | null>(null);
  const smoothProgressIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const cacheInvalidationTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [estimatedWaitSeconds, setEstimatedWaitSeconds] = useState<number | null>(null);
  const [preferencesAnalysis, setPreferencesAnalysis] = useState<MusicPreferencesAnalysis | null>(null);
  const [usageLimitModal, setUsageLimitModal] = useState<{
    visible: boolean;
    limit?: number;
    resetDate?: string;
  }>({ visible: false });
  // Derive shared library mode from user role (librarian/admin)
  const isLibrarian = useIsLibrarian();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { userId, isAuthenticated, isGuest } = useAuthState();
  const { maybeRequestReviewAfterPositiveAction } = useAppReview();

  // Fetch user profile to get music preferences - uses shared cache
  const { profileData: profileResponse } = useProfile();

  React.useEffect(() => {
    const musicPrefs = profileResponse?.preferences?.musicPreferences;

    if (!musicPrefs || musicPrefs.trim().length === 0) {
      setPreferencesAnalysis(null);
      return;
    }

    let cancelled = false;

    analyzeMusicPreferences(musicPrefs)
      .then(analysis => {
        if (cancelled) return;
        setPreferencesAnalysis(analysis);
      })
      .catch(error => {
        if (!cancelled) {
          logger.error('Music preferences analysis failed', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profileResponse?.preferences?.musicPreferences, userId]);

  // ✅ UNIFIED: Use shared entries hook as single source of truth
  // This fixes the 1/50 vs 1/20 count discrepancy between screens
  const {
    entries,
    total: totalEntries,
    isLoading: isLoadingEntries,
    refetch: refetchEntries,
    invalidateEntries,
  } = useEntriesSimple();

  // Auto-refetch entries when screen gains focus (e.g., navigating from Profile screen)
  // Skipped for guests — they have no personal entries, avoiding a wasted network call
  useFocusEffect(
    React.useCallback(() => {
      if (!isGuest) refetchEntries();
    }, [refetchEntries, isGuest])
  );

  // NOTE: Removed auto-update effect that derived selectedEntryIdState from selectedEntryContent content.
  // This caused race conditions where scrolling through entries could set the wrong ID.
  // The ID must ALWAYS be set directly by the caller (e.g., CreateScreen's handleEntrySelect)
  // which sets both selectedEntryIdState AND selectedEntryContent atomically.

  // isGenerating is derived from activeRequestIdRef for reliable lifecycle tracking
  // This avoids feedback loops with songGenerationProgress and handles all abort paths
  const [isActiveGeneration, setIsActiveGeneration] = useState(false);

  // Smooth progress interpolation using time-based animation
  // Instead of relying on phase transitions (which can be missed due to polling delays),
  // we interpolate smoothly from START to TARGET over the expected total duration
  // Uses easeOutQuad for natural deceleration (slows down as it approaches target)
  React.useEffect(() => {
    if (isActiveGeneration && musicGenStartTimeRef.current) {
      // Clear any existing interval before creating new one
      if (smoothProgressIntervalRef.current) {
        clearInterval(smoothProgressIntervalRef.current);
        smoothProgressIntervalRef.current = null;
      }

      const startTime = musicGenStartTimeRef.current;

      // Helper to calculate progress based on elapsed time
      const calculateProgress = () => {
        const elapsed = Date.now() - startTime;
        const progressRange = SMOOTH_PROGRESS.TARGET - SMOOTH_PROGRESS.START;
        // Use easeOutQuad for natural deceleration (slows down as it approaches target)
        const t = Math.min(elapsed / SMOOTH_PROGRESS.DURATION_MS, 1);
        const easedT = t * (2 - t); // easeOutQuad
        return Math.round(SMOOTH_PROGRESS.START + progressRange * easedT);
      };

      // Set initial progress immediately (don't wait for first interval tick)
      setSongGenerationProgress(calculateProgress());

      // Update progress smoothly based on elapsed time
      smoothProgressIntervalRef.current = setInterval(() => {
        setSongGenerationProgress(calculateProgress());
      }, SMOOTH_PROGRESS.UPDATE_INTERVAL_MS);
    } else {
      // Clear interval when not generating
      if (smoothProgressIntervalRef.current) {
        clearInterval(smoothProgressIntervalRef.current);
        smoothProgressIntervalRef.current = null;
      }
    }

    // Cleanup: always clear interval on unmount or dependency change
    return () => {
      if (smoothProgressIntervalRef.current) {
        clearInterval(smoothProgressIntervalRef.current);
        smoothProgressIntervalRef.current = null;
      }
    };
  }, [isActiveGeneration]);

  // Cleanup: clear all timeouts and intervals on unmount
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
    };
  }, [smoothProgressIntervalRef, cacheInvalidationTimeoutRef]);

  // Fetch existing lyrics for selected entry (using dedicated entry-lyrics endpoint)
  // Returns null if no lyrics exist for the entry (not an error)
  const { data: existingLyricsResponse } = useQuery<ExistingLyricsResponse>({
    queryKey: queryKeys.lyrics.byEntry(selectedEntryIdState ?? undefined),
    queryFn: () => apiRequest(`/api/v1/app/lyrics/entry/${selectedEntryIdState}`) as Promise<ExistingLyricsResponse>,
    enabled: !!selectedEntryIdState,
  });

  // Fetch all user's private tracks to show those generated from this entry
  // SCALABILITY: Cached for 30 seconds - allows quick updates after track deletion/addition
  // Only fetch when user is authenticated to prevent 401 errors during startup/hydration
  const { data: privateTracksResponse } = useQuery<PrivateTracksResponse>({
    queryKey: queryKeys.tracks.private(),
    queryFn: () => apiRequest('/api/v1/app/library/private') as Promise<PrivateTracksResponse>,
    enabled: isAuthenticated,
    staleTime: QUERY_STALE_TIME.short,
    gcTime: 300000, // 5 minutes cache retention
  });

  // Filter tracks generated from the selected entry, or include last generated track for guests
  const entryTracks = React.useMemo(() => {
    if (!privateTracksResponse?.data?.tracks) return [];

    interface PrivateTrack {
      id: string;
      entryId?: string;
      audioUrl?: string;
      artworkUrl?: string | null;
      title?: string | null;
      displayName?: string | null;
    }

    // If we have a selected entry ID, filter by it
    if (selectedEntryIdState) {
      return privateTracksResponse.data.tracks.filter((track: PrivateTrack) => track.entryId === selectedEntryIdState);
    }

    // For users without a saved entry (e.g., guests typing fresh content),
    // include the most recently generated track so they can see/play it
    if (lastGeneratedTrackId) {
      return privateTracksResponse.data.tracks.filter((track: PrivateTrack) => track.id === lastGeneratedTrackId);
    }

    return [];
  }, [selectedEntryIdState, privateTracksResponse, lastGeneratedTrackId]);

  // Auto-load existing lyrics when entry is selected (but NOT during active generation FOR THAT ENTRY)
  // Invalidate lyrics if the entry was modified after the lyrics were created
  React.useEffect(() => {
    // Skip cached lyrics only if we're actively generating for THIS specific entry
    // This prevents stale cached lyrics from overwriting fresh ones being streamed in,
    // while still allowing cached lyrics to hydrate when switching to a different entry
    if (activeRequestIdRef.current && activeEntryIdRef.current === selectedEntryIdState) {
      return;
    }

    const lyrics = existingLyricsResponse?.data;
    if (existingLyricsResponse?.success && lyrics) {
      // Check if the entry was modified after the lyrics were created
      const currentEntry = entries.find((t: Entry) => t.id === selectedEntryIdState);
      if (currentEntry?.updatedAt && lyrics.createdAt) {
        const entryUpdatedAt = new Date(currentEntry.updatedAt).getTime();
        const lyricsCreatedAt = new Date(lyrics.createdAt).getTime();

        if (entryUpdatedAt > lyricsCreatedAt) {
          // Entry was modified after lyrics were generated - treat as stale
          setGeneratedLyrics('');
          setGeneratedLyricsId(null);
          return;
        }
      }
      // Lyrics are still valid - use them
      setGeneratedLyrics(lyrics.content);
      setGeneratedLyricsId(lyrics.id);
    } else if (existingLyricsResponse?.success && !lyrics) {
      setGeneratedLyrics('');
      setGeneratedLyricsId(null);
    }
  }, [existingLyricsResponse, selectedEntryIdState, entries]);

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
      // Validate userId before making request
      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Shared library mode is now derived from isLibrarian (user role)
      // No need to track separately - the hook already has this info

      // ✅ Build enhanced generation request with AI-analyzed preferences
      // NOTE: All optional fields use undefined (not null) to match Zod .optional() validation
      interface MusicGenerationRequest {
        userId: string | undefined;
        entryId?: string;
        entryContent?: string; // Plain string content, not object - matches MusicGenerateSchema
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
        // Picture-to-song: generate from image using OpenAI Vision
        artworkUrl?: string;
        pictureContext?: string;
        // Source-to-song: generate from book entry
        sourceEntryId?: string;
        sourceText?: string;
        sourceReference?: string;
        sourceBookTitle?: string;
        // Note: visibility is determined by backend based on authenticated user role
      }

      const selectedCulturalLanguages = params?.culturalLanguages;
      const isBilingual = selectedCulturalLanguages && selectedCulturalLanguages.length === 2;

      // Send entry content directly - backend generates lyrics as part of song generation
      // No separate lyrics preview step needed
      // IMPORTANT: When in picture mode (artworkUrl provided), DON'T send entryContent
      // Otherwise backend will use entryContent instead of doing image analysis
      // IMPORTANT: When in source mode (sourceEntryId provided), use source text instead of entry
      const isPictureMode = !!params?.artworkUrl;
      const isSourceMode = !!params?.sourceEntryId && !!params?.sourceText;

      const generateRequest: MusicGenerationRequest = {
        userId,
        entryId: isPictureMode || isSourceMode ? undefined : selectedEntryIdState || undefined,
        entryContent: isPictureMode || isSourceMode ? undefined : selectedEntryContent || undefined,
        chapterId: isPictureMode || isSourceMode ? undefined : selectedEntryChapterId || undefined,
        lyricsId: params?.lyricsId || undefined, // Use existing lyrics if available, else backend generates fresh
        musicType: 'song',
        prompt: undefined, // Backend generates from entryContent, artworkUrl, or source text
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
            : i18n.language,
        targetLanguages: selectedCulturalLanguages,
        isBilingual,
        pictureContext: params?.pictureContext,
        // Source-to-song: generate from book entry with attribution
        sourceEntryId: params?.sourceEntryId,
        sourceText: params?.sourceText,
        sourceReference: params?.sourceReference,
        sourceBookTitle: params?.sourceBookTitle,
        // Note: visibility is determined by backend based on authenticated user role
      };

      if (params?.genre && params.genre.trim().length > 0) {
        generateRequest.genre = params.genre.trim();
      }

      // ✅ Add AI-analyzed preferences for additional style/mood/cultural hints
      // Enhanced: Include ALL extracted values (comma-separated) instead of just the first
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

        // Include ALL styles (comma-separated for MusicAPI tags)
        if (validStyles && validStyles.length > 0) {
          generateRequest.style = validStyles.join(', ');
        }
        // Only use AI-analyzed genres if user hasn't selected one from the picker
        // Include ALL genres for richer style tags
        if (!generateRequest.genre && validGenres && validGenres.length > 0) {
          generateRequest.genre = validGenres.join(', ');
        }
        // Include ALL moods
        if (validMoods && validMoods.length > 0) {
          generateRequest.mood = validMoods.join(', ');
        }
        // Include ALL cultural styles
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

      // DEBUG: Log the exact request being sent to backend
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
        setCurrentPhase(null); // Reset phase for new generation
        setSongGenerationProgress(PROGRESS.INITIAL);

        // Start timing for smooth progress interpolation
        musicGenStartTimeRef.current = Date.now();
        setIsActiveGeneration(true);

        // Track active request and entry to prevent stale cached lyrics from overwriting
        activeRequestIdRef.current = pollingId;
        activeEntryIdRef.current = selectedEntryIdState;

        // Add to track generation store for background progress display on Music screen
        // Include artworkUrl for picture-to-song blur-to-sharp animation in DraftTrackCard
        useTrackGenerationStore.getState().startGeneration(pollingId, {
          entryContent: selectedEntryContent,
          artworkUrl: generateSongMutation.variables?.artworkUrl,
        });

        // Clear generated content so new lyrics can appear in typewriter animation
        setGeneratedLyrics('');
        setGeneratedSongTitle(null);

        // Set queue info (use nullish coalescing to preserve 0 as valid value)
        setQueuePosition(data.queuePosition ?? null);
        setEstimatedWaitSeconds(data.estimatedWaitSeconds ?? null);

        // Invalidate credit cache immediately (credits were deducted at generation start)
        invalidateOnEvent(queryClient, { type: 'CREDITS_CHANGED' });

        // Call onGenerationStart callback if provided (for navigation, etc.)
        if (onGenerationStartRef.current) {
          onGenerationStartRef.current();
          onGenerationStartRef.current = null;
        }

        pollForSongCompletion(pollingId);
      } else {
        setCurrentPhase(null);
        setSongGenerationProgress(0);

        // Stop smooth progress animation
        musicGenStartTimeRef.current = null;
        setIsActiveGeneration(false);

        // Clear active request tracking
        activeRequestIdRef.current = null;
        activeEntryIdRef.current = null;

        // Clear generated content so next generation attempt starts fresh
        setGeneratedLyrics('');
        setGeneratedSongTitle(null);

        // Invalidate credit cache on failure
        invalidateOnEvent(queryClient, { type: 'CREDITS_CHANGED' });

        toast({
          title: t('hooks.musicGeneration.songGenerationFailed'),
          description: data.error || t('common.unknownError'),
          variant: 'destructive',
        });
      }
    },
    onError: (error: unknown) => {
      setCurrentPhase(null);
      setSongGenerationProgress(0);

      // Stop smooth progress animation
      musicGenStartTimeRef.current = null;
      setIsActiveGeneration(false);

      // Clear pending generation flag since generation failed
      useTrackGenerationStore.getState().setPendingGeneration(false);

      // Clear active request tracking
      activeRequestIdRef.current = null;
      activeEntryIdRef.current = null;

      // Clear generated content so next generation attempt starts fresh
      setGeneratedLyrics('');
      setGeneratedSongTitle(null);

      // Invalidate credit cache on error (credits may have been refunded)
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
          selectedEntryIdState,
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

  const pollForSongCompletion = async (pollingId: string) => {
    const maxAttempts = POLLING.MAX_ATTEMPTS;
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const response = (await apiRequest(
          `/api/v1/app/music/song-requests/${pollingId}`
        )) as SongRequestProgressResponse;

        if (response.success && response.data) {
          const { status, phase, percentComplete, lyrics, trackId, trackTitle, artworkUrl, errorMessage } =
            response.data;

          // Track current phase for smooth progress animation
          setCurrentPhase(phase);

          // Set lyrics for typewriter animation as soon as available
          // Always update lyrics from polling - the activeRequestIdRef guard in existingLyricsResponse
          // effect prevents cached lyrics from other entries from overwriting these
          if (lyrics && lyrics.trim().length > 0) {
            setGeneratedLyrics(lyrics);
          }

          // Set song title when available (for 3-stage typewriter)
          if (trackTitle && trackTitle.trim().length > 0) {
            setGeneratedSongTitle(trackTitle);
          }

          // Time-based smooth interpolation handles progress - ignore backend percentages
          // This prevents jumps that occur when phases complete faster than polling

          if (status === 'completed' && trackId) {
            setCurrentPhase(null);
            setSongGenerationProgress(PROGRESS.COMPLETE);

            // Stop smooth progress animation
            musicGenStartTimeRef.current = null;
            setIsActiveGeneration(false);

            // Clear active request tracking - generation complete
            activeRequestIdRef.current = null;
            activeEntryIdRef.current = null;

            const newTrack = {
              id: trackId,
              entryId: selectedEntryIdState,
              audioUrl: undefined, // Will be fetched via cache invalidation
              artworkUrl: artworkUrl ?? undefined,
              title: trackTitle ?? t('common.generatedSong'),
            };

            if (trackId) {
              setLastGeneratedTrackId(trackId);
            }

            // Optimistically add the new track to cache before refetch (for non-librarians)
            if (!isLibrarian) {
              queryClient.setQueryData(['/api/v1/app/library/private'], (old: PrivateTracksResponse | undefined) => {
                if (!old?.data?.tracks) {
                  return {
                    success: true,
                    data: { tracks: [newTrack] },
                  };
                }
                if (old.data.tracks.some((t: { id?: string }) => t.id === newTrack.id)) {
                  return old;
                }
                return {
                  ...old,
                  data: {
                    ...old.data,
                    tracks: [newTrack, ...old.data.tracks],
                  },
                };
              });
            }

            // Use centralized cache invalidation with slight delay to ensure backend commit
            if (cacheInvalidationTimeoutRef.current) {
              clearTimeout(cacheInvalidationTimeoutRef.current);
            }
            cacheInvalidationTimeoutRef.current = setTimeout(() => {
              invalidateOnEvent(queryClient, {
                type: 'TRACK_CREATED',
                entryId: selectedEntryIdState || undefined,
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
            setCurrentPhase(null);
            setSongGenerationProgress(0);

            // Stop smooth progress animation
            musicGenStartTimeRef.current = null;
            setIsActiveGeneration(false);

            // Clear active request tracking - generation failed
            activeRequestIdRef.current = null;
            activeEntryIdRef.current = null;

            // Invalidate credit cache on failure (credits may have been refunded)
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
          setCurrentPhase(null);
          setSongGenerationProgress(0);

          // Stop smooth progress animation
          musicGenStartTimeRef.current = null;
          setIsActiveGeneration(false);

          // Clear active request tracking - timeout
          activeRequestIdRef.current = null;
          activeEntryIdRef.current = null;

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
        setCurrentPhase(null);
        setSongGenerationProgress(0);

        // Stop smooth progress animation
        musicGenStartTimeRef.current = null;
        setIsActiveGeneration(false);

        // Clear active request tracking - error
        activeRequestIdRef.current = null;
        activeEntryIdRef.current = null;
      }
    };

    checkStatus();
  };

  // Store onSuccess callback ref for navigation after successful generation start
  const onGenerationStartRef = React.useRef<(() => void) | null>(null);

  const generateSongFromEntry = (
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

  // Delete entry mutation - uses unified cache invalidation
  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await apiRequest(`/api/v1/app/entries/${entryId}`, {
        method: 'DELETE',
      });
      return response;
    },
    onSuccess: () => {
      // ✅ UNIFIED: Invalidate shared entries cache for all screens
      invalidateEntries();
      // Also invalidate profile to refresh totalEntries in stats
      invalidateOnEvent(queryClient, { type: 'PROFILE_UPDATED' });
    },
    onError: wrapErrorHandler(toast, t, 'Delete Entry', undefined, {
      customTitle: t('hooks.musicGeneration.deleteFailed'),
    }),
  });

  return {
    entries,
    totalEntries,
    selectedEntry: selectedEntryContent,
    selectedEntryId: selectedEntryIdState,
    generatedLyrics,
    generatedLyricsId,
    generatedSongTitle,
    lastGeneratedTrackId,
    entryTracks,
    songGenerationProgress,
    currentPhase,
    queuePosition,
    estimatedWaitSeconds,
    preferencesAnalysis,
    usageLimitModal,

    isLoadingEntries,
    isGeneratingSong: generateSongMutation.isPending,
    isDeletingEntry: deleteEntryMutation.isPending,

    updateEntryContext,
    setEntryContext,
    setSelectedEntry,
    setSelectedEntryId,
    setSelectedEntryChapterId: setSelectedEntryChapterIdSetter,
    setSelectedEntryArtworkUrl: setSelectedEntryArtworkUrlSetter,
    clearGeneratedContent: () => {
      setGeneratedLyrics('');
      setGeneratedLyricsId(null);
      setGeneratedSongTitle(null);
      setLastGeneratedTrackId(null);
      setCurrentPhase(null);
      setSongGenerationProgress(0);
      setSelectedEntryChapterIdSetter(null);
      activeRequestIdRef.current = null;
      activeEntryIdRef.current = null;
    },
    setUsageLimitModal,
    refetchEntries,
    generateSong: generateSongFromEntry,
    deleteEntry: deleteEntryMutation.mutate,

    songError: generateSongMutation.error,
  };
}
