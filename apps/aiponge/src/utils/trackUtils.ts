/**
 * Track Utilities - Shared transformation functions for track data
 * Used by both Library (MyMusicPage) and Explore (SharedLibraryPage)
 */

import { getRelativeTimeString } from './timeUtils';
import { normalizeMediaUrl } from '../lib/apiConfig';
import type { PlayableTrack } from '../types';
import { CONFIG } from '../constants/appConfig';

/**
 * Input type for building a PlayableTrack - accepts various track formats
 */
interface TrackLike {
  id: string;
  audioUrl?: string | null;
  title?: string | null;
  displayName?: string | null;
  artworkUrl?: string | null;
  duration?: number;
  lyricsId?: string | null;
  hasSyncedLyrics?: boolean;
}

/**
 * Builds a standardized PlayableTrack with normalized URLs and required defaults
 * This helper ensures consistent artwork/audio URL handling across the app
 *
 * @param track - Track object from any source (API response, local state, etc.)
 * @returns PlayableTrack with normalized URLs ready for playback, or null if no audio URL
 */
export function buildPlaybackTrack(track: TrackLike): PlayableTrack | null {
  const normalizedAudioUrl = normalizeMediaUrl(track.audioUrl);

  if (!normalizedAudioUrl) {
    return null;
  }

  return {
    id: track.id,
    audioUrl: normalizedAudioUrl,
    title: track.title || 'Unknown Track',
    displayName: track.displayName || CONFIG.app.defaultDisplayName,
    artworkUrl: normalizeMediaUrl(track.artworkUrl) || undefined,
    duration: track.duration || 0,
    lyricsId: track.lyricsId || undefined,
    hasSyncedLyrics: track.hasSyncedLyrics,
  };
}

/**
 * Converts an array of track-like objects to PlayableTrack format
 * Filters out tracks without audio URLs
 */
export function buildPlaybackTracks(tracks: TrackLike[]): PlayableTrack[] {
  return tracks.map(buildPlaybackTrack).filter((track): track is PlayableTrack => track !== null);
}

/**
 * Formats track duration from seconds to MM:SS format
 * Handles missing, null, or invalid durations gracefully
 */
export function formatTrackDuration(durationInSeconds?: number | null): string {
  // Handle missing or invalid duration
  if (!durationInSeconds || durationInSeconds <= 0 || !Number.isFinite(durationInSeconds)) {
    return '--:--';
  }

  const minutes = Math.floor(durationInSeconds / 60);
  const seconds = Math.floor(durationInSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Builds relative timestamp string from ISO date
 * Examples: "just now", "5 min ago", "2 days ago"
 */
export function buildRelativeTimestamp(isoDateString: string): string {
  return getRelativeTimeString(isoDateString);
}

/**
 * Extracts artwork statistics from a track collection
 * Useful for debugging and logging
 */
export function getArtworkStats<T extends { artworkUrl?: string }>(
  tracks: T[]
): {
  totalTracks: number;
  withArtwork: number;
  withoutArtwork: number;
} {
  return {
    totalTracks: tracks.length,
    withArtwork: tracks.filter(t => t.artworkUrl).length,
    withoutArtwork: tracks.filter(t => !t.artworkUrl).length,
  };
}

/**
 * Shuffles an array using Fisher-Yates algorithm
 * Returns a new shuffled array without modifying the original
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

type Direction = 'next' | 'previous';

function getAdjacentTrack<T extends { id: string }>(
  tracks: T[],
  currentTrack: T | null,
  shuffleEnabled: boolean,
  repeatMode: 'off' | 'one' | 'all',
  direction: Direction
): T | null {
  if (tracks.length === 0) return null;
  if (repeatMode === 'one' && currentTrack) return currentTrack;

  const fallbackTrack = direction === 'next' ? tracks[0] : tracks[tracks.length - 1];

  if (!currentTrack) {
    return shuffleEnabled ? shuffleArray(tracks)[0] : fallbackTrack;
  }

  const currentIndex = tracks.findIndex(t => t.id === currentTrack.id);
  if (currentIndex === -1) {
    return shuffleEnabled ? shuffleArray(tracks)[0] : fallbackTrack;
  }

  if (shuffleEnabled) {
    const otherTracks = tracks.filter(t => t.id !== currentTrack.id);
    if (otherTracks.length === 0) {
      return repeatMode === 'all' ? currentTrack : null;
    }
    return otherTracks[Math.floor(Math.random() * otherTracks.length)];
  }

  const adjacentIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  const isOutOfBounds = direction === 'next' ? adjacentIndex >= tracks.length : adjacentIndex < 0;

  if (isOutOfBounds) {
    return repeatMode === 'all' ? fallbackTrack : null;
  }

  return tracks[adjacentIndex];
}

/**
 * Gets the previous track to play based on current state and playback modes
 */
export function getPreviousTrack<T extends { id: string }>(
  tracks: T[],
  currentTrack: T | null,
  shuffleEnabled: boolean,
  repeatMode: 'off' | 'one' | 'all'
): T | null {
  return getAdjacentTrack(tracks, currentTrack, shuffleEnabled, repeatMode, 'previous');
}

/**
 * Gets the next track to play based on current state and playback modes
 */
export function getNextTrack<T extends { id: string }>(
  tracks: T[],
  currentTrack: T | null,
  shuffleEnabled: boolean,
  repeatMode: 'off' | 'one' | 'all'
): T | null {
  return getAdjacentTrack(tracks, currentTrack, shuffleEnabled, repeatMode, 'next');
}
