import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
import { createLogger } from '@aiponge/platform-core';

const logger = createLogger('queue-manager');

export interface JobProcessor<T = unknown> {
  (job: Job<T>): Promise<void>;
}

interface QueueEntry {
  queue: Queue;
  worker: Worker | null;
}

class QueueManagerClass {
  private queues = new Map<string, QueueEntry>();
  private connection: ConnectionOptions | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized) return;

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      const isProduction = process.env.NODE_ENV === 'production';
      logger[isProduction ? 'warn' : 'debug']('REDIS_URL not set, QueueManager disabled');
      return;
    }

    try {
      const url = new URL(redisUrl);
      this.connection = {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: url.password || undefined,
        username: url.username || undefined,
        tls: url.protocol === 'rediss:' ? {} : undefined,
      };
      this.initialized = true;
      logger.info('QueueManager initialized', { host: url.hostname, port: url.port });
    } catch (error) {
      logger.error('Failed to parse REDIS_URL', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  registerQueue<T = unknown>(name: string, processor: JobProcessor<T>): void {
    if (!this.initialized || !this.connection) {
      logger.debug(`Cannot register queue "${name}": QueueManager not initialized`);
      return;
    }

    if (this.queues.has(name)) {
      logger.warn(`Queue "${name}" already registered`);
      return;
    }

    const queue = new Queue(name, { connection: this.connection });

    const worker = new Worker<T>(
      name,
      async (job: Job<T>) => {
        logger.info(`Processing job ${job.id} on queue "${name}"`, {
          jobName: job.name,
          attempt: job.attemptsMade,
        });
        await processor(job);
      },
      {
        connection: this.connection,
        concurrency: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );

    worker.on('completed', (job: Job<T>) => {
      logger.info(`Job ${job.id} completed on queue "${name}"`, {
        jobName: job.name,
        duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
      });
    });

    worker.on('failed', (job: Job<T> | undefined, err: Error) => {
      logger.error(`Job ${job?.id ?? 'unknown'} failed on queue "${name}"`, {
        jobName: job?.name,
        error: err.message,
        attempt: job?.attemptsMade,
      });
    });

    this.queues.set(name, { queue, worker });
    logger.info(`Queue "${name}" registered with worker`);
  }

  async enqueue<T = unknown>(
    queueName: string,
    jobName: string,
    data: T,
    options?: { jobId?: string; delay?: number; attempts?: number }
  ): Promise<string | null> {
    const entry = this.queues.get(queueName);
    if (!entry) {
      logger.warn(`Queue "${queueName}" not found, cannot enqueue`);
      return null;
    }

    const job = await entry.queue.add(jobName, data, {
      jobId: options?.jobId,
      delay: options?.delay,
      attempts: options?.attempts ?? 1,
      backoff: { type: 'exponential', delay: 2000 },
    });

    logger.debug(`Enqueued job ${job.id} on queue "${queueName}"`, {
      jobName,
    });

    return job.id ?? null;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down QueueManager...', { queueCount: this.queues.size });

    const closePromises: Promise<void>[] = [];

    for (const [name, entry] of this.queues) {
      if (entry.worker) {
        closePromises.push(
          entry.worker.close().catch(err => {
            logger.error(`Error closing worker for queue "${name}"`, {
              error: err instanceof Error ? err.message : String(err),
            });
          })
        );
      }
      closePromises.push(
        entry.queue.close().catch(err => {
          logger.error(`Error closing queue "${name}"`, {
            error: err instanceof Error ? err.message : String(err),
          });
        })
      );
    }

    await Promise.all(closePromises);
    this.queues.clear();
    this.initialized = false;
    logger.info('QueueManager shutdown complete');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }
}

export const QueueManager = new QueueManagerClass();
