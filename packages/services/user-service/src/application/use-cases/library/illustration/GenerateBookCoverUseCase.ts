/**
 * Generate Book Cover Use Case
 * Generates AI-powered cover images for books using centralized ai-content-service
 * Uses AiContentServiceClient for unified image generation and storage
 * Cover themes and description prefixes are data-driven via lib_book_types.default_settings
 * Enriches cover generation with actual book content (themes, mood, sentiment) from entries
 */

import { IllustrationRepository, BookRepository, BookTypeRepository, EntryRepository } from '@infrastructure/repositories';
import { Illustration } from '@infrastructure/database/schemas/library-schema';
import { BookEntity } from '@domains/library/entities';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { LibraryResponse, success, notFound, forbidden, operationFailed } from '../shared/LibraryErrors';
import { getLogger } from '@config/service-urls';
import { AiContentServiceClient } from '@infrastructure/clients';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';

const logger = getLogger('generate-book-cover-use-case');

export interface GenerateBookCoverInput {
  bookId: string;
  title: string;
  description?: string;
  themes?: string[];
  style?: 'artistic' | 'minimalist' | 'classical' | 'modern';
  bookType?: string;
}

const DEFAULT_COVER_THEMES = 'knowledge and insight';
const DEFAULT_COVER_DESCRIPTION_PREFIX = 'A book exploring';

interface CoverDefaults {
  themes: string;
  descriptionPrefix: string;
}

export function extractCoverDefaults(defaultSettings: unknown): CoverDefaults {
  const settings = defaultSettings as Record<string, unknown> | null;
  return {
    themes: (typeof settings?.coverThemes === 'string' && settings.coverThemes) || DEFAULT_COVER_THEMES,
    descriptionPrefix:
      (typeof settings?.coverDescriptionPrefix === 'string' && settings.coverDescriptionPrefix) ||
      DEFAULT_COVER_DESCRIPTION_PREFIX,
  };
}

export interface GenerateBookCoverResult {
  illustration: Illustration;
  artworkUrl: string;
}

interface ContentEnrichment {
  contentSummary?: string;
  dominantMood?: string;
  emotionalTone?: string;
  keySymbols?: string;
  extractedThemes?: string[];
}

const MOOD_PRIORITY: Record<string, number> = {
  serene: 1,
  contemplative: 2,
  hopeful: 3,
  joyful: 4,
  melancholic: 5,
  anxious: 6,
  determined: 7,
  grateful: 8,
  reflective: 9,
  peaceful: 10,
};

function deriveMoodLabel(moods: string[]): string {
  if (moods.length === 0) return '';
  const counts = new Map<string, number>();
  for (const m of moods) {
    const lower = m.toLowerCase();
    counts.set(lower, (counts.get(lower) || 0) + 1);
  }
  let dominant = '';
  let maxCount = 0;
  for (const [mood, count] of counts) {
    if (count > maxCount || (count === maxCount && (MOOD_PRIORITY[mood] ?? 99) < (MOOD_PRIORITY[dominant] ?? 99))) {
      dominant = mood;
      maxCount = count;
    }
  }
  return dominant;
}

function deriveSentimentTone(sentiments: string[], intensities: number[]): string {
  if (sentiments.length === 0) return '';
  const counts = new Map<string, { count: number; totalIntensity: number }>();
  for (let i = 0; i < sentiments.length; i++) {
    const s = sentiments[i].toLowerCase();
    const existing = counts.get(s) || { count: 0, totalIntensity: 0 };
    existing.count++;
    existing.totalIntensity += intensities[i] ?? 5;
    counts.set(s, existing);
  }
  let dominant = '';
  let maxScore = 0;
  for (const [sentiment, data] of counts) {
    const score = data.count * (data.totalIntensity / data.count);
    if (score > maxScore) {
      dominant = sentiment;
      maxScore = score;
    }
  }
  const avgIntensity = intensities.length > 0
    ? intensities.reduce((a, b) => a + b, 0) / intensities.length
    : 5;
  const intensityLabel = avgIntensity >= 7 ? 'deeply' : avgIntensity >= 4 ? 'gently' : 'subtly';
  return dominant ? `${intensityLabel} ${dominant}` : '';
}

