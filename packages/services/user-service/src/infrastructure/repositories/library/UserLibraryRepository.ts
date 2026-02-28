import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import {
  libUserLibrary,
  type UserLibrary,
} from '../../database/schemas/library-schema';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('library-repository');

export interface AddToLibraryData {
  userId: string;
  bookId: string;
  fontSize?: string;
}

export interface UpdateLibraryProgressData {
  lastChapterId?: string;
  lastEntryId?: string;
  currentPageIndex?: number;
  readingProgress?: number;
  fontSize?: string;
}

export class UserLibraryRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getByUser(userId: string): Promise<UserLibrary[]> {
    return this.db
      .select()
      .from(libUserLibrary)
      .where(and(eq(libUserLibrary.userId, userId), isNull(libUserLibrary.deletedAt)))
      .orderBy(desc(libUserLibrary.lastAccessedAt));
  }

  async getByUserAndBook(userId: string, bookId: string): Promise<UserLibrary | null> {
    const results = await this.db
      .select()
      .from(libUserLibrary)
      .where(
        and(eq(libUserLibrary.userId, userId), eq(libUserLibrary.bookId, bookId), isNull(libUserLibrary.deletedAt))
      )
      .limit(1);
    return results[0] || null;
  }

  async addToLibrary(data: AddToLibraryData): Promise<UserLibrary> {
    const existing = await this.getByUserAndBook(data.userId, data.bookId);
    if (existing) {
      return existing;
    }

    const result = await this.db
      .insert(libUserLibrary)
      .values({
        userId: data.userId,
        bookId: data.bookId,
        fontSize: data.fontSize ?? 'm',
      })
      .returning();

    logger.info('Book added to user library', { userId: data.userId, bookId: data.bookId });
    return result[0];
  }

  async updateProgress(userId: string, bookId: string, data: UpdateLibraryProgressData): Promise<UserLibrary | null> {
    const result = await this.db
      .update(libUserLibrary)
      .set({
        ...data,
        lastAccessedAt: new Date(),
      })
      .where(
        and(eq(libUserLibrary.userId, userId), eq(libUserLibrary.bookId, bookId), isNull(libUserLibrary.deletedAt))
      )
      .returning();

    return result[0] || null;
  }

  async markCompleted(userId: string, bookId: string): Promise<UserLibrary | null> {
    const result = await this.db
      .update(libUserLibrary)
      .set({
        completedAt: new Date(),
        readingProgress: 100,
        lastAccessedAt: new Date(),
      })
      .where(
        and(eq(libUserLibrary.userId, userId), eq(libUserLibrary.bookId, bookId), isNull(libUserLibrary.deletedAt))
      )
      .returning();

    return result[0] || null;
  }

  async removeFromLibrary(userId: string, bookId: string): Promise<boolean> {
    const result = await this.db
      .delete(libUserLibrary)
      .where(and(eq(libUserLibrary.userId, userId), eq(libUserLibrary.bookId, bookId)))
      .returning({ id: libUserLibrary.id });

    return result.length > 0;
  }
}
