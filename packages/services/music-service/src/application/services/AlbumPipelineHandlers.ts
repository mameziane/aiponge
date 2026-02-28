/**
 * AlbumPipelineHandlers - Default implementations of AlbumGenerationPipeline handlers
 *
 * These handlers provide album creation, artwork generation, and album linking functionality.
 * Track generation is handled by RefactoredTrackGenerationHandler in RefactoredAlbumHandlers.ts
 */

import { getLogger, getServiceUrl, createServiceHttpClient, type HttpClient } from '../../config/service-urls';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { albums, tracks as tracksTable } from '../../schema/music-schema';
import { eq, inArray, sum } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { max } from 'drizzle-orm';
import { isPubliclyAccessibleContext } from '../shared/persistence-types';
import { CONTENT_VISIBILITY, isContentPubliclyAccessible, ALBUM_LIFECYCLE } from '@aiponge/shared-contracts';
import type {
  AlbumCreationHandler,
  AlbumCreationResult,
  ArtworkGenerationHandler,
  AlbumLinkingHandler,
  TitleTranslationHandler,
  AlbumGenerationConfig,
  ProgressContext,
} from './AlbumGenerationPipeline';

const logger = getLogger('music-service:album-pipeline-handlers');

export class DefaultAlbumCreationHandler implements AlbumCreationHandler {
  async createAlbum(config: AlbumGenerationConfig, context: ProgressContext): Promise<AlbumCreationResult> {
    const db = getDatabase();
    const { and } = await import('drizzle-orm');
    const visibility = context.persistenceContext?.visibility || CONTENT_VISIBILITY.PERSONAL;
    const isShared = isContentPubliclyAccessible(visibility);

    if (config.chapterId) {
      const conditions = [eq(albums.chapterId, config.chapterId), eq(albums.visibility, visibility)];
      if (!isShared) {
        conditions.push(eq(albums.userId, config.userId));
      }

      const existing = await db
        .select({ id: albums.id })
        .from(albums)
        .where(and(...conditions))
        .limit(1);

      if (existing.length > 0) {
        const existingAlbumId = existing[0].id;

        const maxGenResult = await db
          .select({ maxGen: max(tracksTable.generationNumber) })
          .from(tracksTable)
          .where(eq(tracksTable.albumId, existingAlbumId));

        const currentMaxGen = maxGenResult[0]?.maxGen ?? 0;
        const nextGenerationNumber = currentMaxGen + 1;

        logger.info('Reusing existing album for chapter (new generation)', {
          albumId: existingAlbumId,
          userId: config.userId,
          chapterId: config.chapterId,
          visibility,
          previousGeneration: currentMaxGen,
          newGeneration: nextGenerationNumber,
        });
        return { albumId: existingAlbumId, generationNumber: nextGenerationNumber };
      }
    }

    const albumId = uuidv4();

    const descriptionParts = [`Album from "${config.chapterTitle}"`];
    if (config.bookTitle) descriptionParts.push(`in "${config.bookTitle}"`);
    if (config.style) descriptionParts.push(`Style: ${config.style}`);
    if (config.mood) descriptionParts.push(`Mood: ${config.mood}`);
    const description = descriptionParts.join(' · ');

    await db.insert(albums).values({
      id: albumId,
      title: context.albumTitle,
      userId: config.userId,
      description,
      type: config.entries.length === 1 ? 'single' : 'album',
      status: ALBUM_LIFECYCLE.DRAFT,
      totalTracks: context.totalTracks,
      genres: config.genre ? [config.genre] : [],
      mood: config.mood,
      visibility,
      chapterId: config.chapterId,
      metadata: {
        bookId: config.bookId,
        chapterTitle: config.chapterTitle,
        bookTitle: config.bookTitle,
        languageMode: config.languageMode || 'single',
        targetLanguages: config.targetLanguages || [config.language || 'en-US'],
        ...(isShared ? { generatedBy: config.userId } : {}),
        ...(config.displayName ? { displayName: config.displayName } : {}),
      },
    } as typeof albums.$inferInsert);

    logger.info('Album created', {
      albumId,
      userId: config.userId,
      title: context.albumTitle,
      visibility,
      totalTracks: context.totalTracks,
    });

    return { albumId, generationNumber: 1 };
  }
}

