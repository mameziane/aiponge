import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import {
  libBookTypes,
  libBooks,
  type BookType,
  type Book,
  BOOK_TYPE_IDS,
  CONTENT_VISIBILITY,
} from '../../database/schemas/library-schema';
import { eq, and, asc, desc, sql, ilike, or, inArray, isNull, type SQL } from 'drizzle-orm';
import { getLogger } from '../../../config/service-urls';
import { BOOK_LIFECYCLE, encodeCursor, decodeCursor, type CursorPaginatedResponse } from '@aiponge/shared-contracts';
import { ChapterRepository } from './ChapterRepository';

const logger = getLogger('library-repository');

export class BookTypeRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getAll(): Promise<BookType[]> {
    return this.db.select().from(libBookTypes).orderBy(asc(libBookTypes.sortOrder));
  }

  async getById(id: string): Promise<BookType | null> {
    const results = await this.db.select().from(libBookTypes).where(eq(libBookTypes.id, id)).limit(1);
    return results[0] || null;
  }

  async getUserCreatable(): Promise<BookType[]> {
    return this.db
      .select()
      .from(libBookTypes)
      .where(eq(libBookTypes.isUserCreatable, true))
      .orderBy(asc(libBookTypes.sortOrder));
  }
}

export interface CreateBookData {
  typeId: string;
  title: string;
  subtitle?: string;
  description?: string;
  author?: string;
  userId: string;
  isReadOnly?: boolean;
  category?: string;
  language?: string;
  visibility?: string;
  status?: string;
  systemType?: string;
}

export interface UpdateBookData {
  title?: string;
  subtitle?: string;
  description?: string;
  author?: string;
  category?: string;
  language?: string;
  visibility?: string;
  status?: string;
  isReadOnly?: boolean;
}

export interface BookFilters {
  typeId?: string;
  userId?: string;
  category?: string;
  language?: string;
  visibility?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface BookWithCounts extends Book {
  chapterCount: number;
  entryCount: number;
  coverIllustrationUrl: string | null;
}

export class BookRepository {
  private readonly readDb: DatabaseConnection;

  constructor(
    private readonly db: DatabaseConnection,
    readDb?: DatabaseConnection
  ) {
    this.readDb = readDb || db;
  }

  async getById(id: string): Promise<Book | null> {
    const results = await this.readDb
      .select()
      .from(libBooks)
      .where(and(eq(libBooks.id, id), isNull(libBooks.deletedAt)))
      .limit(1);
    return results[0] || null;
  }

  async getBooksByUserAndType(userId: string, typeId?: string): Promise<Book[]> {
    const conditions = [eq(libBooks.userId, userId), isNull(libBooks.deletedAt)];
    if (typeId) {
      conditions.push(eq(libBooks.typeId, typeId));
    }

    return this.readDb
      .select()
      .from(libBooks)
      .where(and(...conditions))
      .orderBy(desc(libBooks.createdAt))
      .limit(200);
  }

  async getBooksByUser(userId: string): Promise<Book[]> {
    return this.readDb
      .select()
      .from(libBooks)
      .where(and(eq(libBooks.userId, userId), isNull(libBooks.deletedAt)))
      .orderBy(desc(libBooks.createdAt))
      .limit(200);
  }

  async getPersonalBooksByUser(userId: string): Promise<Book[]> {
    return this.getBooksByUserAndType(userId, BOOK_TYPE_IDS.PERSONAL);
  }

  async getBySystemType(userId: string, systemType: string): Promise<Book | null> {
    const results = await this.db
      .select()
      .from(libBooks)
      .where(and(eq(libBooks.userId, userId), eq(libBooks.systemType, systemType), isNull(libBooks.deletedAt)))
      .limit(1);
    return results[0] || null;
  }

