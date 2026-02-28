/**
 * Content Repository Implementation using Drizzle ORM
 * Handles database operations for content entities
 */

import { eq, desc, and, like, gte, lte, isNull } from 'drizzle-orm';
import {
  contentRequests,
  contentResults,
  contentFeedback,
  SelectContentRequest as _SelectContentRequest,
  SelectContentResult,
  InsertContentRequest,
  InsertContentResult,
} from '@schema/content-schema';
import { Content, type ContentType, type ContentMetadata, type ContentAnalysis } from '@domains/entities/Content';
import { GenerationRequest, type RequestStatus } from '@domains/entities/GenerationRequest';
import { getLogger } from '@config/service-urls';
import { DatabaseConnection } from '../DatabaseConnectionFactory';
import { ContentError } from '@application/errors';
import { AI_CONTENT_LIFECYCLE } from '@aiponge/shared-contracts';
import { getAuditService, getCorrelationContext } from '@aiponge/platform-core';

const logger = getLogger('ai-content-service-contentrepository');

export interface ContentRepository {
  // Content Request operations
  saveRequest(_request: GenerationRequest): Promise<string>;
  getRequest(_id: string): Promise<GenerationRequest | null>;
  updateRequestStatus(_id: string, _status: string, _metadata?: Record<string, unknown>): Promise<void>;

  // Content Result operations
  saveContent(_content: Content): Promise<string>;
  getContent(_id: string): Promise<Content | null>;
  getContentByRequest(_requestId: string): Promise<Content[]>;
  updateContent(_id: string, _updates: Partial<Content>): Promise<void>;
  deleteContent(_id: string): Promise<boolean>;

  // Query operations
  findContentByUser(_userId: string, _limit?: number, _offset?: number): Promise<Content[]>;
  findContentByType(_contentType: string, _limit?: number, _offset?: number): Promise<Content[]>;
  searchContent(_query: string, _filters?: ContentSearchFilters): Promise<Content[]>;

  // Analytics and statistics
  getContentStats(_timeframe?: 'day' | 'week' | 'month'): Promise<ContentStats>;
  getRequestStats(_timeframe?: 'day' | 'week' | 'month'): Promise<RequestStats>;

  // Feedback operations
  createFeedback(_feedback: CreateFeedbackInput): Promise<{ id: string }>;
}

export interface CreateFeedbackInput {
  resultId: string;
  userId: string;
  overallRating: number;
  qualityRating?: number | null;
  relevanceRating?: number | null;
  creativityRating?: number | null;
  usefulnessRating?: number | null;
  feedback?: string | null;
  improvements?: string[];
  metadata?: { feedbackType: 'manual' | 'automated'; source: string; context?: string };
}

export interface ContentSearchFilters {
  userId?: string;
  contentType?: string;
  status?: string;
  isPublished?: boolean;
  isApproved?: boolean;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
}

export interface ContentStats {
  totalContent: number;
  publishedContent: number;
  approvedContent: number;
  averageQualityScore: number;
  contentByType: Record<string, number>;
  contentByStatus: Record<string, number>;
}

export interface RequestStats {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  averageProcessingTime: number;
  requestsByType: Record<string, number>;
  requestsByStatus: Record<string, number>;
}

