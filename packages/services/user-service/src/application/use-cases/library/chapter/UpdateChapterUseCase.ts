/**
 * Update Chapter Use Case
 * Updates a chapter with role-based authorization
 */

import { z } from 'zod';
import { BookRepository, ChapterRepository } from '@infrastructure/repositories';
import { Chapter } from '@infrastructure/database/schemas/library-schema';
import { BookEntity, ChapterEntity } from '@domains/library/entities';
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

const logger = getLogger('update-chapter-use-case');

export const updateChapterInputSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isLocked: z.boolean().optional(),
  unlockTrigger: z.string().max(100).optional(),
});

export type UpdateChapterInput = z.infer<typeof updateChapterInputSchema>;

export interface UpdateChapterResult {
  chapter: Chapter;
  entity: ChapterEntity;
}

export class UpdateChapterUseCase {
  constructor(
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository
  ) {}

  async execute(
    chapterId: string,
    input: UpdateChapterInput,
    context: ContentAccessContext
  ): Promise<LibraryResponse<UpdateChapterResult>> {
    try {
      const parsed = updateChapterInputSchema.safeParse(input);
      if (!parsed.success) {
        return validationError('Invalid chapter data', {
          errors: parsed.error.errors.map(e => ({ path: e.path, message: e.message })),
        });
      }

      const existingChapter = await this.chapterRepo.getById(chapterId);
      if (!existingChapter) {
        return notFound('Chapter', chapterId);
      }

      const book = await this.bookRepo.getById(existingChapter.bookId);
      const bookEntity = book ? new BookEntity(book) : undefined;
      const existingEntity = new ChapterEntity(existingChapter, bookEntity);

      if (!existingEntity.canBeEditedBy(context)) {
        return forbidden('update this chapter', 'You do not have permission to update this chapter');
      }

      const updatedChapter = await this.chapterRepo.update(chapterId, parsed.data);
      const entity = new ChapterEntity(updatedChapter, bookEntity);

      logger.info('Chapter updated', {
        chapterId,
        userId: context.userId,
        changes: Object.keys(parsed.data),
      });

      return success({ chapter: updatedChapter, entity });
    } catch (error) {
      logger.error('Failed to update chapter', { error, chapterId, userId: context.userId });
      return operationFailed('update chapter', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
