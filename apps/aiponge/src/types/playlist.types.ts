/**
 * Playlist Type Definitions
 * Consolidated types for playlists across the application
 */

import type { IconName } from './ui.types';
import type { ContentVisibility, ServiceResponse } from '@aiponge/shared-contracts';

/**
 * Playlist entity with track count and metadata
 * Note: Backend may return 'name' or 'title' depending on the endpoint
 * - /api/playlists/public/all returns 'name' (from Drizzle ORM)
 * - /api/app/explore/feed returns 'title' (from SQL alias)
 */
export interface Playlist {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  totalTracks: number;
  artworkUrl?: string;
  category?: string;
  playlistType?: 'manual' | 'smart' | 'hybrid';
  isSystem?: boolean;
  icon?: IconName;
  color?: string;
  smartKey?: string;
  computedTrackCount?: number;
  visibility?: ContentVisibility;
  userId?: string;
  userName?: string;
}

/**
 * Smart playlist with computed track count
 */
export interface SmartPlaylist extends Playlist {
  playlistType: 'smart';
  isSystem: true;
  smartKey: string;
  icon: IconName;
  color: string;
  computedTrackCount: number;
}

/**
 * Smart playlist definition from backend
 */
export interface SmartPlaylistDefinition {
  smartKey: string;
  name: string;
  icon: IconName;
  color: string;
}

/**
 * Track in a smart playlist
 */
export interface SmartPlaylistTrack {
  id: string;
  title: string;
  displayName: string | null;
  fileUrl: string;
  artworkUrl?: string;
  durationSeconds: number;
  createdAt: string;
  mood?: string;
  playCount?: number;
}

export type PlaylistsResponse = ServiceResponse<{
  playlists: Playlist[];
  total: number;
}>;

export type SmartPlaylistsResponse = ServiceResponse<{
  playlists: SmartPlaylist[];
  total: number;
  definitions: SmartPlaylistDefinition[];
}>;

export type SmartPlaylistTracksResponse = ServiceResponse<{
  tracks: SmartPlaylistTrack[];
  total: number;
}>;
