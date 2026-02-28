import { useState, useEffect } from 'react';
import { logger } from '../../lib/logger';
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
    languageOptions,
  } = useSharedLibraryFilters();

  const { tracks, total, playlists, allGenres, isLoading, isFetching, isError } = useSharedLibraryData({
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

  const handleNextTrack = () => {
    const nextTrack = getNextTrack(tracks, currentTrack, shuffleEnabled, repeatMode);
    if (nextTrack) {
      handlePlayTrack(nextTrack);
    }
  };

  const handlePreviousTrack = () => {
    const prevTrack = getPreviousTrack(tracks, currentTrack, shuffleEnabled, repeatMode);
    if (prevTrack) {
      handlePlayTrack(prevTrack);
    }
  };

  const handleTogglePlayPause = () => {
    if (!currentTrack && tracks.length > 0) {
      handlePlayTrack(tracks[0]);
    } else if (currentTrack) {
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    }
  };

  const filteredTracks = tracks;

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
