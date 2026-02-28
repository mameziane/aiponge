import { eq, desc, sql } from 'drizzle-orm';
import { fileProcessingJobs } from '../../schema/storage-schema';
import type { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { createLogger } from '@aiponge/platform-core';
import { PROCESSING_JOB_STATUS } from '@aiponge/shared-contracts';

const logger = createLogger('processing-job-repository');

export interface CreateJobParams {
  fileId: string;
  jobType: string;
  inputParams?: Record<string, unknown>;
}

export class ProcessingJobRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createJob(fileId: string, jobType: string, config?: Record<string, unknown>) {
    const [created] = await this.db
      .insert(fileProcessingJobs)
      .values({
        fileId,
        jobType,
        status: PROCESSING_JOB_STATUS.PENDING,
        inputParams: config || {},
      })
      .returning();

    logger.info('Processing job created', { jobId: created.id, fileId, jobType });
    return created;
  }

  async updateJobStatus(
    jobId: string,
    status: string,
    result?: { outputParams?: Record<string, unknown>; errorMessage?: string }
  ) {
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (status === PROCESSING_JOB_STATUS.PROCESSING) {
      updateData.startedAt = new Date();
    }

    if (status === PROCESSING_JOB_STATUS.COMPLETED || status === PROCESSING_JOB_STATUS.FAILED) {
      updateData.completedAt = new Date();
    }

    if (result?.outputParams) {
      updateData.outputParams = result.outputParams;
    }

    if (result?.errorMessage) {
      updateData.errorMessage = result.errorMessage;
    }

    const [updated] = await this.db
      .update(fileProcessingJobs)
      .set(updateData)
      .where(eq(fileProcessingJobs.id, jobId))
      .returning();

    logger.debug('Processing job status updated', { jobId, status });
    return updated;
  }

  async getJobsByFile(fileId: string) {
    return this.db
      .select()
      .from(fileProcessingJobs)
      .where(eq(fileProcessingJobs.fileId, fileId))
      .orderBy(desc(fileProcessingJobs.createdAt));
  }

  async getJobById(jobId: string) {
    const results = await this.db.select().from(fileProcessingJobs).where(eq(fileProcessingJobs.id, jobId)).limit(1);

    return results[0] || null;
  }

  async getJobsByUser(userId: string) {
    return this.db
      .select()
      .from(fileProcessingJobs)
      .where(sql`${fileProcessingJobs.inputParams}->>'userId' = ${userId}`)
      .orderBy(desc(fileProcessingJobs.createdAt));
  }

  async getAllJobs() {
    return this.db.select().from(fileProcessingJobs).orderBy(desc(fileProcessingJobs.createdAt)).limit(1000);
  }
}
