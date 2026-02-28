/**
 * Promote Entry Use Case
 * Copies a personal entry to the user's shared library (Shared Notes book)
 * for visibility to followers. Original entry remains intact.
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
import { getLogger } from '@config/service-urls';
import { isContentPubliclyAccessible, CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('promote-entry-use-case');

export const promoteEntryInputSchema = z.object({
  entryId: z.string().uuid(),
});

export type PromoteEntryInput = z.infer<typeof promoteEntryInputSchema>;

export interface PromoteEntryResult {
  originalEntryId: string;
  promotedEntryId: string;
  sharedBookId: string;
  sharedChapterId: string;
}

const SHARED_CHAPTER_TITLE = 'Shared Entries';
const SHARED_CHAPTER_DESCRIPTION = 'Entries promoted to share with followers';

export class PromoteEntryUseCase {
  constructor(
    private entryRepo: EntryRepository,
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository
  ) {}

  async execute(input: PromoteEntryInput, context: ContentAccessContext): Promise<LibraryResponse<PromoteEntryResult>> {
    try {
      const parsed = promoteEntryInputSchema.safeParse(input);
      if (!parsed.success) {
        return validationError('Invalid input', {
          errors: parsed.error.errors.map(e => ({ path: e.path, message: e.message })),
        });
      }

      const entry = await this.entryRepo.getById(parsed.data.entryId);
      if (!entry) {
        return notFound('Entry', parsed.data.entryId);
      }

      const chapter = await this.chapterRepo.getById(entry.chapterId);
      if (!chapter) {
        return notFound('Chapter', entry.chapterId);
      }

      const book = await this.bookRepo.getById(chapter.bookId);
      if (!book) {
        return notFound('Book', chapter.bookId);
      }

      const bookEntity = new BookEntity(book);
      const chapterEntity = new ChapterEntity(chapter, bookEntity);
      const entryEntity = new EntryEntity(entry, chapterEntity);

      if (!entryEntity.isOwnedBy(context.userId)) {
        return forbidden('promote this entry', 'You can only promote your own entries');
      }

      if (isContentPubliclyAccessible(bookEntity.visibility ?? CONTENT_VISIBILITY.PERSONAL)) {
        return validationError('Entry is already shared', {
          reason: 'This entry is already in a shared or public book',
        });
      }

      const existingPromoted = await this.findExistingPromotion(parsed.data.entryId, context.userId);
      if (existingPromoted) {
        return validationError('Entry already promoted', {
          promotedEntryId: existingPromoted.id,
          reason: 'This entry has already been promoted to your shared library',
        });
      }

      const sharedBook = await this.bookRepo.getOrCreateSharedNotesBook(context.userId);
      const sharedChapter = await this.getOrCreateSharedChapter(sharedBook.id, context.userId);

      const existingMetadata =
        entry.metadata && typeof entry.metadata === 'object' ? (entry.metadata as Record<string, unknown>) : {};
      const promotedEntry = await this.entryRepo.create({
        chapterId: sharedChapter.id,
        bookId: sharedBook.id,
        userId: context.userId,
        content: entry.content,
        entryType: entry.entryType,
        sortOrder: await this.getNextSortOrder(sharedChapter.id),
        sourceTitle: entry.sourceTitle ?? undefined,
        sourceAuthor: entry.sourceAuthor ?? undefined,
        sourceChapter: entry.sourceChapter ?? undefined,
        attribution: entry.attribution ?? undefined,
        moodContext: entry.moodContext ?? undefined,
        sentiment: entry.sentiment ?? undefined,
        emotionalIntensity: entry.emotionalIntensity ?? undefined,
        tags: entry.tags ?? undefined,
        themes: entry.themes ?? undefined,
        musicHints: (entry.musicHints as Record<string, unknown>) ?? undefined,
        depthLevel: entry.depthLevel ?? undefined,
        metadata: {
          ...existingMetadata,
          sourceEntryId: parsed.data.entryId,
          promotedAt: new Date().toISOString(),
        },
      });

      await this.chapterRepo.updateEntryCount(sharedChapter.id);
      await this.bookRepo.updateEntryCount(sharedBook.id);

      logger.info('Entry promoted to shared library', {
        originalEntryId: parsed.data.entryId,
        promotedEntryId: promotedEntry.id,
        sharedBookId: sharedBook.id,
        sharedChapterId: sharedChapter.id,
        userId: context.userId,
      });

      return success({
        originalEntryId: parsed.data.entryId,
        promotedEntryId: promotedEntry.id,
        sharedBookId: sharedBook.id,
        sharedChapterId: sharedChapter.id,
      });
    } catch (error) {
      logger.error('Failed to promote entry', {
        error: serializeError(error),
        entryId: input.entryId,
        userId: context.userId,
      });
      return operationFailed('promote entry', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async findExistingPromotion(sourceEntryId: string, userId: string): Promise<Entry | null> {
    const sharedBook = await this.bookRepo.getBySystemType(userId, 'shared-notes');
    if (!sharedBook) {
      return null;
    }

    const chapters = await this.chapterRepo.getByBook(sharedBook.id);
    for (const chapter of chapters) {
      const entries = await this.entryRepo.getByChapter(chapter.id);
      const existing = entries.find(e => e.metadata && (e.metadata as Record<string, unknown>).sourceEntryId === sourceEntryId);
      if (existing) {
        return existing;
      }
    }
    return null;
  }

  private async getOrCreateSharedChapter(bookId: string, userId: string) {
    const chapters = await this.chapterRepo.getByBook(bookId);
    const existingChapter = chapters.find(c => c.title === SHARED_CHAPTER_TITLE);
    if (existingChapter) {
      return existingChapter;
    }

    return this.chapterRepo.create({
      bookId,
      userId,
      title: SHARED_CHAPTER_TITLE,
      description: SHARED_CHAPTER_DESCRIPTION,
      sortOrder: 0,
    });
  }

  private async getNextSortOrder(chapterId: string): Promise<number> {
    const entries = await this.entryRepo.getByChapter(chapterId);
    if (entries.length === 0) {
      return 0;
    }
    return Math.max(...entries.map(e => e.sortOrder ?? 0)) + 1;
  }
}
