/**
 * Library Repository Implementation
 * Adapts existing IntelligenceRepository for library-domain operations
 */

import { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import { ILibraryRepository, EntryFilter } from '@domains/library/repositories/ILibraryRepository';
import {
  libBooks as books,
  libChapters as chapters,
  libEntries as entries,
  libIllustrations as illustrations,
} from '@infrastructure/database/schemas/library-schema';
import type {
  Book,
  InsertBook,
  Chapter,
  InsertChapter,
  Entry,
  InsertEntry,
  Illustration,
} from '@domains/library/types';
import { eq, desc, and, gte, lte, sql, inArray, asc, isNull } from 'drizzle-orm';
import { getLogger } from '@config/service-urls';
import { encryptionService } from '@infrastructure/services';
import { LibraryError } from '@application/errors';

const logger = getLogger('library-repository');

const SENSITIVE_ENTRY_FIELDS = ['content'] as const;
type SensitiveEntryField = (typeof SENSITIVE_ENTRY_FIELDS)[number];

export class LibraryRepositoryImpl implements ILibraryRepository {
  constructor(private readonly db: DatabaseConnection) {}

  private encryptEntryData(data: InsertEntry): InsertEntry {
    const encrypted = { ...data };
    for (const field of SENSITIVE_ENTRY_FIELDS) {
      const value = encrypted[field as SensitiveEntryField];
      if (value) {
        (encrypted as Record<string, unknown>)[field] = encryptionService.encrypt(value);
      }
    }
    return encrypted;
  }

  private decryptEntry(entry: Entry): Entry {
    const decrypted = { ...entry };
    for (const field of SENSITIVE_ENTRY_FIELDS) {
      const value = decrypted[field as SensitiveEntryField];
      if (value) {
        (decrypted as Record<string, unknown>)[field] = encryptionService.decrypt(value);
      }
    }
    return decrypted;
  }

  private decryptEntries(entryList: Entry[]): Entry[] {
    return entryList.map(e => this.decryptEntry(e));
  }

  // ==================== BOOKS ====================

  async createBook(book: InsertBook): Promise<Book> {
    const [result] = await this.db
      .insert(books)
      .values(book as typeof books.$inferInsert)
      .returning();
    logger.info('Book created', { id: result.id, typeId: result.typeId });
    return result;
  }

  async findBookById(id: string): Promise<Book | null> {
    const [result] = await this.db
      .select()
      .from(books)
      .where(and(eq(books.id, id), isNull(books.deletedAt)));
    return result || null;
  }

  async findBooksByUserId(userId: string): Promise<Book[]> {
    return this.db
      .select()
      .from(books)
      .where(and(eq(books.userId, userId), isNull(books.deletedAt)))
      .orderBy(desc(books.createdAt));
  }

  async updateBook(id: string, data: Partial<Book>): Promise<Book> {
    const [result] = await this.db
      .update(books)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(books.id, id), isNull(books.deletedAt)))
      .returning();
    return result;
  }

  async deleteBook(id: string): Promise<void> {
    await this.db.update(books).set({ deletedAt: new Date() }).where(eq(books.id, id));
    logger.info('Book soft-deleted', { id });
  }

  // ==================== CHAPTERS ====================

  async createChapter(chapter: InsertChapter): Promise<Chapter> {
    const [result] = await this.db
      .insert(chapters)
      .values(chapter as typeof chapters.$inferInsert)
      .returning();
    logger.info('Chapter created', { id: result.id, bookId: result.bookId });
    return result;
  }

  async findChapterById(id: string): Promise<Chapter | null> {
    const [result] = await this.db
      .select()
      .from(chapters)
      .where(and(eq(chapters.id, id), isNull(chapters.deletedAt)));
    return result || null;
  }

  async findChaptersByBookId(bookId: string): Promise<Chapter[]> {
    return this.db
      .select()
      .from(chapters)
      .where(and(eq(chapters.bookId, bookId), isNull(chapters.deletedAt)))
      .orderBy(asc(chapters.sortOrder))
      .limit(200);
  }

  async updateChapter(id: string, data: Partial<Chapter>): Promise<Chapter> {
    const [result] = await this.db
      .update(chapters)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(chapters.id, id), isNull(chapters.deletedAt)))
      .returning();
    return result;
  }

  async deleteChapter(id: string): Promise<void> {
    await this.db.update(chapters).set({ deletedAt: new Date() }).where(eq(chapters.id, id));
    logger.info('Chapter soft-deleted', { id });
  }

  // ==================== ENTRIES ====================

  async createEntry(entry: InsertEntry): Promise<Entry> {
    const encryptedData = this.encryptEntryData(entry);
    const [result] = await this.db
      .insert(entries)
      .values(encryptedData as unknown as typeof entries.$inferInsert)
      .returning();
    logger.info('Entry created', { id: result.id, bookId: result.bookId });
    return this.decryptEntry(result);
  }

  async findEntryById(id: string): Promise<Entry | null> {
    const [result] = await this.db
      .select()
      .from(entries)
      .where(and(eq(entries.id, id), isNull(entries.deletedAt)));
    return result ? this.decryptEntry(result) : null;
  }

  async findEntriesByIds(ids: string[], userId?: string): Promise<Entry[]> {
    if (ids.length === 0) return [];

    if (userId) {
      const result = await this.db
        .select({ entry: entries })
        .from(entries)
        .innerJoin(books, eq(entries.bookId, books.id))
        .where(
          and(inArray(entries.id, ids), eq(books.userId, userId), isNull(entries.deletedAt), isNull(books.deletedAt))
        );
      return this.decryptEntries(result.map(r => r.entry));
    }

    const result = await this.db
      .select()
      .from(entries)
      .where(and(inArray(entries.id, ids), isNull(entries.deletedAt)));
    return this.decryptEntries(result);
  }

  async findEntriesByUserId(userId: string, limit: number = 50, offset: number = 0, bookId?: string): Promise<Entry[]> {
    if (bookId) {
      const result = await this.db
        .select({ entry: entries })
        .from(entries)
        .innerJoin(books, eq(entries.bookId, books.id))
        .where(
          and(eq(books.userId, userId), eq(entries.bookId, bookId), isNull(entries.deletedAt), isNull(books.deletedAt))
        )
        .orderBy(desc(entries.createdAt))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);
      return this.decryptEntries(result.map(r => r.entry));
    }

    const result = await this.db
      .select({ entry: entries })
      .from(entries)
      .innerJoin(books, eq(entries.bookId, books.id))
      .where(and(eq(books.userId, userId), isNull(entries.deletedAt), isNull(books.deletedAt)))
      .orderBy(desc(entries.createdAt))
      .limit(Math.min(limit || 20, 100))
      .offset(offset);
    return this.decryptEntries(result.map(r => r.entry));
  }

  async countEntriesByUserId(userId: string, bookId?: string): Promise<number> {
    const conditions = [eq(books.userId, userId), isNull(entries.deletedAt), isNull(books.deletedAt)];
    if (bookId) {
      conditions.push(eq(entries.bookId, bookId));
    }

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(entries)
      .innerJoin(books, eq(entries.bookId, books.id))
      .where(and(...conditions));

    return result?.count ?? 0;
  }

  async updateEntry(id: string, data: Partial<Entry>): Promise<Entry> {
    const updateData = { ...data };
    if (updateData.content) {
      updateData.content = encryptionService.encrypt(updateData.content);
    }

    const [result] = await this.db
      .update(entries)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(entries.id, id), isNull(entries.deletedAt)))
      .returning();
    return this.decryptEntry(result);
  }

  async updateEntriesBatch(ids: string[], data: Partial<Entry>): Promise<number> {
    if (ids.length === 0) return 0;

    const updateData = { ...data };
    if (updateData.content) {
      updateData.content = encryptionService.encrypt(updateData.content);
    }

    const result = await this.db
      .update(entries)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(inArray(entries.id, ids), isNull(entries.deletedAt)))
      .returning({ id: entries.id });

    return result.length;
  }

  async deleteEntry(id: string): Promise<void> {
    await this.db.update(entries).set({ deletedAt: new Date() }).where(eq(entries.id, id));
    logger.info('Entry soft-deleted', { id });
  }

  async getEntriesByUser(userId: string, filter?: EntryFilter): Promise<Entry[]> {
    const conditions = [eq(books.userId, userId), isNull(entries.deletedAt), isNull(books.deletedAt)];

    if (filter?.dateFrom) {
      const dateFrom = typeof filter.dateFrom === 'string' ? new Date(filter.dateFrom) : filter.dateFrom;
      conditions.push(gte(entries.createdAt, dateFrom));
    }
    if (filter?.dateTo) {
      const dateTo = typeof filter.dateTo === 'string' ? new Date(filter.dateTo) : filter.dateTo;
      conditions.push(lte(entries.createdAt, dateTo));
    }
    if (filter?.entryType) {
      conditions.push(eq(entries.entryType, filter.entryType));
    }

    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    const result = await this.db
      .select({ entry: entries })
      .from(entries)
      .innerJoin(books, eq(entries.bookId, books.id))
      .where(and(...conditions))
      .orderBy(desc(entries.createdAt))
      .limit(Math.min(limit || 20, 100))
      .offset(offset);

    return this.decryptEntries(result.map(r => r.entry));
  }

  async getMaxChapterSortOrder(chapterId: string): Promise<number> {
    const [result] = await this.db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${entries.sortOrder}), -1)::int` })
      .from(entries)
      .where(and(eq(entries.chapterId, chapterId), isNull(entries.deletedAt)));
    return (result?.maxOrder ?? -1) + 1;
  }

  // ==================== ILLUSTRATIONS ====================

  async addEntryIllustration(entryId: string, url: string): Promise<Illustration> {
    const entry = await this.findEntryById(entryId);
    if (!entry) {
      throw LibraryError.entryNotFound(entryId);
    }

    const existingIllustrations = await this.findEntryIllustrations(entryId);
    const sortOrder = existingIllustrations.length;

    const [result] = await this.db
      .insert(illustrations)
      .values({
        entryId,
        bookId: entry.bookId,
        url,
        illustrationType: 'image',
        source: 'user_upload',
        sortOrder,
      })
      .returning();

    logger.info('Illustration added', { id: result.id, entryId });
    return result;
  }

  async findEntryIllustrations(entryId: string): Promise<Illustration[]> {
    return this.db
      .select()
      .from(illustrations)
      .where(and(eq(illustrations.entryId, entryId), isNull(illustrations.deletedAt)))
      .orderBy(asc(illustrations.sortOrder));
  }

  async findEntryIllustrationsByEntryIds(entryIds: string[]): Promise<Map<string, Illustration[]>> {
    if (entryIds.length === 0) return new Map();

    const results = await this.db
      .select()
      .from(illustrations)
      .where(and(inArray(illustrations.entryId, entryIds), isNull(illustrations.deletedAt)))
      .orderBy(asc(illustrations.sortOrder));

    const map = new Map<string, Illustration[]>();
    for (const illustration of results) {
      if (illustration.entryId) {
        const existing = map.get(illustration.entryId) || [];
        existing.push(illustration);
        map.set(illustration.entryId, existing);
      }
    }
    return map;
  }

  async removeEntryIllustration(illustrationId: string): Promise<void> {
    await this.db.update(illustrations).set({ deletedAt: new Date() }).where(eq(illustrations.id, illustrationId));
    logger.info('Illustration soft-deleted', { id: illustrationId });
  }

  async reorderEntryIllustrations(entryId: string, illustrationIds: string[]): Promise<Illustration[]> {
    for (let i = 0; i < illustrationIds.length; i++) {
      await this.db
        .update(illustrations)
        .set({ sortOrder: i })
        .where(
          and(
            eq(illustrations.id, illustrationIds[i]),
            eq(illustrations.entryId, entryId),
            isNull(illustrations.deletedAt)
          )
        );
    }
    return this.findEntryIllustrations(entryId);
  }
}