  async getAccessibleBooks(
    userId: string,
    accessibleCreatorIds: string[],
    filters: BookFilters = {}
  ): Promise<CursorPaginatedResponse<Book>> {
    const conditions: SQL[] = [isNull(libBooks.deletedAt)];

    if (filters.status) {
      conditions.push(eq(libBooks.status, filters.status));
    } else {
      conditions.push(eq(libBooks.status, BOOK_LIFECYCLE.ACTIVE));
    }

    const publicBooksCondition = eq(libBooks.visibility, CONTENT_VISIBILITY.PUBLIC);

    let accessCondition: SQL | undefined;

    if (userId) {
      const ownBooksCondition = and(
        eq(libBooks.userId, userId),
        or(eq(libBooks.visibility, CONTENT_VISIBILITY.PERSONAL), eq(libBooks.visibility, CONTENT_VISIBILITY.SHARED))
      );

      const otherCreatorIds = accessibleCreatorIds.filter(id => id !== userId);

      if (otherCreatorIds.length > 0) {
        const followedBooksCondition = and(
          inArray(libBooks.userId, otherCreatorIds),
          eq(libBooks.visibility, CONTENT_VISIBILITY.SHARED)
        );
        accessCondition = or(ownBooksCondition, followedBooksCondition, publicBooksCondition)!;
      } else {
        accessCondition = or(ownBooksCondition, publicBooksCondition)!;
      }
    } else {
      const sharedFromLibrarians =
        accessibleCreatorIds.length > 0
          ? and(inArray(libBooks.userId, accessibleCreatorIds), eq(libBooks.visibility, CONTENT_VISIBILITY.SHARED))
          : undefined;

      accessCondition = sharedFromLibrarians ? or(publicBooksCondition, sharedFromLibrarians)! : publicBooksCondition;
    }

    if (accessCondition) {
      conditions.push(accessCondition);
    }

    if (filters.typeId) {
      conditions.push(eq(libBooks.typeId, filters.typeId));
    }
    if (filters.category) {
      conditions.push(eq(libBooks.category, filters.category));
    }
    if (filters.language) {
      conditions.push(ilike(libBooks.language, `${filters.language}%`));
    }
    if (filters.visibility) {
      if (filters.visibility === 'publicly_accessible') {
        conditions.push(inArray(libBooks.visibility, [CONTENT_VISIBILITY.SHARED, CONTENT_VISIBILITY.PUBLIC]));
      } else {
        conditions.push(eq(libBooks.visibility, filters.visibility));
      }
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(libBooks.title, `%${filters.search}%`),
          ilike(libBooks.author, `%${filters.search}%`),
          ilike(libBooks.description, `%${filters.search}%`)
        )!
      );
    }

    const limit = Math.min(filters.limit || 50, 100);

    interface BookCursor {
      createdAt: string;
      id: string;
    }
    const decoded = filters.cursor ? decodeCursor<BookCursor>(filters.cursor) : null;

