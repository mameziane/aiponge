import { eq, desc, and, gte, lte, sql, inArray, isNull, type SQL } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { EntryFilter } from '../../../domains/intelligence/repositories/IIntelligenceRepository';
import {
  libBooks as books,
  libEntries as entries,
  libIllustrations as illustrations,
} from '../../database/schemas/library-schema';
import type { Entry, InsertEntry, Illustration } from '../../../domains/library/types';
import { getLogger } from '../../../config/service-urls';
import { encryptEntryData, decryptEntry, decryptEntries, encryptionService } from './encryption-helpers';
import { ProfileError } from '../../../application/errors/errors';

const logger = getLogger('intelligence-repository');

export class EntryRepositoryPart {
  constructor(private readonly db: DatabaseConnection) {}

  async createEntry(entryData: InsertEntry): Promise<Entry> {
    const encryptedData = encryptEntryData(entryData);
    const [entry] = await this.db
      .insert(entries)
      .values(encryptedData as unknown as typeof entries.$inferInsert)
      .returning();
    logger.info('Entry created', {
      id: entry.id,
      bookId: entry.bookId,
      encrypted: encryptionService.isEncryptionEnabled(),
    });
    return decryptEntry(entry);
  }

  async findEntryById(id: string): Promise<Entry | null> {
    const [entry] = await this.db
      .select()
      .from(entries)
      .where(and(eq(entries.id, id), isNull(entries.deletedAt)));
    return entry ? decryptEntry(entry) : null;
  }

  async findEntriesByIds(ids: string[], userId?: string): Promise<Entry[]> {
    if (ids.length === 0) {
      return [];
    }

    if (userId) {
      const result = await this.db
        .select({ entry: entries })
        .from(entries)
        .innerJoin(books, eq(entries.bookId, books.id))
        .where(
          and(inArray(entries.id, ids), eq(books.userId, userId), isNull(entries.deletedAt), isNull(books.deletedAt))
        );
      return decryptEntries(result.map(r => r.entry));
    }

    const result = await this.db
      .select()
      .from(entries)
      .where(and(inArray(entries.id, ids), isNull(entries.deletedAt)));
    return decryptEntries(result);
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
      return decryptEntries(result.map(r => r.entry));
    }

