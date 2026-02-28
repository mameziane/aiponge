import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { libBooks, libEntries } from '../../database/schemas/library-schema';
import { eq, and, desc, sql, isNull, gte, lte } from 'drizzle-orm';
import type {
  IEntryRepository,
  EntryFilter,
  EntryRecord,
  InsightRecord,
} from '../../../domains/profile/repositories/IEntryRepository';
import { usrInsights } from '../../database/schemas/profile-schema';

export class UnifiedEntryRepositoryAdapter implements IEntryRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getEntriesByUser(userId: string, filter?: EntryFilter): Promise<EntryRecord[]> {
    const conditions = [eq(libBooks.userId, userId), isNull(libEntries.deletedAt), isNull(libBooks.deletedAt)];

    if (filter?.dateFrom) {
      conditions.push(sql`${libEntries.createdAt} >= ${filter.dateFrom}`);
    }
    if (filter?.dateTo) {
      conditions.push(sql`${libEntries.createdAt} <= ${filter.dateTo}`);
    }

    const entries = await this.db
      .select({
        id: libEntries.id,
        bookId: libEntries.bookId,
        chapterId: libEntries.chapterId,
        content: libEntries.content,
        entryType: libEntries.entryType,
        sortOrder: libEntries.sortOrder,
        moodContext: libEntries.moodContext,
        sentiment: libEntries.sentiment,
        emotionalIntensity: libEntries.emotionalIntensity,
        tags: libEntries.tags,
        metadata: libEntries.metadata,
        createdAt: libEntries.createdAt,
        updatedAt: libEntries.updatedAt,
      })
      .from(libEntries)
      .innerJoin(libBooks, eq(libEntries.bookId, libBooks.id))
      .where(and(...conditions))
      .orderBy(desc(libEntries.createdAt));

    return entries.map(entry => ({
      id: entry.id,
      userId: userId,
      chapterId: entry.chapterId,
      chapterSortOrder: entry.sortOrder,
      content: entry.content,
      type: entry.entryType,
      moodContext: entry.moodContext,
      triggerSource: null,
      sentiment: entry.sentiment,
      emotionalIntensity: entry.emotionalIntensity,
      processingStatus: null,
      tags: entry.tags,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
  }

  async getInsightsByUser(userId: string, filter?: EntryFilter): Promise<InsightRecord[]> {
    const conditions = [eq(usrInsights.userId, userId), isNull(usrInsights.deletedAt)];

    if (filter?.dateFrom) {
      conditions.push(gte(usrInsights.createdAt, filter.dateFrom));
    }
    if (filter?.dateTo) {
      conditions.push(lte(usrInsights.createdAt, filter.dateTo));
    }
    if (filter?.minConfidence) {
      conditions.push(sql`(${usrInsights.confidence})::numeric >= ${filter.minConfidence}`);
    }

    const insights = await this.db
      .select()
      .from(usrInsights)
      .where(and(...conditions))
      .orderBy(desc(usrInsights.createdAt));

    return insights.map(insight => ({
      id: insight.id,
      userId: insight.userId,
      entryId: insight.entryId,
      type: insight.type,
      title: insight.title,
      content: insight.content,
      confidence: insight.confidence,
      category: insight.category,
      themes: insight.themes,
      actionable: insight.actionable,
      priority: insight.priority,
      aiProvider: insight.aiProvider,
      aiModel: insight.aiModel,
      generatedAt: insight.generatedAt,
      validatedAt: insight.validatedAt,
      validatedBy: insight.validatedBy,
      metadata: insight.metadata,
      createdAt: insight.createdAt,
    }));
  }
}