export class DefaultArtworkGenerationHandler implements ArtworkGenerationHandler {
  private httpClient: HttpClient;
  private aiContentServiceUrl: string;

  constructor() {
    this.httpClient = createServiceHttpClient('ai'); // 120s timeout for AI content generation
    this.aiContentServiceUrl = getServiceUrl('ai-content-service');
  }

  async generateArtwork(
    content: string,
    title: string,
    config: AlbumGenerationConfig,
    _context: ProgressContext
  ): Promise<string | undefined> {
    logger.info('Starting early album artwork generation', { title });

    try {
      const artworkPrompt = this.buildArtworkPrompt(content, title, config);
      const requestId = uuidv4();

      // Use httpClient with proper timeout instead of raw fetch
      const result = await this.httpClient.post<{ success?: boolean; data?: { artworkUrl?: string } }>(
        `${this.aiContentServiceUrl}/api/content/generate`,
        {
          userId: config.userId,
          contentType: 'album-artwork',
          prompt: artworkPrompt,
          parameters: {
            style: config.style,
            genre: config.genre,
            mood: config.mood,
            culturalStyle: config.culturalStyle,
          },
          options: { templateId: 'album-artwork' },
        },
        {
          headers: {
            'x-user-id': config.userId,
            'x-request-id': requestId,
          },
        }
      );

      const artworkUrl = result?.data?.artworkUrl;

      if (artworkUrl) {
        logger.info('Album artwork generated successfully', {
          title,
          artworkUrl: artworkUrl.substring(0, 50) + '...',
        });
        return artworkUrl;
      }

      return undefined;
    } catch (error) {
      logger.warn('Artwork generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private buildArtworkPrompt(content: string, title: string, config: AlbumGenerationConfig): string {
    const noTextInstruction =
      'CRITICAL INSTRUCTION: ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY, NO WRITING, NO NUMBERS, NO CHARACTERS OF ANY KIND IN THE IMAGE.';
    const parts = [`Album artwork for "${title}"`];
    if (config.style) parts.push(`Style: ${config.style}`);
    if (config.genre) parts.push(`Genre: ${config.genre}`);
    if (config.mood) parts.push(`Mood: ${config.mood}`);
    if (content) parts.push(`Inspired by: ${content.substring(0, 200)}`);
    parts.push(
      'Create an abstract composition with a cohesive color palette. Focus on visual elements only - shapes, colors, gradients, and creative patterns.'
    );
    return `${noTextInstruction}\n\n${parts.join('. ')}`;
  }
}

export class DefaultAlbumLinkingHandler implements AlbumLinkingHandler {
  async linkTracksToAlbum(
    albumId: string,
    trackIds: string[],
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<void> {
    if (trackIds.length === 0) {
      logger.info('No tracks to link to album', { albumId });
      return;
    }

    const db = getDatabase();

    logger.info('Linking tracks to album', {
      albumId,
      trackCount: trackIds.length,
      visibility: context.persistenceContext?.visibility,
    });

    try {
      await db.update(tracksTable).set({ albumId }).where(inArray(tracksTable.id, trackIds));

      logger.info('Tracks linked to album successfully', {
        albumId,
        trackCount: trackIds.length,
      });
    } catch (error) {
      logger.error('Failed to link tracks to album', {
        albumId,
        trackIds,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async finalizeAlbum(
    albumId: string,
    artworkUrl: string | undefined,
    config: AlbumGenerationConfig,
    context: ProgressContext
  ): Promise<void> {
    const db = getDatabase();

    logger.info('Finalizing album', {
      albumId,
      hasArtwork: !!artworkUrl,
      visibility: context.persistenceContext?.visibility,
      successfulTracks: context.successfulTracks,
    });

    try {
      const [durationResult] = await db
        .select({ totalDuration: sum(tracksTable.duration) })
        .from(tracksTable)
        .where(eq(tracksTable.albumId, albumId));
      const totalDuration = durationResult?.totalDuration ? parseInt(String(durationResult.totalDuration), 10) : 0;

      const updateData: Record<string, unknown> = {
        status: context.successfulTracks > 0 ? ALBUM_LIFECYCLE.PUBLISHED : 'failed',
        totalTracks: context.successfulTracks,
        totalDuration,
        updatedAt: new Date(),
      };

      if (artworkUrl) {
        updateData.artworkUrl = artworkUrl;
      }

      // Use unified albums table for both shared and personal content
      await db.update(albums).set(updateData).where(eq(albums.id, albumId));

      logger.info('Album finalized successfully', {
        albumId,
        status: updateData.status,
        totalDuration,
        totalTracks: context.successfulTracks,
      });

      // Invalidate public albums cache when shared library album is published
      if (isPubliclyAccessibleContext(context.persistenceContext) && updateData.status === ALBUM_LIFECYCLE.PUBLISHED) {
        this.invalidatePublicAlbumsCache().catch(err => {
          logger.warn('Failed to invalidate public albums cache (non-critical)', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (error) {
      logger.error('Failed to finalize album', {
        albumId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async invalidatePublicAlbumsCache(): Promise<void> {
    try {
      const apiGatewayUrl = getServiceUrl('api-gateway');
      const internalClient = createServiceHttpClient('internal');

      const response = await internalClient.postWithResponse(
        `${apiGatewayUrl}/api/admin/cache/invalidate`,
        { pattern: 'public-albums' },
        { timeout: 10000 }
      );

      if (response.ok) {
        logger.info('Public albums cache invalidated successfully');
      } else {
        logger.warn('Cache invalidation returned non-OK status', { status: response.status });
      }
    } catch (error) {
      // Log but don't throw - cache invalidation is best-effort
      logger.warn('Cache invalidation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  'en-US': 'English',
  'es-ES': 'Spanish',
  'de-DE': 'German',
  'fr-FR': 'French',
  'pt-BR': 'Brazilian Portuguese',
  ar: 'Arabic',
  'ja-JP': 'Japanese',
};

export class DefaultTitleTranslationHandler implements TitleTranslationHandler {
  private httpClient: HttpClient;
  private aiContentServiceUrl: string;

  constructor() {
    this.httpClient = createServiceHttpClient('ai');
    this.aiContentServiceUrl = getServiceUrl('ai-content-service');
  }

  async translateTitle(title: string, targetLanguage: string): Promise<string> {
    const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    const result = await this.httpClient.post<{ success?: boolean; content?: string; data?: { content?: string } }>(
      `${this.aiContentServiceUrl}/api/content/generate`,
      {
        userId: 'system',
        contentType: 'translation',
        prompt: title,
        parameters: {
          language: targetLanguage,
          instruction: `Translate the following album title to ${langName}. Return ONLY the translated title, nothing else. If the title is already in ${langName}, return it unchanged. Keep it concise and natural-sounding as an album title.`,
        },
        options: { templateId: 'simple-translation' },
      },
      {
        headers: {
          'x-user-id': 'system',
          'x-request-id': uuidv4(),
        },
      }
    );

    const content = result?.content || result?.data?.content;
    if (content && content.trim().length > 0) {
      const cleaned = content.trim().replace(/^["']|["']$/g, '');
      logger.info('Title translation completed', { original: title, translated: cleaned, targetLanguage });
      return cleaned;
    }

    logger.warn('Title translation returned empty result, using original', { title, targetLanguage });
    return title;
  }
}
