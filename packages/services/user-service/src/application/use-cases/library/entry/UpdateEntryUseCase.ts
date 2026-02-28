/**
 * Update Entry Use Case
 * Updates an entry with role-based authorization and change tracking
 */

import { z } from 'zod';
import { BookRepository, ChapterRepository, EntryRepository } from '@infrastructure/repositories';
import { IIntelligenceRepository } from '@domains/intelligence';
import type { Entry } from '@infrastructure/database/schemas/library-schema';
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
import { getLogger } from '@config/service-urls';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('update-entry-use-case');

export const updateEntryInputSchema = z.object({
  content: z.string().min(1).optional(),
  entryType: z.string().min(1).max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
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
  processingStatus: z.string().optional(),
  chapterId: z.string().nullable().optional(),
  illustrationUrl: z.string().nullable().optional(),
  clarityLevel: z.string().optional(),
});

export type UpdateEntryInput = z.infer<typeof updateEntryInputSchema>;

export interface UpdateEntryDependencies {
  intelligenceRepo?: IIntelligenceRepository;
}

export interface UpdateEntryResult {
  entry: Entry;
  entity: EntryEntity;
  changes: {
    fieldsUpdated: string[];
    previousValues: Record<string, unknown>;
  };
  impact: {
    requiresReanalysis: boolean;
  };
}

export class UpdateEntryUseCase {
  private intelligenceRepo?: IIntelligenceRepository;

  constructor(
    private entryRepo: EntryRepository,
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository,
    deps?: UpdateEntryDependencies
  ) {
    this.intelligenceRepo = deps?.intelligenceRepo;
  }

  async execute(
    entryId: string,
    input: UpdateEntryInput,
    context: ContentAccessContext
  ): Promise<LibraryResponse<UpdateEntryResult>> {
    try {
      const parsed = updateEntryInputSchema.safeParse(input);
      if (!parsed.success) {
        return validationError('Invalid entry data', {
          errors: parsed.error.errors.map(e => ({ path: e.path, message: e.message })),
        });
      }

      const existingEntry = await this.entryRepo.getById(entryId);
      if (!existingEntry) {
        return notFound('Entry', entryId);
      }

      const chapter = await this.chapterRepo.getById(existingEntry.chapterId);
      const book = existingEntry.bookId ? await this.bookRepo.getById(existingEntry.bookId) : null;

      const bookEntity = book ? new BookEntity(book) : undefined;
      const chapterEntity = chapter ? new ChapterEntity(chapter, bookEntity) : undefined;
      const existingEntity = new EntryEntity(existingEntry, chapterEntity, bookEntity);

      if (!existingEntity.canBeEditedBy(context)) {
        return forbidden('update this entry', 'You do not have permission to update this entry');
      }

      const previousValues: Record<string, unknown> = {};
      const fieldsUpdated: string[] = [];
      const updateData: Record<string, unknown> = {};

      const { userDate, chapterId, metadata, ...restData } = parsed.data;

      for (const [key, value] of Object.entries(restData)) {
        if (value !== undefined) {
          previousValues[key] = (existingEntry as Record<string, unknown>)[key];
          updateData[key] = value;
          fieldsUpdated.push(key);
        }
      }

      if (userDate !== undefined) {
        previousValues.userDate = existingEntry.userDate;
        updateData.userDate = new Date(userDate);
        fieldsUpdated.push('userDate');
      }

      if (metadata !== undefined) {
        previousValues.metadata = existingEntry.metadata;
        const currentMetadata = (existingEntry.metadata as Record<string, unknown>) || {};
        updateData.metadata = { ...currentMetadata, ...metadata };
        fieldsUpdated.push('metadata');
      }

      if (chapterId !== undefined) {
        const isChapterChanging = existingEntry.chapterId !== chapterId;
        previousValues.chapterId = existingEntry.chapterId;
        updateData.chapterId = chapterId;
        fieldsUpdated.push('chapterId');

        if (isChapterChanging && this.intelligenceRepo) {
          if (chapterId === null) {
            updateData.chapterSortOrder = null;
          } else {
            const maxSortOrder = await this.intelligenceRepo.getMaxChapterSortOrder(chapterId);
            updateData.chapterSortOrder = maxSortOrder + 1;
          }
          fieldsUpdated.push('chapterSortOrder');
        }
      }

      const updatedEntry = await this.entryRepo.update(entryId, updateData);
      const entity = new EntryEntity(updatedEntry, chapterEntity, bookEntity);

      const requiresReanalysis = fieldsUpdated.includes('content');

      logger.info('Entry updated', {
        entryId,
        userId: context.userId,
        changes: fieldsUpdated,
      });

      return success({
        entry: updatedEntry,
        entity,
        changes: {
          fieldsUpdated,
          previousValues,
        },
        impact: {
          requiresReanalysis,
        },
      });
    } catch (error) {
      logger.error('Failed to update entry', { error, entryId, userId: context.userId });
      return operationFailed('update entry', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
