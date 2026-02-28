/**
 * Create Entry Use Case
 * Creates an entry within a chapter with ownership validation,
 * profile metrics updates, and optional risk detection for safety screening
 */

import { z } from 'zod';
import { BookRepository, ChapterRepository, EntryRepository } from '@infrastructure/repositories';
import { Entry } from '@infrastructure/database/schemas/library-schema';
import { BookEntity, ChapterEntity, EntryEntity } from '@domains/library/entities';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import {
  LibraryResponse,
  success,
  notFound,
  forbidden,
  validationError,
  operationFailed,
} from '../shared/LibraryErrors';
import { IProfileRepository } from '@domains/profile/repositories/IProfileRepository';
import { RiskDetectionService } from '@infrastructure/services';
import { getLogger } from '@config/service-urls';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('create-entry-use-case');

export const createEntryInputSchema = z.object({
  chapterId: z.string().uuid(),
  content: z.string().min(1),
  entryType: z.string().min(1).max(50),
  sortOrder: z.number().int().min(0).optional(),
  chapterSortOrder: z.number().int().min(0).optional(),
  processingStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  sourceTitle: z.string().max(255).optional(),
  sourceAuthor: z.string().max(255).optional(),
  sourceChapter: z.string().max(255).optional(),
  attribution: z.string().max(500).optional(),
  moodContext: z.string().max(100).optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).optional(),
  emotionalIntensity: z.number().int().min(1).max(10).optional(),
  tags: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  musicHints: z
    .object({
      mood: z.string().optional(),
      tempo: z.string().optional(),
      genre: z.string().optional(),
    })
    .optional(),
  depthLevel: z.enum(['brief', 'standard', 'deep']).optional(),
  metadata: z.record(z.unknown()).optional(),
  userDate: z.string().datetime().optional(),
});

export type CreateEntryInput = z.infer<typeof createEntryInputSchema>;

export interface CreateEntryResult {
  entry: Entry;
  entity: EntryEntity;
  riskDetected?: boolean;
}

export interface CreateEntryDependencies {
  profileRepo?: IProfileRepository;
  riskDetectionService?: RiskDetectionService;
}

export class CreateEntryUseCase {
  private profileRepo?: IProfileRepository;
  private riskDetectionService?: RiskDetectionService;

  constructor(
    private entryRepo: EntryRepository,
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository,
    deps?: CreateEntryDependencies
  ) {
    this.profileRepo = deps?.profileRepo;
    this.riskDetectionService = deps?.riskDetectionService;
  }

  async execute(input: CreateEntryInput, context: ContentAccessContext): Promise<LibraryResponse<CreateEntryResult>> {
    try {
      const parsed = createEntryInputSchema.safeParse(input);
      if (!parsed.success) {
        return validationError('Invalid entry data', {
          errors: parsed.error.errors.map(e => ({ path: e.path, message: e.message })),
        });
      }

      const chapter = await this.chapterRepo.getById(parsed.data.chapterId);
      if (!chapter) {
        return notFound('Chapter', parsed.data.chapterId);
      }

      const book = await this.bookRepo.getById(chapter.bookId);
      const bookEntity = book ? new BookEntity(book) : undefined;
      const chapterEntity = new ChapterEntity(chapter, bookEntity);

      if (!chapterEntity.canAddEntriesBy(context)) {
        return forbidden('add entries to this chapter', 'You do not have permission to add entries');
      }

      const entry = await this.entryRepo.create({
        chapterId: parsed.data.chapterId,
        bookId: chapter.bookId,
        userId: context.userId,
        content: parsed.data.content,
        entryType: parsed.data.entryType,
        sortOrder: parsed.data.sortOrder,
        chapterSortOrder: parsed.data.chapterSortOrder,
        processingStatus: parsed.data.processingStatus,
        sourceTitle: parsed.data.sourceTitle,
        sourceAuthor: parsed.data.sourceAuthor,
        sourceChapter: parsed.data.sourceChapter,
        attribution: parsed.data.attribution,
        moodContext: parsed.data.moodContext,
        sentiment: parsed.data.sentiment,
        emotionalIntensity: parsed.data.emotionalIntensity,
        tags: parsed.data.tags,
        themes: parsed.data.themes,
        musicHints: parsed.data.musicHints,
        depthLevel: parsed.data.depthLevel,
        metadata: parsed.data.metadata,
        userDate: parsed.data.userDate ? new Date(parsed.data.userDate) : undefined,
      });

      await this.chapterRepo.updateEntryCount(chapter.id);
      await this.bookRepo.updateEntryCount(chapter.bookId);

      if (this.profileRepo) {
        try {
          await this.profileRepo.incrementEntries(context.userId);
          logger.debug('Profile metrics updated', { userId: context.userId });
        } catch (error) {
          logger.warn('Failed to update profile metrics', { error, userId: context.userId });
        }
      }

      let riskDetected = false;
      if (this.riskDetectionService) {
        try {
          const riskResult = await this.riskDetectionService.analyzeContent({
            content: parsed.data.content,
            userId: context.userId,
            sourceType: 'entry',
            sourceId: entry.id,
            skipAI: false,
          });

          if (riskResult.detected) {
            riskDetected = true;
            logger.warn('Risk detected in entry content', {
              entryId: entry.id,
              userId: context.userId,
              severity: riskResult.severity,
              type: riskResult.type,
              flagId: riskResult.flagId,
            });
          }
        } catch (error) {
          logger.error('Risk detection failed', {
            entryId: entry.id,
            error: serializeError(error),
          });
        }
      }

      const entity = new EntryEntity(entry, chapterEntity, bookEntity);

      logger.info('Entry created', {
        entryId: entry.id,
        chapterId: chapter.id,
        bookId: chapter.bookId,
        userId: context.userId,
        riskDetected,
      });

      return success({ entry, entity, riskDetected });
    } catch (error) {
      logger.error('Failed to create entry', { error, input, userId: context.userId });
      return operationFailed('create entry', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
