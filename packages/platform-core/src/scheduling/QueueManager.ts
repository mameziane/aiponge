import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
import Redis, { Cluster as RedisCluster } from 'ioredis';
import { createLogger } from '../logging/index.js';
import { registerPhasedShutdownHook } from '../lifecycle/gracefulShutdown.js';

const logger = createLogger('queue-manager');

export interface JobProcessor<T = unknown> {
  (job: Job<T>): Promise<void>;
}

export interface DLQHandler {
  (data: {
    queueName: string;
    jobId?: string;
    jobName?: string;
    payload: unknown;
    errorMessage?: string;
    errorStack?: string;
    attemptsMade: number;
    maxAttempts: number;
  }): Promise<void>;
}

interface QueueEntry {
  queue: Queue;
  worker: Worker | null;
}

class QueueManagerClass {
  private queues = new Map<string, QueueEntry>();
  private connection: ConnectionOptions | Redis | RedisCluster | null = null;
  private initialized = false;
  private dlqHandler: DLQHandler | null = null;

  init(): void {
    if (this.initialized) return;

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      const isProduction = process.env.NODE_ENV === 'production';
      logger[isProduction ? 'warn' : 'debug']('REDIS_URL not set, QueueManager disabled');
      return;
    }

    try {
      const clusterNodes = process.env.REDIS_CLUSTER_NODES;
      if (clusterNodes) {
        const nodes = clusterNodes.split(',').map((node: string) => {
          const [host, port] = node.trim().split(':');
          return { host, port: parseInt(port || '6379') };
        });
        this.connection = new RedisCluster(nodes, {
          redisOptions: {
            password: process.env.REDIS_PASSWORD || undefined,
            tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
          },
        });
      } else {
        const url = new URL(redisUrl);
        this.connection = {
          host: url.hostname,
          port: Number(url.port) || 6379,
          password: url.password || undefined,
          username: url.username || undefined,
          tls: url.protocol === 'rediss:' ? {} : undefined,
        };
      }
      this.initialized = true;
      registerPhasedShutdownHook('queues', () => this.shutdown(), 'QueueManager');
      logger.debug('QueueManager initialized', { clusterMode: !!clusterNodes });
    } catch (error) {
      logger.error('Failed to initialize QueueManager', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  setDLQHandler(handler: DLQHandler): void {
    this.dlqHandler = handler;
    logger.debug('DLQ handler registered');
  }

  registerQueue<T = unknown>(name: string, processor: JobProcessor<T>, options?: { concurrency?: number }): void {
    if (!this.initialized || !this.connection) {
      logger.warn(`Cannot register queue "${name}": QueueManager not initialized`);
      return;
    }

    if (this.queues.has(name)) {
      logger.warn(`Queue "${name}" already registered`);
      return;
    }

    const queue = new Queue(name, { connection: this.connection });

    const concurrency = options?.concurrency ?? parseInt(process.env.QUEUE_WORKER_CONCURRENCY || '1');

    const worker = new Worker<T>(
      name,
      async (job: Job<T>) => {
        logger.debug(`Processing job ${job.id} on queue "${name}"`, {
          jobName: job.name,
          attempt: job.attemptsMade,
        });
        await processor(job);
      },
      {
        connection: this.connection,
        concurrency,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );

    worker.on('completed', (job: Job<T>) => {
      logger.debug(`Job ${job.id} completed on queue "${name}"`, {
        jobName: job.name,
        duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
      });
    });

    worker.on('failed', async (job: Job<T> | undefined, err: Error) => {
      logger.error(`Job ${job?.id ?? 'unknown'} failed on queue "${name}"`, {
        jobName: job?.name,
        error: err.message,
        attempt: job?.attemptsMade,
      });

      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        if (this.dlqHandler) {
          try {
            await this.dlqHandler({
              queueName: name,
              jobId: job.id,
              jobName: job.name,
              payload: job.data,
              errorMessage: err.message,
              errorStack: err.stack,
              attemptsMade: job.attemptsMade,
              maxAttempts: job.opts.attempts || 3,
            });
          } catch (dlqError) {
            logger.error('Failed to move job to DLQ (fire-and-forget)', {
              queueName: name,
              jobId: job.id,
              error: dlqError instanceof Error ? dlqError.message : String(dlqError),
            });
          }
        } else {
          logger.warn('Job exhausted all attempts but no DLQ handler registered', {
            queueName: name,
            jobId: job.id,
            attemptsMade: job.attemptsMade,
          });
        }
      }
    });

    this.queues.set(name, { queue, worker });
    logger.debug(`Queue "${name}" registered with worker`, { concurrency });
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
      attempts: options?.attempts ?? 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    logger.debug(`Enqueued job ${job.id} on queue "${queueName}"`, {
      jobName,
    });

    return job.id ?? null;
  }

  getQueue(queueName: string): Queue | null {
    return this.queues.get(queueName)?.queue || null;
  }

  async shutdown(): Promise<void> {
    const drainTimeoutMs = parseInt(process.env.QUEUE_DRAIN_TIMEOUT_MS || '15000', 10);
    const activeWorkers = Array.from(this.queues.entries()).filter(([, e]) => e.worker);
    logger.info('Shutting down QueueManager...', {
      queueCount: this.queues.size,
      activeWorkers: activeWorkers.length,
      drainTimeoutMs,
    });

    const closePromises: Promise<void>[] = [];

    for (const [name, entry] of this.queues) {
      if (entry.worker) {
        closePromises.push(
          Promise.race([
            entry.worker.close().then(() => {
              logger.info(`Worker drained for queue "${name}"`);
            }),
            new Promise<void>(resolve =>
              setTimeout(() => {
                logger.warn(`Worker drain timed out for queue "${name}"`, { drainTimeoutMs });
                resolve();
              }, drainTimeoutMs)
            ),
          ]).catch(err => {
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
