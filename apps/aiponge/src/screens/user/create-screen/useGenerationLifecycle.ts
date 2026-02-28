import { useState, useEffect, useRef, useCallback } from 'react';
import { usePlaybackState } from '../../../contexts/PlaybackContext';
import { logger } from '../../../lib/logger';
import { useToast } from '../../../hooks/ui/use-toast';
import type { Entry } from '@/types/profile.types';

export interface GenerationLifecycleOptions {
  sharedContent?: string;
  entryId?: string;
  isDataReady: boolean;
  entries: Entry[] | null;
  accessibleEntries: Entry[];
  chapters: Array<{ id: string; isLocked?: boolean }>;
  generatedTrack: { id: string } | null;
  isGeneratingSong: boolean;
  isGuestUser: boolean;
  trackSongCreated: () => void;
  setEntryContext: (ctx: {
    content: string;
    id: string | null;
    chapterId: string | null;
    artworkUrl: string | null;
  }) => void;
  setSongGenerationExpanded: (v: boolean) => void;
  t: (key: string) => string;
}

export function useGenerationLifecycle({
  sharedContent,
  entryId,
  isDataReady,
  entries,
  accessibleEntries,
  chapters,
  generatedTrack,
  isGeneratingSong,
  isGuestUser,
  trackSongCreated,
  setEntryContext,
  setSongGenerationExpanded,
  t,
}: GenerationLifecycleOptions) {
  const { toast } = useToast();
  const { currentTrack, isPlaying, playbackPhase } = usePlaybackState();

  const [generationPhase, setGenerationPhase] = useState<'idle' | 'lyrics' | 'song'>('idle');
  const [sharedContentProcessed, setSharedContentProcessed] = useState(false);
  const [entryIdProcessed, setEntryIdProcessed] = useState(false);
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [hasPlayedGeneratedTrack, setHasPlayedGeneratedTrack] = useState(false);

  const prevGeneratedTrackRef = useRef<typeof generatedTrack>(null);
  const lastFeedbackTrackIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isGeneratingSong && generationPhase !== 'idle') {
      setGenerationPhase('idle');
    }
  }, [isGeneratingSong, generationPhase]);

  useEffect(() => {
    if (generatedTrack && !prevGeneratedTrackRef.current && isGuestUser) {
      trackSongCreated();
    }
    prevGeneratedTrackRef.current = generatedTrack;
  }, [generatedTrack, isGuestUser, trackSongCreated]);

  useEffect(() => {
    if (generatedTrack?.id && generatedTrack.id !== lastFeedbackTrackIdRef.current) {
      setFeedbackSubmitted(false);
      setShowFeedbackPrompt(false);
      setHasPlayedGeneratedTrack(false);
    }
  }, [generatedTrack?.id]);

  useEffect(() => {
    if (
      generatedTrack &&
      currentTrack?.id === generatedTrack.id &&
      playbackPhase === 'playing' &&
      !hasPlayedGeneratedTrack
    ) {
      setHasPlayedGeneratedTrack(true);
      logger.info('[MusicGeneration] Generated track played for first time', { trackId: generatedTrack.id });
    }
  }, [generatedTrack, currentTrack?.id, playbackPhase, hasPlayedGeneratedTrack]);

  useEffect(() => {
    if (
      generatedTrack &&
      hasPlayedGeneratedTrack &&
      !feedbackSubmitted &&
      !showFeedbackPrompt &&
      generatedTrack.id !== lastFeedbackTrackIdRef.current
    ) {
      const timer = setTimeout(() => {
        setShowFeedbackPrompt(true);
        lastFeedbackTrackIdRef.current = generatedTrack.id;
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [generatedTrack, hasPlayedGeneratedTrack, feedbackSubmitted, showFeedbackPrompt]);

  useEffect(() => {
    if (sharedContent && !sharedContentProcessed) {
      logger.info('[MusicGeneration] Received shared content from Share Intent', {
        contentLength: sharedContent.length,
      });
      setEntryContext({ content: sharedContent, id: null, chapterId: null, artworkUrl: null });
      setSharedContentProcessed(true);
      setSongGenerationExpanded(true);
    }
  }, [sharedContent, sharedContentProcessed, setEntryContext, setSongGenerationExpanded]);

  useEffect(() => {
    if (entryId && !entryIdProcessed) {
      logger.info('[MusicGeneration] Pre-selected entry from Book, waiting for data', { entryId });
      setSongGenerationExpanded(true);

      if (isDataReady && entries) {
        const entry = entries.find(e => e.id === entryId);

        if (!entry) {
          logger.warn('[MusicGeneration] Pre-selected entry not found in entries list', { entryId });
          toast({ title: t('create.errorLoadingEntry'), variant: 'destructive' });
          setEntryIdProcessed(true);
          return;
        }

        if (entry.chapterId && chapters.length > 0) {
          const chapter = chapters.find(ch => ch.id === entry.chapterId);
          if (chapter?.isLocked) {
            logger.warn('[MusicGeneration] Pre-selected entry is from a locked chapter', {
              entryId,
              chapterId: entry.chapterId,
            });
            toast({ title: t('create.entryFromLockedChapter'), variant: 'destructive' });
            setEntryIdProcessed(true);
            return;
          }
        }

        logger.info('[MusicGeneration] Pre-selected entry validated, navigation proceeding', { entryId });
      }
    }
  }, [entryId, entryIdProcessed, isDataReady, chapters, entries, toast, t, setSongGenerationExpanded]);

  const handleNavigatedToEntry = useCallback(() => {
    if (!entryIdProcessed) {
      logger.info('[MusicGeneration] EntryNavigator navigated to pre-selected entry', { entryId });
      setEntryIdProcessed(true);
    }
  }, [entryId, entryIdProcessed]);

  useEffect(() => {
    if (entryId && !entryIdProcessed && isDataReady) {
      const timeout = setTimeout(() => {
        if (!entryIdProcessed) {
          logger.warn('[MusicGeneration] Navigation to entry timed out after data ready', { entryId });
          toast({ title: t('create.errorLoadingEntry'), variant: 'destructive' });
          setEntryIdProcessed(true);
        }
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [entryId, entryIdProcessed, isDataReady, toast, t]);

  const handleFeedbackSubmitted = useCallback(
    (wasHelpful: boolean) => {
      setFeedbackSubmitted(true);
      setShowFeedbackPrompt(false);
      logger.info('[MusicGeneration] Feedback submitted', { wasHelpful, trackId: generatedTrack?.id });
    },
    [generatedTrack?.id]
  );

  const handleFeedbackDismiss = useCallback(() => {
    setFeedbackSubmitted(true);
    setShowFeedbackPrompt(false);
  }, []);

  const navigateToEntryId =
    entryIdProcessed || !isDataReady ? null : accessibleEntries.some(e => e.id === entryId) ? (entryId ?? null) : null;

  return {
    generationPhase,
    setGenerationPhase,
    sharedContentProcessed,
    entryIdProcessed,
    showFeedbackPrompt,
    feedbackSubmitted,
    handleFeedbackSubmitted,
    handleFeedbackDismiss,
    handleNavigatedToEntry,
    navigateToEntryId,
    currentTrack,
    isPlaying,
  };
}
