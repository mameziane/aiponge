/**
 * Get Entry Use Case
 * Retrieves an entry with illustrations and role-based access validation
 */

import {
  BookRepository,
  ChapterRepository,
  EntryRepository,
  IllustrationRepository,
} from '@infrastructure/repositories';
import { Entry, Illustration } from '@infrastructure/database/schemas/library-schema';
import { BookEntity, ChapterEntity, EntryEntity } from '@domains/library/entities';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { LibraryResponse, success, notFound, forbidden, operationFailed } from '../shared/LibraryErrors';
import { getLogger } from '@config/service-urls';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('get-entry-use-case');

export interface GetEntryResult {
  entry: Entry;
  entity: EntryEntity;
  illustrations: Illustration[];
}

export class GetEntryUseCase {
  constructor(
    private entryRepo: EntryRepository,
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository,
    private illustrationRepo: IllustrationRepository
  ) {}

  async execute(entryId: string, context: ContentAccessContext): Promise<LibraryResponse<GetEntryResult>> {
    try {
      const entry = await this.entryRepo.getById(entryId);
      if (!entry) {
        return notFound('Entry', entryId);
      }

      const chapter = await this.chapterRepo.getById(entry.chapterId);
      const book = entry.bookId ? await this.bookRepo.getById(entry.bookId) : null;

      const bookEntity = book ? new BookEntity(book) : undefined;
      const chapterEntity = chapter ? new ChapterEntity(chapter, bookEntity) : undefined;
      const entity = new EntryEntity(entry, chapterEntity, bookEntity);

      if (!entity.canBeViewedBy(context)) {
        return forbidden('view this entry', 'You do not have permission to view this entry');
      }

      const illustrations = await this.illustrationRepo.getByEntry(entryId);

      return success({
        entry,
        entity,
        illustrations,
      });
    } catch (error) {
      logger.error('Failed to get entry', { error, entryId, userId: context.userId });
      return operationFailed('retrieve entry', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