    if (decoded) {
      conditions.push(
        sql`(${libBooks.createdAt}, ${libBooks.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
      );
    }

    const rows = await this.readDb
      .select()
      .from(libBooks)
      .where(and(...conditions))
      .orderBy(desc(libBooks.createdAt), desc(libBooks.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem ? encodeCursor({ createdAt: lastItem.createdAt.toISOString(), id: lastItem.id }) : null;

    return { items, nextCursor, hasMore };
  }

  async getBooksByFilters(filters: BookFilters = {}): Promise<CursorPaginatedResponse<BookWithCounts>> {
    const conditions: SQL[] = [isNull(libBooks.deletedAt)];

    if (filters.typeId) {
      conditions.push(eq(libBooks.typeId, filters.typeId));
    }
    if (filters.category) {
      conditions.push(eq(libBooks.category, filters.category));
    }
    if (filters.visibility) {
      if (filters.visibility === 'publicly_accessible') {
        conditions.push(inArray(libBooks.visibility, [CONTENT_VISIBILITY.SHARED, CONTENT_VISIBILITY.PUBLIC]));
      } else {
        conditions.push(eq(libBooks.visibility, filters.visibility));
      }
    }
    if (filters.status) {
      conditions.push(eq(libBooks.status, filters.status));
    }
    if (filters.userId) {
      conditions.push(eq(libBooks.userId, filters.userId));
    }
    if (filters.language) {
      conditions.push(ilike(libBooks.language, `${filters.language}%`));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(libBooks.title, `%${filters.search}%`),
          ilike(libBooks.author, `%${filters.search}%`),
          ilike(libBooks.description, `%${filters.search}%`)
        )!
      );
    }

    const limit = Math.min(filters.limit || 50, 100);

    interface BookCursor {
      createdAt: string;
      id: string;
    }
    const decoded = filters.cursor ? decodeCursor<BookCursor>(filters.cursor) : null;

    if (decoded) {
      conditions.push(
        sql`(${libBooks.createdAt}, ${libBooks.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
      );
    }

    const coverUrlSq = sql<string | null>`(
      SELECT url FROM lib_illustrations 
      WHERE lib_illustrations.book_id = lib_books.id 
        AND lib_illustrations.illustration_type = 'cover' 
      ORDER BY lib_illustrations.created_at DESC 
      LIMIT 1
    )`.as('cover_illustration_url');

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await this.db
      .select({
        id: libBooks.id,
        typeId: libBooks.typeId,
        title: libBooks.title,
        subtitle: libBooks.subtitle,
        description: libBooks.description,
        author: libBooks.author,
        userId: libBooks.userId,
        isReadOnly: libBooks.isReadOnly,
        category: libBooks.category,
        language: libBooks.language,
        visibility: libBooks.visibility,
        status: libBooks.status,
        systemType: libBooks.systemType,
        createdAt: libBooks.createdAt,
        updatedAt: libBooks.updatedAt,
        publishedAt: libBooks.publishedAt,
        chapterCount: libBooks.chapterCount,
        entryCount: libBooks.entryCount,
        cover_illustration_url: coverUrlSq,
      })
      .from(libBooks)
      .where(whereClause)
      .orderBy(desc(libBooks.createdAt), desc(libBooks.id))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const pageResults = hasMore ? results.slice(0, limit) : results;
    const lastRow = pageResults[pageResults.length - 1];
    const nextCursor =
      hasMore && lastRow ? encodeCursor({ createdAt: lastRow.createdAt.toISOString(), id: lastRow.id }) : null;

    const items = pageResults.map(row => ({
      id: row.id,
      typeId: row.typeId,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      author: row.author,
      userId: row.userId,
      isReadOnly: row.isReadOnly,
      category: row.category,
      language: row.language,
      visibility: row.visibility,
      status: row.status,
      systemType: row.systemType,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
      chapterCount: row.chapterCount,
      entryCount: row.entryCount,
      coverIllustrationUrl: row.cover_illustration_url,
    })) as BookWithCounts[];

    return { items, nextCursor, hasMore };
  }

  async create(data: CreateBookData): Promise<Book> {
    const insertValues = {
      typeId: data.typeId,
      title: data.title,
      subtitle: data.subtitle,
      description: data.description,
      author: data.author,
      userId: data.userId,
      isReadOnly: data.isReadOnly ?? false,
      category: data.category,
      language: data.language ?? 'en',
      visibility: data.visibility ?? CONTENT_VISIBILITY.PERSONAL,
      status: data.status ?? BOOK_LIFECYCLE.ACTIVE,
      systemType: data.systemType,
    };

    const result = await this.db.insert(libBooks).values(insertValues).returning();
    return result[0];
  }

  async update(id: string, data: UpdateBookData): Promise<Book | null> {
    const result = await this.db
      .update(libBooks)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(libBooks.id, id), isNull(libBooks.deletedAt)))
      .returning();

    return result[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(libBooks).where(eq(libBooks.id, id)).returning({ id: libBooks.id });

    return result.length > 0;
  }

