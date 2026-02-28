/**
 * ImageAnalysisService - Vision API-based image analysis for picture-to-song generation
 *
 * Analyzes images to extract emotional themes, visual elements, and narrative context
 * that can be used to generate personalized song lyrics.
 *
 * Routes through centralized ProviderProxy for consistent auth, monitoring, and circuit breaking.
 * Supports both cloud storage URLs (GCS, S3, Cloudinary) and local file paths.
 * Local images are converted to base64 for Vision API.
 */

import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { getLogger, FEATURE_FLAGS } from '../../config/service-urls';
import { ProvidersServiceClient } from '../../infrastructure/clients/ProvidersServiceClient';
import {
  MusicTemplateServiceClient,
  MUSIC_TEMPLATE_IDS,
} from '../../infrastructure/clients/TemplateEngineServiceClient';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';
import { PipelineError } from '../errors';

const logger = getLogger('music-service:image-analysis');

/**
 * SECURITY: Image URL allowlist for OpenAI Vision API
 *
 * This allowlist restricts which image URLs can be sent to OpenAI for analysis.
 * For production, consider:
 * 1. Using signed URLs with expiration
 * 2. Validating URLs through storage-service before calling OpenAI
 * 3. Restricting to specific owned bucket paths
 *
 * The current implementation accepts cloud storage domains to allow user-uploaded images.
 * Configure ALLOWED_IMAGE_DOMAIN_OVERRIDE env var to restrict to a specific domain.
 */
const ALLOWED_IMAGE_DOMAINS = process.env.ALLOWED_IMAGE_DOMAIN_OVERRIDE
  ? [process.env.ALLOWED_IMAGE_DOMAIN_OVERRIDE]
  : [
      'storage.googleapis.com',
      'storage.cloud.google.com',
      's3.amazonaws.com',
      's3.us-east-1.amazonaws.com',
      's3.eu-west-1.amazonaws.com',
      'res.cloudinary.com',
    ];

const ImageAnalysisResponseSchema = z.object({
  emotionalThemes: z.array(z.string()).default([]),
  visualElements: z.array(z.string()).default([]),
  narrative: z.string().default(''),
  mood: z.string().default('reflective'),
  suggestedStyle: z.string().optional(),
  suggestedGenre: z.string().optional(),
});

export interface ImageAnalysisRequest {
  artworkUrl: string;
  userContext?: string;
  userId: string;
  requestId: string;
  language?: string;
}

export interface ImageAnalysisResult {
  success: boolean;
  analysis?: {
    emotionalThemes: string[];
    visualElements: string[];
    narrative: string;
    mood: string;
    suggestedStyle?: string;
    suggestedGenre?: string;
  };
  entryContent?: string;
  error?: string;
}

export class ImageAnalysisService {
  private providersClient: ProvidersServiceClient;
  private templateClient: MusicTemplateServiceClient;

  constructor() {
    const registry = getServiceRegistry();
    this.providersClient = registry.providersClient as unknown as ProvidersServiceClient;
    this.templateClient = registry.templateClient as unknown as MusicTemplateServiceClient;
    logger.info('ImageAnalysisService: Using centralized ProviderProxy for Vision API');
  }

