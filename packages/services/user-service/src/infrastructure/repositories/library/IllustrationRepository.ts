import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import {
  libIllustrations,
  type Illustration,
} from '../../database/schemas/library-schema';
import { eq, and, asc, inArray, isNull } from 'drizzle-orm';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('library-repository');

export interface CreateIllustrationData {
  bookId?: string;
  chapterId?: string;
  entryId?: string;
  url: string;
  artworkUrl?: string;
  altText?: string;
  illustrationType: string;
  source: string;
  sortOrder?: number;
  generationPrompt?: string;
  generationMetadata?: Record<string, unknown>;
  width?: number;
  height?: number;
}

export class IllustrationRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getById(id: string): Promise<Illustration | null> {
    const results = await this.db
      .select()
      .from(libIllustrations)
      .where(and(eq(libIllustrations.id, id), isNull(libIllustrations.deletedAt)))
      .limit(1);
    return results[0] || null;
  }

  async getByBook(bookId: string): Promise<Illustration[]> {
    return this.db
      .select()
      .from(libIllustrations)
      .where(and(eq(libIllustrations.bookId, bookId), isNull(libIllustrations.deletedAt)))
      .orderBy(asc(libIllustrations.sortOrder));
  }

  async getByChapter(chapterId: string): Promise<Illustration[]> {
    return this.db
      .select()
      .from(libIllustrations)
      .where(and(eq(libIllustrations.chapterId, chapterId), isNull(libIllustrations.deletedAt)))
      .orderBy(asc(libIllustrations.sortOrder));
  }

  async getByEntry(entryId: string): Promise<Illustration[]> {
    return this.db
      .select()
      .from(libIllustrations)
      .where(and(eq(libIllustrations.entryId, entryId), isNull(libIllustrations.deletedAt)))
      .orderBy(asc(libIllustrations.sortOrder));
  }

  async getByEntries(entryIds: string[]): Promise<Map<string, Illustration[]>> {
    if (entryIds.length === 0) return new Map();

    const rows = await this.db
      .select()
      .from(libIllustrations)
      .where(and(inArray(libIllustrations.entryId, entryIds), isNull(libIllustrations.deletedAt)))
      .orderBy(asc(libIllustrations.sortOrder));

    const map = new Map<string, Illustration[]>();
    for (const row of rows) {
      if (!row.entryId) continue;
      const existing = map.get(row.entryId);
      if (existing) {
        existing.push(row);
      } else {
        map.set(row.entryId, [row]);
      }
    }
    return map;
  }

  async getBookCover(bookId: string): Promise<Illustration | null> {
    const results = await this.db
      .select()
      .from(libIllustrations)
      .where(
        and(
          eq(libIllustrations.bookId, bookId),
          eq(libIllustrations.illustrationType, 'cover'),
          isNull(libIllustrations.deletedAt)
        )
      )
      .limit(1);

    if (results[0]) {
      logger.debug('Found cover for book', {
        bookId,
        illustrationId: results[0].id,
        url: results[0].url,
      });
    }

    return results[0] || null;
  }

  async getBookCoversBatch(bookIds: string[]): Promise<Map<string, Illustration>> {
    if (bookIds.length === 0) return new Map();

    const results = await this.db
      .select()
      .from(libIllustrations)
      .where(
        and(
          inArray(libIllustrations.bookId, bookIds),
          eq(libIllustrations.illustrationType, 'cover'),
          isNull(libIllustrations.deletedAt)
        )
      );

    const coverMap = new Map<string, Illustration>();
    for (const ill of results) {
      if (ill.bookId && !coverMap.has(ill.bookId)) {
        coverMap.set(ill.bookId, ill);
      }
    }
    return coverMap;
  }

  async create(data: CreateIllustrationData): Promise<Illustration> {
    logger.info('Creating illustration record', {
      bookId: data.bookId,
      chapterId: data.chapterId,
      entryId: data.entryId,
      illustrationType: data.illustrationType,
      urlPrefix: data.url?.substring(0, 80),
    });

    const result = await this.db
      .insert(libIllustrations)
      .values({
        bookId: data.bookId,
        chapterId: data.chapterId,
        entryId: data.entryId,
        url: data.url,
        artworkUrl: data.artworkUrl,
        altText: data.altText,
        illustrationType: data.illustrationType,
        source: data.source,
        sortOrder: data.sortOrder ?? 0,
        generationPrompt: data.generationPrompt,
        generationMetadata: data.generationMetadata,
        width: data.width,
        height: data.height,
      })
      .returning();

    logger.info('Illustration created successfully', {
      illustrationId: result[0].id,
      type: data.illustrationType,
      bookId: data.bookId,
      url: result[0].url,
    });
    return result[0];
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(libIllustrations)
      .where(eq(libIllustrations.id, id))
      .returning({ id: libIllustrations.id });

    return result.length > 0;
  }

  async updateSortOrder(id: string, sortOrder: number): Promise<boolean> {
    const result = await this.db
      .update(libIllustrations)
      .set({ sortOrder })
      .where(and(eq(libIllustrations.id, id), isNull(libIllustrations.deletedAt)))
      .returning({ id: libIllustrations.id });

    return result.length > 0;
  }
}
