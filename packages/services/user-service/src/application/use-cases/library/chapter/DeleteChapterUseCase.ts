/**
 * Delete Chapter Use Case
 * Deletes a chapter with cascading and role-based authorization
 */

import { BookRepository, ChapterRepository } from '@infrastructure/repositories';
import { BookEntity, ChapterEntity } from '@domains/library/entities';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { LibraryResponse, success, notFound, forbidden, operationFailed } from '../shared/LibraryErrors';
import { getLogger } from '@config/service-urls';
import { serializeError, generateCorrelationId } from '@aiponge/platform-core';
import { UserEventPublisher } from '../../../../infrastructure/events/UserEventPublisher';

const logger = getLogger('delete-chapter-use-case');

export interface DeleteChapterResult {
  deleted: boolean;
  chapterId: string;
}

export class DeleteChapterUseCase {
  constructor(
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository
  ) {}

  async execute(chapterId: string, context: ContentAccessContext): Promise<LibraryResponse<DeleteChapterResult>> {
    try {
      const chapter = await this.chapterRepo.getById(chapterId);
      if (!chapter) {
        return notFound('Chapter', chapterId);
      }

      const book = await this.bookRepo.getById(chapter.bookId);
      const bookEntity = book ? new BookEntity(book) : undefined;
      const entity = new ChapterEntity(chapter, bookEntity);

      if (!entity.canBeDeletedBy(context)) {
        return forbidden('delete this chapter', 'You do not have permission to delete this chapter');
      }

      await this.chapterRepo.delete(chapterId);

      await this.bookRepo.updateChapterCount(chapter.bookId);

      logger.info('Chapter deleted', {
        chapterId,
        userId: context.userId,
        chapterTitle: chapter.title,
      });

      UserEventPublisher.libraryChapterDeleted(chapterId, context.userId, generateCorrelationId(), chapter.bookId);

      return success({ deleted: true, chapterId });
    } catch (error) {
      logger.error('Failed to delete chapter', { error, chapterId, userId: context.userId });
      return operationFailed('delete chapter', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
