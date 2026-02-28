/**
 * Playlist Repository Interface - Centralized Domain Contract
 * Single source of truth for playlist data access operations
 */

import { type ContentVisibility } from '@aiponge/shared-contracts';
import { PlaylistEntity } from '../entities/Playlist';

export interface PlaylistTrack {
  songId: string;
  title: string;
  displayName: string; // Display name for the track creator
  albumName: string;
  position: number;
  addedAt: Date;
  addedBy: string;
}

export interface UpdatePlaylistRequest {
  playlistId: string;
  name?: string;
  description?: string;
  visibility?: ContentVisibility;
  tracks?: PlaylistTrack[];
}

export interface PlaylistStats {
  totalPlaylists: number;
  totalTracks: number;
  totalFollowers: number;
  averagePlaylistLength: number;
  mostPopularGenre: string;
}

export interface IPlaylistRepository {
  // Basic CRUD operations (canonical methods)
  create(playlist: PlaylistEntity): Promise<PlaylistEntity>;
  findById(id: string): Promise<PlaylistEntity | null>;
  update(playlist: PlaylistEntity): Promise<PlaylistEntity>;
  delete(id: string): Promise<void>;

  // User playlist queries
  findByUserId(userId: string, limit?: number, offset?: number): Promise<PlaylistEntity[]>;
  findPublicPlaylists(limit?: number, offset?: number): Promise<PlaylistEntity[]>;
  searchPlaylists(query: string, limit?: number, offset?: number): Promise<PlaylistEntity[]>;

  // Track management
  addTrackToPlaylist(playlistId: string, trackId: string, position?: number): Promise<void>;
  removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void>;
  getPlaylistTracks(playlistId: string): Promise<string[]>;
  updatePlaylistOrder(playlistId: string, trackOrders: { trackId: string; position: number }[]): Promise<void>;

  // Additional methods for complex operations
  getFollowedPlaylists(userId: string, limit?: number, offset?: number): Promise<PlaylistEntity[]>;
  updatePlaylist(request: UpdatePlaylistRequest): Promise<PlaylistEntity>;
}
