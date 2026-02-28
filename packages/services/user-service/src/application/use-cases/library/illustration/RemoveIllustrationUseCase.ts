/**
 * Remove Illustration Use Case
 * Removes an illustration with role-based authorization
 */

import {
  BookRepository,
  ChapterRepository,
  EntryRepository,
  IllustrationRepository,
} from '@infrastructure/repositories';
import { BookEntity, ChapterEntity, EntryEntity, IllustrationEntity } from '@domains/library/entities';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { LibraryResponse, success, notFound, forbidden, operationFailed } from '../shared/LibraryErrors';
import { getLogger } from '@config/service-urls';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('remove-illustration-use-case');

export interface RemoveIllustrationResult {
  deleted: boolean;
  illustrationId: string;
}

export class RemoveIllustrationUseCase {
  constructor(
    private illustrationRepo: IllustrationRepository,
    private bookRepo: BookRepository,
    private chapterRepo: ChapterRepository,
    private entryRepo: EntryRepository
  ) {}

  async execute(
    illustrationId: string,
    context: ContentAccessContext
  ): Promise<LibraryResponse<RemoveIllustrationResult>> {
    try {
      const illustration = await this.illustrationRepo.getById(illustrationId);
      if (!illustration) {
        return notFound('Illustration', illustrationId);
      }

      let bookEntity: BookEntity | undefined;
      let chapterEntity: ChapterEntity | undefined;
      let entryEntity: EntryEntity | undefined;

      if (illustration.bookId) {
        const book = await this.bookRepo.getById(illustration.bookId);
        bookEntity = book ? new BookEntity(book) : undefined;
      }

      if (illustration.chapterId) {
        const chapter = await this.chapterRepo.getById(illustration.chapterId);
        if (chapter && !bookEntity) {
          const book = await this.bookRepo.getById(chapter.bookId);
          bookEntity = book ? new BookEntity(book) : undefined;
        }
        chapterEntity = chapter ? new ChapterEntity(chapter, bookEntity) : undefined;
      }

      if (illustration.entryId) {
        const entry = await this.entryRepo.getById(illustration.entryId);
        if (entry) {
          if (!chapterEntity) {
            const chapter = await this.chapterRepo.getById(entry.chapterId);
            chapterEntity = chapter ? new ChapterEntity(chapter, bookEntity) : undefined;
          }
          if (!bookEntity && entry.bookId) {
            const book = await this.bookRepo.getById(entry.bookId);
            bookEntity = book ? new BookEntity(book) : undefined;
          }
          entryEntity = new EntryEntity(entry, chapterEntity, bookEntity);
        }
      }

      const entity = new IllustrationEntity(illustration, bookEntity, chapterEntity, entryEntity);

      if (!entity.canBeDeletedBy(context)) {
        return forbidden('delete this illustration', 'You do not have permission to delete this illustration');
      }

      await this.illustrationRepo.delete(illustrationId);

      logger.info('Illustration removed', {
        illustrationId,
        userId: context.userId,
      });

      return success({ deleted: true, illustrationId });
    } catch (error) {
      logger.error('Failed to remove illustration', { error, illustrationId, userId: context.userId });
      return operationFailed('remove illustration', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
