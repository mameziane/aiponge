/**
 * DrizzleAudioProcessingJobRepository - PostgreSQL implementation for audio processing jobs
 */

import { eq, desc, and, gte, lte, sql, asc, isNull } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { AudioProcessingJob, PaginationOptions } from '../../domains/ai-music/repositories/IMusicRepository';
import { audioProcessingJobs } from '../../schema/music-schema';
import type { DatabaseConnection } from './DatabaseConnectionFactory';

type DbRow = Record<string, unknown>;

/**
 * Repository for managing audio processing jobs.
 */
export class DrizzleAudioProcessingJobRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async save(job: AudioProcessingJob): Promise<AudioProcessingJob> {
    await this.db.insert(audioProcessingJobs).values({
      id: job.id,
      musicResultId: job.musicResultId || null,
      jobType: job.jobType,
      processingType: job.processingType,
      status: job.status,
      priority: job.priority,
      inputUrl: job.inputUrl,
      outputUrl: job.outputUrl || null,
      inputFormat: job.inputFormat || null,
      outputFormat: job.outputFormat || null,
      parameters: job.parameters as Record<string, unknown>,
      progressPercentage: job.progressPercentage,
      processingTimeMs: job.processingTimeMs || null,
      fileSize: job.fileSize || null,
      qualityScore: job.qualityScore ? job.qualityScore.toString() : null,
      errorMessage: job.errorMessage || null,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      metadata: job.metadata as Record<string, unknown>,
      createdAt: job.createdAt,
      startedAt: job.startedAt || null,
      completedAt: job.completedAt || null,
    });

