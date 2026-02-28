import { eq, and, desc, gte, lte, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import {
  usrUserPatterns,
  usrProfileAnalytics,
  UserPattern,
  ProfileAnalytics,
} from '@infrastructure/database/schemas/profile-schema';
import {
  IPatternRepository,
  PatternFilter,
  AnalyticsFilter,
  AnalyticsEvent,
} from '@domains/insights/repositories/IPatternRepository';

export class PatternRepositoryImpl implements IPatternRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getUserPatterns(userId: string, filter?: PatternFilter): Promise<UserPattern[]> {
    const conditions = [eq(usrUserPatterns.userId, userId), isNull(usrUserPatterns.deletedAt)];

    if (filter?.type) {
      conditions.push(eq(usrUserPatterns.patternType, filter.type));
    }

    if (filter?.minConfidence !== undefined) {
      conditions.push(gte(usrUserPatterns.strength, filter.minConfidence.toString()));
    }

    if (filter?.dateFrom) {
      const fromDate = typeof filter.dateFrom === 'string' ? new Date(filter.dateFrom) : filter.dateFrom;
      conditions.push(gte(usrUserPatterns.createdAt, fromDate));
    }

    if (filter?.dateTo) {
      const toDate = typeof filter.dateTo === 'string' ? new Date(filter.dateTo) : filter.dateTo;
      conditions.push(lte(usrUserPatterns.createdAt, toDate));
    }

    let query = this.db
      .select()
      .from(usrUserPatterns)
      .where(and(...conditions))
      .orderBy(desc(usrUserPatterns.lastObserved));

    if (filter?.limit) {
      query = query.limit(Math.min(filter.limit || 20, 100)) as typeof query;
    }

    return query;
  }

  async getProfileAnalytics(userId: string, filter?: AnalyticsFilter): Promise<ProfileAnalytics[]> {
    const conditions = [eq(usrProfileAnalytics.userId, userId)];

    if (filter?.eventType) {
      conditions.push(eq(usrProfileAnalytics.analysisType, filter.eventType));
    }

    if (filter?.dateFrom) {
      const fromDate = typeof filter.dateFrom === 'string' ? new Date(filter.dateFrom) : filter.dateFrom;
      conditions.push(gte(usrProfileAnalytics.computedAt, fromDate));
    }

    if (filter?.dateTo) {
      const toDate = typeof filter.dateTo === 'string' ? new Date(filter.dateTo) : filter.dateTo;
      conditions.push(lte(usrProfileAnalytics.computedAt, toDate));
    }

    let query = this.db
      .select()
      .from(usrProfileAnalytics)
      .where(and(...conditions))
      .orderBy(desc(usrProfileAnalytics.computedAt));

    if (filter?.limit) {
      query = query.limit(Math.min(filter.limit || 20, 100)) as typeof query;
    }

    return query;
  }

  async recordAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
    const now = event.timestamp || new Date();
    await this.db.insert(usrProfileAnalytics).values({
      userId: event.userId,
      analysisType: event.eventType,
      timeframe: 'event',
      progressIndicators: event.eventData || {},
      computedAt: now,
      validFrom: now,
      validTo: now,
    });
  }

  async getAnalyticsEvents(filter?: AnalyticsFilter): Promise<AnalyticsEvent[]> {
    const conditions = [];

    if (filter?.eventType) {
      conditions.push(eq(usrProfileAnalytics.analysisType, filter.eventType));
    }

    if (filter?.dateFrom) {
      const fromDate = typeof filter.dateFrom === 'string' ? new Date(filter.dateFrom) : filter.dateFrom;
      conditions.push(gte(usrProfileAnalytics.computedAt, fromDate));
    }

    if (filter?.dateTo) {
      const toDate = typeof filter.dateTo === 'string' ? new Date(filter.dateTo) : filter.dateTo;
      conditions.push(lte(usrProfileAnalytics.computedAt, toDate));
    }

    let query = this.db
      .select()
      .from(usrProfileAnalytics)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(usrProfileAnalytics.computedAt));

    if (filter?.limit) {
      query = query.limit(Math.min(filter.limit || 20, 100)) as typeof query;
    }

    const results = await query;
    return results.map(row => ({
      userId: row.userId,
      eventType: row.analysisType,
      eventData: row.progressIndicators as Record<string, unknown>,
      timestamp: row.computedAt,
    }));
  }
}
