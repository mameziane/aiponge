/**
 * GenerateImageUseCase - Centralized image generation for all AI-generated artwork
 * Migrated from music-service GenerateArtworkUseCase for unified image generation
 * Supports: album artwork, playlist artwork, book cover artwork
 */

import { getLogger } from '../../config/service-urls';
import { StorageServiceClient } from '../../infrastructure/clients/StorageServiceClient';
import { TemplateEngineServiceClient } from '../../infrastructure/clients/TemplateEngineServiceClient';
import { ProvidersServiceClient } from '../../infrastructure/clients/ProvidersServiceClient';
import { ImageError } from '../errors';
import {
  type ImageType,
  type ContentVisibility,
  CONTENT_VISIBILITY,
  isContentPubliclyAccessible,
} from '@aiponge/shared-contracts';

const logger = getLogger('ai-content-service-generateimageusecase');

export type { ImageType, ContentVisibility };

export interface GenerateImageRequest {
  imageType: ImageType;
  variables: Record<string, string | number | undefined>;
  userId?: string;
  visibility?: ContentVisibility;
  destinationPath?: string;
}

export interface GenerateImageResult {
  success: boolean;
  artworkUrl?: string;
  revisedPrompt?: string;
  error?: string;
  processingTimeMs?: number;
  templateUsed?: string;
}

export class GenerateImageUseCase {
  private readonly storageServiceClient: StorageServiceClient;
  private readonly templateServiceClient: TemplateEngineServiceClient;
  private readonly providersClient: ProvidersServiceClient;

  constructor() {
    this.storageServiceClient = new StorageServiceClient();
    this.templateServiceClient = new TemplateEngineServiceClient();
    this.providersClient = new ProvidersServiceClient();
  }

  async execute(request: GenerateImageRequest): Promise<GenerateImageResult> {
    const startTime = Date.now();
    const imageId = `image-${Date.now()}`;

    const isSharedContent = isContentPubliclyAccessible(request.visibility);

    logger.info('Starting image generation', {
      imageId,
      imageType: request.imageType,
      visibility: request.visibility,
      hasUserId: !!request.userId,
    });

    try {
      const promptResult = await this.getImagePromptFromTemplate(request);

      if (!promptResult.prompt || promptResult.prompt.length === 0) {
        const error = ImageError.promptGenerationFailed(request.imageType, 'Template returned empty prompt');
        logger.error('Template execution returned empty prompt', {
          imageId,
          imageType: request.imageType,
          templateUsed: promptResult.templateUsed,
          errorName: error.name,
        });
        return {
          success: false,
          error: error.message,
          processingTimeMs: Date.now() - startTime,
          templateUsed: promptResult.templateUsed,
        };
      }

      const imagePrompt = promptResult.prompt;
      const templateUsed = promptResult.templateUsed;

      logger.info('Calling image provider for generation', {
        imageId,
        promptLength: imagePrompt.length,
      });
      const imageResult = await this.generateImage(imagePrompt);

      if (!imageResult.success || !imageResult.artworkUrl) {
        const processingTimeMs = Date.now() - startTime;
        const error = ImageError.providerFailed('image-provider', imageResult.error || 'No image URL returned');
        logger.error('IMAGE GENERATION FAILED', {
          error: error.message,
          errorName: error.name,
          originalError: imageResult.error,
          imageId,
          processingTimeMs,
        });
        return {
          success: false,
          error: error.message,
          processingTimeMs,
          templateUsed,
        };
      }

      const generatedBy = imageResult.metadata?.originalProviderId || 'openai-dalle';
      const isBase64Response = imageResult.metadata?.isBase64 === true;

      logger.info('Image generated successfully', {
        imageId,
        generatedBy,
        isBase64Response,
      });

      const destinationPath = request.destinationPath || this.getDestinationPath(request);

      logger.info('Storing image', {
        destinationPath,
        isSharedContent,
        isBase64Response,
        imageId,
      });

      const storageResult = await this.storageServiceClient.downloadFromExternalUrl({
        taskId: imageId,
        externalUrl: imageResult.artworkUrl,
        metadata: {
          type: request.imageType,
          ...request.variables,
          generatedBy,
          templateUsed,
          userId: request.userId,
          visibility: request.visibility ?? CONTENT_VISIBILITY.PERSONAL,
          isSharedContent,
          isBase64Source: isBase64Response,
        },
        destinationPath,
      });

      logger.info('Storage service response', {
        success: storageResult.success,
        hasFilePath: !!storageResult.filePath,
        filePath: storageResult.filePath?.substring(0, 100),
        error: storageResult.error,
      });

      if (!storageResult.success || !storageResult.filePath) {
        const processingTimeMs = Date.now() - startTime;
        const error = ImageError.storageFailed('upload', storageResult.error || 'No file path returned');
        logger.error('STORAGE SERVICE FAILED TO SAVE IMAGE', {
          error: error.message,
          errorName: error.name,
          originalError: storageResult.error,
          success: storageResult.success,
          hasFilePath: !!storageResult.filePath,
          destinationPath,
        });
        return {
          success: false,
          error: error.message,
          processingTimeMs,
          templateUsed,
        };
      }

      const processingTimeMs = Date.now() - startTime;

      logger.info('Image generated and stored', {
        filePath: storageResult.filePath,
        templateUsed,
        processingTimeMs,
      });

      return {
        success: true,
        artworkUrl: storageResult.filePath,
        revisedPrompt: imageResult.revisedPrompt,
        processingTimeMs,
        templateUsed,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const wrappedError =
        error instanceof ImageError
          ? error
          : ImageError.internalError(
              error instanceof Error ? error.message : 'Unknown image generation error',
              error instanceof Error ? error : undefined
            );

      logger.error('Image generation error', {
        error: wrappedError.message,
        errorName: wrappedError.name,
        imageId,
        imageType: request.imageType,
        processingTimeMs,
        stack: wrappedError.stack,
      });

      return {
        success: false,
        error: wrappedError.message,
        processingTimeMs,
      };
    }
  }

  private getDestinationPath(request: GenerateImageRequest): string {
    const folder = 'artworks';
    if (!request.userId) {
      throw ImageError.userIdRequired();
    }
    return `user/${request.userId}/${folder}`;
  }

  private async getImagePromptFromTemplate(request: GenerateImageRequest): Promise<{
    prompt: string;
    templateUsed: string;
  }> {
    const templateResult = await this.templateServiceClient.executeArtworkTemplate({
      templateId: request.imageType,
      variables: this.normalizeVariables(request.variables),
    });

    if (templateResult.success && templateResult.prompt) {
      return {
        prompt: templateResult.prompt,
        templateUsed: templateResult.templateUsed,
      };
    }

    logger.warn('Template execution failed, using fallback prompt', {
      templateId: request.imageType,
      error: templateResult.error,
    });

    return {
      prompt: this.generateFallbackPrompt(request),
      templateUsed: 'fallback-no-text',
    };
  }

  private normalizeVariables(
    variables: Record<string, string | number | undefined>
  ): Record<string, string | undefined> {
    const normalized: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(variables)) {
      normalized[key] = value !== undefined ? String(value) : undefined;
    }
    return normalized;
  }

