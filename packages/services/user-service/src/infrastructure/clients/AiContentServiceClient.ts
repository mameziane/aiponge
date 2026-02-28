/**
 * AI Content Service Client
 * Client for interacting with centralized AI Content Service image generation
 */

import {
  type HttpClient,
  serializeError,
  withServiceResilience,
} from '@aiponge/platform-core';
import { createServiceClient, getLogger } from '@config/service-urls';
import { v4 as uuidv4 } from 'uuid';
import { CONTENT_VISIBILITY, type ImageType, type ContentVisibility } from '@aiponge/shared-contracts';

const SERVICE_NAME = 'ai-content-service';
const logger = getLogger('ai-content-service-client');

function generateCorrelationId(): string {
  return `trace-${Date.now()}-${uuidv4().substring(0, 8)}`;
}

export type { ImageType, ContentVisibility };

export interface GenerateImageRequest {
  imageType: ImageType;
  variables: Record<string, string | number | undefined>;
  userId?: string;
  visibility?: ContentVisibility;
  destinationPath?: string;
}

export interface GenerateImageResponse {
  success: boolean;
  data?: {
    artworkUrl?: string;
    revisedPrompt?: string;
    templateUsed?: string;
  };
  metadata?: {
    processingTimeMs?: number;
    imageType?: string;
  };
  error?: string;
  timestamp?: string;
}

export interface GenerateBookCoverRequest {
  title: string;
  description: string;
  themes?: string;
  bookType?: string;
  tradition?: string;
  era?: string;
  style?: string;
  contentSummary?: string;
  dominantMood?: string;
  emotionalTone?: string;
  keySymbols?: string;
  userId?: string;
  visibility?: ContentVisibility;
  destinationPath?: string;
}

export interface GenerateBookCoverResponse {
  success: boolean;
  artworkUrl?: string;
  templateUsed?: string;
  processingTimeMs?: number;
  error?: string;
}

export class AiContentServiceClient {
  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;

  constructor() {
    const { httpClient, baseUrl } = createServiceClient('ai-content-service', { type: 'ai' });
    this.httpClient = httpClient;
    this.baseUrl = baseUrl;
    logger.debug('AiContentServiceClient initialized', { baseUrl: this.baseUrl });
  }

  async generateBookCover(request: GenerateBookCoverRequest): Promise<GenerateBookCoverResponse> {
    const correlationId = generateCorrelationId();
    const startTime = Date.now();

    logger.info('Generating book cover', {
      correlationId,
      title: request.title,
      userId: request.userId,
      visibility: request.visibility,
    });

    return withServiceResilience(
      'ai-content-service',
      'generateBookCover',
      async () => {
        try {
          const imageRequest: GenerateImageRequest = {
            imageType: 'book-cover-artwork',
            variables: {
              title: request.title,
              description: request.description,
              themes: request.themes,
              bookType: request.bookType,
              tradition: request.tradition,
              era: request.era,
              style: request.style,
              contentSummary: request.contentSummary,
              dominantMood: request.dominantMood,
              emotionalTone: request.emotionalTone,
              keySymbols: request.keySymbols,
            },
            userId: request.userId,
            visibility: request.visibility ?? CONTENT_VISIBILITY.SHARED,
            destinationPath: request.destinationPath,
          };

          const response = await this.httpClient.post<GenerateImageResponse>(
            `${this.baseUrl}/api/ai/images/generate`,
            imageRequest,
            {
              headers: {
                'x-correlation-id': correlationId,
                'x-user-id': request.userId || '',
              },
            }
          );

          const duration = Date.now() - startTime;

          if (response.success && response.data?.artworkUrl) {
            logger.info('Book cover generated successfully', {
              correlationId,
              artworkUrl: response.data.artworkUrl.substring(0, 60),
              duration,
            });

            return {
              success: true,
              artworkUrl: response.data.artworkUrl,
              templateUsed: response.data.templateUsed,
              processingTimeMs: response.metadata?.processingTimeMs,
            };
          }

          logger.warn('Book cover generation failed', {
            correlationId,
            error: response.error,
            duration,
          });

          return {
            success: false,
            error: response.error || 'Failed to generate book cover',
            processingTimeMs: duration,
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('Book cover generation error', {
            correlationId,
            error: serializeError(error),
            duration,
          });

          return {
            success: false,
            error: error instanceof Error ? error.message : 'Book cover generation failed',
            processingTimeMs: duration,
          };
        }
      },
      'ai-provider'
    );
  }

  async generateImage(request: GenerateImageRequest): Promise<GenerateImageResponse> {
    const correlationId = generateCorrelationId();
    const startTime = Date.now();

    logger.info('Generating image', {
      correlationId,
      imageType: request.imageType,
      userId: request.userId,
    });

    return withServiceResilience(
      'ai-content-service',
      'generateImage',
      async () => {
        try {
          const response = await this.httpClient.post<GenerateImageResponse>(
            `${this.baseUrl}/api/ai/images/generate`,
            request,
            {
              headers: {
                'x-correlation-id': correlationId,
                'x-user-id': request.userId || '',
              },
            }
          );

          const duration = Date.now() - startTime;

          logger.info('Image generation completed', {
            correlationId,
            success: response.success,
            duration,
          });

          return response;
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('Image generation error', {
            correlationId,
            error: serializeError(error),
            duration,
          });

          return {
            success: false,
            error: error instanceof Error ? error.message : 'Image generation failed',
            timestamp: new Date().toISOString(),
          };
        }
      },
      'ai-provider'
    );
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.httpClient.get<{ status: string }>(`${this.baseUrl}/api/ai/images/health`);
      return response.status === 'healthy';
    } catch {
      return false;
    }
  }
}
