/**
 * Insight Repository Implementation
 * AI-generated insights from user entries
 */

import { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import { IInsightRepository, InsightFilter } from '@domains/insights/repositories/IInsightRepository';
import { usrInsights as insights, Insight, NewInsight } from '@infrastructure/database/schemas/profile-schema';
import { eq, desc, and, gte, lte, inArray, isNull } from 'drizzle-orm';
import { getLogger } from '@config/service-urls';
import { encryptionService } from '@infrastructure/services';

const logger = getLogger('insight-repository');

const SENSITIVE_INSIGHT_FIELDS = ['content'] as const;
type SensitiveInsightField = (typeof SENSITIVE_INSIGHT_FIELDS)[number];

export class InsightRepositoryImpl implements IInsightRepository {
  constructor(private readonly db: DatabaseConnection) {}

  private encryptInsightData(data: NewInsight): NewInsight {
    const encrypted = { ...data };
    for (const field of SENSITIVE_INSIGHT_FIELDS) {
      const value = encrypted[field as SensitiveInsightField];
      if (value) {
        (encrypted as Record<string, unknown>)[field] = encryptionService.encrypt(value);
      }
    }
    return encrypted;
  }

  private decryptInsight(insight: Insight): Insight {
    const decrypted = { ...insight };
    for (const field of SENSITIVE_INSIGHT_FIELDS) {
      const value = decrypted[field as SensitiveInsightField];
      if (value) {
        (decrypted as Record<string, unknown>)[field] = encryptionService.decrypt(value);
      }
    }
    return decrypted;
  }

  private decryptInsights(insightList: Insight[]): Insight[] {
    return insightList.map(i => this.decryptInsight(i));
  }

  async createInsight(insight: NewInsight): Promise<Insight> {
    const encryptedData = this.encryptInsightData(insight);
    const [result] = await this.db
      .insert(insights)
      .values(encryptedData as typeof insights.$inferInsert)
      .returning();
    logger.info('Insight created', { id: result.id, userId: result.userId, type: result.type });
    return this.decryptInsight(result);
  }

  async createInsightsBulk(insightList: NewInsight[]): Promise<Insight[]> {
    if (insightList.length === 0) return [];

    const encryptedInsights = insightList.map(i => this.encryptInsightData(i));
    const results = await this.db
      .insert(insights)
      .values(encryptedInsights as (typeof insights.$inferInsert)[])
      .returning();

    logger.info('Insights created in bulk', { count: results.length });
    return this.decryptInsights(results);
  }

  async findInsightsByUserId(userId: string, limit: number = 50): Promise<Insight[]> {
    const results = await this.db
      .select()
      .from(insights)
      .where(and(eq(insights.userId, userId), isNull(insights.deletedAt)))
      .orderBy(desc(insights.createdAt))
      .limit(Math.min(limit || 20, 100));
    return this.decryptInsights(results);
  }

  async findInsightsByEntryId(entryId: string): Promise<Insight[]> {
    const results = await this.db
      .select()
      .from(insights)
      .where(and(eq(insights.entryId, entryId), isNull(insights.deletedAt)))
      .orderBy(desc(insights.createdAt));
    return this.decryptInsights(results);
  }

  async getInsightsByUser(userId: string, filter?: InsightFilter): Promise<Insight[]> {
    const conditions = [eq(insights.userId, userId), isNull(insights.deletedAt)];

    if (filter?.category) {
      conditions.push(eq(insights.category, filter.category));
    }
    if (filter?.type) {
      conditions.push(eq(insights.type, filter.type));
    }
    if (filter?.entryId) {
      conditions.push(eq(insights.entryId, filter.entryId));
    }
    if (filter?.dateFrom) {
      const dateFrom = typeof filter.dateFrom === 'string' ? new Date(filter.dateFrom) : filter.dateFrom;
      conditions.push(gte(insights.createdAt, dateFrom));
    }
    if (filter?.dateTo) {
      const dateTo = typeof filter.dateTo === 'string' ? new Date(filter.dateTo) : filter.dateTo;
      conditions.push(lte(insights.createdAt, dateTo));
    }

    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    const results = await this.db
      .select()
      .from(insights)
      .where(and(...conditions))
      .orderBy(desc(insights.createdAt))
      .limit(Math.min(limit || 20, 100))
      .offset(offset);

    return this.decryptInsights(results);
  }
}
