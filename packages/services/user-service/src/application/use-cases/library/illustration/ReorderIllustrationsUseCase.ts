/**
 * Reorder Illustrations Use Case
 * Reorders illustrations for an entry with role-based authorization
 */

import {
  BookRepository,
  ChapterRepository,
  EntryRepository,
  IllustrationRepository,
} from '@infrastructure/repositories';
import { Illustration } from '@infrastructure/database/schemas/library-schema';
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

const logger = getLogger('reorder-illustrations-use-case');

export interface ReorderIllustrationsResult {
  illustrations: Illustration[];
}

export class ReorderIllustrationsUseCase {
  constructor(
    private illustrationRepo: IllustrationRepository,
    private entryRepo: EntryRepository,
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository
  ) {}

  async execute(
    entryId: string,
    illustrationIds: string[],
    context: ContentAccessContext
  ): Promise<LibraryResponse<ReorderIllustrationsResult>> {
    try {
      if (!illustrationIds || illustrationIds.length === 0) {
        return validationError('Illustration IDs are required');
      }

      const entry = await this.entryRepo.getById(entryId);
      if (!entry) {
        return notFound('Entry', entryId);
      }

      const chapter = await this.chapterRepo.getById(entry.chapterId);
      const book = entry.bookId ? await this.bookRepo.getById(entry.bookId) : null;

      const bookEntity = book ? new BookEntity(book) : undefined;
      const chapterEntity = chapter ? new ChapterEntity(chapter, bookEntity) : undefined;
      const entryEntity = new EntryEntity(entry, chapterEntity, bookEntity);

      if (!entryEntity.canBeEditedBy(context)) {
        return forbidden('reorder illustrations', 'You do not have permission to reorder illustrations');
      }

      for (let i = 0; i < illustrationIds.length; i++) {
        await this.illustrationRepo.updateSortOrder(illustrationIds[i], i);
      }

      const illustrations = await this.illustrationRepo.getByEntry(entryId);

      logger.info('Illustrations reordered', {
        entryId,
        illustrationCount: illustrations.length,
        userId: context.userId,
      });

      return success({ illustrations });
    } catch (error) {
      logger.error('Failed to reorder illustrations', { error, entryId, userId: context.userId });
      return operationFailed('reorder illustrations', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
