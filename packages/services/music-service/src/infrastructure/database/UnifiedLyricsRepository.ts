/**
 * UnifiedLyricsRepository
 * Consolidated repository for all lyrics (personal, draft, shared)
 * Uses unified mus_lyrics table with visibility-based filtering
 *
 * Replaces: DrizzleLyricsRepository, DrizzleUserLyricsRepository
 */

import { eq, and, desc, sql, or, inArray, isNull } from 'drizzle-orm';
import { lyrics, Lyrics, NewLyrics } from '../../schema/music-schema';
import { getLogger } from '../../config/service-urls';
import type { DatabaseConnection } from './DatabaseConnectionFactory';
import {
  CONTENT_VISIBILITY,
  VISIBILITY_FILTER,
  type ContentVisibility,
  type VisibilityFilter,
} from '@aiponge/shared-contracts';

const logger = getLogger('music-service-unified-lyrics-repository');

export type LyricsVisibility = ContentVisibility;
export type LyricsVisibilityFilter = VisibilityFilter;

export interface IUnifiedLyricsRepository {
  create(data: NewLyrics, visibility?: LyricsVisibility): Promise<Lyrics>;
  findById(id: string, visibilityFilter?: LyricsVisibilityFilter): Promise<Lyrics | null>;
  findByUserId(userId: string, options?: { visibility?: LyricsVisibilityFilter; limit?: number }): Promise<Lyrics[]>;
  findByEntryId(entryId: string, visibilityFilter?: LyricsVisibilityFilter): Promise<Lyrics | null>;
  findByLanguage(
    language: string,
    options?: { visibility?: LyricsVisibilityFilter; limit?: number }
  ): Promise<Lyrics[]>;
  update(id: string, data: Partial<NewLyrics>): Promise<Lyrics | null>;
  delete(id: string): Promise<boolean>;
  deleteByUserId(userId: string, visibility?: LyricsVisibilityFilter): Promise<number>;
  updateSyncedLines(id: string, syncedLines: unknown): Promise<Lyrics | null>;
}