const MAX_ENTRIES_FOR_ENRICHMENT = 30;
const MAX_CONTENT_SUMMARY_LENGTH = 200;

export class GenerateBookCoverUseCase {
  private aiContentClient: AiContentServiceClient;

  constructor(
    private illustrationRepo: IllustrationRepository,
    private bookRepo: BookRepository,
    private bookTypeRepo: BookTypeRepository,
    private entryRepo: EntryRepository
  ) {
    this.aiContentClient = new AiContentServiceClient();
  }

  private async extractContentEnrichment(bookId: string): Promise<ContentEnrichment> {
    try {
      const entries = await this.entryRepo.getByBook(bookId);
      if (entries.length === 0) {
        return {};
      }

      const sampled = entries.slice(0, MAX_ENTRIES_FOR_ENRICHMENT);

      const allThemes: string[] = [];
      const allTags: string[] = [];
      const moods: string[] = [];
      const sentiments: string[] = [];
      const intensities: number[] = [];
      const contentSnippets: string[] = [];

      for (const entry of sampled) {
        if (entry.themes && Array.isArray(entry.themes)) {
          allThemes.push(...entry.themes);
        }
        if (entry.tags && Array.isArray(entry.tags)) {
          allTags.push(...entry.tags);
        }
        if (entry.moodContext) {
          moods.push(entry.moodContext);
        }
        if (entry.sentiment) {
          sentiments.push(entry.sentiment);
          intensities.push(entry.emotionalIntensity ?? 5);
        }
        if (entry.content) {
          const snippet = entry.content.substring(0, 100).trim();
          if (snippet.length > 20) {
            contentSnippets.push(snippet);
          }
        }
      }

      const themeCounts = new Map<string, number>();
      for (const t of allThemes) {
        const lower = t.toLowerCase();
        themeCounts.set(lower, (themeCounts.get(lower) || 0) + 1);
      }
      const topThemes = [...themeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([theme]) => theme);

      const tagCounts = new Map<string, number>();
      for (const t of allTags) {
        const lower = t.toLowerCase();
        tagCounts.set(lower, (tagCounts.get(lower) || 0) + 1);
      }
      const topTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);

      const dominantMood = deriveMoodLabel(moods);
      const emotionalTone = deriveSentimentTone(sentiments, intensities);

      let contentSummary = '';
      if (topThemes.length > 0) {
        contentSummary = `Explores ${topThemes.join(', ')}`;
        if (topTags.length > 0) {
          contentSummary += ` through ${topTags.slice(0, 3).join(', ')}`;
        }
      } else if (contentSnippets.length > 0) {
        contentSummary = contentSnippets.slice(0, 3).join('; ');
      }
      if (contentSummary.length > MAX_CONTENT_SUMMARY_LENGTH) {
        contentSummary = contentSummary.substring(0, MAX_CONTENT_SUMMARY_LENGTH - 3) + '...';
      }

      const visualSymbols = topTags
        .filter(tag => !topThemes.includes(tag))
        .slice(0, 4);
      const keySymbols = visualSymbols.length > 0 ? visualSymbols.join(', ') : undefined;

      logger.info('Content enrichment extracted', {
        bookId,
        entryCount: entries.length,
        sampledCount: sampled.length,
        themeCount: topThemes.length,
        dominantMood,
        emotionalTone: emotionalTone || undefined,
        hasContentSummary: !!contentSummary,
      });

      return {
        contentSummary: contentSummary || undefined,
        dominantMood: dominantMood || undefined,
        emotionalTone: emotionalTone || undefined,
        keySymbols,
        extractedThemes: topThemes.length > 0 ? topThemes : undefined,
      };
    } catch (error) {
      logger.warn('Failed to extract content enrichment, proceeding with defaults', {
        bookId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  async execute(
    input: GenerateBookCoverInput,
    context: ContentAccessContext
  ): Promise<LibraryResponse<GenerateBookCoverResult>> {
    const startTime = Date.now();

    try {
      const book = await this.bookRepo.getById(input.bookId);
      if (!book) {
        return notFound('Book', input.bookId);
      }

      const bookEntity = new BookEntity(book);
      if (!bookEntity.isOwnedBy(context.userId) && !bookEntity.canBeEditedBy(context)) {
        return forbidden('generate cover for this book', 'You do not have permission');
      }

      const existingCover = await this.illustrationRepo.getBookCover(input.bookId);
      if (existingCover) {
        logger.info('Removing existing cover before regeneration', { bookId: input.bookId, existingId: existingCover.id });
        await this.illustrationRepo.delete(existingCover.id);
      }

      logger.info('Generating book cover via ai-content-service', {
        bookId: input.bookId,
        title: input.title,
      });

      const styleDescriptions: Record<string, string> = {
        artistic: 'artistic oil painting with rich textures',
        minimalist: 'clean minimalist design with elegant simplicity',
        classical: 'classical Renaissance-inspired with ornate details',
        modern: 'contemporary digital art with bold colors',
      };

      let coverDefaults: CoverDefaults = {
        themes: DEFAULT_COVER_THEMES,
        descriptionPrefix: DEFAULT_COVER_DESCRIPTION_PREFIX,
      };
      if (input.bookType) {
        const bookType = await this.bookTypeRepo.getById(input.bookType);
        if (bookType) {
          coverDefaults = extractCoverDefaults(bookType.defaultSettings);
        }
      }

      const enrichment = await this.extractContentEnrichment(input.bookId);

      const themes = enrichment.extractedThemes?.length
        ? enrichment.extractedThemes.slice(0, 3).join(', ')
        : input.themes?.length
          ? input.themes.slice(0, 3).join(', ')
          : coverDefaults.themes;

      const style = styleDescriptions[input.style || 'artistic'];

      const coverResult = await this.aiContentClient.generateBookCover({
        title: input.title,
        description: input.description || `${coverDefaults.descriptionPrefix} ${themes}`,
        themes,
        bookType: input.bookType,
        tradition: 'universal',
        era: 'timeless',
        style,
        contentSummary: enrichment.contentSummary,
        dominantMood: enrichment.dominantMood,
        emotionalTone: enrichment.emotionalTone,
        keySymbols: enrichment.keySymbols,
        userId: context.userId,
        visibility: CONTENT_VISIBILITY.SHARED,
        destinationPath: `user/${context.userId}/covers/${input.bookId}`,
      });

      logger.info('Cover generation result from ai-content-service', {
        bookId: input.bookId,
        success: coverResult.success,
        hasImageUrl: !!coverResult.artworkUrl,
        artworkUrlPrefix: coverResult.artworkUrl?.substring(0, 80),
        error: coverResult.error,
        processingTimeMs: coverResult.processingTimeMs,
        hasEnrichment: !!(enrichment.contentSummary || enrichment.dominantMood),
      });

      if (!coverResult.success || !coverResult.artworkUrl) {
        logger.error('Failed to generate cover image via ai-content-service', {
          bookId: input.bookId,
          error: coverResult.error,
          fullResult: JSON.stringify(coverResult),
        });
        return operationFailed('generate cover image', coverResult.error || 'Image generation failed');
      }

      logger.info('Creating illustration record in database', {
        bookId: input.bookId,
        artworkUrl: coverResult.artworkUrl,
      });

      const illustration = await this.illustrationRepo.create({
        bookId: input.bookId,
        url: coverResult.artworkUrl,
        artworkUrl: coverResult.artworkUrl,
        altText: `Cover image for ${input.title}`,
        illustrationType: 'cover',
        source: 'ai_generated',
        sortOrder: 0,
        generationPrompt: `Book cover for: ${input.title}`,
        generationMetadata: {
          provider: 'ai-content-service',
          templateUsed: coverResult.templateUsed,
          processingTimeMs: coverResult.processingTimeMs || Date.now() - startTime,
          contentEnriched: !!(enrichment.contentSummary || enrichment.dominantMood),
        },
        width: 1024,
        height: 1024,
      });

      logger.info('Book cover generated and stored successfully', {
        bookId: input.bookId,
        illustrationId: illustration.id,
        processingTimeMs: Date.now() - startTime,
        contentEnriched: !!(enrichment.contentSummary || enrichment.dominantMood),
      });

      return success({ illustration, artworkUrl: coverResult.artworkUrl });
    } catch (error) {
      logger.error('Failed to generate book cover', {
        error,
        bookId: input.bookId,
        userId: context.userId,
      });
      return operationFailed('generate book cover', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
