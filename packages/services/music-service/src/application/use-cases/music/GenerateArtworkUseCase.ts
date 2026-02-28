/**
 * GenerateArtworkUseCase - Generates album artwork from song lyrics
 * Uses centralized ai-content-service for image generation
 * Delegates to AIContentServiceClient which handles template execution and storage
 */

import { getLogger } from '@config/service-urls';
import {
  AIContentServiceClient,
  type GenerateAlbumArtworkRequest,
} from '@infrastructure/clients/AIContentServiceClient';
import { CONTENT_VISIBILITY, type ContentVisibility } from '@aiponge/shared-contracts';
import { getServiceRegistry } from '@infrastructure/ServiceFactory';

const logger = getLogger('music-service-generateartworkusecase');

export interface GenerateArtworkRequest {
  lyrics: string;
  title: string;
  style?: string;
  genre?: string;
  mood?: string;
  culturalStyle?: string;
  userId?: string;
  visibility?: ContentVisibility;
}

export interface GenerateArtworkResult {
  success: boolean;
  artworkUrl?: string;
  revisedPrompt?: string;
  error?: string;
  processingTimeMs?: number;
  templateUsed?: string;
}

export class GenerateArtworkUseCase {
  private readonly aiContentClient: AIContentServiceClient;

  constructor() {
    this.aiContentClient = getServiceRegistry().aiContentClient as AIContentServiceClient;
  }

  async execute(request: GenerateArtworkRequest): Promise<GenerateArtworkResult> {
    const startTime = Date.now();

    logger.info('Starting artwork generation via centralized service', {
      title: request.title,
      visibility: request.visibility || CONTENT_VISIBILITY.PERSONAL,
      hasUserId: !!request.userId,
    });

    try {
      const clientRequest: GenerateAlbumArtworkRequest = {
        title: request.title,
        lyrics: request.lyrics,
        style: request.style,
        genre: request.genre,
        mood: request.mood,
        culturalStyle: request.culturalStyle,
        userId: request.userId,
        visibility: request.visibility,
      };

      const result = await this.aiContentClient.generateAlbumArtwork(clientRequest);

      const processingTimeMs = Date.now() - startTime;

      if (result.success && result.artworkUrl) {
        logger.info('Artwork generated successfully', {
          artworkUrl: result.artworkUrl.substring(0, 60),
          templateUsed: result.templateUsed,
          processingTimeMs,
        });

        return {
          success: true,
          artworkUrl: result.artworkUrl,
          revisedPrompt: result.revisedPrompt,
          templateUsed: result.templateUsed,
          processingTimeMs,
        };
      }

      logger.warn('Artwork generation failed', {
        error: result.error,
        processingTimeMs,
      });

      return {
        success: false,
        error: result.error || 'Failed to generate artwork',
        processingTimeMs,
        templateUsed: result.templateUsed,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      logger.error('Artwork generation error', {
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown artwork generation error',
        processingTimeMs,
      };
    }
  }
}