export class UnifiedLyricsRepository implements IUnifiedLyricsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  private getVisibilityCondition(filter: LyricsVisibilityFilter) {
    switch (filter) {
      case VISIBILITY_FILTER.USER:
      case VISIBILITY_FILTER.PERSONAL:
        return eq(lyrics.visibility, CONTENT_VISIBILITY.PERSONAL);
      case VISIBILITY_FILTER.SHARED:
        return eq(lyrics.visibility, CONTENT_VISIBILITY.SHARED);
      case VISIBILITY_FILTER.PUBLIC:
        return eq(lyrics.visibility, CONTENT_VISIBILITY.PUBLIC);
      case VISIBILITY_FILTER.PUBLICLY_ACCESSIBLE:
        return inArray(lyrics.visibility, [CONTENT_VISIBILITY.SHARED, CONTENT_VISIBILITY.PUBLIC]);
      case VISIBILITY_FILTER.ALL:
        return undefined;
      default:
        return eq(lyrics.visibility, filter);
    }
  }

  async create(data: NewLyrics, visibility: LyricsVisibility = CONTENT_VISIBILITY.PERSONAL): Promise<Lyrics> {
    const dataWithVisibility = {
      ...data,
      visibility,
    };
    const [result] = await this.db.insert(lyrics).values(dataWithVisibility).returning();
    logger.info('Lyrics created', {
      id: result.id,
      userId: data.userId,
      visibility,
      language: data.language,
    });
    return result;
  }

  async findById(id: string, visibilityFilter: LyricsVisibilityFilter = VISIBILITY_FILTER.ALL): Promise<Lyrics | null> {
    const visibilityCondition = this.getVisibilityCondition(visibilityFilter);
    const conditions = visibilityCondition
      ? and(eq(lyrics.id, id), visibilityCondition, isNull(lyrics.deletedAt))
      : and(eq(lyrics.id, id), isNull(lyrics.deletedAt));

    const [result] = await this.db.select().from(lyrics).where(conditions).limit(1);
    return result || null;
  }

  async findByUserId(
    userId: string,
    options: { visibility?: LyricsVisibilityFilter; limit?: number } = {}
  ): Promise<Lyrics[]> {
    const { visibility = VISIBILITY_FILTER.USER, limit = 50 } = options;
    const visibilityCondition = this.getVisibilityCondition(visibility);
    const conditions = visibilityCondition
      ? and(eq(lyrics.userId, userId), visibilityCondition, isNull(lyrics.deletedAt))
      : and(eq(lyrics.userId, userId), isNull(lyrics.deletedAt));

    return this.db
      .select()
      .from(lyrics)
      .where(conditions)
      .orderBy(desc(lyrics.createdAt))
      .limit(Math.min(limit || 20, 100));
  }

  async findByEntryId(
    entryId: string,
    visibilityFilter: LyricsVisibilityFilter = VISIBILITY_FILTER.ALL
  ): Promise<Lyrics | null> {
    const visibilityCondition = this.getVisibilityCondition(visibilityFilter);
    const conditions = visibilityCondition
      ? and(eq(lyrics.entryId, entryId), visibilityCondition, isNull(lyrics.deletedAt))
      : and(eq(lyrics.entryId, entryId), isNull(lyrics.deletedAt));

    const [result] = await this.db.select().from(lyrics).where(conditions).limit(1);
    return result || null;
  }

  async findByLanguage(
    language: string,
    options: { visibility?: LyricsVisibilityFilter; limit?: number } = {}
  ): Promise<Lyrics[]> {
    const { visibility = CONTENT_VISIBILITY.SHARED, limit = 50 } = options;
    const visibilityCondition = this.getVisibilityCondition(visibility);
    const conditions = visibilityCondition
      ? and(eq(lyrics.language, language), visibilityCondition, isNull(lyrics.deletedAt))
      : and(eq(lyrics.language, language), isNull(lyrics.deletedAt));

    return this.db
      .select()
      .from(lyrics)
      .where(conditions)
      .orderBy(desc(lyrics.createdAt))
      .limit(Math.min(limit || 20, 100));
  }

  async update(id: string, data: Partial<NewLyrics>): Promise<Lyrics | null> {
    const [result] = await this.db
      .update(lyrics)
      .set({ ...data, updatedAt: sql`NOW()` })
      .where(and(eq(lyrics.id, id), isNull(lyrics.deletedAt)))
      .returning();
    if (result) {
      logger.info('Lyrics updated', { id, visibility: result.visibility });
    }
    return result || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .update(lyrics)
      .set({ deletedAt: new Date() })
      .where(eq(lyrics.id, id))
      .returning({ id: lyrics.id });
    const deleted = result.length > 0;
    if (deleted) {
      logger.info('Lyrics deleted', { id });
    }
    return deleted;
  }

  async deleteByUserId(userId: string, visibility: LyricsVisibilityFilter = VISIBILITY_FILTER.USER): Promise<number> {
    const visibilityCondition = this.getVisibilityCondition(visibility);
    const conditions = visibilityCondition
      ? and(eq(lyrics.userId, userId), visibilityCondition)
      : eq(lyrics.userId, userId);

    const result = await this.db.delete(lyrics).where(conditions).returning({ id: lyrics.id });
    logger.info('Lyrics deleted for user', { userId, count: result.length, visibility });
    return result.length;
  }

  async updateSyncedLines(id: string, syncedLines: unknown): Promise<Lyrics | null> {
    const [result] = await this.db
      .update(lyrics)
      .set({
        syncedLines: syncedLines as (typeof lyrics.$inferInsert)['syncedLines'],
        updatedAt: sql`NOW()`,
      })
      .where(and(eq(lyrics.id, id), isNull(lyrics.deletedAt)))
      .returning();
    if (result) {
      logger.info('Lyrics synced lines updated', { id });
    }
    return result || null;
  }
}
