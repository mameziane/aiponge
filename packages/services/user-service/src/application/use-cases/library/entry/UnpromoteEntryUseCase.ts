/**
 * Unpromote Entry Use Case
 * Removes a promoted entry from the user's shared library (Shared Notes book)
 * The original personal entry remains intact.
 */

import { z } from 'zod';
import { BookRepository, ChapterRepository, EntryRepository } from '@infrastructure/repositories';
import { Entry } from '@infrastructure/database/schemas/library-schema';
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

const logger = getLogger('unpromote-entry-use-case');

export const unpromoteEntryInputSchema = z.object({
  entryId: z.string().uuid(),
});

export type UnpromoteEntryInput = z.infer<typeof unpromoteEntryInputSchema>;

export interface UnpromoteEntryResult {
  originalEntryId: string;
  deletedPromotedEntryId: string;
}

export class UnpromoteEntryUseCase {
  constructor(
    private entryRepo: EntryRepository,
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository
  ) {}

  async execute(
    input: UnpromoteEntryInput,
    context: ContentAccessContext
  ): Promise<LibraryResponse<UnpromoteEntryResult>> {
    try {
      const parsed = unpromoteEntryInputSchema.safeParse(input);
      if (!parsed.success) {
        return validationError('Invalid input', {
          errors: parsed.error.errors.map(e => ({ path: e.path, message: e.message })),
        });
      }

      const originalEntry = await this.entryRepo.getById(parsed.data.entryId);
      if (!originalEntry) {
        return notFound('Entry', parsed.data.entryId);
      }

      const chapter = await this.chapterRepo.getById(originalEntry.chapterId);
      if (!chapter) {
        return notFound('Chapter', originalEntry.chapterId);
      }

      const book = await this.bookRepo.getById(chapter.bookId);
      if (!book) {
        return notFound('Book', chapter.bookId);
      }

      if (book.userId !== context.userId) {
        return forbidden('unpromote this entry', 'You can only unpromote your own entries');
      }

      const promotedEntry = await this.findPromotedCopy(parsed.data.entryId, context.userId);
      if (!promotedEntry) {
        return validationError('Entry not promoted', {
          reason: 'This entry has not been promoted to your shared library',
        });
      }

      await this.entryRepo.delete(promotedEntry.id);

      await this.chapterRepo.updateEntryCount(promotedEntry.chapterId);
      const promotedBook = await this.bookRepo.getById(promotedEntry.bookId);
      if (promotedBook) {
        await this.bookRepo.updateEntryCount(promotedBook.id);
      }

      logger.info('Entry unpromoted from shared library', {
        originalEntryId: parsed.data.entryId,
        deletedPromotedEntryId: promotedEntry.id,
        userId: context.userId,
      });

      return success({
        originalEntryId: parsed.data.entryId,
        deletedPromotedEntryId: promotedEntry.id,
      });
    } catch (error) {
      logger.error('Failed to unpromote entry', {
        error: serializeError(error),
        entryId: input.entryId,
        userId: context.userId,
      });
      return operationFailed('unpromote entry', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async findPromotedCopy(sourceEntryId: string, userId: string): Promise<Entry | null> {
    const sharedBook = await this.bookRepo.getBySystemType(userId, 'shared-notes');
    if (!sharedBook) {
      return null;
    }

    const chapters = await this.chapterRepo.getByBook(sharedBook.id);
    for (const chapter of chapters) {
      const entries = await this.entryRepo.getByChapter(chapter.id);
      const promoted = entries.find(
        e => e.metadata && (e.metadata as Record<string, unknown>).sourceEntryId === sourceEntryId
      );
      if (promoted) {
        return promoted;
      }
    }
    return null;
  }
}
