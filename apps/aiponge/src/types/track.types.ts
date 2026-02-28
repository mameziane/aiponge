/**
 * Track Type Definitions
 * Consolidated types for audio tracks across the application
 */

/**
 * Base track identity - minimal properties needed for playback
 */
export interface TrackIdentity {
  id: string;
  audioUrl: string;
  title?: string;
  artworkUrl?: string;
}

/**
 * Playable track - all properties needed for full playback experience
 * Use this as the constraint for playback hooks to eliminate `as any` casts
 */
export interface PlayableTrack extends TrackIdentity {
  title: string;
  displayName: string;
  duration: number;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
}

/**
 * Base track with common properties shared across all track types
 */
export interface BaseTrack extends TrackIdentity {
  title: string;
  displayName: string;
  duration: number;
  artworkUrl?: string;
  lyricsId?: string;
  hasSyncedLyrics?: boolean;
}

/**
 * Track in user's private music library (My Music)
 */
export interface MyMusicTrack extends BaseTrack {
  addedAt: string;
  isPrivate: boolean;
  isUserGenerated?: boolean;
  playOnDate?: string | null;
}

/**
 * Track in shared/public library
 */
export interface SharedTrack extends BaseTrack {
  genres?: string[];
  tags?: string[];
  playCount: number;
  addedAt: string;
}

/**
 * Track for display in explore/discovery sections
 */
export interface ExploreTrack extends BaseTrack {
  genres?: string[];
  playCount?: number;
  createdAt?: string;
}

/**
 * Repeat mode for playback controls
 */
export type RepeatMode = 'off' | 'one' | 'all';
