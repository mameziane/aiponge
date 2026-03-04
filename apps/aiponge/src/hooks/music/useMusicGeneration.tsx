/**
 * Music Generation Facade Hook
 * Composes 5 focused hooks into a single API for backward compatibility.
 *
 * Responsibilities are split into:
 * - useEntryContext:    Entry selection state (content, ID, artwork, chapter)
 * - useEntryLibrary:    Entries list, focus-refetch, deletion
 * - useLyricsCache:     Lyrics fetching, caching, freshness validation
 * - useEntryTracks:     Private tracks query, entry filtering
 * - useSongGeneration:  Generation mutation, polling, progress animation, quota errors
 *
 * This facade preserves the same return shape so no consumer changes are needed.
 */

import React from 'react';
import { useProfile } from '../profile/useProfile';
import { useAuthState } from '../auth/useAuthState';
import { analyzeMusicPreferences, type MusicPreferencesAnalysis } from './musicPreferencesAnalyzer';
import { logger } from '../../lib/logger';
import { useEntryContext } from './useEntryContext';
import { useEntryLibrary } from './useEntryLibrary';
import { useLyricsCache } from './useLyricsCache';
import { useEntryTracks } from './useEntryTracks';
import { useSongGeneration } from './useSongGeneration';

export type { EntryContextUpdate, EntryContext } from './useEntryContext';
export type { Entry } from './useEntryLibrary';

export function useMusicGeneration(bookId?: string | null) {
  const { userId } = useAuthState();

  // ─── Shared Refs ────────────────────────────────────────────────
  // These refs bridge the gap between useSongGeneration (writes) and
  // useLyricsCache (reads) to prevent stale cached lyrics from overwriting
  // fresh lyrics being streamed during an active generation.
  const activeRequestIdRef = React.useRef<string | null>(null);
  const activeEntryIdRef = React.useRef<string | null>(null);

  // ─── Preferences Analysis ───────────────────────────────────────
  const [preferencesAnalysis, setPreferencesAnalysis] = React.useState<MusicPreferencesAnalysis | null>(null);
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

  // ─── Compose focused hooks (order: no circular deps) ───────────

  const entryContext = useEntryContext();
  const entryLibrary = useEntryLibrary(bookId);

  const entryTracks = useEntryTracks({
    selectedEntryId: entryContext.selectedEntryId,
  });

  const lyricsCache = useLyricsCache({
    selectedEntryId: entryContext.selectedEntryId,
    entries: entryLibrary.entries,
    activeRequestIdRef,
    activeEntryIdRef,
  });

  const songGeneration = useSongGeneration({
    selectedEntryContent: entryContext.selectedEntryContent,
    selectedEntryId: entryContext.selectedEntryId,
    selectedEntryArtworkUrl: entryContext.selectedEntryArtworkUrl,
    selectedEntryChapterId: entryContext.selectedEntryChapterId,
    preferencesAnalysis,
    generatedLyricsId: lyricsCache.generatedLyricsId,
    setGeneratedLyrics: lyricsCache.setGeneratedLyrics,
    setGeneratedLyricsId: lyricsCache.setGeneratedLyricsId,
    setGeneratedSongTitle: lyricsCache.setGeneratedSongTitle,
    setLastGeneratedTrackId: entryTracks.setLastGeneratedTrackId,
    invalidateEntries: entryLibrary.invalidateEntries,
    // Shared refs — generation writes, lyrics cache reads
    activeRequestIdRef,
    activeEntryIdRef,
  });

  // ─── Combined clearGeneratedContent ─────────────────────────────

  const clearGeneratedContent = React.useCallback(() => {
    lyricsCache.setGeneratedLyrics('');
    lyricsCache.setGeneratedLyricsId(null);
    lyricsCache.setGeneratedSongTitle(null);
    entryTracks.setLastGeneratedTrackId(null);
    entryContext.setSelectedEntryChapterId(null);
    activeRequestIdRef.current = null;
    activeEntryIdRef.current = null;
  }, [lyricsCache, entryTracks, entryContext]);

  // ─── Return same properties for backward compatibility ──────────

  return {
    // Entry context
    selectedEntry: entryContext.selectedEntryContent,
    selectedEntryId: entryContext.selectedEntryId,
    updateEntryContext: entryContext.updateEntryContext,
    setEntryContext: entryContext.setEntryContext,
    setSelectedEntry: entryContext.setSelectedEntry,
    setSelectedEntryId: entryContext.setSelectedEntryId,
    setSelectedEntryChapterId: entryContext.setSelectedEntryChapterId,
    setSelectedEntryArtworkUrl: entryContext.setSelectedEntryArtworkUrl,

    // Entry library
    entries: entryLibrary.entries,
    totalEntries: entryLibrary.totalEntries,
    isLoadingEntries: entryLibrary.isLoadingEntries,
    refetchEntries: entryLibrary.refetchEntries,
    deleteEntry: entryLibrary.deleteEntry,
    isDeletingEntry: entryLibrary.isDeletingEntry,

    // Lyrics cache
    generatedLyrics: lyricsCache.generatedLyrics,
    generatedLyricsId: lyricsCache.generatedLyricsId,
    generatedSongTitle: lyricsCache.generatedSongTitle,

    // Entry tracks
    entryTracks: entryTracks.entryTracks,
    lastGeneratedTrackId: entryTracks.lastGeneratedTrackId,

    // Song generation
    songGenerationProgress: songGeneration.songGenerationProgress,
    currentPhase: songGeneration.currentPhase,
    queuePosition: songGeneration.queuePosition,
    estimatedWaitSeconds: songGeneration.estimatedWaitSeconds,
    preferencesAnalysis,
    usageLimitModal: songGeneration.usageLimitModal,
    isGeneratingSong: songGeneration.isGeneratingSong,
    generateSong: songGeneration.generateSong,
    songError: songGeneration.songError,
    setUsageLimitModal: songGeneration.setUsageLimitModal,

    // Combined
    clearGeneratedContent,
  };
}