  private isAllowedImageUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return false;
      }
      if (parsed.port && parsed.port !== '443') {
        return false;
      }
      const ipLiteralPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      if (ipLiteralPattern.test(parsed.hostname)) {
        return false;
      }
      return ALLOWED_IMAGE_DOMAINS.some(domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
    } catch (error) {
      logger.warn('Failed to validate image URL', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  private isLocalPath(urlOrPath: string): boolean {
    return urlOrPath.startsWith('/uploads/') || urlOrPath.startsWith('uploads/') || urlOrPath.startsWith('./uploads/');
  }

  private isHttpUrl(urlOrPath: string): boolean {
    return urlOrPath.startsWith('https://') || urlOrPath.startsWith('http://');
  }

  private async getImageAsBase64FromFile(localPath: string): Promise<{ dataUrl: string; mimeType: string } | null> {
    try {
      const normalizedPath = localPath.startsWith('/') ? localPath.substring(1) : localPath;
      const fullPath = path.resolve(process.cwd(), normalizedPath);

      if (!fullPath.includes('/uploads/')) {
        logger.warn('🖼️ Attempted to access file outside uploads directory', {
          path: localPath,
        });
        return null;
      }

      const fileBuffer = await fs.readFile(fullPath);
      const base64 = fileBuffer.toString('base64');

      const ext = path.extname(localPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };
      const mimeType = mimeTypes[ext] || 'image/jpeg';

      logger.info('🖼️ Converted local image to base64', {
        path: localPath,
        mimeType,
        sizeKb: Math.round(fileBuffer.length / 1024),
      });

      return {
        dataUrl: `data:${mimeType};base64,${base64}`,
        mimeType,
      };
    } catch (error) {
      logger.error('🖼️ Failed to read local image file', {
        path: localPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async fetchImageAsBase64FromUrl(artworkUrl: string): Promise<{ dataUrl: string; mimeType: string } | null> {
    try {
      logger.info('🖼️ Fetching image from URL for base64 conversion', {
        url: artworkUrl.substring(0, 100),
      });

      const response = await fetch(artworkUrl, {
        headers: {
          Accept: 'image/*',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        logger.warn('🖼️ Failed to fetch image from URL', {
          url: artworkUrl.substring(0, 100),
          status: response.status,
        });
        return null;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');

      logger.info('🖼️ Fetched and converted image to base64', {
        url: artworkUrl.substring(0, 100),
        mimeType: contentType,
        sizeKb: Math.round(buffer.length / 1024),
      });

      return {
        dataUrl: `data:${contentType};base64,${base64}`,
        mimeType: contentType,
      };
    } catch (error) {
      logger.error('🖼️ Failed to fetch image from URL', {
        url: artworkUrl.substring(0, 100),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResult> {
    let artworkUrlForApi: string;
    const isLocal = this.isLocalPath(request.artworkUrl);
    const isHttp = this.isHttpUrl(request.artworkUrl);
    const isAllowedCloudUrl = isHttp && this.isAllowedImageUrl(request.artworkUrl);

    if (isLocal) {
      logger.info('Detected local image path, converting to base64', {
        requestId: request.requestId,
        path: request.artworkUrl,
      });

      const base64Result = await this.getImageAsBase64FromFile(request.artworkUrl);
      if (!base64Result) {
        return {
          success: false,
          error: 'Failed to read local image file',
        };
      }
      artworkUrlForApi = base64Result.dataUrl;
    } else if (isAllowedCloudUrl) {
      artworkUrlForApi = request.artworkUrl;
    } else if (isHttp) {
      logger.info('Detected HTTP URL not in allowed list, fetching and converting to base64', {
        requestId: request.requestId,
        url: request.artworkUrl.substring(0, 100),
      });

      const base64Result = await this.fetchImageAsBase64FromUrl(request.artworkUrl);
      if (!base64Result) {
        return {
          success: false,
          error: 'Failed to fetch image from URL for analysis',
        };
      }
      artworkUrlForApi = base64Result.dataUrl;
    } else {
      logger.warn('Invalid image URL format', {
        requestId: request.requestId,
        url: request.artworkUrl.substring(0, 50),
      });
      return {
        success: false,
        error: 'Image URL must be a valid HTTPS URL or local uploads path',
      };
    }

    const startTime = Date.now();
    logger.info('Starting image analysis via centralized ProviderProxy', {
      requestId: request.requestId,
      userId: request.userId,
      hasUserContext: !!request.userContext,
      language: request.language,
      isLocalImage: isLocal,
    });

    try {
      let systemPrompt: string;
      let userPrompt: string;

      const templateResult = await this.templateClient.renderTemplate(MUSIC_TEMPLATE_IDS.IMAGE_ANALYSIS, {
        language: request.language || 'English',
        user_context: request.userContext,
      });

      if (templateResult.success && templateResult.systemPrompt && templateResult.userPrompt) {
        systemPrompt = templateResult.systemPrompt;
        userPrompt = templateResult.userPrompt;
        logger.debug('Using database template for image analysis', { templateId: MUSIC_TEMPLATE_IDS.IMAGE_ANALYSIS });
      } else {
        if (FEATURE_FLAGS.templateStrictMode) {
          const error = new Error(
            `Template rendering failed for ${MUSIC_TEMPLATE_IDS.IMAGE_ANALYSIS}: ${templateResult.error || 'unknown error'}`
          );
          logger.error('TEMPLATE_STRICT_MODE: Throwing error instead of fallback', {
            templateId: MUSIC_TEMPLATE_IDS.IMAGE_ANALYSIS,
            error: templateResult.error,
          });
          throw error;
        }

        logger.warn('Template rendering failed, using fallback prompt', { error: templateResult.error });
        const languageInstruction = request.language
          ? `Respond in ${request.language} language. The narrative and themes should be written in ${request.language}.`
          : 'Respond in English.';

        systemPrompt = `You are an empathetic image analyst helping to create personalized song lyrics. 
Analyze the provided image and extract emotional and narrative elements that can inspire meaningful lyrics.

Focus on:
1. Emotional themes and feelings the image evokes
2. Key visual elements and their symbolic meaning
3. A brief narrative interpretation of the image
4. The overall mood and atmosphere
5. Suggested music style and genre that would complement the image

Be sensitive and thoughtful - the user may have personal connections to this image.
${languageInstruction}
Respond in JSON format with the following structure:
{
  "emotionalThemes": ["theme1", "theme2", ...],
  "visualElements": ["element1", "element2", ...],
  "narrative": "A brief interpretation of what this image represents emotionally",
  "mood": "The overall emotional mood (e.g., hopeful, nostalgic, peaceful, bittersweet)",
  "suggestedStyle": "A music style that would complement this image",
  "suggestedGenre": "A genre suggestion"
}`;

        userPrompt = request.userContext
          ? `Analyze this image for song lyrics generation. The user shared this context: "${request.userContext}"`
          : 'Analyze this image for song lyrics generation. Extract emotional themes and visual elements that could inspire meaningful lyrics.';
      }

      // Route through centralized ProviderProxy for Vision API
      const response = await this.providersClient.analyzeImage({
        artworkUrl: artworkUrlForApi,
        prompt: userPrompt,
        systemPrompt: systemPrompt,
        options: {
          model: 'gpt-4o',
          maxTokens: 1000,
          imageDetail: 'low',
          responseFormat: 'json',
        },
      });

      if (!response.success || !response.result) {
        throw PipelineError.generationFailed(response.error || 'No response from Vision API');
      }

      const content = response.result;
      const defaultAnalysis = {
        emotionalThemes: ['personal moment'],
        visualElements: ['captured scene'],
        narrative: request.userContext || 'A meaningful moment captured in an image',
        mood: 'reflective',
      };

      let rawParsed: unknown;
      let analysis: z.infer<typeof ImageAnalysisResponseSchema> = defaultAnalysis;

      try {
        rawParsed = JSON.parse(content);
        const parseResult = ImageAnalysisResponseSchema.safeParse(rawParsed);

        if (!parseResult.success) {
          logger.warn('Vision response validation failed, using defaults', {
            requestId: request.requestId,
            errors: parseResult.error.issues,
          });
        } else {
          analysis = parseResult.data;
        }
      } catch (parseError) {
        logger.warn('Failed to parse JSON from vision response, using defaults', {
          requestId: request.requestId,
          content: content.substring(0, 200),
        });
      }
      const processingTime = Date.now() - startTime;

      logger.info('Image analysis completed via ProviderProxy', {
        requestId: request.requestId,
        processingTimeMs: processingTime,
        emotionalThemesCount: analysis.emotionalThemes.length,
        mood: analysis.mood,
      });

      const entryContent = this.synthesizeEntryContent(analysis, request.userContext);

      return {
        success: true,
        analysis: {
          emotionalThemes: analysis.emotionalThemes,
          visualElements: analysis.visualElements,
          narrative: analysis.narrative,
          mood: analysis.mood,
          suggestedStyle: analysis.suggestedStyle,
          suggestedGenre: analysis.suggestedGenre,
        },
        entryContent,
      };
    } catch (error) {
      logger.error('Image analysis failed', {
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image analysis failed',
      };
    }
  }

  private synthesizeEntryContent(
    analysis: {
      emotionalThemes?: string[];
      visualElements?: string[];
      narrative?: string;
      mood?: string;
    },
    userContext?: string
  ): string {
    const parts: string[] = [];

    if (userContext) {
      parts.push(userContext);
    }

    if (analysis.narrative) {
      parts.push(analysis.narrative);
    }

    if (analysis.emotionalThemes?.length) {
      parts.push(`Feelings: ${analysis.emotionalThemes.slice(0, 3).join(', ')}`);
    }

    if (analysis.visualElements?.length) {
      parts.push(`Visual inspiration: ${analysis.visualElements.slice(0, 3).join(', ')}`);
    }

    return parts.join('. ').trim() || 'A moment captured in time';
  }

  isAvailable(): boolean {
    // Always available via centralized ProviderProxy - actual availability checked at call time
    return true;
  }
}

let imageAnalysisServiceInstance: ImageAnalysisService | null = null;

export function getImageAnalysisService(): ImageAnalysisService {
  if (!imageAnalysisServiceInstance) {
    imageAnalysisServiceInstance = new ImageAnalysisService();
  }
  return imageAnalysisServiceInstance;
}
