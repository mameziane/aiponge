/**
 * Analysis Repository
 * Repository for analytics, patterns, and analysis data
 * Implements real Drizzle ORM queries for profile analytics
 *
 * SECURITY: All user content is encrypted at rest using AES-256-GCM
 * via the EncryptionService. Content is decrypted on retrieval.
 */

import { and, desc, eq, gte, lte, sql, inArray, isNull, type SQL } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { usrInsights, usrUserPatterns, usrProfileAnalytics } from '../database/schemas/profile-schema';
import { libBooks, libEntries, Entry } from '../database/schemas/library-schema';
import { encryptionService } from '../services/EncryptionService';
import type {
  IAnalysisRepository,
  PatternFilter,
  AnalyticsFilter,
  PatternRecord,
  ProfileAnalyticsRecord,
  AnalyticsEventData,
} from '../../domains/profile/repositories/IAnalysisRepository';
import type { InsightRecord } from '../../domains/profile/repositories/IEntryRepository';
import { UserPattern, NewUserPattern } from '../database/schemas/profile-schema';

export type {
  PatternFilter,
  AnalyticsFilter,
  PatternRecord,
  ProfileAnalyticsRecord,
  InsightRecord,
  AnalyticsEventData,
};

export interface EntryFilter {
  type?: string;
  sentiment?: string;
  dateFrom?: Date;
  dateTo?: Date;
  isArchived?: boolean;
}

