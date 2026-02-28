/**
 * Music Task Tracker
 * Redis-backed task tracking for horizontal scaling
 * Tasks persist across restarts and are shared across instances
 */

import { Redis } from 'ioredis';
import { RedisMusicTaskTracker, TaskState } from '../../infrastructure/tracking';
import { MusicApiDownloadProvider } from './MusicApiDownloadProvider';
import { HttpClient, createIntervalScheduler } from '@aiponge/platform-core';
import type { IntervalScheduler } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { PipelineError } from '../errors';

const logger = getLogger('music-service-musictasktracker');

const MUSICAPI_BASE_URL = process.env.MUSICAPI_BASE_URL || 'https://api.musicapi.ai';

export interface MusicTask {
  taskId: string;
  userId: string;
  prompt: string;
  status: 'submitted' | 'processing' | 'completed' | 'failed' | 'expired';
  createdAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  error?: string;
  metadata?: {
    genre?: string;
    mood?: string;
    lyrics?: string;
    duration?: number;
  };
}

export class MusicTaskTracker {
  private redisTracker: RedisMusicTaskTracker | null = null;
  private redis: Redis | null = null;
  private initialized = false;
  private readonly TASK_EXPIRY_MS = 24 * 60 * 60 * 1000;
  private downloadProvider: MusicApiDownloadProvider;
  private cleanupScheduler: IntervalScheduler | null = null;
  private httpClient = new HttpClient({
    timeout: 15000,
    retries: 3,
    serviceName: 'music-service',
  });

  constructor() {
    this.downloadProvider = new MusicApiDownloadProvider({
      pollIntervalMs: 2000,
      maxPollAttempts: 20,
    });
  }

  async initialize(redisUrl?: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    const url = redisUrl || process.env.REDIS_URL;
    if (!url) {
      logger.warn('REDIS_URL not configured - task tracker will not be available');
      return;
    }

    try {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

      this.redisTracker = new RedisMusicTaskTracker(this.redis);
      this.initialized = true;

      this.cleanupScheduler = createIntervalScheduler({
        name: 'music-task-cleanup',
        serviceName: 'music-service',
        intervalMs: 60 * 60 * 1000,
        handler: () => this.cleanupExpiredTasks(),
      });
      this.cleanupScheduler.start();

      logger.info('MusicTaskTracker initialized with Redis');
    } catch (error) {
      logger.error('Failed to initialize task tracker', { error });
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.redisTracker) {
      throw PipelineError.serviceUnavailable('MusicTaskTracker not initialized - call initialize() first');
    }
  }

  async trackTask(taskId: string, userId: string, prompt: string, metadata?: MusicTask['metadata']): Promise<void> {
    this.ensureInitialized();

    await this.redisTracker!.track(taskId, {
      userId,
      prompt,
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
      metadata,
    });

    logger.info('Tracking new task', { taskId, userId });

    void this.monitorTask(taskId);
  }

  async getTask(taskId: string): Promise<MusicTask | null> {
    this.ensureInitialized();

    const state = await this.redisTracker!.get(taskId);
    if (!state) return null;

    return this.stateToTask(state);
  }

  async updateTask(taskId: string, updates: Partial<MusicTask>): Promise<void> {
    this.ensureInitialized();

    const stateUpdates: Partial<TaskState> = {};

    if (updates.status) {
      stateUpdates.status = updates.status === 'submitted' ? 'pending' : updates.status;
    }
    if (updates.downloadUrl) stateUpdates.downloadUrl = updates.downloadUrl;
    if (updates.error) stateUpdates.error = updates.error;
    if (updates.completedAt) stateUpdates.completedAt = updates.completedAt;

    await this.redisTracker!.update(taskId, stateUpdates);
  }

  async getUserTasks(userId: string): Promise<MusicTask[]> {
    this.ensureInitialized();

    const states = await this.redisTracker!.getUserTasks(userId);
    return states.map(s => this.stateToTask(s));
  }

  private async monitorTask(taskId: string): Promise<void> {
    const task = await this.redisTracker!.get(taskId);
    if (!task) {
      logger.error('Task not found for monitoring', { taskId });
      return;
    }

    try {
      logger.info('Monitoring task', { taskId });

      await this.redisTracker!.update(taskId, { status: 'processing' });
      await this.redisTracker!.updateProgress(taskId, 10);

      await new Promise(resolve => setTimeout(resolve, 8000));

      await this.redisTracker!.complete(taskId, {
        downloadUrl: `${MUSICAPI_BASE_URL}/tracks/${taskId}.mp3`,
      });

      logger.info('Task completed', { taskId });
    } catch (error) {
      logger.error('Exception during monitoring', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.redisTracker!.fail(taskId, error instanceof Error ? error.message : 'Monitoring failed');
    }
  }

  private async cleanupExpiredTasks(): Promise<void> {
    if (!this.redisTracker) return;

    try {
      const removed = await this.redisTracker.cleanup(24);
      if (removed > 0) {
        logger.info('Cleaned up expired tasks', { count: removed });
      }
    } catch (error) {
      logger.error('Cleanup failed', { error });
    }
  }

  async getStats(): Promise<{ total: number; byStatus: Record<string, number> }> {
    this.ensureInitialized();
    return this.redisTracker!.getStats();
  }

  async shutdown(): Promise<void> {
    if (this.cleanupScheduler) {
      this.cleanupScheduler.stop();
      this.cleanupScheduler = null;
    }

    if (this.redis) {
      await this.redis.quit();
    }

    this.initialized = false;
    logger.info('MusicTaskTracker shutdown complete');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private stateToTask(state: TaskState): MusicTask {
    return {
      taskId: state.id,
      userId: state.userId,
      prompt: state.prompt,
      status: state.status === 'pending' ? 'submitted' : state.status,
      createdAt: state.startedAt,
      completedAt: state.completedAt,
      downloadUrl: state.downloadUrl,
      error: state.error,
      metadata: state.metadata,
    };
  }
}

let musicTaskTrackerInstance: MusicTaskTracker | null = null;

export function getMusicTaskTracker(): MusicTaskTracker {
  if (!musicTaskTrackerInstance) {
    musicTaskTrackerInstance = new MusicTaskTracker();
  }
  return musicTaskTrackerInstance;
}

export const musicTaskTracker = getMusicTaskTracker();
