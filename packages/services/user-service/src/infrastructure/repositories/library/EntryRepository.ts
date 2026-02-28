import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import {
  libBooks,
  libEntries,
  type Entry,
} from '../../database/schemas/library-schema';
import { eq, and, asc, desc, sql, inArray, isNull, type SQL } from 'drizzle-orm';
import { getLogger } from '../../../config/service-urls';
import {
  GENERATION_STATUS,
  encodeCursor,
  decodeCursor,
  type CursorPaginatedResponse,
} from '@aiponge/shared-contracts';

const logger = getLogger('library-repository');

export interface CreateEntryData {
  chapterId: string;
  bookId: string;
  userId: string;
  content: string;
  entryType: string;
  sortOrder?: number;
  chapterSortOrder?: number;
  processingStatus?: string;
  sourceTitle?: string;
  sourceAuthor?: string;
  sourceChapter?: string;
  attribution?: string;
  moodContext?: string;
  sentiment?: string;
  emotionalIntensity?: number;
  tags?: string[];
  themes?: string[];
  musicHints?: Record<string, unknown>;
  depthLevel?: string;
  metadata?: Record<string, unknown>;
  userDate?: Date;
}

export interface UpdateEntryData {
  content?: string;
  entryType?: string;
  sortOrder?: number;
  sourceTitle?: string;
  sourceAuthor?: string;
  sourceChapter?: string;
  attribution?: string;
  moodContext?: string;
  sentiment?: string;
  emotionalIntensity?: number;
  tags?: string[];
  themes?: string[];
  musicHints?: Record<string, unknown>;
  depthLevel?: string;
  metadata?: Record<string, unknown>;
  userDate?: Date;
}

export interface EntryFilters {
  chapterId?: string;
  bookId?: string;
  entryType?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface EntryUserFilter {
  dateFrom?: Date;
  dateTo?: Date;
  entryType?: string;
  limit?: number;
  offset?: number;
}

export class EntryRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getById(id: string): Promise<Entry | null> {
    const results = await this.db
      .select()
      .from(libEntries)
      .where(and(eq(libEntries.id, id), isNull(libEntries.deletedAt)))
      .limit(1);
    return results[0] || null;
  }

  async getByChapter(chapterId: string): Promise<Entry[]> {
    return this.db
      .select()
      .from(libEntries)
      .where(and(eq(libEntries.chapterId, chapterId), isNull(libEntries.deletedAt)))
      .orderBy(asc(libEntries.sortOrder));
  }

  async getByBook(bookId: string): Promise<Entry[]> {
    return this.db
      .select()
      .from(libEntries)
      .where(and(eq(libEntries.bookId, bookId), isNull(libEntries.deletedAt)))
      .orderBy(asc(libEntries.sortOrder));
  }

  async countByBook(bookId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(libEntries)
      .where(and(eq(libEntries.bookId, bookId), isNull(libEntries.deletedAt)));
    return result[0]?.count ?? 0;
  }

  async getByUser(userId: string, filter?: EntryUserFilter): Promise<Entry[]> {
    const conditions: SQL[] = [eq(libEntries.userId, userId), isNull(libEntries.deletedAt)];

    if (filter?.dateFrom) {
      conditions.push(sql`${libEntries.createdAt} >= ${filter.dateFrom}`);
    }
    if (filter?.dateTo) {
      conditions.push(sql`${libEntries.createdAt} <= ${filter.dateTo}`);
    }
    if (filter?.entryType) {
      conditions.push(eq(libEntries.entryType, filter.entryType));
    }

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    return this.db
      .select()
      .from(libEntries)
      .where(and(...conditions))
      .orderBy(desc(libEntries.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countByUser(
    userId: string,
    filter?: Pick<EntryUserFilter, 'dateFrom' | 'dateTo'>
  ): Promise<{ total: number; processed: number }> {
    const conditions: SQL[] = [eq(libEntries.userId, userId), isNull(libEntries.deletedAt)];

    if (filter?.dateFrom) {
      conditions.push(sql`${libEntries.createdAt} >= ${filter.dateFrom}`);
    }
    if (filter?.dateTo) {
      conditions.push(sql`${libEntries.createdAt} <= ${filter.dateTo}`);
    }

    const result = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        processed: sql<number>`count(*) filter (where ${libEntries.processingStatus} = 'processed')::int`,
      })
      .from(libEntries)
      .where(and(...conditions));

    return {
      total: result[0]?.total ?? 0,
      processed: result[0]?.processed ?? 0,
    };
  }

  async getByFilters(filters: EntryFilters): Promise<CursorPaginatedResponse<Entry>> {
    const conditions: SQL[] = [isNull(libEntries.deletedAt)];

    if (filters.chapterId) {
      conditions.push(eq(libEntries.chapterId, filters.chapterId));
    }
    if (filters.bookId) {
      conditions.push(eq(libEntries.bookId, filters.bookId));
    }
    if (filters.entryType) {
      conditions.push(eq(libEntries.entryType, filters.entryType));
    }

    const limit = Math.min(filters.limit || 100, 500);

    const decoded = filters.cursor ? decodeCursor<{ sortOrder: number; id: string }>(filters.cursor) : null;
    if (decoded) {
      conditions.push(sql`(${libEntries.sortOrder}, ${libEntries.id}) > (${decoded.sortOrder}, ${decoded.id})`);
    }

    let query = this.db.select().from(libEntries);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const rows = await query.orderBy(asc(libEntries.sortOrder), asc(libEntries.id)).limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items.length > 0 ? items[items.length - 1] : null;

    return {
      items,
      hasMore,
      nextCursor: hasMore && lastItem ? encodeCursor({ sortOrder: lastItem.sortOrder, id: lastItem.id }) : null,
    };
  }

  async create(data: CreateEntryData): Promise<Entry> {
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const nextResult = await this.db
        .select({ next: sql<number>`COALESCE(MAX(${libEntries.sortOrder}), -1) + 1` })
        .from(libEntries)
        .where(and(eq(libEntries.chapterId, data.chapterId), isNull(libEntries.deletedAt)));
      sortOrder = nextResult[0]?.next ?? 0;
    }

    const result = await this.db
      .insert(libEntries)
      .values({
        chapterId: data.chapterId,
        bookId: data.bookId,
        userId: data.userId,
        content: data.content,
        entryType: data.entryType,
        sortOrder,
        chapterSortOrder: data.chapterSortOrder ?? sortOrder,
        processingStatus: data.processingStatus ?? GENERATION_STATUS.PENDING,
        sourceTitle: data.sourceTitle,
        sourceAuthor: data.sourceAuthor,
        sourceChapter: data.sourceChapter,
        attribution: data.attribution,
        moodContext: data.moodContext,
        sentiment: data.sentiment,
        emotionalIntensity: data.emotionalIntensity,
        tags: data.tags,
        themes: data.themes,
        musicHints: data.musicHints,
        depthLevel: data.depthLevel,
        metadata: data.metadata,
        userDate: data.userDate,
      })
      .returning();

    logger.info('Entry created', { entryId: result[0].id, chapterId: data.chapterId, entryType: data.entryType });
    return result[0];
  }

