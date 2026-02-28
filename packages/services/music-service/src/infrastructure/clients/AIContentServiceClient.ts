/**
 * AIContentServiceClient - HTTP client for ai-content-service integration
 * Handles content generation requests using AI templates
 */

import {
  createServiceClient,
  type HttpClient,
  type HttpResponse,
  getServiceUrl,
  getLogger,
} from '../../config/service-urls';
import { withServiceResilience, tryParseServiceResponse } from '@aiponge/platform-core';
import { v4 as uuidv4 } from 'uuid';
import {
  CONTENT_VISIBILITY,
  type ContentVisibility,
  type ImageType,
  ImageGenerationResponseSchema,
} from '@aiponge/shared-contracts';
import { z } from 'zod';

const ContentResponseSchema = z.object({
  success: z.boolean(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  processingTimeMs: z.number().optional(),
});

const logger = getLogger('music-service:ai-content-client');

const SERVICE_NAME = 'ai-content-service';

function generateCorrelationId(): string {
  return `trace-${Date.now()}-${uuidv4().substring(0, 8)}`;
}

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

export type { ImageType };

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

import type { IAIContentServiceClient } from '../../domains/music-catalog/ports/IAIContentServiceClient';

export class AIContentServiceClient implements IAIContentServiceClient {
  private httpClient: HttpClient;

  constructor() {
    const { httpClient } = createServiceClient('ai-content-service', { type: 'ai' });
    this.httpClient = httpClient;
    logger.debug('AI Content service client initialized');
  }

  /**
   * Generate content using AI templates
   */
  async generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse> {
    return withServiceResilience(
      'ai-content-service',
      'generateContent',
      async () => {
        try {
          logger.info('🎨 AI Content generation request initiated', {
            templateId: request.templateId,
            contentType: request.contentType,
            variableCount: Object.keys(request.variables).length,
          });

          const data = await this.httpClient.post<GenerateContentResponse>(
            getServiceUrl(SERVICE_NAME) + '/api/content/generate',
            {
              templateId: request.templateId,
              contentType: request.contentType,
              variables: request.variables,
              options: request.options || {},
            },
            {
              timeout: 60000,
            }
          );

          logger.info('Received response from ai-content-service', {
            hasContent: !!data?.content,
            success: data?.success,
          });

          tryParseServiceResponse(
            ContentResponseSchema,
            data,
            SERVICE_NAME,
            'generateContent'
          );

          if (data && data.success) {
            logger.info('Content generation completed successfully');
            return {
              success: true,
              content: data.content,
              metadata: data.metadata,
              processingTimeMs: data.processingTimeMs,
            };
          } else {
            const errorMessage = typeof data?.error === 'string' ? data.error : 'Content generation failed';

            logger.error('❌ Content generation failed', {
              error: errorMessage,
            });

            return {
              success: false,
              error: errorMessage,
            };
          }
        } catch (error) {
          logger.error('💥 Content generation request threw error', {
            error: error instanceof Error ? error.message : String(error),
            templateId: request.templateId,
          });

          return {
            success: false,
            error: error instanceof Error ? error.message : 'Content generation request failed',
          };
        }
      },
      'ai-provider'
    );
  }

  /**
   * Check if content service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.httpClient.getWithResponse<{ status: string }>(
        getServiceUrl(SERVICE_NAME) + '/health'
      );
      return response.ok && response.data?.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Generate album artwork using centralized image generation
   */
  async generateAlbumArtwork(request: GenerateAlbumArtworkRequest): Promise<GenerateArtworkResponse> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    logger.info('Generating album artwork via centralized service', {
      correlationId,
      title: request.title,
      userId: request.userId,
      visibility: request.visibility,
    });

    return withServiceResilience(
      'ai-content-service',
      'generateAlbumArtwork',
      async () => {
        try {
          const lyricsSummary = this.extractLyricsSummary(request.lyrics);
          const destinationPath = `user/${request.userId || 'anonymous'}/artworks`;

          const imageRequest: GenerateImageRequest = {
            imageType: 'album-artwork',
            variables: {
              title: request.title,
              lyrics_keywords: lyricsSummary,
              style: request.style,
              genre: request.genre,
              mood: request.mood,
              cultural_style: request.culturalStyle,
            },
            userId: request.userId,
            visibility: request.visibility || CONTENT_VISIBILITY.SHARED,
            destinationPath,
          };

          const response = await this.httpClient.post<GenerateImageResponse>(
            getServiceUrl(SERVICE_NAME) + '/api/ai/images/generate',
            imageRequest,
            {
              timeout: 120000,
              headers: {
                'x-correlation-id': correlationId,
                'x-user-id': request.userId || '',
              },
            }
          );

          const duration = Date.now() - startTime;

          tryParseServiceResponse(
            ImageGenerationResponseSchema,
            response,
            SERVICE_NAME,
            'generateAlbumArtwork'
          );

          if (response.success && response.data?.artworkUrl) {
            logger.info('Album artwork generated successfully', {
              artworkUrl: response.data.artworkUrl.substring(0, 60),
              duration,
            });

            return {
              success: true,
              artworkUrl: response.data.artworkUrl,
              revisedPrompt: response.data.revisedPrompt,
              templateUsed: response.data.templateUsed,
              processingTimeMs: response.metadata?.processingTimeMs || duration,
            };
          }

          logger.warn('Album artwork generation failed', {
            error: response.error,
            duration,
          });

          return {
            success: false,
            error: response.error || 'Failed to generate album artwork',
            processingTimeMs: duration,
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('Album artwork generation error', {
            error: error instanceof Error ? error.message : String(error),
            duration,
          });

          return {
            success: false,
            error: error instanceof Error ? error.message : 'Album artwork generation failed',
            processingTimeMs: duration,
          };
        }
      },
      'ai-provider'
    );
  }

  /**
   * Generate playlist artwork using centralized image generation
   */
  async generatePlaylistArtwork(request: GeneratePlaylistArtworkRequest): Promise<GenerateArtworkResponse> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    logger.info('Generating playlist artwork via centralized service', {
      correlationId,
      playlistName: request.playlistName,
      playlistId: request.playlistId,
    });

    return withServiceResilience(
      'ai-content-service',
      'generatePlaylistArtwork',
      async () => {
        try {
          const imageRequest: GenerateImageRequest = {
            imageType: 'playlist-artwork',
            variables: {
              mood: request.mood || 'vibrant',
              genre: request.genre || 'music',
              playlist_name: request.playlistName,
              playlist_id: request.playlistId,
              description: request.description,
              track_count: request.trackCount,
            },
            visibility: CONTENT_VISIBILITY.SHARED,
            destinationPath: `user/${request.userId || 'anonymous'}/artworks`,
          };

          const response = await this.httpClient.post<GenerateImageResponse>(
            getServiceUrl(SERVICE_NAME) + '/api/ai/images/generate',
            imageRequest,
            {
              timeout: 120000,
              headers: {
                'x-correlation-id': correlationId,
              },
            }
          );

          const duration = Date.now() - startTime;

          if (response.success && response.data?.artworkUrl) {
            logger.info('Playlist artwork generated successfully', {
              playlistName: request.playlistName,
              artworkUrl: response.data.artworkUrl.substring(0, 60),
              duration,
            });

            return {
              success: true,
              artworkUrl: response.data.artworkUrl,
              revisedPrompt: response.data.revisedPrompt,
              templateUsed: response.data.templateUsed,
              processingTimeMs: response.metadata?.processingTimeMs || duration,
            };
          }

          logger.warn('Playlist artwork generation failed', {
            error: response.error,
            duration,
          });

          return {
            success: false,
            error: response.error || 'Failed to generate playlist artwork',
            processingTimeMs: duration,
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('Playlist artwork generation error', {
            error: error instanceof Error ? error.message : String(error),
            duration,
          });

          return {
            success: false,
            error: error instanceof Error ? error.message : 'Playlist artwork generation failed',
            processingTimeMs: duration,
          };
        }
      },
      'ai-provider'
    );
  }

  private static readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'through', 'during', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'can', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their',
    'this', 'that', 'these', 'those', 'not', 'no', 'so', 'if', 'then', 'than', 'when',
    'where', 'how', 'what', 'who', 'which', 'just', 'like', 'more', 'some', 'any', 'all',
    'each', 'every', 'both', 'few', 'most', 'other', 'such', 'only', 'also', 'back',
    'even', 'still', 'well', 'here', 'there', 'very', 'much', 'many', 'come', 'came',
    'know', 'knew', 'make', 'made', 'take', 'took', 'give', 'gave', 'tell', 'told',
    'said', 'says', 'going', 'goes', 'gone', 'went', 'want', 'need', 'keep', 'kept',
    'let', 'say', 'get', 'got', 'yeah', 'ohh', 'ooh', 'hey', 'whoa', 'gonna', 'wanna',
    'gotta', 'cause', 'ain', 'don', 'won', 'verse', 'chorus', 'bridge', 'outro', 'intro',
    'pre', 'hook', 'repeat', 'title',
  ]);

  private static readonly VISUAL_IMAGERY: ReadonlyMap<string, string> = new Map([
    ['rain', 'rainfall'], ['storm', 'stormy weather'], ['thunder', 'thunderstorm'],
    ['lightning', 'electric sky'], ['sun', 'sunlight'], ['sunrise', 'dawn breaking'],
    ['sunset', 'golden sunset'], ['moon', 'moonlight'], ['stars', 'starlit sky'],
    ['ocean', 'vast ocean'], ['sea', 'rolling sea'], ['waves', 'crashing waves'],
    ['river', 'flowing river'], ['mountain', 'towering mountain'], ['forest', 'deep forest'],
    ['fire', 'blazing fire'], ['flame', 'dancing flames'], ['snow', 'falling snow'],
    ['ice', 'frozen landscape'], ['wind', 'wind sweeping'], ['sky', 'open sky'],
    ['night', 'nightscape'], ['dawn', 'first light of dawn'], ['dusk', 'twilight'],
    ['garden', 'blooming garden'], ['flower', 'blossoming flowers'], ['rose', 'red rose'],
    ['tree', 'ancient tree'], ['desert', 'vast desert'], ['cloud', 'dramatic clouds'],
    ['road', 'winding road'], ['path', 'solitary path'], ['bridge', 'crossing a bridge'],
    ['mirror', 'shattered mirror'], ['window', 'rain-streaked window'],
    ['city', 'city skyline'], ['street', 'empty street'], ['light', 'ethereal light'],
    ['shadow', 'long shadows'], ['dark', 'darkness'], ['door', 'open doorway'],
    ['wall', 'crumbling wall'], ['wings', 'outstretched wings'], ['bird', 'bird in flight'],
    ['cage', 'gilded cage'], ['crown', 'fallen crown'], ['sword', 'gleaming sword'],
    ['ship', 'distant ship'], ['island', 'remote island'], ['castle', 'ancient castle'],
  ]);

  private static readonly EMOTION_MAP: ReadonlyMap<string, string> = new Map([
    ['love', 'warmth and intimacy'], ['heart', 'emotional depth'], ['soul', 'soulful essence'],
    ['tears', 'melancholy'], ['cry', 'deep sorrow'], ['smile', 'gentle joy'],
    ['laugh', 'euphoria'], ['pain', 'inner struggle'], ['hurt', 'emotional wounds'],
    ['hope', 'hope and aspiration'], ['dream', 'dreamlike wonder'], ['fear', 'tension and unease'],
    ['anger', 'fierce intensity'], ['rage', 'raw power'], ['peace', 'serenity and calm'],
    ['free', 'liberation'], ['freedom', 'boundless freedom'], ['broken', 'fractured beauty'],
    ['heal', 'healing transformation'], ['lost', 'searching and longing'],
    ['found', 'discovery and relief'], ['alone', 'solitude'], ['lonely', 'isolation'],
    ['together', 'unity and connection'], ['strong', 'resilient strength'],
    ['brave', 'courageous spirit'], ['wild', 'untamed energy'], ['gentle', 'tender softness'],
    ['fierce', 'fierce determination'], ['quiet', 'contemplative stillness'],
    ['scream', 'cathartic release'], ['whisper', 'intimate whisper'],
    ['dance', 'movement and rhythm'], ['run', 'urgency and escape'],
    ['fall', 'descent and vulnerability'], ['rise', 'ascension and triumph'],
    ['fly', 'soaring above'], ['breathe', 'deep breath of life'],
    ['burn', 'burning passion'], ['shine', 'radiant glow'],
    ['fade', 'fading away'], ['bloom', 'blossoming growth'],
    ['drown', 'overwhelming depths'], ['fight', 'inner battle'],
    ['wait', 'patient anticipation'], ['remember', 'nostalgic memories'],
    ['forget', 'letting go'], ['forgive', 'graceful forgiveness'],
  ]);

  private extractLyricsSummary(lyrics: string): string {
    if (!lyrics) return 'personal journey, emotion, growth';

    const cleanedLyrics = lyrics
      .replace(/\[(Title|Verse|Chorus|Bridge|Outro|Intro|Pre-Chorus|Hook|Repeat)[^\]]*\]/gi, '')
      .trim();

    const lowerLyrics = cleanedLyrics.toLowerCase();
    const words = lowerLyrics.replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(Boolean);

    const visualElements: string[] = [];
    const emotionalThemes: string[] = [];
    const keyPhrases: string[] = [];

    const seenVisual = new Set<string>();
    const seenEmotion = new Set<string>();

    for (const word of words) {
      const stem = word.replace(/(ing|ed|ly|ness|tion|sion|ment|ful|less|ous|ive|able|ible)$/, '');

      const visualMatch = AIContentServiceClient.VISUAL_IMAGERY.get(word)
        || AIContentServiceClient.VISUAL_IMAGERY.get(stem);
      if (visualMatch && !seenVisual.has(visualMatch)) {
        seenVisual.add(visualMatch);
        visualElements.push(visualMatch);
      }

      const emotionMatch = AIContentServiceClient.EMOTION_MAP.get(word)
        || AIContentServiceClient.EMOTION_MAP.get(stem);
      if (emotionMatch && !seenEmotion.has(emotionMatch)) {
        seenEmotion.add(emotionMatch);
        emotionalThemes.push(emotionMatch);
      }
    }

    const lines = cleanedLyrics.split('\n').filter(l => l.trim().length > 5);
    const imageLines = lines.filter(line => {
      const lower = line.toLowerCase();
      return /\b(like|as if|reminds me|looks like|feels like|painted|colors?|bright|glow|shimmer|sparkle)\b/.test(lower);
    });

    for (const line of imageLines.slice(0, 3)) {
      const trimmed = line.trim().replace(/[,!?.]+$/, '');
      if (trimmed.length > 10 && trimmed.length < 80) {
        keyPhrases.push(trimmed.toLowerCase());
      }
    }

    const significantWords = words.filter(w =>
      w.length > 3 && !AIContentServiceClient.STOP_WORDS.has(w)
    );
    const wordFreq = new Map<string, number>();
    for (const word of significantWords) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
    const topWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w]) => w);

    const parts: string[] = [];

    if (visualElements.length > 0) {
      parts.push(visualElements.slice(0, 4).join(', '));
    }

    if (emotionalThemes.length > 0) {
      parts.push(emotionalThemes.slice(0, 3).join(', '));
    }

    if (keyPhrases.length > 0) {
      parts.push(keyPhrases.slice(0, 2).join('; '));
    }

    if (parts.length < 2 && topWords.length > 0) {
      parts.push(topWords.join(', '));
    }

    const summary = parts.join('; ');

    if (summary.length < 10) {
      return 'personal journey, emotion, growth';
    }

    return summary.substring(0, 200);
  }
}
