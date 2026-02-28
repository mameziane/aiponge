/**
 * List Entries Use Case
 * Lists entries for a chapter or user with role-based access validation
 * Consolidated from library and profile GetEntriesUseCase
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

const logger = getLogger('list-entries-use-case');

export interface ListEntriesFilter {
  chapterId?: string;
  bookId?: string;
  entryType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  isArchived?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface EntryWithIllustrations {
  entry: Entry;
  entity: EntryEntity;
  illustrations: Illustration[];
}

export interface ListEntriesResult {
  entries: EntryWithIllustrations[];
  total: number;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  cursorPagination?: {
    hasMore: boolean;
    nextCursor: string | null;
  };
  analytics?: {
    totalEntries: number;
    analyzedEntries: number;
    archivedEntries: number;
  };
}

export class ListEntriesUseCase {
  constructor(
    private entryRepo: EntryRepository,
    private chapterRepo: ChapterRepository,
    private bookRepo: BookRepository,
    private illustrationRepo: IllustrationRepository
  ) {}

  async executeByChapter(
    chapterId: string,
    context: ContentAccessContext
  ): Promise<LibraryResponse<ListEntriesResult>> {
    try {
      const chapter = await this.chapterRepo.getById(chapterId);
      if (!chapter) {
        return notFound('Chapter', chapterId);
      }

      const book = await this.bookRepo.getById(chapter.bookId);
      const bookEntity = book ? new BookEntity(book) : undefined;
      const chapterEntity = new ChapterEntity(chapter, bookEntity);

      if (!chapterEntity.canBeViewedBy(context)) {
        return forbidden('view entries in this chapter', 'You do not have permission to view this chapter');
      }

      const entries = await this.entryRepo.getByChapter(chapterId);

      const entriesWithIllustrations = await this.enrichEntriesWithIllustrations(entries, chapterEntity, bookEntity);

      return success({
        entries: entriesWithIllustrations,
        total: entriesWithIllustrations.length,
      });
    } catch (error) {
      logger.error('Failed to list entries by chapter', { error, chapterId, userId: context.userId });
      return operationFailed('list entries', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async executeByUser(
    context: ContentAccessContext,
    filter?: ListEntriesFilter
  ): Promise<LibraryResponse<ListEntriesResult>> {
    try {
      const limit = filter?.limit ?? 50;
      const offset = filter?.offset ?? 0;

      const dateFilter = { dateFrom: filter?.dateFrom, dateTo: filter?.dateTo };

      const [entries, counts] = await Promise.all([
        this.entryRepo.getByUser(context.userId, { ...dateFilter, limit, offset }),
        this.entryRepo.countByUser(context.userId, dateFilter),
      ]);

      const entriesWithIllustrations = await this.enrichEntriesWithIllustrations(entries);

      return success({
        entries: entriesWithIllustrations,
        total: counts.total,
        pagination: {
          limit,
          offset,
          hasMore: offset + limit < counts.total,
        },
        analytics: {
          totalEntries: counts.total,
          analyzedEntries: counts.processed,
          archivedEntries: 0,
        },
      });
    } catch (error) {
      logger.error('Failed to list entries by user', { error, userId: context.userId });
      return operationFailed('list entries', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async executeByBook(
    bookId: string,
    context: ContentAccessContext,
    filter?: Pick<ListEntriesFilter, 'limit' | 'offset' | 'cursor'>
  ): Promise<LibraryResponse<ListEntriesResult>> {
    try {
      const book = await this.bookRepo.getById(bookId);
      if (!book) {
        return notFound('Book', bookId);
      }

      const bookEntity = new BookEntity(book);

      if (!bookEntity.canBeViewedBy(context)) {
        return forbidden('view entries in this book', 'You do not have permission to view this book');
      }

      const limit = filter?.limit ?? 50;
      const [result, total] = await Promise.all([
        this.entryRepo.getByFilters({
          bookId,
          limit,
          cursor: filter?.cursor,
        }),
        this.entryRepo.countByBook(bookId),
      ]);

      const entriesWithIllustrations = await this.enrichEntriesWithIllustrations(result.items, undefined, bookEntity);

      return success({
        entries: entriesWithIllustrations,
        total,
        cursorPagination: {
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        },
      });
    } catch (error) {
      logger.error('Failed to list entries by book', { error, bookId, userId: context.userId });
      return operationFailed('list entries', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async enrichEntriesWithIllustrations(
    entries: Entry[],
    chapterEntity?: ChapterEntity,
    bookEntity?: BookEntity
  ): Promise<EntryWithIllustrations[]> {
    if (entries.length === 0) return [];

    const entryIds = entries.map(e => e.id);
    const illustrationsMap = await this.illustrationRepo.getByEntries(entryIds);

    return entries.map(entry => ({
      entry,
      entity: new EntryEntity(entry, chapterEntity, bookEntity),
      illustrations: illustrationsMap.get(entry.id) ?? [],
    }));
  }
}
