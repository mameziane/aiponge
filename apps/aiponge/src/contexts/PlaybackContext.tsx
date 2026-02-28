/**
 * Playback Context (Split Architecture)
 * Two independent contexts to prevent cross-domain re-renders:
 * - PlaybackStateContext: Currently playing track and playback status
 * - PlaybackQueueContext: Queue of tracks and playback context (album, playlist, creator)
 *
 * Exports hooks:
 * - usePlaybackState() — playback state fields only (re-renders only on state changes)
 * - usePlaybackQueue() — queue fields only (re-renders only on queue changes)
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useRef } from 'react';
import { logger } from '../lib/logger';
import { useTrackEndListener } from './AudioPlayerContext';

export interface PlaybackTrack {
  id: string;
  audioUrl: string;
  title?: string;
  displayName?: string;
  artworkUrl?: string;
  duration?: number;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
}

export type PlaybackPhase = 'idle' | 'buffering' | 'playing' | 'paused';

export interface QueueTrack {
  id: string;
  title: string;
  displayName?: string;
  artworkUrl?: string;
  audioUrl: string;
  duration?: number;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
}

export type QueueSourceType = 'album' | 'playlist' | 'creator' | 'library' | 'search' | 'single';

export interface QueueSource {
  type: QueueSourceType;
  id: string;
  title?: string;
}

export type RepeatMode = 'off' | 'one' | 'all';

type AutoAdvanceCallback = (track: QueueTrack) => Promise<void>;

export interface PlaybackStateFields {
  currentTrack: PlaybackTrack | null;
  isPlaying: boolean;
  playbackPhase: PlaybackPhase;
  setCurrentTrack: (track: PlaybackTrack | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackPhase: (phase: PlaybackPhase) => void;
  isCurrentTrack: (trackId: string) => boolean;
  updateCurrentTrackMetadata: (
    trackId: string,
    metadata: Partial<Pick<PlaybackTrack, 'title' | 'displayName' | 'artworkUrl'>>
  ) => void;
}

export interface PlaybackQueueFields {
  queue: QueueTrack[];
  queueSource: QueueSource | null;
  currentIndex: number;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  currentQueueTrack: QueueTrack | null;
  hasNext: boolean;
  hasPrevious: boolean;
  trackCount: number;
  setQueue: (tracks: QueueTrack[], source: QueueSource, startIndex?: number) => void;
  clearQueue: () => void;
  playTrackAtIndex: (index: number) => QueueTrack | null;
  next: () => QueueTrack | null;
  previous: () => QueueTrack | null;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  setShuffleEnabled: (enabled: boolean) => void;
  syncCurrentIndex: (trackId: string) => void;
  registerAutoAdvanceCallback: (callback: AutoAdvanceCallback) => () => void;
}

const PlaybackStateContext = createContext<PlaybackStateFields | null>(null);
const PlaybackQueueContext = createContext<PlaybackQueueFields | null>(null);

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrackState] = useState<PlaybackTrack | null>(null);
  const [playbackPhase, setPlaybackPhaseState] = useState<PlaybackPhase>('idle');

  const isPlaying = playbackPhase === 'playing' || playbackPhase === 'buffering';

  const isCurrentTrack = useCallback(
    (trackId: string) => {
      return currentTrack?.id === trackId;
    },
    [currentTrack]
  );

  const setCurrentTrack = useCallback((track: PlaybackTrack | null) => {
    logger.debug('PlaybackState setting current track', { title: track?.title, id: track?.id });
    setCurrentTrackState(track);
  }, []);

  const setPlaybackPhase = useCallback((phase: PlaybackPhase) => {
    logger.debug('PlaybackState setting playback phase', { phase });
    setPlaybackPhaseState(phase);
  }, []);

  const setIsPlaying = useCallback((playing: boolean) => {
    logger.debug('PlaybackState setting playing state', { playing });
    setPlaybackPhaseState(playing ? 'playing' : 'paused');
  }, []);

  const updateCurrentTrackMetadata = useCallback(
    (trackId: string, metadata: Partial<Pick<PlaybackTrack, 'title' | 'displayName' | 'artworkUrl'>>) => {
      setCurrentTrackState(prev => {
        if (!prev || prev.id !== trackId) return prev;
        logger.debug('PlaybackState updating current track metadata', { trackId, ...metadata });
        return { ...prev, ...metadata };
      });
    },
    []
  );

  const [queue, setQueueState] = useState<QueueTrack[]>([]);
  const [originalQueue, setOriginalQueue] = useState<QueueTrack[]>([]);
  const [queueSource, setQueueSource] = useState<QueueSource | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [shuffleEnabled, setShuffleEnabledState] = useState(false);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>('off');

  const originalIndexRef = useRef<number>(-1);

  const currentQueueTrack = useMemo(() => {
    if (currentIndex >= 0 && currentIndex < queue.length) {
      return queue[currentIndex];
    }
    return null;
  }, [queue, currentIndex]);

  const hasNext = useMemo(() => {
    if (repeatMode === 'all' && queue.length > 0) return true;
    return currentIndex < queue.length - 1;
  }, [currentIndex, queue.length, repeatMode]);

  const hasPrevious = useMemo(() => {
    if (repeatMode === 'all' && queue.length > 0) return true;
    return currentIndex > 0;
  }, [currentIndex, queue.length, repeatMode]);

  const trackCount = queue.length;

  const setQueue = useCallback(
    (tracks: QueueTrack[], source: QueueSource, startIndex = 0) => {
      const playableTracks = tracks.filter(t => t.audioUrl && t.audioUrl.trim() !== '');

      if (playableTracks.length === 0) {
        logger.warn('[PlaybackQueue] No playable tracks in queue (all missing audioUrl)');
        return;
      }

      const originalTrack = tracks[startIndex];
      let adjustedStartIndex = playableTracks.findIndex(t => t.id === originalTrack?.id);
      if (adjustedStartIndex < 0) adjustedStartIndex = 0;

      logger.debug('[PlaybackQueue] Setting queue', {
        trackCount: playableTracks.length,
        source,
        startIndex: adjustedStartIndex,
      });

      setOriginalQueue(playableTracks);
      setQueueSource(source);

      if (shuffleEnabled && playableTracks.length > 1) {
        const currentTrack = playableTracks[adjustedStartIndex];
        const otherTracks = playableTracks.filter((_, i) => i !== adjustedStartIndex);
        const shuffledOthers = shuffleArray(otherTracks);
        setQueueState([currentTrack, ...shuffledOthers]);
        setCurrentIndex(0);
        originalIndexRef.current = adjustedStartIndex;
      } else {
        setQueueState(playableTracks);
        setCurrentIndex(adjustedStartIndex);
        originalIndexRef.current = adjustedStartIndex;
      }
    },
    [shuffleEnabled]
  );

  const clearQueue = useCallback(() => {
    logger.debug('[PlaybackQueue] Clearing queue');
    setQueueState([]);
    setOriginalQueue([]);
    setQueueSource(null);
    setCurrentIndex(-1);
    originalIndexRef.current = -1;
  }, []);

  const playTrackAtIndex = useCallback(
    (index: number): QueueTrack | null => {
      if (index >= 0 && index < queue.length) {
        setCurrentIndex(index);
        logger.debug('[PlaybackQueue] Playing track at index', { index, trackId: queue[index].id });
        return queue[index];
      }
      return null;
    },
    [queue]
  );

  const next = useCallback((): QueueTrack | null => {
    if (queue.length === 0) return null;

    if (repeatMode === 'one') {
      logger.debug('[PlaybackQueue] Repeat one - staying on current track');
      return currentQueueTrack;
    }

    let nextIndex = currentIndex + 1;

    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
        logger.debug('[PlaybackQueue] Wrapping to start of queue');
      } else {
        logger.debug('[PlaybackQueue] End of queue reached');
        return null;
      }
    }

    setCurrentIndex(nextIndex);
    logger.debug('[PlaybackQueue] Next track', { nextIndex, trackId: queue[nextIndex].id });
    return queue[nextIndex];
  }, [queue, currentIndex, repeatMode, currentQueueTrack]);

  const previous = useCallback((): QueueTrack | null => {
    if (queue.length === 0) return null;

    if (repeatMode === 'one') {
      logger.debug('[PlaybackQueue] Repeat one - staying on current track');
      return currentQueueTrack;
    }

    let prevIndex = currentIndex - 1;

    if (prevIndex < 0) {
      if (repeatMode === 'all') {
        prevIndex = queue.length - 1;
        logger.debug('[PlaybackQueue] Wrapping to end of queue');
      } else {
        logger.debug('[PlaybackQueue] Start of queue reached');
        return null;
      }
    }

    setCurrentIndex(prevIndex);
    logger.debug('[PlaybackQueue] Previous track', { prevIndex, trackId: queue[prevIndex].id });
    return queue[prevIndex];
  }, [queue, currentIndex, repeatMode, currentQueueTrack]);

  const toggleShuffle = useCallback(() => {
    const newShuffleEnabled = !shuffleEnabled;
    setShuffleEnabledState(newShuffleEnabled);

    if (queue.length <= 1) {
      logger.debug('[PlaybackQueue] Shuffle toggled (no effect - single/empty queue)', {
        shuffleEnabled: newShuffleEnabled,
      });
      return;
    }

    if (newShuffleEnabled) {
      const currentTrack = queue[currentIndex];
      const otherTracks = queue.filter((_, i) => i !== currentIndex);
      const shuffledOthers = shuffleArray(otherTracks);
      setQueueState([currentTrack, ...shuffledOthers]);
      originalIndexRef.current = currentIndex;
      setCurrentIndex(0);
      logger.debug('[PlaybackQueue] Queue shuffled', { currentTrackId: currentTrack.id });
    } else {
      const currentTrack = queue[currentIndex];
      const originalIndex = originalQueue.findIndex(t => t.id === currentTrack.id);
      setQueueState(originalQueue);
      setCurrentIndex(originalIndex >= 0 ? originalIndex : 0);
      logger.debug('[PlaybackQueue] Queue unshuffled', { newIndex: originalIndex });
    }
  }, [shuffleEnabled, queue, currentIndex, originalQueue]);

  const cycleRepeat = useCallback(() => {
    setRepeatModeState(prev => {
      const next = prev === 'off' ? 'one' : prev === 'one' ? 'all' : 'off';
      logger.debug('[PlaybackQueue] Repeat mode changed', { from: prev, to: next });
      return next;
    });
  }, []);

  const setRepeatMode = useCallback((mode: RepeatMode) => {
    setRepeatModeState(mode);
    logger.debug('[PlaybackQueue] Repeat mode set', { mode });
  }, []);

  const setShuffleEnabled = useCallback(
    (enabled: boolean) => {
      if (enabled !== shuffleEnabled) {
        toggleShuffle();
      }
    },
    [shuffleEnabled, toggleShuffle]
  );

  const syncCurrentIndex = useCallback(
    (trackId: string) => {
      const index = queue.findIndex(t => t.id === trackId);
      if (index >= 0 && index !== currentIndex) {
        setCurrentIndex(index);
        logger.debug('[PlaybackQueue] Synced current index', { trackId, index });
      }
    },
    [queue, currentIndex]
  );

  const autoAdvanceCallbacks = useRef<Set<AutoAdvanceCallback>>(new Set());
  const isAdvancingRef = useRef(false);

  const registerAutoAdvanceCallback = useCallback((callback: AutoAdvanceCallback): (() => void) => {
    autoAdvanceCallbacks.current.add(callback);
    return () => {
      autoAdvanceCallbacks.current.delete(callback);
    };
  }, []);

  const handleTrackEnd = useCallback(async () => {
    if (isAdvancingRef.current) {
      logger.debug('[PlaybackQueue] Skipping re-entrant auto-advance call');
      return;
    }

    logger.debug('[PlaybackQueue] Track ended, checking auto-advance', {
      repeatMode,
      currentIndex,
      queueLength: queue.length,
    });

    isAdvancingRef.current = true;
    try {
      if (repeatMode === 'one') {
        const currentTrack = queue[currentIndex];
        if (currentTrack && currentTrack.audioUrl) {
          logger.debug('[PlaybackQueue] Repeat-one: replaying current track', { trackId: currentTrack.id });
          const callbacks = Array.from(autoAdvanceCallbacks.current);
          for (const cb of callbacks) {
            await cb(currentTrack);
          }
        }
        return;
      }

      let nextIndex = currentIndex + 1;

      if (nextIndex >= queue.length) {
        if (repeatMode === 'all') {
          nextIndex = 0;
          logger.debug('[PlaybackQueue] Auto-wrapping to start of queue');
        } else {
          logger.debug('[PlaybackQueue] End of queue, clearing mini player');
          setCurrentTrack(null);
          setPlaybackPhase('idle');
          return;
        }
      }

      const nextTrack = queue[nextIndex];
      if (nextTrack && nextTrack.audioUrl) {
        setCurrentIndex(nextIndex);
        logger.debug('[PlaybackQueue] Auto-advancing to track', { trackId: nextTrack.id, nextIndex });
        const callbacks = Array.from(autoAdvanceCallbacks.current);
        for (const cb of callbacks) {
          await cb(nextTrack);
        }
      }
    } finally {
      isAdvancingRef.current = false;
    }
  }, [queue, currentIndex, repeatMode, setCurrentTrack, setPlaybackPhase]);

  const handleSingleTrackEnd = useCallback(() => {
    logger.debug('[PlaybackQueue] Single track ended, clearing mini player');
    setCurrentTrack(null);
    setPlaybackPhase('idle');
  }, [setCurrentTrack, setPlaybackPhase]);

  useTrackEndListener(queue.length > 0 ? handleTrackEnd : handleSingleTrackEnd);

  const stateValue = useMemo<PlaybackStateFields>(
    () => ({
      currentTrack,
      isPlaying,
      playbackPhase,
      setCurrentTrack,
      setIsPlaying,
      setPlaybackPhase,
      isCurrentTrack,
      updateCurrentTrackMetadata,
    }),
    [
      currentTrack,
      isPlaying,
      playbackPhase,
      setCurrentTrack,
      setIsPlaying,
      setPlaybackPhase,
      isCurrentTrack,
      updateCurrentTrackMetadata,
    ]
  );

  const queueValue = useMemo<PlaybackQueueFields>(
    () => ({
      queue,
      queueSource,
      currentIndex,
      shuffleEnabled,
      repeatMode,
      currentQueueTrack,
      hasNext,
      hasPrevious,
      trackCount,
      setQueue,
      clearQueue,
      playTrackAtIndex,
      next,
      previous,
      toggleShuffle,
      cycleRepeat,
      setRepeatMode,
      setShuffleEnabled,
      syncCurrentIndex,
      registerAutoAdvanceCallback,
    }),
    [
      queue,
      queueSource,
      currentIndex,
      shuffleEnabled,
      repeatMode,
      currentQueueTrack,
      hasNext,
      hasPrevious,
      trackCount,
      setQueue,
      clearQueue,
      playTrackAtIndex,
      next,
      previous,
      toggleShuffle,
      cycleRepeat,
      setRepeatMode,
      setShuffleEnabled,
      syncCurrentIndex,
      registerAutoAdvanceCallback,
    ]
  );

  return (
    <PlaybackStateContext.Provider value={stateValue}>
      <PlaybackQueueContext.Provider value={queueValue}>{children}</PlaybackQueueContext.Provider>
    </PlaybackStateContext.Provider>
  );
}

export function usePlaybackState(): PlaybackStateFields {
  const context = useContext(PlaybackStateContext);
  if (!context) {
    throw new Error('usePlaybackState must be used within PlaybackProvider');
  }
  return context;
}

export function usePlaybackQueue(): PlaybackQueueFields {
  const context = useContext(PlaybackQueueContext);
  if (!context) {
    throw new Error('usePlaybackQueue must be used within PlaybackProvider');
  }
  return context;
}

export { type AutoAdvanceCallback };
