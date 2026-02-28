import { eq, desc, and, isNull, type SQL } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import {
  AnalyticsFilter,
  AnalyticsEvent,
  PatternFilter,
} from '../../../domains/intelligence/repositories/IIntelligenceRepository';
import {
  usrUserPatterns as userPatterns,
  usrProfileAnalytics as profileAnalytics,
  usrPatternReactions,
} from '../../database/schemas/profile-schema';
import type { UserPattern, ProfileAnalytics, PatternReaction, NewPatternReaction } from '../../../domains/insights/types';
import { getLogger } from '../../../config/service-urls';
import { ProfileError } from '../../../application/errors/errors';

export interface AnalyticsEventFilter {
  userId?: string;
  eventType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

const logger = getLogger('intelligence-repository');

export class AnalyticsRepositoryPart {
  constructor(private readonly db: DatabaseConnection) {}

  async getUserPatterns(userId: string, filter?: PatternFilter): Promise<UserPattern[]> {
    const conditions: SQL[] = [eq(userPatterns.userId, userId), isNull(userPatterns.deletedAt)];
    if (filter?.type) {
      conditions.push(eq(userPatterns.patternType, filter.type));
    }

    const query = this.db
      .select()
      .from(userPatterns)
      .where(and(...conditions))
      .orderBy(desc(userPatterns.lastObserved));

    if (filter?.limit) {
      return query.limit(Math.min(filter.limit || 20, 100));
    }

    return query;
  }

  async createPatternReaction(reactionData: NewPatternReaction): Promise<PatternReaction> {
    const patternReactionsTable = usrPatternReactions;
    const [reaction] = await this.db.insert(patternReactionsTable).values(reactionData).returning();
    logger.info('Pattern reaction created', { id: reaction.id, patternId: reaction.patternId, reaction: reaction.reaction });
    return reaction;
  }

  async findPatternReactionsByPatternId(patternId: string, userId: string): Promise<PatternReaction[]> {
    const patternReactionsTable = usrPatternReactions;
    return this.db
      .select()
      .from(patternReactionsTable)
      .where(and(eq(patternReactionsTable.patternId, patternId), eq(patternReactionsTable.userId, userId)))
      .orderBy(desc(patternReactionsTable.createdAt));
  }

  async findPatternReactionsByUserId(userId: string, limit: number = 50): Promise<PatternReaction[]> {
    const patternReactionsTable = usrPatternReactions;
    return this.db
      .select()
      .from(patternReactionsTable)
      .where(eq(patternReactionsTable.userId, userId))
      .orderBy(desc(patternReactionsTable.createdAt))
      .limit(Math.min(limit, 100));
  }

  async getPatternById(patternId: string, userId: string): Promise<UserPattern | null> {
    const [pattern] = await this.db
      .select()
      .from(userPatterns)
      .where(and(eq(userPatterns.id, patternId), eq(userPatterns.userId, userId), isNull(userPatterns.deletedAt)));
    return pattern || null;
  }

  async updatePattern(id: string, data: Partial<UserPattern>): Promise<UserPattern> {
    const [pattern] = await this.db
      .update(userPatterns)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(userPatterns.id, id), isNull(userPatterns.deletedAt)))
      .returning();
    if (!pattern) throw ProfileError.notFound('UserPattern', id);
    return pattern;
  }

  async getProfileAnalytics(userId: string, filter?: AnalyticsFilter): Promise<ProfileAnalytics[]> {
    const conditions = [eq(profileAnalytics.userId, userId)];
    if (filter?.eventType) {
      conditions.push(eq(profileAnalytics.analysisType, filter.eventType));
    }

    const query = this.db
      .select()
      .from(profileAnalytics)
      .where(and(...conditions))
      .orderBy(desc(profileAnalytics.computedAt));

    if (filter?.limit) {
      return query.limit(Math.min(filter.limit || 20, 100));
    }

    return query;
  }

  async recordAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
    try {
      logger.info('Analytics event recorded (logged only)', {
        userId: event.userId,
        eventType: event.eventType,
      });
    } catch (error) {
      logger.error('Failed to record analytics event', { error, event });
    }
  }

  async getAnalyticsEvents(_filter?: AnalyticsFilter | AnalyticsEventFilter): Promise<AnalyticsEvent[]> {
    throw ProfileError.internalError(
      'IntelligenceRepository.getAnalyticsEvents is not implemented. ' +
        'Analytics events are stored in ai-analytics-service. ' +
        'Use ai-analytics-service API for analytics event queries.'
    );
  }
}