  async update(id: string, data: UpdateEntryData): Promise<Entry | null> {
    const result = await this.db
      .update(libEntries)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(libEntries.id, id), isNull(libEntries.deletedAt)))
      .returning();

    return result[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(libEntries).where(eq(libEntries.id, id)).returning({ id: libEntries.id });

    return result.length > 0;
  }

  async clearSourceEntryIdReferences(originalEntryId: string): Promise<number> {
    const result = await this.db.execute(sql`
      UPDATE lib_entries 
      SET metadata = metadata - 'sourceEntryId', updated_at = NOW()
      WHERE metadata->>'sourceEntryId' = ${originalEntryId}
      RETURNING id
    `);
    return result.length || 0;
  }

  async getNextSortOrder(chapterId: string): Promise<number> {
    const result = await this.db
      .select({ next: sql<number>`COALESCE(MAX(${libEntries.sortOrder}), -1) + 1` })
      .from(libEntries)
      .where(and(eq(libEntries.chapterId, chapterId), isNull(libEntries.deletedAt)));
    return result[0]?.next ?? 0;
  }

  async getEntriesByUser(userId: string, filter?: EntryUserFilter): Promise<Entry[]> {
    const conditions = [eq(libBooks.userId, userId), isNull(libEntries.deletedAt), isNull(libBooks.deletedAt)];

    if (filter?.dateFrom) {
      conditions.push(sql`${libEntries.createdAt} >= ${filter.dateFrom}`);
    }
    if (filter?.dateTo) {
      conditions.push(sql`${libEntries.createdAt} <= ${filter.dateTo}`);
    }
    if (filter?.entryType) {
      conditions.push(eq(libEntries.entryType, filter.entryType));
    }

    const results = await this.db
      .select({
        id: libEntries.id,
        chapterId: libEntries.chapterId,
        bookId: libEntries.bookId,
        userId: libEntries.userId,
        content: libEntries.content,
        entryType: libEntries.entryType,
        processingStatus: libEntries.processingStatus,
        illustrationUrl: libEntries.illustrationUrl,
        chapterSortOrder: libEntries.chapterSortOrder,
        sortOrder: libEntries.sortOrder,
        sourceTitle: libEntries.sourceTitle,
        sourceAuthor: libEntries.sourceAuthor,
        sourceChapter: libEntries.sourceChapter,
        attribution: libEntries.attribution,
        moodContext: libEntries.moodContext,
        sentiment: libEntries.sentiment,
        emotionalIntensity: libEntries.emotionalIntensity,
        tags: libEntries.tags,
        themes: libEntries.themes,
        musicHints: libEntries.musicHints,
        depthLevel: libEntries.depthLevel,
        metadata: libEntries.metadata,
        userDate: libEntries.userDate,
        createdAt: libEntries.createdAt,
        updatedAt: libEntries.updatedAt,
      })
      .from(libEntries)
      .innerJoin(libBooks, eq(libEntries.bookId, libBooks.id))
      .where(and(...conditions))
      .orderBy(desc(libEntries.createdAt));

    return results as Entry[];
  }
}