export interface AnalyticsEventFilter {
  userId?: string;
  contentId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export class AnalysisRepository implements IAnalysisRepository {
  constructor(private readonly db: DatabaseConnection) {}

  private decryptEntry(entry: Entry): Entry {
    if (!entry.content) return entry;
    return {
      ...entry,
      content: encryptionService.decrypt(entry.content),
    };
  }

  private decryptEntries(entries: Entry[]): Entry[] {
    return entries.map(e => this.decryptEntry(e));
  }

  private decryptInsight(insight: InsightRecord): InsightRecord {
    if (!insight.content) return insight;
    return {
      ...insight,
      content: encryptionService.decrypt(insight.content),
    };
  }

  private decryptInsights(insights: InsightRecord[]): InsightRecord[] {
    return insights.map(i => this.decryptInsight(i));
  }

  async getUserPatterns(userId: string, filter?: PatternFilter): Promise<PatternRecord[]> {
    const conditions: SQL[] = [eq(usrUserPatterns.userId, userId), isNull(usrUserPatterns.deletedAt)];

    if (filter?.dateFrom) {
      conditions.push(gte(usrUserPatterns.lastObserved, filter.dateFrom));
    }

    if (filter?.dateTo) {
      conditions.push(lte(usrUserPatterns.firstObserved, filter.dateTo));
    }

    if (filter?.isActive !== undefined) {
      conditions.push(eq(usrUserPatterns.isActive, filter.isActive));
    }

    if (filter?.patternType) {
      conditions.push(eq(usrUserPatterns.patternType, filter.patternType));
    }

    return await this.db
      .select()
      .from(usrUserPatterns)
      .where(and(...conditions))
      .orderBy(desc(usrUserPatterns.lastObserved));
  }

  async getProfileAnalytics(userId: string, filter?: AnalyticsFilter): Promise<ProfileAnalyticsRecord[]> {
    const conditions = [eq(usrProfileAnalytics.userId, userId)];

    if (filter?.validFrom) {
      conditions.push(gte(usrProfileAnalytics.validFrom, filter.validFrom));
    }

    if (filter?.validTo) {
      conditions.push(lte(usrProfileAnalytics.validTo, filter.validTo));
    }

    if (filter?.analysisType) {
      conditions.push(eq(usrProfileAnalytics.analysisType, filter.analysisType));
    }

    return await this.db
      .select()
      .from(usrProfileAnalytics)
      .where(and(...conditions))
      .orderBy(desc(usrProfileAnalytics.computedAt));
  }

  async recordAnalyticsEvent(event: AnalyticsEventData): Promise<void> {
    await this.db.insert(usrProfileAnalytics).values({
      userId: event.userId,
      analysisType: event.eventType,
      timeframe: 'event',
      validFrom: new Date(),
      validTo: new Date(),
      progressIndicators: { ...event.eventData, sessionId: event.sessionId, ...event.metadata },
    });
  }

  async getInsightsByUser(userId: string, filter?: { dateFrom?: Date; dateTo?: Date }): Promise<InsightRecord[]> {
    const conditions: SQL[] = [eq(usrInsights.userId, userId), isNull(usrInsights.deletedAt)];

    if (filter?.dateFrom) {
      conditions.push(gte(usrInsights.createdAt, filter.dateFrom));
    }

    if (filter?.dateTo) {
      conditions.push(lte(usrInsights.createdAt, filter.dateTo));
    }

    const insights = await this.db
      .select()
      .from(usrInsights)
      .where(and(...conditions))
      .orderBy(desc(usrInsights.createdAt));

    return this.decryptInsights(insights);
  }

  async getAnalyticsEvents(filter?: AnalyticsEventFilter): Promise<(ProfileAnalyticsRecord & { eventType: string })[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (filter?.userId) {
      conditions.push(eq(usrProfileAnalytics.userId, filter.userId));
    }

    if (filter?.dateFrom) {
      conditions.push(gte(usrProfileAnalytics.createdAt, filter.dateFrom));
    }

    if (filter?.dateTo) {
      conditions.push(lte(usrProfileAnalytics.createdAt, filter.dateTo));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await this.db
      .select()
      .from(usrProfileAnalytics)
      .where(whereClause)
      .orderBy(desc(usrProfileAnalytics.createdAt))
      .limit(1000);

    return results.map(r => ({
      ...r,
      eventType: r.analysisType,
    }));
  }

  async getEntriesByUser(userId: string, filter?: EntryFilter): Promise<Entry[]> {
    // First get all book IDs for this user
    const userBooks = await this.db
      .select({ id: libBooks.id })
      .from(libBooks)
      .where(and(eq(libBooks.userId, userId), isNull(libBooks.deletedAt)));

    if (userBooks.length === 0) {
      return [];
    }

    const bookIds = userBooks.map(b => b.id);
    const conditions: SQL[] = [inArray(libEntries.bookId, bookIds), isNull(libEntries.deletedAt)];

    if (filter?.type) {
      conditions.push(eq(libEntries.entryType, filter.type));
    }

    if (filter?.sentiment) {
      conditions.push(eq(libEntries.sentiment, filter.sentiment));
    }

    if (filter?.dateFrom) {
      conditions.push(gte(libEntries.createdAt, filter.dateFrom));
    }

    if (filter?.dateTo) {
      conditions.push(lte(libEntries.createdAt, filter.dateTo));
    }

    const entries = await this.db
      .select()
      .from(libEntries)
      .where(and(...conditions))
      .orderBy(desc(libEntries.createdAt));

    return this.decryptEntries(entries);
  }

  async createPattern(data: NewUserPattern): Promise<UserPattern> {
    const [pattern] = await this.db
      .insert(usrUserPatterns)
      .values({
        userId: data.userId,
        patternType: data.patternType,
        patternName: data.patternName,
        description: data.description,
        frequency: data.frequency || 1,
        strength: data.strength || '0.50',
        trend: data.trend || 'stable',
        firstObserved: data.firstObserved || new Date(),
        lastObserved: data.lastObserved || new Date(),
        relatedThemes: data.relatedThemes || [],
        triggerFactors: data.triggerFactors || [],
        isActive: data.isActive !== undefined ? data.isActive : true,
        metadata: data.metadata || {},
      })
      .returning();

    return pattern;
  }

  async updatePattern(patternId: string, data: Partial<UserPattern>): Promise<UserPattern> {
    const [updated] = await this.db
      .update(usrUserPatterns)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(usrUserPatterns.id, patternId), isNull(usrUserPatterns.deletedAt)))
      .returning();

    return updated;
  }
}