  private generateFallbackPrompt(request: GenerateImageRequest): string {
    const noTextInstruction =
      'CRITICAL INSTRUCTION: ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY, NO WRITING, NO NUMBERS, NO CHARACTERS OF ANY KIND IN THE IMAGE.';

    const title = request.variables.title || request.variables.playlist_name || 'Untitled';
    const mood = request.variables.mood || 'peaceful';
    const style = request.variables.style || 'modern digital art';

    return `${noTextInstruction}

Modern, professional ${request.imageType.replace('-artwork', ' cover')} artwork for "${title}" with a ${mood} aesthetic in ${style} style.
Create an abstract, artistic composition with a cohesive color palette.
Focus on visual elements only - shapes, colors, gradients, and artistic patterns. No text elements whatsoever.`;
  }

  private async generateImage(prompt: string): Promise<{
    success: boolean;
    artworkUrl?: string;
    revisedPrompt?: string;
    metadata?: Record<string, unknown>;
    error?: string;
  }> {
    // Only add no-text instruction if the template prompt doesn't already contain it
    const hasNoTextInstruction = prompt.toLowerCase().includes('no text');
    const finalPrompt = hasNoTextInstruction ? prompt : `NO TEXT in image. ${prompt}`;

    logger.info('Generating image via centralized ProviderProxy', {
      promptLength: finalPrompt.length,
    });

    const result = await this.providersClient.generateImage({
      prompt: finalPrompt.substring(0, 1000),
      parameters: {
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
      },
    });

    if (result.success && result.artworkUrl) {
      logger.info('Image generated successfully via ProviderProxy', {
        artworkUrl: result.artworkUrl.substring(0, 60),
      });
    } else {
      logger.error('Image generation failed via ProviderProxy', {
        error: result.error,
      });
    }

    return result;
  }
}
