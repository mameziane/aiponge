import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { libChapters, type Chapter } from '../../database/schemas/library-schema';
import { eq, and, asc, sql, isNull } from 'drizzle-orm';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('library-repository');

export interface CreateChapterData {
  bookId: string;
  userId: string;
  title: string;
  description?: string;
  sortOrder?: number;
  isLocked?: boolean;
  unlockTrigger?: string;
}

export interface UpdateChapterData {
  title?: string;
  description?: string;
  sortOrder?: number;
  isLocked?: boolean;
  unlockTrigger?: string;
}

export class ChapterRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getById(id: string): Promise<Chapter | null> {
    const results = await this.db
      .select()
      .from(libChapters)
      .where(and(eq(libChapters.id, id), isNull(libChapters.deletedAt)))
      .limit(1);
    return results[0] || null;
  }

  async getByBook(bookId: string): Promise<Chapter[]> {
    return this.db
      .select()
      .from(libChapters)
      .where(and(eq(libChapters.bookId, bookId), isNull(libChapters.deletedAt)))
      .orderBy(asc(libChapters.sortOrder))
      .limit(200);
  }

  async getByUser(userId: string): Promise<Chapter[]> {
    return this.db
      .select()
      .from(libChapters)
      .where(and(eq(libChapters.userId, userId), isNull(libChapters.deletedAt)))
      .orderBy(asc(libChapters.sortOrder));
  }

  async create(data: CreateChapterData): Promise<Chapter> {
    const existingChapters = await this.getByBook(data.bookId);
    const sortOrder = data.sortOrder ?? existingChapters.length;

    const result = await this.db
      .insert(libChapters)
      .values({
        bookId: data.bookId,
        userId: data.userId,
        title: data.title,
        description: data.description,
        sortOrder,
        isLocked: data.isLocked ?? false,
        unlockTrigger: data.unlockTrigger,
      })
      .returning();

    logger.info('Chapter created', { chapterId: result[0].id, bookId: data.bookId, title: data.title });
    return result[0];
  }

  async update(id: string, data: UpdateChapterData): Promise<Chapter | null> {
    const result = await this.db
      .update(libChapters)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(libChapters.id, id), isNull(libChapters.deletedAt)))
      .returning();

    return result[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(libChapters).where(eq(libChapters.id, id)).returning({ id: libChapters.id });

    return result.length > 0;
  }

  async updateEntryCount(chapterId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE lib_chapters 
      SET entry_count = (SELECT COUNT(*) FROM lib_entries WHERE chapter_id = ${chapterId}),
          updated_at = NOW()
      WHERE id = ${chapterId}
    `);
  }

  async unlock(id: string): Promise<Chapter | null> {
    const result = await this.db
      .update(libChapters)
      .set({
        isLocked: false,
        unlockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(libChapters.id, id), isNull(libChapters.deletedAt)))
      .returning();

    return result[0] || null;
  }

  async getOrCreateDefaultChapter(bookId: string, userId: string, defaultTitle: string = 'Saved'): Promise<Chapter> {
    const chapters = await this.getByBook(bookId);
    if (chapters.length > 0) {
      return chapters[0];
    }

    try {
      return await this.create({
        bookId,
        userId,
        title: defaultTitle,
        sortOrder: 0,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('unique') || errorMessage.includes('duplicate')) {
        const retryChapters = await this.getByBook(bookId);
        if (retryChapters.length > 0) {
          return retryChapters[0];
        }
      }
      throw error;
    }
  }
}
