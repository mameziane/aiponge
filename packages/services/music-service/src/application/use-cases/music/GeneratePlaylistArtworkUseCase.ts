/**
 * GeneratePlaylistArtworkUseCase - Generates artwork for playlists
 * Uses centralized ai-content-service for image generation
 * Delegates to AIContentServiceClient which handles template execution and storage
 */

import { getLogger } from '@config/service-urls';
import {
  AIContentServiceClient,
  type GeneratePlaylistArtworkRequest as ClientRequest,
} from '@infrastructure/clients/AIContentServiceClient';
import { getServiceRegistry } from '@infrastructure/ServiceFactory';

const logger = getLogger('music-service-generateplaylistartwork');

export interface GeneratePlaylistArtworkRequest {
  playlistName: string;
  description?: string;
  mood?: string;
  genre?: string;
  trackCount?: number;
  playlistId: string;
}

export interface GeneratePlaylistArtworkResult {
  success: boolean;
  artworkUrl?: string;
  revisedPrompt?: string;
  error?: string;
  processingTimeMs?: number;
}

export class GeneratePlaylistArtworkUseCase {
  private readonly aiContentClient: AIContentServiceClient;

  constructor() {
    this.aiContentClient = getServiceRegistry().aiContentClient as AIContentServiceClient;
  }

  async execute(request: GeneratePlaylistArtworkRequest): Promise<GeneratePlaylistArtworkResult> {
    const startTime = Date.now();

    logger.info('Starting playlist artwork generation via centralized service', {
      playlistName: request.playlistName,
      playlistId: request.playlistId,
    });

    try {
      const clientRequest: ClientRequest = {
        playlistName: request.playlistName,
        description: request.description,
        mood: request.mood,
        genre: request.genre,
        trackCount: request.trackCount,
        playlistId: request.playlistId,
      };

      const result = await this.aiContentClient.generatePlaylistArtwork(clientRequest);

      const processingTimeMs = Date.now() - startTime;

      if (result.success && result.artworkUrl) {
        logger.info('Playlist artwork generated successfully', {
          playlistName: request.playlistName,
          artworkUrl: result.artworkUrl.substring(0, 60),
          processingTimeMs,
        });

        return {
          success: true,
          artworkUrl: result.artworkUrl,
          revisedPrompt: result.revisedPrompt,
          processingTimeMs,
        };
      }

      logger.warn('Playlist artwork generation failed', {
        error: result.error,
        processingTimeMs,
      });

      return {
        success: false,
        error: result.error || 'Failed to generate playlist artwork',
        processingTimeMs,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      logger.error('Playlist artwork generation error', {
        error: error instanceof Error ? error.message : String(error),
        playlistName: request.playlistName,
        processingTimeMs,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown playlist artwork generation error',
        processingTimeMs,
      };
    }
  }
}
