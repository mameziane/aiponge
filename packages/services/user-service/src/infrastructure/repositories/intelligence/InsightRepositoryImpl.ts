import { eq, desc, and, isNull, type SQL } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { InsightFilter } from '../../../domains/intelligence/repositories/IIntelligenceRepository';
import { usrInsights as insights } from '../../database/schemas/profile-schema';
import type { Insight, NewInsight } from '../../../domains/insights/types';
import { getLogger } from '../../../config/service-urls';
import { encryptInsightData, decryptInsight, decryptInsights, encryptionService } from './encryption-helpers';

const logger = getLogger('intelligence-repository');

export class InsightRepositoryPart {
  constructor(private readonly db: DatabaseConnection) {}

  async createInsight(insightData: NewInsight): Promise<Insight> {
    const encryptedData = encryptInsightData(insightData);
    const [insight] = await this.db.insert(insights).values(encryptedData).returning();
    logger.info('Insight created', {
      id: insight.id,
      userId: insight.userId,
      encrypted: encryptionService.isEncryptionEnabled(),
    });
    return decryptInsight(insight);
  }

  async createInsightsBulk(insightsData: NewInsight[]): Promise<Insight[]> {
    if (insightsData.length === 0) return [];

    const encryptedData = insightsData.map(d => encryptInsightData(d));
    const result = await this.db.insert(insights).values(encryptedData).returning();

    logger.info('Bulk insights created', { count: result.length });
    return decryptInsights(result);
  }

  async findInsightsByUserId(userId: string, limit: number = 50): Promise<Insight[]> {
    const result = await this.db
      .select()
      .from(insights)
      .where(and(eq(insights.userId, userId), isNull(insights.deletedAt)))
      .orderBy(desc(insights.createdAt))
      .limit(Math.min(limit || 20, 100));
    return decryptInsights(result);
  }

  async findInsightsByEntryId(entryId: string): Promise<Insight[]> {
    const result = await this.db
      .select()
      .from(insights)
      .where(and(eq(insights.entryId, entryId), isNull(insights.deletedAt)))
      .orderBy(desc(insights.createdAt));
    return decryptInsights(result);
  }

  async getInsightsByUser(userId: string, filter?: InsightFilter): Promise<Insight[]> {
    const conditions: SQL[] = [eq(insights.userId, userId), isNull(insights.deletedAt)];
    if (filter?.category) {
      conditions.push(eq(insights.category, filter.category));
    }

    const query = this.db
      .select()
      .from(insights)
      .where(and(...conditions))
      .orderBy(desc(insights.createdAt));

    let result: Insight[];
    if (filter?.limit) {
      result = await query.limit(Math.min(filter.limit || 20, 100));
    } else {
      result = await query;
    }

    return decryptInsights(result);
  }
}