  async updateChapterCount(bookId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE lib_books 
      SET chapter_count = (SELECT COUNT(*) FROM lib_chapters WHERE book_id = ${bookId}),
          updated_at = NOW()
      WHERE id = ${bookId}
    `);
  }

  async updateEntryCount(bookId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE lib_books 
      SET entry_count = (SELECT COUNT(*) FROM lib_entries WHERE book_id = ${bookId}),
          updated_at = NOW()
      WHERE id = ${bookId}
    `);
  }

  async getOrCreateBookmarksBook(userId: string): Promise<Book> {
    const existing = await this.getBySystemType(userId, 'bookmarks');
    if (existing) {
      return existing;
    }

    try {
      return await this.create({
        typeId: BOOK_TYPE_IDS.PERSONAL,
        title: 'Bookmarks',
        description: 'Your saved entries from books',
        userId,
        isReadOnly: false,
        visibility: CONTENT_VISIBILITY.PERSONAL,
        status: BOOK_LIFECYCLE.ACTIVE,
        systemType: 'bookmarks',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('unique') || errorMessage.includes('duplicate')) {
        const retryResult = await this.getBySystemType(userId, 'bookmarks');
        if (retryResult) {
          return retryResult;
        }
      }
      throw error;
    }
  }

  async getOrCreateDefaultPersonalBook(userId: string): Promise<Book> {
    const existing = await this.getBySystemType(userId, 'default');
    if (existing) {
      return existing;
    }

    const personalBooks = await this.getBooksByUserAndType(userId, BOOK_TYPE_IDS.PERSONAL);
    if (personalBooks.length > 0) {
      return personalBooks[0];
    }

    try {
      const book = await this.create({
        typeId: BOOK_TYPE_IDS.PERSONAL,
        title: 'My Story',
        description: 'Your personal space for reflection and growth',
        userId,
        isReadOnly: false,
        visibility: CONTENT_VISIBILITY.PERSONAL,
        status: BOOK_LIFECYCLE.ACTIVE,
        systemType: 'default',
      });

      const chapterRepo = new ChapterRepository(this.db);
      await chapterRepo.create({
        bookId: book.id,
        userId,
        title: 'My Entries',
        description: 'Your personal entries',
        sortOrder: 0,
      });

      logger.info('Default chapter created for auto-created personal book', { userId, bookId: book.id });

      return book;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('unique') || errorMessage.includes('duplicate')) {
        const retryBooks = await this.getBooksByUserAndType(userId, BOOK_TYPE_IDS.PERSONAL);
        if (retryBooks.length > 0) {
          return retryBooks[0];
        }
      }
      throw error;
    }
  }

  async getOrCreateSharedNotesBook(userId: string): Promise<Book> {
    const SHARED_NOTES_TITLE = 'My Shared Notes';
    const SHARED_NOTES_SYSTEM_TYPE = 'shared-notes';

    const existing = await this.getBySystemType(userId, SHARED_NOTES_SYSTEM_TYPE);
    if (existing) {
      return existing;
    }

    const sharedBooks = await this.db
      .select()
      .from(libBooks)
      .where(
        and(
          eq(libBooks.userId, userId),
          eq(libBooks.title, SHARED_NOTES_TITLE),
          eq(libBooks.visibility, CONTENT_VISIBILITY.SHARED),
          isNull(libBooks.deletedAt)
        )
      )
      .limit(1);

    if (sharedBooks.length > 0) {
      return sharedBooks[0];
    }

    try {
      const newBook = await this.create({
        typeId: BOOK_TYPE_IDS.PERSONAL,
        title: SHARED_NOTES_TITLE,
        description: 'Entries shared with your followers',
        userId,
        isReadOnly: false,
        visibility: CONTENT_VISIBILITY.SHARED,
        status: BOOK_LIFECYCLE.ACTIVE,
        systemType: SHARED_NOTES_SYSTEM_TYPE,
      });

      logger.info('Created Shared Notes book for user', {
        userId,
        bookId: newBook.id,
      });

      return newBook;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('unique') || errorMessage.includes('duplicate')) {
        const retryBook = await this.getBySystemType(userId, SHARED_NOTES_SYSTEM_TYPE);
        if (retryBook) {
          return retryBook;
        }
      }
      throw error;
    }
  }
}