    const result = await this.db
      .select({ entry: entries })
      .from(entries)
      .innerJoin(books, eq(entries.bookId, books.id))
      .where(and(eq(books.userId, userId), isNull(entries.deletedAt), isNull(books.deletedAt)))
      .orderBy(desc(entries.createdAt))
      .limit(Math.min(limit || 20, 100))
      .offset(offset);
    return decryptEntries(result.map(r => r.entry));
  }

  async countEntriesByUserId(userId: string, bookId?: string): Promise<number> {
    if (bookId) {
      const result = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(entries)
        .innerJoin(books, eq(entries.bookId, books.id))
        .where(
          and(eq(books.userId, userId), eq(entries.bookId, bookId), isNull(entries.deletedAt), isNull(books.deletedAt))
        );
      return Number(result[0]?.count ?? 0);
    }

    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(entries)
      .innerJoin(books, eq(entries.bookId, books.id))
      .where(and(eq(books.userId, userId), isNull(entries.deletedAt), isNull(books.deletedAt)));
    return Number(result[0]?.count ?? 0);
  }

  async findEntriesByChapterId(chapterId: string): Promise<Entry[]> {
    const result = await this.db
      .select()
      .from(entries)
      .where(and(eq(entries.chapterId, chapterId), isNull(entries.deletedAt)))
      .orderBy(entries.sortOrder);
    return decryptEntries(result);
  }

  async updateEntry(id: string, data: Partial<Entry>): Promise<Entry> {
    const updateData = data.content ? { ...data, content: encryptionService.encrypt(data.content) } : data;

    const [entry] = await this.db
      .update(entries)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(entries.id, id), isNull(entries.deletedAt)))
      .returning();

    if (!entry) throw ProfileError.notFound('Entry', id);
    return decryptEntry(entry);
  }

  async deleteEntry(id: string): Promise<void> {
    await this.db.update(entries).set({ deletedAt: new Date() }).where(eq(entries.id, id));
  }

  async addEntryIllustration(entryId: string, url: string): Promise<Illustration> {
    const existingImages = await this.findEntryIllustrations(entryId);
    if (existingImages.length >= 4) {
      throw ProfileError.validationError('images', 'Maximum of 4 images per entry allowed');
    }
    const sortOrder = existingImages.length;
    const [image] = await this.db
      .insert(illustrations)
      .values({
        entryId,
        url,
        sortOrder,
        illustrationType: 'entry',
        source: 'uploaded',
      })
      .returning();
    logger.info('Entry image added', { id: image.id, entryId, sortOrder });
    return image;
  }

  async findEntryIllustrations(entryId: string): Promise<Illustration[]> {
    return this.db
      .select()
      .from(illustrations)
      .where(and(eq(illustrations.entryId, entryId), isNull(illustrations.deletedAt)))
      .orderBy(illustrations.sortOrder);
  }

  async findEntryIllustrationsByEntryIds(entryIds: string[]): Promise<Map<string, Illustration[]>> {
    if (entryIds.length === 0) {
      return new Map();
    }

    const images = await this.db
      .select()
      .from(illustrations)
      .where(and(inArray(illustrations.entryId, entryIds), isNull(illustrations.deletedAt)))
      .orderBy(illustrations.entryId, illustrations.sortOrder);

    const result = new Map<string, Illustration[]>();
    for (const image of images) {
      if (image.entryId) {
        const existing = result.get(image.entryId) || [];
        existing.push(image);
        result.set(image.entryId, existing);
      }
    }

    return result;
  }

  async removeEntryIllustration(illustrationId: string): Promise<void> {
    const [illustration] = await this.db
      .select()
      .from(illustrations)
      .where(and(eq(illustrations.id, illustrationId), isNull(illustrations.deletedAt)));

    if (!illustration) {
      throw ProfileError.notFound('Illustration', illustrationId);
    }

    await this.db.update(illustrations).set({ deletedAt: new Date() }).where(eq(illustrations.id, illustrationId));

    if (illustration.entryId) {
      await this.db
        .update(illustrations)
        .set({ sortOrder: sql`${illustrations.sortOrder} - 1` })
        .where(
          and(
            eq(illustrations.entryId, illustration.entryId),
            sql`${illustrations.sortOrder} > ${illustration.sortOrder}`,
            isNull(illustrations.deletedAt)
          )
        );
    }

    logger.info('Entry illustration removed', { illustrationId, entryId: illustration.entryId });
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

  async updateEntriesBatch(ids: string[], data: Partial<Entry>): Promise<number> {
    if (ids.length === 0) return 0;

    const updateData = data.content ? { ...data, content: encryptionService.encrypt(data.content) } : data;

    const result = await this.db
      .update(entries)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(inArray(entries.id, ids), isNull(entries.deletedAt)))
      .returning();

    logger.info('Batch updated entries', { count: result.length, ids });
    return result.length;
  }

  async getEntriesByUser(userId: string, filter?: EntryFilter): Promise<Entry[]> {
    const conditions: SQL[] = [eq(books.userId, userId), isNull(entries.deletedAt), isNull(books.deletedAt)];
    if (filter?.entryType) {
      conditions.push(eq(entries.entryType, filter.entryType));
    }
    if (filter?.dateFrom) {
      const fromDate = typeof filter.dateFrom === 'string' ? new Date(filter.dateFrom) : filter.dateFrom;
      conditions.push(gte(entries.createdAt, fromDate));
    }
    if (filter?.dateTo) {
      const toDate = typeof filter.dateTo === 'string' ? new Date(filter.dateTo) : filter.dateTo;
      conditions.push(lte(entries.createdAt, toDate));
    }
    if (filter?.tags && filter.tags.length > 0) {
      conditions.push(sql`${entries.tags} && ${filter.tags}`);
    }

    const query = this.db
      .select({ entry: entries })
      .from(entries)
      .innerJoin(books, eq(entries.bookId, books.id))
      .where(and(...conditions))
      .orderBy(desc(entries.createdAt));

    let result: { entry: Entry }[];
    if (filter?.limit) {
      result = await query.limit(Math.min(filter.limit || 20, 100));
    } else {
      result = await query;
    }
    if (filter?.offset) {
      result = await this.db
        .select({ entry: entries })
        .from(entries)
        .innerJoin(books, eq(entries.bookId, books.id))
        .where(and(...conditions))
        .orderBy(desc(entries.createdAt))
        .limit(Math.min(filter.limit || 20, 100))
        .offset(filter.offset);
    }

    return decryptEntries(result.map(r => r.entry));
  }
}