    return job;
  }

  async findById(id: string): Promise<AudioProcessingJob | null> {
    const query = this.db.select().from(audioProcessingJobs) as unknown as {
      where: (c: unknown) => { limit: (n: number) => Promise<DbRow[]> };
    };
    const result = await query
      .where(and(eq(audioProcessingJobs.id, id), isNull(audioProcessingJobs.deletedAt)))
      .limit(1);

    return result[0] ? this.mapToEntity(result[0]) : null;
  }

  async findByMusicResultId(musicResultId: string): Promise<AudioProcessingJob[]> {
    const query = this.db.select().from(audioProcessingJobs) as unknown as {
      where: (c: unknown) => { orderBy: (o: unknown) => Promise<DbRow[]> };
    };
    const results = await query
      .where(and(eq(audioProcessingJobs.musicResultId, musicResultId), isNull(audioProcessingJobs.deletedAt)))
      .orderBy(desc(audioProcessingJobs.createdAt));

    return results.map(row => this.mapToEntity(row));
  }

  async findByStatus(status: string, options?: PaginationOptions): Promise<AudioProcessingJob[]> {
    const results = await this.executeQuery(
      and(eq(audioProcessingJobs.status, status), isNull(audioProcessingJobs.deletedAt)),
      options
    );
    return results.map(row => this.mapToEntity(row));
  }

  async findAll(options?: PaginationOptions): Promise<AudioProcessingJob[]> {
    const results = await this.executeQuery(isNull(audioProcessingJobs.deletedAt), options);
    return results.map(row => this.mapToEntity(row));
  }

  async update(job: AudioProcessingJob): Promise<AudioProcessingJob> {
    await this.db
      .update(audioProcessingJobs)
      .set({
        status: job.status,
        outputUrl: job.outputUrl || null,
        progressPercentage: job.progressPercentage,
        processingTimeMs: job.processingTimeMs || null,
        fileSize: job.fileSize || null,
        qualityScore: job.qualityScore ? job.qualityScore.toString() : null,
        errorMessage: job.errorMessage || null,
        retryCount: job.retryCount,
        metadata: job.metadata as Record<string, unknown>,
        startedAt: job.startedAt || null,
        completedAt: job.completedAt || null,
      })
      .where(and(eq(audioProcessingJobs.id, job.id), isNull(audioProcessingJobs.deletedAt)));

    return job;
  }

  async delete(id: string): Promise<void> {
    await this.db.update(audioProcessingJobs).set({ deletedAt: new Date() }).where(eq(audioProcessingJobs.id, id));
  }

  async findPendingJobs(limit?: number): Promise<AudioProcessingJob[]> {
    const results = await this.executeQuery(
      and(eq(audioProcessingJobs.status, 'pending'), isNull(audioProcessingJobs.deletedAt)),
      { limit, sortBy: 'createdAt', sortOrder: 'ASC' }
    );
    return results.map(row => this.mapToEntity(row));
  }

  async findFailedJobs(maxRetries?: number, options?: PaginationOptions): Promise<AudioProcessingJob[]> {
    const conditions = [eq(audioProcessingJobs.status, 'failed'), isNull(audioProcessingJobs.deletedAt)];

    if (maxRetries !== undefined) {
      conditions.push(gte(audioProcessingJobs.retryCount, maxRetries));
    }

    const results = await this.executeQuery(and(...conditions), options);
    return results.map(row => this.mapToEntity(row));
  }

  async findJobsByDateRange(
    startDate: Date,
    endDate: Date,
    options?: PaginationOptions
  ): Promise<AudioProcessingJob[]> {
    const results = await this.executeQuery(
      and(
        gte(audioProcessingJobs.createdAt, startDate),
        lte(audioProcessingJobs.createdAt, endDate),
        isNull(audioProcessingJobs.deletedAt)
      ),
      options
    );
    return results.map(row => this.mapToEntity(row));
  }

  async countByStatus(status: string): Promise<number> {
    const result = await this.db
      .select({ count: sql`count(*)::integer` })
      .from(audioProcessingJobs)
      .where(and(eq(audioProcessingJobs.status, status), isNull(audioProcessingJobs.deletedAt)));

    return (result[0]?.count as number) || 0;
  }

  async getAverageProcessingTime(jobType?: string): Promise<number> {
    const conditions = [
      eq(audioProcessingJobs.status, 'completed'),
      sql`${audioProcessingJobs.processingTimeMs} IS NOT NULL`,
      isNull(audioProcessingJobs.deletedAt),
    ];

    if (jobType) {
      conditions.push(eq(audioProcessingJobs.jobType, jobType));
    }

    const result = await this.db
      .select({
        avgTime: sql`AVG(${audioProcessingJobs.processingTimeMs})::integer`,
      })
      .from(audioProcessingJobs)
      .where(and(...conditions));

    return (result[0]?.avgTime as number) || 0;
  }

  private async executeQuery(
    whereCondition: ReturnType<typeof eq> | ReturnType<typeof and> | undefined,
    options?: PaginationOptions
  ): Promise<DbRow[]> {
    const sortColumn = this.getSortColumn(options?.sortBy);
    const orderFn = options?.sortOrder === 'ASC' ? asc : desc;

    const baseQuery = this.db.select().from(audioProcessingJobs).$dynamic();
    const filteredQuery = whereCondition ? baseQuery.where(whereCondition) : baseQuery;
    const orderedQuery = filteredQuery.orderBy(orderFn(sortColumn));
    const limitedQuery = options?.limit ? orderedQuery.limit(Math.min(options.limit || 20, 100)) : orderedQuery;
    const paginatedQuery = options?.offset ? limitedQuery.offset(options.offset) : limitedQuery;

    return await paginatedQuery;
  }

  private getSortColumn(sortBy?: string): PgColumn {
    switch (sortBy) {
      case 'startedAt':
        return audioProcessingJobs.startedAt;
      case 'completedAt':
        return audioProcessingJobs.completedAt;
      case 'priority':
        return audioProcessingJobs.priority;
      case 'retryCount':
        return audioProcessingJobs.retryCount;
      case 'createdAt':
      default:
        return audioProcessingJobs.createdAt;
    }
  }

  private mapToEntity(row: DbRow): AudioProcessingJob {
    return {
      id: row.id as string,
      musicResultId: (row.musicResultId as string) || '',
      jobType: row.jobType as string,
      processingType: row.processingType as string,
      status: row.status as 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled',
      priority: row.priority as 'low' | 'normal' | 'high' | 'urgent',
      inputUrl: row.inputUrl as string,
      outputUrl: row.outputUrl as string | undefined,
      inputFormat: row.inputFormat as string | undefined,
      outputFormat: row.outputFormat as string | undefined,
      parameters: (row.parameters as Record<string, unknown>) || {},
      progressPercentage: (row.progressPercentage as number) || 0,
      processingTimeMs: row.processingTimeMs as number | undefined,
      fileSize: row.fileSize as number | undefined,
      qualityScore: row.qualityScore ? parseFloat(row.qualityScore as string) : undefined,
      errorMessage: row.errorMessage as string | undefined,
      retryCount: (row.retryCount as number) || 0,
      maxRetries: (row.maxRetries as number) || 3,
      metadata: (row.metadata as Record<string, unknown>) || {},
      createdAt: row.createdAt as Date,
      startedAt: row.startedAt as Date | undefined,
      completedAt: row.completedAt as Date | undefined,
    };
  }
}