export class DrizzleContentRepository implements ContentRepository {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
    logger.debug('Initialized with Drizzle ORM via DatabaseConnectionFactory');
  }

  // ===== CONTENT REQUEST OPERATIONS =====

  async saveRequest(request: GenerationRequest): Promise<string> {
    try {
      const insertData: InsertContentRequest = {
        id: request.id,
        userId: request.userId,
        contentType: request.contentType,
        prompt: request.prompt,
        parameters: request.parameters ? (request.parameters as unknown as typeof contentRequests.$inferInsert.parameters) : null,
        options: request.options ? (request.options as unknown as typeof contentRequests.$inferInsert.options) : null,
        status: request.status,
        workflowId: request.workflowId,
        providerId: request.providerId,
        model: request.model,
        metadata: request.metadata ? (request.metadata as unknown as typeof contentRequests.$inferInsert.metadata) : null,
        createdAt: request.createdAt,
        startedAt: request.startedAt,
        completedAt: request.completedAt,
        updatedAt: request.updatedAt,
      };

      await this.db.insert(contentRequests).values(insertData as typeof contentRequests.$inferInsert);

      getAuditService().log({
        userId: request.userId,
        targetType: 'content_request',
        targetId: request.id,
        action: 'create',
        metadata: { contentType: request.contentType },
        serviceName: 'ai-content-service',
        correlationId: getCorrelationContext()?.correlationId,
      });

      logger.info('Saved request: {}', { data0: request.id });
      return request.id;
    } catch (error) {
      logger.error('Failed to save request:', { error: error instanceof Error ? error.message : String(error) });
      throw ContentError.internalError(
        `Failed to save content request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getRequest(id: string): Promise<GenerationRequest | null> {
    try {
      const result = await this.db
        .select()
        .from(contentRequests)
        .where(and(eq(contentRequests.id, id), isNull(contentRequests.deletedAt)))
        .limit(1);

      if (result.length === 0) return null;

      const data = result[0];
      return new GenerationRequest(
        data.id,
        data.userId,
        data.contentType as ContentType,
        data.prompt,
        data.parameters as Record<string, unknown>,
        data.options as Record<string, unknown>,
        data.status as RequestStatus,
        data.workflowId || undefined,
        data.providerId || undefined,
        data.model || undefined,
        data.metadata as Record<string, unknown>,
        data.createdAt,
        data.startedAt || undefined,
        data.completedAt || undefined,
        data.updatedAt
      );
    } catch (error) {
      logger.error('Failed to get request:', { error: error instanceof Error ? error.message : String(error) });
      throw ContentError.internalError(
        `Failed to get content request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async updateRequestStatus(id: string, status: string, metadata?: Record<string, unknown>): Promise<void> {
    try {
      const updateData: Record<string, unknown> = {
        status,
        updatedAt: new Date(),
      };

      if (metadata) {
        updateData.metadata = metadata;
      }

      if (status === 'processing') {
        updateData.startedAt = new Date();
      } else if (['completed', 'failed', 'cancelled'].includes(status)) {
        updateData.completedAt = new Date();
      }

      await this.db
        .update(contentRequests)
        .set(updateData)
        .where(and(eq(contentRequests.id, id), isNull(contentRequests.deletedAt)));

      logger.info('Updated request {} status to: {}', { data0: id, data1: status });
    } catch (error) {
      logger.error('Failed to update request status:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw ContentError.internalError(
        `Failed to update request status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ===== CONTENT RESULT OPERATIONS =====

  async saveContent(content: Content): Promise<string> {
    try {
      const insertData: InsertContentResult = {
        id: content.id,
        requestId: content.requestId,
        content: content.content,
        formattedContent: content.formattedContent,
        metadata: content.metadata ? (content.metadata as unknown as typeof contentResults.$inferInsert.metadata) : null,
        analysis: content.analysis ? (content.analysis as unknown as typeof contentResults.$inferInsert.analysis) : null,
        version: content.version,
        parentId: content.parentId,
        isApproved: content.isApproved,
        approvedBy: content.approvedBy,
        approvedAt: content.approvedAt,
        isPublished: content.isPublished,
        publishedAt: content.publishedAt,
        publishUrl: content.publishUrl,
        cost: content.cost.toString(),
        createdAt: content.createdAt,
        updatedAt: content.updatedAt,
      };

      await this.db.insert(contentResults).values(insertData as typeof contentResults.$inferInsert);

      getAuditService().log({
        targetType: 'content_result',
        targetId: content.id,
        action: 'create',
        metadata: { requestId: content.requestId },
        serviceName: 'ai-content-service',
        correlationId: getCorrelationContext()?.correlationId,
      });

      logger.info('Saved content: {}', { data0: content.id });
      return content.id;
    } catch (error) {
      logger.error('Failed to save content:', { error: error instanceof Error ? error.message : String(error) });
      throw ContentError.internalError(
        `Failed to save content: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getContent(id: string): Promise<Content | null> {
    try {
      const result = await this.db
        .select()
        .from(contentResults)
        .where(and(eq(contentResults.id, id), isNull(contentResults.deletedAt)))
        .limit(1);

      if (result.length === 0) return null;

      return this.mapToContentEntity(result[0]);
    } catch (error) {
      logger.error('Failed to get content:', { error: error instanceof Error ? error.message : String(error) });
      throw ContentError.internalError(
        `Failed to get content: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getContentByRequest(requestId: string): Promise<Content[]> {
    try {
      const results = await this.db
        .select()
        .from(contentResults)
        .where(and(eq(contentResults.requestId, requestId), isNull(contentResults.deletedAt)))
        .orderBy(desc(contentResults.createdAt));

      return results.map(this.mapToContentEntity);
    } catch (error) {
      logger.error('Failed to get content by request:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw ContentError.internalError(
        `Failed to get content by request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async updateContent(id: string, updates: Partial<Content>): Promise<void> {
    try {
      const updateData = this.buildContentUpdateData(updates);

      await this.db
        .update(contentResults)
        .set(updateData)
        .where(and(eq(contentResults.id, id), isNull(contentResults.deletedAt)));

      logger.info('Updated content: {}', { data0: id });
    } catch (error) {
      logger.error('Failed to update content:', { error: error instanceof Error ? error.message : String(error) });
      throw ContentError.internalError(
        `Failed to update content: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteContent(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(contentResults)
        .set({ deletedAt: new Date() })
        .where(eq(contentResults.id, id));

      logger.info('Deleted content: {}', { data0: id });
      return true;
    } catch (error) {
      logger.error('Failed to delete content:', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  // ===== QUERY OPERATIONS =====

  async findContentByUser(userId: string, limit: number = 20, offset: number = 0): Promise<Content[]> {
    try {
      const results = await this.db
        .select({
          aic_content_results: contentResults,
          aic_content_requests: contentRequests,
        })
        .from(contentResults)
        .innerJoin(contentRequests, eq(contentResults.requestId, contentRequests.id))
        .where(
          and(eq(contentRequests.userId, userId), isNull(contentResults.deletedAt), isNull(contentRequests.deletedAt))
        )
        .orderBy(desc(contentResults.createdAt))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);

      return results.map(result => this.mapToContentEntity(result.aic_content_results));
    } catch (error) {
      logger.error('Failed to find content by user:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw ContentError.internalError(
        `Failed to find content by user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async findContentByType(contentType: string, limit: number = 20, offset: number = 0): Promise<Content[]> {
    try {
      const results = await this.db
        .select({
          aic_content_results: contentResults,
          aic_content_requests: contentRequests,
        })
        .from(contentResults)
        .innerJoin(contentRequests, eq(contentResults.requestId, contentRequests.id))
        .where(
          and(
            eq(contentRequests.contentType, contentType),
            isNull(contentResults.deletedAt),
            isNull(contentRequests.deletedAt)
          )
        )
        .orderBy(desc(contentResults.createdAt))
        .limit(Math.min(limit || 20, 100))
        .offset(offset);

      return results.map(result => this.mapToContentEntity(result.aic_content_results));
    } catch (error) {
      logger.error('Failed to find content by type:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw ContentError.internalError(
        `Failed to find content by type: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async searchContent(query: string, filters?: ContentSearchFilters): Promise<Content[]> {
    try {
      const conditions = this.buildSearchConditions(query, filters);

      const baseSelect = this.db
        .select({
          aic_content_results: contentResults,
          aic_content_requests: contentRequests,
        })
        .from(contentResults)
        .innerJoin(contentRequests, eq(contentResults.requestId, contentRequests.id));

      const dbQuery = conditions.length > 0 ? baseSelect.where(and(...conditions)) : baseSelect;

      const results = await dbQuery.orderBy(desc(contentResults.createdAt)).limit(50);

      return results.map(result => this.mapToContentEntity(result.aic_content_results));
    } catch (error) {
      logger.error('Failed to search content:', { error: error instanceof Error ? error.message : String(error) });
      throw ContentError.internalError(
        `Failed to search content: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ===== ANALYTICS AND STATISTICS =====

  async getContentStats(timeframe: 'day' | 'week' | 'month' = 'day'): Promise<ContentStats> {
    try {
      const since = this.getTimeframeSince(timeframe);

      const allContent = await this.db
        .select()
        .from(contentResults)
        .where(and(gte(contentResults.createdAt, since), isNull(contentResults.deletedAt)));

      const contentWithRequests = await this.db
        .select({
          contentType: contentRequests.contentType,
          status: contentRequests.status,
        })
        .from(contentResults)
        .innerJoin(contentRequests, eq(contentResults.requestId, contentRequests.id))
        .where(
          and(gte(contentResults.createdAt, since), isNull(contentResults.deletedAt), isNull(contentRequests.deletedAt))
        );

      return {
        totalContent: allContent.length,
        publishedContent: allContent.filter(c => c.isPublished).length,
        approvedContent: allContent.filter(c => c.isApproved).length,
        averageQualityScore: this.computeAverageQualityScore(allContent),
        contentByType: this.groupByField(contentWithRequests, 'contentType'),
        contentByStatus: this.computeContentByStatus(allContent),
      };
    } catch (error) {
      logger.error('Failed to get content stats:', { error: error instanceof Error ? error.message : String(error) });
      throw ContentError.internalError(
        `Failed to get content stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getRequestStats(timeframe: 'day' | 'week' | 'month' = 'day'): Promise<RequestStats> {
    try {
      const since = this.getTimeframeSince(timeframe);
      const requests = await this.db
        .select()
        .from(contentRequests)
        .where(and(gte(contentRequests.createdAt, since), isNull(contentRequests.deletedAt)));

      return {
        totalRequests: requests.length,
        completedRequests: requests.filter(r => r.status === 'completed').length,
        failedRequests: requests.filter(r => r.status === 'failed').length,
        averageProcessingTime: this.computeAverageProcessingTime(requests),
        requestsByType: this.groupByField(requests, 'contentType'),
        requestsByStatus: this.groupByField(requests, 'status'),
      };
    } catch (error) {
      logger.error('Failed to get request stats:', { error: error instanceof Error ? error.message : String(error) });
      throw ContentError.internalError(
        `Failed to get request stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ===== PRIVATE HELPERS =====

  private getTimeframeSince(timeframe: 'day' | 'week' | 'month'): Date {
    const timeframeHours = { day: 24, week: 168, month: 720 }[timeframe];
    return new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
  }

  private computeAverageQualityScore(content: SelectContentResult[]): number {
    const qualityScores = content.map(c => (c.metadata as Record<string, unknown>)?.qualityScore).filter((score): score is number => typeof score === 'number');
    if (qualityScores.length === 0) return 0;
    return qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
  }

  private computeContentByStatus(content: SelectContentResult[]): Record<string, number> {
    return content.reduce(
      (acc, item) => {
        const status = item.isPublished
          ? AI_CONTENT_LIFECYCLE.PUBLISHED
          : item.isApproved
            ? AI_CONTENT_LIFECYCLE.REVIEWED
            : AI_CONTENT_LIFECYCLE.DRAFT;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  private computeAverageProcessingTime(requests: Array<{ status: string; startedAt?: Date | null; completedAt?: Date | null }>): number {
    const completedWithTiming = requests.filter(r => r.status === 'completed' && r.startedAt && r.completedAt);
    if (completedWithTiming.length === 0) return 0;
    const totalTime = completedWithTiming.reduce((sum, r) => {
      const duration = r.completedAt!.getTime() - r.startedAt!.getTime();
      return sum + duration;
    }, 0);
    return totalTime / completedWithTiming.length;
  }

  private groupByField<T extends Record<string, unknown>>(items: T[], field: keyof T): Record<string, number> {
    return items.reduce(
      (acc, item) => {
        const key = String(item[field]);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  private buildContentUpdateData(updates: Partial<Content>): Record<string, unknown> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.content) updateData.content = updates.content;
    if (updates.formattedContent) updateData.formattedContent = updates.formattedContent;
    if (updates.metadata) updateData.metadata = updates.metadata;
    if (updates.analysis) updateData.analysis = updates.analysis;
    if (updates.version) updateData.version = updates.version;
    if (updates.isApproved !== undefined) updateData.isApproved = updates.isApproved;
    if (updates.approvedBy) updateData.approvedBy = updates.approvedBy;
    if (updates.approvedAt) updateData.approvedAt = updates.approvedAt;
    if (updates.isPublished !== undefined) updateData.isPublished = updates.isPublished;
    if (updates.publishedAt) updateData.publishedAt = updates.publishedAt;
    if (updates.publishUrl) updateData.publishUrl = updates.publishUrl;
    if (updates.cost !== undefined) updateData.cost = updates.cost.toString();

    return updateData;
  }

  private buildSearchConditions(query: string, filters?: ContentSearchFilters): ReturnType<typeof eq>[] {
    const conditions: ReturnType<typeof eq>[] = [];

    conditions.push(isNull(contentResults.deletedAt));
    conditions.push(isNull(contentRequests.deletedAt));

    if (query.trim()) {
      conditions.push(like(contentResults.content, `%${query}%`));
    }

    if (filters) {
      if (filters.userId) {
        conditions.push(eq(contentRequests.userId, filters.userId));
      }
      if (filters.contentType) {
        conditions.push(eq(contentRequests.contentType, filters.contentType));
      }
      if (filters.isApproved !== undefined) {
        conditions.push(eq(contentResults.isApproved, filters.isApproved));
      }
      if (filters.isPublished !== undefined) {
        conditions.push(eq(contentResults.isPublished, filters.isPublished));
      }
      if (filters.startDate) {
        conditions.push(gte(contentResults.createdAt, filters.startDate));
      }
      if (filters.endDate) {
        conditions.push(lte(contentResults.createdAt, filters.endDate));
      }
    }

    return conditions;
  }

  private mapToContentEntity(data: SelectContentResult): Content {
    return new Content(
      data.id,
      data.requestId,
      data.content,
      'article', // This should come from the request join, simplified for now
      data.metadata as unknown as ContentMetadata,
      data.analysis as unknown as ContentAnalysis,
      data.formattedContent || undefined,
      Number(data.version) || 1,
      data.parentId || undefined,
      AI_CONTENT_LIFECYCLE.GENERATED, // This should be derived from status fields
      data.isApproved !== undefined ? Boolean(data.isApproved) : undefined,
      data.approvedBy || undefined,
      data.approvedAt ? new Date(data.approvedAt as string | number | Date) : undefined,
      data.isPublished !== undefined ? Boolean(data.isPublished) : undefined,
      data.publishedAt ? new Date(data.publishedAt as string | number | Date) : undefined,
      data.publishUrl || undefined,
      parseFloat(String(data.cost) || '0'),
      data.createdAt ? new Date(data.createdAt as string | number | Date) : new Date(),
      data.updatedAt ? new Date(data.updatedAt as string | number | Date) : new Date()
    );
  }

  async createFeedback(input: CreateFeedbackInput): Promise<{ id: string }> {
    try {
      const [result] = await this.db
        .insert(contentFeedback)
        .values({
          resultId: input.resultId,
          userId: input.userId,
          overallRating: input.overallRating,
          qualityRating: input.qualityRating ?? null,
          relevanceRating: input.relevanceRating ?? null,
          creativityRating: input.creativityRating ?? null,
          usefulnessRating: input.usefulnessRating ?? null,
          feedback: input.feedback ?? null,
          improvements: input.improvements || [],
          metadata: input.metadata || null,
        })
        .returning({ id: contentFeedback.id });

      logger.info('Content feedback created', { feedbackId: result.id, resultId: input.resultId });
      return { id: result.id };
    } catch (error) {
      logger.error('Failed to create content feedback', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    // Neon HTTP connections are stateless - no explicit close needed
    // Connection lifecycle managed by DatabaseConnectionFactory
    logger.debug('Repository closed (Neon HTTP - stateless)');
  }
}
