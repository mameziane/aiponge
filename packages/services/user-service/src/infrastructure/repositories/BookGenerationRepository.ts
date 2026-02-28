/**
 * Book Generation Repository
 * Repository for AI-generated book blueprint requests
 * Handles async AI generation jobs for all book types (personal, shared, and managed content)
 * The "blueprint" is the AI-generated structure before it becomes real Book/Chapter/Entry entities
 */

import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { libBookGenerationRequests, type BookGenerationRequest } from '../database/schemas/profile-schema';
import { eq, and, desc, isNull, inArray, lt } from 'drizzle-orm';
import { getLogger } from '../../config/service-urls';
import { GENERATION_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('book-generation-repository');

export type { BookGenerationRequest };

export interface CreateBookGenerationRequestData {
  userId: string;
  primaryGoal: string;
  language?: string;
  tone?: string;
  generationMode?: 'blueprint' | 'book';
  depthLevel?: 'brief' | 'standard' | 'deep';
  bookTypeId?: string;
}

export interface Source {
  author: string;
  work?: string;
  era?: string;
  tradition?: string;
}

export interface GeneratedBookData {
  title: string;
  subtitle?: string;
  description: string;
  language?: string;
  typeId?: string;
  category?: string;
  era?: string;
  tradition?: string;
  chapters: Array<{
    title: string;
    description: string;
    order: number;
    entries: Array<{
      prompt: string;
      type: string;
      content?: string;
      sources?: Source[];
    }>;
  }>;
}

export class BookGenerationRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createRequest(data: CreateBookGenerationRequestData): Promise<BookGenerationRequest> {
    const result = await this.db
      .insert(libBookGenerationRequests)
      .values({
        userId: data.userId,
        primaryGoal: data.primaryGoal,
        language: data.language || 'en-US',
        tone: data.tone,
        generationMode: data.generationMode || 'blueprint',
        depthLevel: data.depthLevel,
        bookTypeId: data.bookTypeId,
        status: GENERATION_STATUS.PENDING,
      })
      .returning();

    logger.info('Book generation request created', {
      requestId: result[0].id,
      userId: data.userId,
      generationMode: data.generationMode || 'blueprint',
      depthLevel: data.depthLevel,
    });
    return result[0];
  }

  async getRequestById(requestId: string): Promise<BookGenerationRequest | null> {
    const results = await this.db
      .select()
      .from(libBookGenerationRequests)
      .where(and(eq(libBookGenerationRequests.id, requestId), isNull(libBookGenerationRequests.deletedAt)))
      .limit(1);

    return results[0] || null;
  }

  async getRequestByIdAndUser(requestId: string, userId: string): Promise<BookGenerationRequest | null> {
    const results = await this.db
      .select()
      .from(libBookGenerationRequests)
      .where(
        and(
          eq(libBookGenerationRequests.id, requestId),
          eq(libBookGenerationRequests.userId, userId),
          isNull(libBookGenerationRequests.deletedAt)
        )
      )
      .limit(1);

    return results[0] || null;
  }

  async getUserRequests(userId: string, limit = 10): Promise<BookGenerationRequest[]> {
    return this.db
      .select()
      .from(libBookGenerationRequests)
      .where(and(eq(libBookGenerationRequests.userId, userId), isNull(libBookGenerationRequests.deletedAt)))
      .orderBy(desc(libBookGenerationRequests.createdAt))
      .limit(Math.min(limit || 20, 100));
  }

  async updateStatus(
    requestId: string,
    status: 'pending' | 'processing' | 'completed' | 'partial_success' | 'failed',
    updates?: {
      generatedBook?: GeneratedBookData;
      errorMessage?: string;
      providerMetadata?: Record<string, unknown>;
      usedSystemPrompt?: string;
      usedUserPrompt?: string;
    }
  ): Promise<BookGenerationRequest | null> {
    const updateData: Record<string, unknown> = { status };

    if (updates?.generatedBook) {
      updateData.generatedBlueprint = updates.generatedBook;
    }
    if (updates?.errorMessage) {
      updateData.errorMessage = updates.errorMessage;
    }
    if (updates?.providerMetadata) {
      updateData.providerMetadata = updates.providerMetadata;
    }
    if (updates?.usedSystemPrompt) {
      updateData.usedSystemPrompt = updates.usedSystemPrompt;
    }
    if (updates?.usedUserPrompt) {
      updateData.usedUserPrompt = updates.usedUserPrompt;
    }
    if (status === GENERATION_STATUS.COMPLETED || status === GENERATION_STATUS.FAILED) {
      updateData.completedAt = new Date();
    }

    const result = await this.db
      .update(libBookGenerationRequests)
      .set(updateData)
      .where(and(eq(libBookGenerationRequests.id, requestId), isNull(libBookGenerationRequests.deletedAt)))
      .returning();

    if (result[0]) {
      logger.info('Book generation request updated', { requestId, status });
    }

    return result[0] || null;
  }

  async updateProgress(
    requestId: string,
    progress: Record<string, unknown>
  ): Promise<void> {
    await this.db
      .update(libBookGenerationRequests)
      .set({ progress })
      .where(and(eq(libBookGenerationRequests.id, requestId), isNull(libBookGenerationRequests.deletedAt)));
  }

  async failStaleRequests(staleThresholdMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - staleThresholdMs);
    const staleStatuses = [GENERATION_STATUS.PENDING, GENERATION_STATUS.PROCESSING];

    const result = await this.db
      .update(libBookGenerationRequests)
      .set({
        status: GENERATION_STATUS.FAILED,
        errorMessage: 'Generation timed out — the request was stuck and automatically cleaned up. Please try again.',
        completedAt: new Date(),
      })
      .where(
        and(
          inArray(libBookGenerationRequests.status, staleStatuses),
          lt(libBookGenerationRequests.createdAt, cutoff),
          isNull(libBookGenerationRequests.deletedAt)
        )
      )
      .returning();

    if (result.length > 0) {
      logger.warn('Failed stale generation requests', {
        count: result.length,
        requestIds: result.map(r => r.id),
        staleThresholdMs,
      });
    }

    return result.length;
  }

  async getActiveRequestForUser(userId: string): Promise<BookGenerationRequest | null> {
    const activeStatuses = [GENERATION_STATUS.PENDING, GENERATION_STATUS.PROCESSING];

    const results = await this.db
      .select()
      .from(libBookGenerationRequests)
      .where(
        and(
          eq(libBookGenerationRequests.userId, userId),
          inArray(libBookGenerationRequests.status, activeStatuses),
          isNull(libBookGenerationRequests.deletedAt)
        )
      )
      .orderBy(desc(libBookGenerationRequests.createdAt))
      .limit(1);

    return results[0] || null;
  }

  async markInterruptedRequestsAsFailed(): Promise<number> {
    const activeStatuses = [GENERATION_STATUS.PENDING, GENERATION_STATUS.PROCESSING];

    const result = await this.db
      .update(libBookGenerationRequests)
      .set({
        status: GENERATION_STATUS.FAILED,
        errorMessage: 'Generation interrupted by server restart. Please try again.',
        completedAt: new Date(),
      })
      .where(
        and(
          inArray(libBookGenerationRequests.status, activeStatuses),
          isNull(libBookGenerationRequests.deletedAt)
        )
      )
      .returning();

    if (result.length > 0) {
      logger.warn('Marked interrupted generation requests as failed on startup', {
        count: result.length,
        requestIds: result.map(r => r.id),
      });
    }

    return result.length;
  }

  async deleteRequest(requestId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(libBookGenerationRequests)
      .where(and(eq(libBookGenerationRequests.id, requestId), eq(libBookGenerationRequests.userId, userId)))
      .returning();

    return result.length > 0;
  }
}
