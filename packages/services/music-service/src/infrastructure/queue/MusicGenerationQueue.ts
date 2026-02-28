import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { getLogger } from '../../config/service-urls';
import { PipelineError } from '../../application/errors';
import { INFRASTRUCTURE } from '@aiponge/shared-contracts';

const logger = getLogger('music-service-queue');

export interface MusicGenerationJobData {
  id: string;
  userId: string;
  entryId: string;
  priority: 'low' | 'normal' | 'high';
  requestedAt: Date;
  metadata?: {
    framework?: string;
    genre?: string;
    mood?: string;
  };
}

export interface MusicGenerationJobResult {
  trackId: string;
  albumId: string;
  audioUrl: string;
  duration: number;
  generatedAt: Date;
}

export interface QueueConfig {
  concurrency: number;
  maxRetries: number;
  retryDelayMs: number;
  jobTimeoutMs: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  concurrency: 2,
  maxRetries: INFRASTRUCTURE.MAX_RETRIES,
  retryDelayMs: 5000,
  jobTimeoutMs: 300000,
};

export class MusicGenerationQueue extends EventEmitter {
  private queue: Queue<MusicGenerationJobData, MusicGenerationJobResult>;
  private worker: Worker<MusicGenerationJobData, MusicGenerationJobResult> | null = null;
  private queueEvents: QueueEvents;
  private workerConnection: Redis;
  private eventsConnection: Redis;
  private readonly QUEUE_NAME = 'music-generation';

  constructor(
    private readonly redis: Redis,
    private readonly config: QueueConfig = DEFAULT_CONFIG
  ) {
    super();

    this.workerConnection = redis.duplicate();
    this.eventsConnection = redis.duplicate();

    this.queue = new Queue(this.QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: config.maxRetries,
        backoff: {
          type: 'exponential',
          delay: config.retryDelayMs,
        },
        removeOnComplete: {
          age: 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    });

    this.queueEvents = new QueueEvents(this.QUEUE_NAME, {
      connection: this.eventsConnection,
    });

    this.setupEventListeners();
    logger.info('MusicGenerationQueue initialized with BullMQ + Redis');
  }

  private setupEventListeners(): void {
    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info('Job completed', { jobId });
      this.emit('completed', { jobId, result: returnvalue });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error('Job failed', { jobId, reason: failedReason });
      this.emit('failed', { jobId, error: failedReason });
    });

    this.queueEvents.on('progress', ({ jobId, data }) => {
      this.emit('progress', { jobId, progress: data });
    });
  }

  async addJob(data: MusicGenerationJobData): Promise<{
    jobId: string;
    position: number;
    estimatedWaitTime: number;
  }> {
    const priority = this.getPriorityScore(data.priority);

    const job = await this.queue.add('generate', data, {
      priority,
      jobId: data.id,
    });

    const position = await this.getQueuePosition(job.id!);
    const estimatedWaitTime = await this.estimateWaitTime(position);

    logger.info('Job added to queue', {
      jobId: job.id,
      position,
      estimatedWaitTime,
      priority: data.priority,
    });

    return {
      jobId: job.id!,
      position,
      estimatedWaitTime,
    };
  }

  async getJobStatus(jobId: string): Promise<{
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
    position?: number;
    progress?: number;
    result?: MusicGenerationJobResult;
    error?: string;
    attempts?: number;
  }> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return { status: 'unknown' };
    }

    const state = await job.getState();

    return {
      status: state as 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown',
      position: state === 'waiting' ? await this.getQueuePosition(jobId) : undefined,
      progress: typeof job.progress === 'number' ? job.progress : undefined,
      result: job.returnvalue,
      error: job.failedReason,
      attempts: job.attemptsMade,
    };
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return false;
    }

    const state = await job.getState();

    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      logger.info('Job cancelled', { jobId });
      return true;
    }

    return false;
  }

  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  startWorker(processor: (job: Job<MusicGenerationJobData>) => Promise<MusicGenerationJobResult>): void {
    if (this.worker) {
      throw PipelineError.generationFailed('Worker already started');
    }

    this.worker = new Worker<MusicGenerationJobData, MusicGenerationJobResult>(this.QUEUE_NAME, processor, {
      connection: this.workerConnection,
      concurrency: this.config.concurrency,
    });

    this.worker.on('completed', (job, result) => {
      logger.info('Worker completed job', { jobId: job.id, trackId: result.trackId });
    });

    this.worker.on('failed', (job, error) => {
      logger.error('Worker job failed', { jobId: job?.id, error: error.message });
    });

    this.worker.on('error', error => {
      logger.error('Worker error', { error: error.message });
    });

    logger.info('Music generation worker started', { concurrency: this.config.concurrency });
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down music generation queue...');
    if (this.worker) {
      await this.worker.close();
    }
    await this.queueEvents.close();
    await this.queue.close();
    await this.workerConnection.quit();
    await this.eventsConnection.quit();
    logger.info('Music generation queue shutdown complete');
  }

  private getPriorityScore(priority: 'low' | 'normal' | 'high'): number {
    switch (priority) {
      case 'high':
        return 1;
      case 'normal':
        return 5;
      case 'low':
        return 10;
    }
  }

  private async getQueuePosition(jobId: string): Promise<number> {
    const waiting = await this.queue.getWaiting();
    const index = waiting.findIndex(j => j.id === jobId);
    return index === -1 ? 0 : index + 1;
  }

  private async estimateWaitTime(position: number): Promise<number> {
    const avgJobTimeMs = 180000;
    return Math.ceil((position * avgJobTimeMs) / this.config.concurrency);
  }
}
