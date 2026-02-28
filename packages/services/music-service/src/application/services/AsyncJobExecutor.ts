/**
 * Async Job Executor for Music Generation
 *
 * Enables non-blocking HTTP responses by running generation in the background.
 * Jobs are tracked in-memory with the ability to update multiple repositories during progress.
 */

import { getLogger } from '../../config/service-urls';

const logger = getLogger('music-service-async-job-executor');

export interface JobDefinition<TInput, TResult> {
  id: string;
  input: TInput;
  execute: (input: TInput, onProgress: (update: JobProgressUpdate) => Promise<void>) => Promise<TResult>;
  onComplete?: (result: TResult) => Promise<void>;
  onError?: (error: Error) => Promise<void>;
}

export interface JobProgressUpdate {
  phase: string;
  percentComplete: number;
  songTitle?: string | null;
  lyrics?: string | null;
  trackId?: string | null;
  artworkUrl?: string | null;
  error?: string | null;
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: JobProgressUpdate | null;
  result?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

class AsyncJobExecutor {
  private jobs: Map<string, JobStatus> = new Map();
  private readonly MAX_JOBS = 1000; // Prevent memory leaks

  /**
   * Enqueue a job for background execution.
   * Returns immediately after storing the job, allowing the HTTP response to be sent.
   */
  enqueue<TInput, TResult>(job: JobDefinition<TInput, TResult>): void {
    // Cleanup old jobs if at capacity
    if (this.jobs.size >= this.MAX_JOBS) {
      this.cleanupOldJobs();
    }

    // Store initial job status
    this.jobs.set(job.id, {
      id: job.id,
      status: 'pending',
      progress: null,
    });

    logger.info('Job enqueued for background execution', { jobId: job.id });

    // Execute in the next tick to allow HTTP response to be sent first
    setImmediate(async () => {
      await this.executeJob(job);
    });
  }

  /**
   * Execute the job and track its progress
   */
  private async executeJob<TInput, TResult>(job: JobDefinition<TInput, TResult>): Promise<void> {
    const jobStatus = this.jobs.get(job.id);
    if (!jobStatus) {
      logger.error('Job not found for execution', { jobId: job.id });
      return;
    }

    jobStatus.status = 'running';
    jobStatus.startedAt = new Date();

    logger.info('Job execution started', { jobId: job.id });

    try {
      const result = await job.execute(job.input, async (update: JobProgressUpdate) => {
        // Update job progress
        const currentStatus = this.jobs.get(job.id);
        if (currentStatus) {
          currentStatus.progress = update;
        }
        logger.debug('Job progress updated', {
          jobId: job.id,
          phase: update.phase,
          percent: update.percentComplete,
          hasLyrics: !!update.lyrics,
        });
      });

      // Mark as completed
      jobStatus.status = 'completed';
      jobStatus.result = result;
      jobStatus.completedAt = new Date();

      logger.info('Job completed successfully', { jobId: job.id });

      // Call completion handler
      if (job.onComplete) {
        try {
          await job.onComplete(result);
        } catch (error) {
          logger.error('Job onComplete handler failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      // Mark as failed
      jobStatus.status = 'failed';
      jobStatus.error = error instanceof Error ? error.message : String(error);
      jobStatus.completedAt = new Date();

      logger.error('Job execution failed', {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Call error handler
      if (job.onError) {
        try {
          await job.onError(error instanceof Error ? error : new Error(String(error)));
        } catch (handlerError) {
          logger.error('Job onError handler failed', {
            jobId: job.id,
            error: handlerError instanceof Error ? handlerError.message : String(handlerError),
          });
        }
      }
    }
  }

  /**
   * Get the current status of a job
   */
  getJobStatus(jobId: string): JobStatus | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Cleanup old completed/failed jobs (older than 30 minutes)
   */
  private cleanupOldJobs(): void {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    let cleaned = 0;

    for (const [id, job] of this.jobs) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        job.completedAt < thirtyMinutesAgo
      ) {
        this.jobs.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up old jobs', { count: cleaned, remaining: this.jobs.size });
    }
  }

  /**
   * Get all active jobs (for monitoring)
   */
  getActiveJobs(): JobStatus[] {
    return Array.from(this.jobs.values()).filter(job => job.status === 'pending' || job.status === 'running');
  }
}

// Singleton instance
export const asyncJobExecutor = new AsyncJobExecutor();
