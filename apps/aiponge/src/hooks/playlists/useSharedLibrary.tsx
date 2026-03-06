import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { logger } from '../../lib/logger';
import { SUPPORTED_LANGUAGES } from '../../i18n/types';
import { formatTrackDuration, getNextTrack, getPreviousTrack } from '../../utils/trackUtils';
import { useTrackPlayback } from '../music/useTrackPlayback';
import { usePlaybackControls } from '../music/usePlaybackControls';
import { useSharedLibraryFilters } from './useSharedLibraryFilters';
import { useSharedLibraryData } from './useSharedLibraryData';
import { useSharedLibraryAdminActions } from './useSharedLibraryAdminActions';
import type { SharedTrack, Playlist, PlaylistsResponse } from '../../types';

export type { SharedTrack, Playlist, PlaylistsResponse };

let instanceCounter = 0;

export function useSharedLibrary() {
  const [instanceId] = useState(() => {
    instanceCounter++;
    const id = instanceCounter;
    logger.debug('useSharedLibrary hook instance mounted', { instanceId: id });
    return id;
  });

  useEffect(() => {
    return () => {
      logger.debug('useSharedLibrary hook instance unmounted', { instanceId });
    };
  }, [instanceId]);

  const {
    filters,
    setSearchQuery,
    setSelectedGenre,
    setSelectedLanguage,
    setSelectedPlaylistId,
    tracksQueryKey,
    tracksEndpoint,
  } = useSharedLibraryFilters();

  const { tracks, total, playlists, allGenres, allLanguages, isLoading, isFetching, isError } = useSharedLibraryData({
    tracksQueryKey,
    tracksEndpoint,
    selectedPlaylistId: filters.selectedPlaylistId,
    smartKey: filters.smartKey,
    instanceId,
  });

  const { shuffleEnabled, repeatMode, handleToggleShuffle, handleCycleRepeat } = usePlaybackControls();

  const { currentTrack, isPlaying, player, handlePlayTrack, pause, resume } = useTrackPlayback<SharedTrack>({
    shuffleEnabled,
    repeatMode,
    availableTracks: tracks,
  });

  const { handleDeleteTrack, isDeletingTrack } = useSharedLibraryAdminActions();

  // CRITICAL: Refs for values that change frequently but are only READ inside callbacks.
  // Same pattern as useMyMusic — prevents callback recreation on every PlaybackContext
  // update or React Query refetch, avoiding the "Maximum update depth exceeded" crash.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- tracks and currentTrack read via refs
  const handleNextTrack = useCallback(() => {
    const nextTrack = getNextTrack(tracksRef.current, currentTrackRef.current, shuffleEnabled, repeatMode);
    if (nextTrack) {
      handlePlayTrack(nextTrack);
    }
  }, [shuffleEnabled, repeatMode, handlePlayTrack]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- tracks and currentTrack read via refs
  const handlePreviousTrack = useCallback(() => {
    const prevTrack = getPreviousTrack(tracksRef.current, currentTrackRef.current, shuffleEnabled, repeatMode);
    if (prevTrack) {
      handlePlayTrack(prevTrack);
    }
  }, [shuffleEnabled, repeatMode, handlePlayTrack]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- currentTrack, tracks, isPlaying read via refs
  const handleTogglePlayPause = useCallback(() => {
    const curTrack = currentTrackRef.current;
    const curTracks = tracksRef.current;
    const playing = isPlayingRef.current;
    if (!curTrack && curTracks.length > 0) {
      handlePlayTrack(curTracks[0]);
    } else if (curTrack) {
      if (playing) {
        pause();
      } else {
        resume();
      }
    }
  }, [handlePlayTrack, pause, resume]);

  // Client-side filtering — works for all endpoint types (shared library, smart playlists, regular playlists)
  const filteredTracks = useMemo(() => {
    let result = tracks;
    if (filters.selectedGenre) {
      const genre = filters.selectedGenre.toLowerCase();
      result = result.filter(t => Array.isArray(t.genres) && t.genres.some(g => g.toLowerCase() === genre));
    }
    if (filters.selectedLanguage) {
      const langCode = filters.selectedLanguage.split('-')[0].toLowerCase();
      result = result.filter(t => {
        const trackLang = t.language;
        return trackLang && trackLang.split('-')[0].toLowerCase() === langCode;
      });
    }
    return result;
  }, [tracks, filters.selectedGenre, filters.selectedLanguage]);

  // Dynamic language options — only languages present in loaded tracks (mirrors allGenres)
  const languageOptions = useMemo(() => {
    return allLanguages
      .map(code => {
        const match = SUPPORTED_LANGUAGES.find(lang => lang.code.split('-')[0].toLowerCase() === code);
        return { code, name: match?.nativeLabel || code.toUpperCase() };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allLanguages]);

  return {
    tracks,
    filteredTracks,
    total,
    allGenres,
    languageOptions,
    playlists,
    searchQuery: filters.searchQuery,
    selectedGenre: filters.selectedGenre,
    selectedLanguage: filters.selectedLanguage,
    selectedPlaylistId: filters.selectedPlaylistId,
    currentTrack,
    isPlaying,
    isLoading,
    isFetching,
    isError,
    shuffleEnabled,
    repeatMode,
    handleToggleShuffle,
    handleCycleRepeat,
    handleNextTrack,
    handlePreviousTrack,
    handleTogglePlayPause,
    setSearchQuery,
    setSelectedGenre,
    setSelectedLanguage,
    setSelectedPlaylistId,
    handlePlayTrack,
    formatDuration: formatTrackDuration,
    hasNoTracks: tracks.length === 0,
    hasNoFilteredTracks: filteredTracks.length === 0 && tracks.length > 0,
    handleDeleteTrack,
    isDeletingTrack,
  };
}
