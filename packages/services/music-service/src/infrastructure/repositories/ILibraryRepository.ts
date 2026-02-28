/**
 * Library Repository Interface
 * Defines contract for user library data access operations
 */

// NOTE: UserLibrary interface removed (Feb 2026) - stats computed on-the-fly

export interface FavoriteTrack {
  id: string;
  userId: string;
  trackId: string;
  addedAt: string;
  playCount: number | null;
  lastPlayedAt: string | null;
  rating: number | null;
  notes: string | null;
  tags: unknown;
}

export interface FavoriteAlbum {
  id: string;
  userId: string;
  albumId: string;
  addedAt: string;
  playCount: number | null;
  lastPlayedAt: string | null;
  rating: number | null;
  completionRate: string | null;
  favoriteTrackIds: unknown;
}

export interface RecentlyPlayedTrack {
  id: string;
  userId: string;
  trackId: string;
  albumId: string | null;
  playedAt: string;
  duration: number | null;
  completionRate: string | null;
  context: unknown;
  deviceType: string | null;
  sessionId: string | null;
}

export interface ILibraryRepository {
  // NOTE: UserLibrary CRUD operations removed (Feb 2026) - stats computed on-the-fly

  // Favorite Tracks Operations
  getFavoriteTracks(userId: string, limit?: number, offset?: number): Promise<FavoriteTrack[]>;
  addFavoriteTrack(userId: string, trackId: string): Promise<FavoriteTrack>;
  removeFavoriteTrack(userId: string, trackId: string): Promise<boolean>;
  isFavoriteTrack(userId: string, trackId: string): Promise<boolean>;
  updateTrackRating(userId: string, trackId: string, rating: number): Promise<void>;

  // Favorite Albums Operations
  getFavoriteAlbums(userId: string, limit?: number, offset?: number): Promise<FavoriteAlbum[]>;
  addFavoriteAlbum(userId: string, albumId: string): Promise<FavoriteAlbum>;
  removeFavoriteAlbum(userId: string, albumId: string): Promise<boolean>;
  isFavoriteAlbum(userId: string, albumId: string): Promise<boolean>;

  // Recently Played Operations
  getRecentlyPlayed(userId: string, limit?: number): Promise<RecentlyPlayedTrack[]>;
  addRecentlyPlayed(track: Omit<RecentlyPlayedTrack, 'id' | 'playedAt'>): Promise<void>;
  clearRecentlyPlayed(userId: string): Promise<void>;

  // Favorite Track Engagement
  updateFavoriteTrackTags(userId: string, trackId: string, tags: string[]): Promise<void>;

  // Favorite Album Engagement
  updateFavoriteAlbumEngagement(userId: string, albumId: string): Promise<void>;

  // Library Statistics
  getLibraryStats(userId: string): Promise<{
    totalTracks: number;
    totalAlbums: number;
    totalPlayTime: number;
  }>;
}
