import { eq, desc, and, sql, inArray, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import {
  libBooks as books,
  libChapters as chapters,
  libEntries as entries,
} from '../../database/schemas/library-schema';
import type { Chapter, InsertChapter } from '../../../domains/library/types';
import { getLogger } from '../../../config/service-urls';
import { ProfileError } from '../../../application/errors/errors';

const logger = getLogger('intelligence-repository');

export class ChapterRepositoryPart {
  constructor(private readonly db: DatabaseConnection) {}

  async createChapter(chapterData: InsertChapter): Promise<Chapter> {
    const [chapter] = await this.db
      .insert(chapters)
      .values(chapterData as typeof chapters.$inferInsert)
      .returning();
    logger.info('Chapter created', { id: chapter.id, bookId: chapter.bookId, title: chapter.title });
    return chapter;
  }

  async findChaptersByUserId(userId: string, bookId?: string): Promise<Chapter[]> {
    logger.info('[findChaptersByUserId] Querying chapters', { userId, bookId, table: 'lib_chapters' });

    if (bookId) {
      const result = await this.db
        .select({ chapter: chapters })
        .from(chapters)
        .innerJoin(books, eq(chapters.bookId, books.id))
        .where(
          and(
            eq(books.userId, userId),
            eq(chapters.bookId, bookId),
            isNull(chapters.deletedAt),
            isNull(books.deletedAt)
          )
        )
        .orderBy(chapters.sortOrder);

      logger.info('[findChaptersByUserId] Query result', {
        userId,
        bookId,
        count: result.length,
        results: result.map(c => ({ id: c.chapter.id, title: c.chapter.title, bookId: c.chapter.bookId })),
      });
      return result.map(r => r.chapter);
    }

    const result = await this.db
      .select({ chapter: chapters })
      .from(chapters)
      .innerJoin(books, eq(chapters.bookId, books.id))
      .where(and(eq(books.userId, userId), isNull(chapters.deletedAt), isNull(books.deletedAt)))
      .orderBy(chapters.sortOrder);

    logger.info('[findChaptersByUserId] Query result', {
      userId,
      bookId,
      count: result.length,
      results: result.map(c => ({ id: c.chapter.id, title: c.chapter.title, bookId: c.chapter.bookId })),
    });
    return result.map(r => r.chapter);
  }

  async findChapterById(id: string): Promise<Chapter | null> {
    const [chapter] = await this.db
      .select()
      .from(chapters)
      .where(and(eq(chapters.id, id), isNull(chapters.deletedAt)));
    return chapter || null;
  }

  async findChapterByUserIdAndTitle(userId: string, title: string): Promise<Chapter | null> {
    const result = await this.db
      .select({ chapter: chapters })
      .from(chapters)
      .innerJoin(books, eq(chapters.bookId, books.id))
      .where(
        and(eq(books.userId, userId), eq(chapters.title, title), isNull(chapters.deletedAt), isNull(books.deletedAt))
      );
    return result[0]?.chapter || null;
  }

  async updateChapter(id: string, data: Partial<Chapter>): Promise<Chapter> {
    const [chapter] = await this.db
      .update(chapters)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(chapters.id, id), isNull(chapters.deletedAt)))
      .returning();

    if (!chapter) throw ProfileError.notFound('Chapter', id);
    logger.info('Chapter updated', { id, updates: Object.keys(data) });
    return chapter;
  }

  async deleteChapter(id: string): Promise<void> {
    const entriesInChapter = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(entries)
      .where(and(eq(entries.chapterId, id), isNull(entries.deletedAt)));

    if (Number(entriesInChapter[0]?.count ?? 0) > 0) {
      logger.warn('Deleting chapter with entries - entries will be cascade deleted', {
        chapterId: id,
        entryCount: entriesInChapter[0]?.count,
      });
    }

    await this.db.update(chapters).set({ deletedAt: new Date() }).where(eq(chapters.id, id));
    logger.info('Chapter soft-deleted', { id });
  }

  async assignEntriesToChapter(entryIds: string[], chapterId: string | null, userId: string): Promise<void> {
    if (!chapterId) {
      throw ProfileError.validationError('chapterId', 'Entries must be assigned to a chapter');
    }

    const userEntries = await this.db
      .select({ entry: entries })
      .from(entries)
      .innerJoin(books, eq(entries.bookId, books.id))
      .where(
        and(inArray(entries.id, entryIds), eq(books.userId, userId), isNull(entries.deletedAt), isNull(books.deletedAt))
      );

    if (userEntries.length !== entryIds.length) {
      throw ProfileError.validationError('entries', 'Some entries do not belong to this user');
    }

    const existingEntries = await this.db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${entries.sortOrder}), -1)` })
      .from(entries)
      .where(and(eq(entries.chapterId, chapterId), isNull(entries.deletedAt)));

    let nextSortOrder = (existingEntries[0]?.maxOrder ?? -1) + 1;

    for (const entryId of entryIds) {
      await this.db
        .update(entries)
        .set({
          chapterId,
          sortOrder: nextSortOrder,
        })
        .where(and(eq(entries.id, entryId), isNull(entries.deletedAt)));
      nextSortOrder++;
    }

    logger.info('Entries assigned to chapter', {
      entryCount: entryIds.length,
      chapterId,
      userId,
    });
  }

  async updateEntryChapterOrder(entryId: string, sortOrder: number, userId: string): Promise<void> {
    await this.db
      .update(entries)
      .set({ sortOrder })
      .where(and(eq(entries.id, entryId), isNull(entries.deletedAt)));

    logger.info('Entry sort order updated', { entryId, sortOrder, userId });
  }

  async getMaxChapterSortOrder(chapterId: string): Promise<number> {
    const result = await this.db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${entries.sortOrder}), -1)` })
      .from(entries)
      .where(and(eq(entries.chapterId, chapterId), isNull(entries.deletedAt)));

    return result[0]?.maxOrder ?? -1;
  }
}
