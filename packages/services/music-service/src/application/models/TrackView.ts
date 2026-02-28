/**
 * Track Read Model - Denormalized view for use cases
 * Contains flattened/joined data optimized for presentation layer
 */

import { type ContentVisibility } from '@aiponge/shared-contracts';

export interface TrackView {
  // Core track data
  id: string;
  title: string;

  // User/creator data (albums/tracks now use userId directly)
  userId: string;
  displayName: string; // Display name (stored in metadata or default)

  // Denormalized album data (resolved from Album VO)
  albumId?: string;
  albumName?: string;

  // Simplified duration (converted from Duration VO to seconds)
  durationSec?: number;

  // Flattened metadata
  fileUrl: string;
  genre: string[]; // Simplified from Genre VO array
  tags: string[];
  isrc?: string;
  status: string; // Simplified from TrackStatus enum

  // Audio metadata (flattened from AudioMetadata VO)
  bitrate?: number;
  sampleRate?: number;
  format?: string;
  quality?: string;
  fileSize?: number;

  // Timestamps
  releaseDate?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Statistics (commonly needed by use cases)
  playCount: number;
  likeCount: number;
  lastPlayedAt?: Date;
}

export interface PlaylistTrackView extends TrackView {
  // Additional playlist-specific data
  position: number;
  addedAt: Date;
  addedBy: string;
}

export interface TrackSearchResult {
  tracks: TrackView[];
  total: number;
  offset: number;
  limit: number;
}

export interface PlaylistView {
  // Core playlist data
  id: string;
  name: string;
  description?: string;
  visibility: ContentVisibility;

  // User data (denormalized)
  userId: string;
  userName?: string;

  // Track data (denormalized)
  tracks: PlaylistTrackView[];
  trackCount: number;
  totalDurationSec: number;

  // Metadata
  artworkUrl?: string;
  tags: string[];

  // Statistics
  playCount: number;
  likeCount: number;
  followerCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastPlayedAt?: Date;
}
