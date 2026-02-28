/**
 * Music Service - Types and Exports Index
 * Central export for music catalog, streaming, and intelligence
 */

import { type ContentVisibility } from '@aiponge/shared-contracts';

// Server exports
export { ServerSetup } from './infrastructure/server/ServerSetup';

// Domain exports
export { TrackEntity as Song } from './domains/music-catalog/entities/Track';
export { Album } from './domains/music-catalog/value-objects/Album';
export { PlaylistEntity as Playlist } from './domains/music-catalog/entities/Playlist';

// Service exports
export { MusicCatalogApplicationService as CatalogService } from './application/services/MusicCatalogApplicationService';
export { PlaylistService } from './application/services/PlaylistService';
export { StreamingService } from './application/services/StreamingService';
export { LibraryOperationsService as LibraryService } from './application/services/LibraryOperationsService';
export { OrchestrationService } from './application/services/OrchestrationService';

// Types
export interface MusicTrack {
  id: string;
  title: string;
  displayName: string;
  album?: string;
  duration: number;
  genre: string[];
  mood: string[];
  energy: number;
  valence: number;
  url?: string;
}

export interface PlaylistRequest {
  name: string;
  description?: string;
  visibility: ContentVisibility;
  tags?: string[];
  mood?: string;
  genre?: string[];
}

export interface MusicRecommendation {
  tracks: MusicTrack[];
  reasoning: string;
  confidence: number;
  basedOn: string[];
}

export interface StreamingSession {
  userId: string;
  trackId: string;
  startedAt: Date;
  duration: number;
  completed: boolean;
  source: 'search' | 'playlist' | 'recommendation';
}
