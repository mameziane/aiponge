import type { ContentVisibility, ImageType } from '@aiponge/shared-contracts';

export interface GenerateContentRequest {
  templateId: string;
  contentType: 'therapeutic' | 'creative' | 'analysis' | 'music';
  variables: Record<string, unknown>;
  options?: {
    userId?: string;
    maxLength?: number;
    temperature?: number;
    fallbackToDefault?: boolean;
  };
}

export interface GenerateContentResponse {
  success: boolean;
  content?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  processingTimeMs?: number;
}

export interface GenerateAlbumArtworkRequest {
  title: string;
  lyrics: string;
  style?: string;
  genre?: string;
  mood?: string;
  culturalStyle?: string;
  userId?: string;
  visibility?: ContentVisibility;
}

export interface GeneratePlaylistArtworkRequest {
  playlistName: string;
  description?: string;
  mood?: string;
  genre?: string;
  trackCount?: number;
  playlistId: string;
  userId?: string;
}

export interface GenerateArtworkResponse {
  success: boolean;
  artworkUrl?: string;
  revisedPrompt?: string;
  templateUsed?: string;
  processingTimeMs?: number;
  error?: string;
}

export interface IAIContentServiceClient {
  generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse>;

  isHealthy(): Promise<boolean>;

  generateAlbumArtwork(request: GenerateAlbumArtworkRequest): Promise<GenerateArtworkResponse>;

  generatePlaylistArtwork(request: GeneratePlaylistArtworkRequest): Promise<GenerateArtworkResponse>;
}
