import { Redis } from 'ioredis';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('music-service-redistasktracker');

export interface TaskState {
  id: string;
  userId: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  progress: number;
  startedAt: Date;
  updatedAt: Date;
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

export class RedisMusicTaskTracker {
  private readonly KEY_PREFIX = 'music:tasks';
  private readonly TTL_SECONDS = 86400;

  constructor(private readonly redis: Redis) {
    logger.info('RedisMusicTaskTracker initialized');
  }

  async track(taskId: string, initialState: Omit<TaskState, 'id' | 'updatedAt'>): Promise<void> {
    const state: TaskState = {
      ...initialState,
      id: taskId,
      updatedAt: new Date(),
    };

    await this.redis.hset(this.getKey(taskId), this.serializeState(state));
    await this.redis.expire(this.getKey(taskId), this.TTL_SECONDS);

    await this.redis.sadd(this.getUserTasksKey(state.userId), taskId);
    await this.redis.expire(this.getUserTasksKey(state.userId), this.TTL_SECONDS);

    logger.info('Task tracked', { taskId, userId: state.userId });
  }

  async update(taskId: string, updates: Partial<TaskState>): Promise<TaskState | null> {
    const current = await this.get(taskId);
    if (!current) return null;

    const updated: TaskState = {
      ...current,
      ...updates,
      updatedAt: new Date(),
    };

    if (updates.status === 'completed') {
      updated.completedAt = new Date();
    }

    await this.redis.hset(this.getKey(taskId), this.serializeState(updated));

    return updated;
  }

  async updateProgress(taskId: string, progress: number): Promise<void> {
    await this.redis.hset(this.getKey(taskId), {
      progress: progress.toString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async complete(taskId: string, result: { downloadUrl?: string; trackId?: string; albumId?: string }): Promise<void> {
    await this.redis.hset(this.getKey(taskId), {
      status: 'completed',
      progress: '100',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      downloadUrl: result.downloadUrl || '',
    });
    logger.info('Task completed', { taskId });
  }

  async fail(taskId: string, error: string): Promise<void> {
    await this.redis.hset(this.getKey(taskId), {
      status: 'failed',
      error,
      updatedAt: new Date().toISOString(),
    });
    logger.error('Task failed', { taskId, error });
  }

  async get(taskId: string): Promise<TaskState | null> {
    const data = await this.redis.hgetall(this.getKey(taskId));

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return this.deserializeState(data);
  }

  async getUserTasks(userId: string): Promise<TaskState[]> {
    const taskIds = await this.redis.smembers(this.getUserTasksKey(userId));

    if (taskIds.length === 0) return [];

    const tasks = await Promise.all(taskIds.map(id => this.get(id)));

    return tasks
      .filter((t): t is TaskState => t !== null)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  async getActiveTasks(): Promise<TaskState[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, foundKeys] = await this.redis.scan(cursor, 'MATCH', `${this.KEY_PREFIX}:*`, 'COUNT', 100);
      cursor = newCursor;
      keys.push(...foundKeys.filter(k => !k.includes(':user:')));
    } while (cursor !== '0');

    const tasks = await Promise.all(
      keys.map(async key => {
        const data = await this.redis.hgetall(key);
        return data && Object.keys(data).length > 0 ? this.deserializeState(data) : null;
      })
    );

    return tasks
      .filter((t): t is TaskState => t !== null)
      .filter(t => t.status === 'pending' || t.status === 'processing');
  }

  async getStats(): Promise<{ total: number; byStatus: Record<string, number> }> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, foundKeys] = await this.redis.scan(cursor, 'MATCH', `${this.KEY_PREFIX}:*`, 'COUNT', 100);
      cursor = newCursor;
      keys.push(...foundKeys.filter(k => !k.includes(':user:')));
    } while (cursor !== '0');

    const byStatus: Record<string, number> = {};
    let total = 0;

    for (const key of keys) {
      const status = await this.redis.hget(key, 'status');
      if (status) {
        byStatus[status] = (byStatus[status] || 0) + 1;
        total++;
      }
    }

    return { total, byStatus };
  }

  async cleanup(olderThanHours: number = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, foundKeys] = await this.redis.scan(cursor, 'MATCH', `${this.KEY_PREFIX}:*`, 'COUNT', 100);
      cursor = newCursor;
      keys.push(...foundKeys.filter(k => !k.includes(':user:')));
    } while (cursor !== '0');

    let removed = 0;

    for (const key of keys) {
      const data = await this.redis.hgetall(key);
      if (!data || Object.keys(data).length === 0) continue;

      const task = this.deserializeState(data);
      if ((task.status === 'completed' || task.status === 'failed') && task.updatedAt < cutoff) {
        await this.redis.del(key);
        await this.redis.srem(this.getUserTasksKey(task.userId), task.id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Cleaned up expired tasks', { count: removed });
    }

    return removed;
  }

  private getKey(taskId: string): string {
    return `${this.KEY_PREFIX}:${taskId}`;
  }

  private getUserTasksKey(userId: string): string {
    return `${this.KEY_PREFIX}:user:${userId}`;
  }

  private serializeState(state: TaskState): Record<string, string> {
    return {
      id: state.id,
      userId: state.userId,
      prompt: state.prompt,
      status: state.status,
      progress: state.progress.toString(),
      startedAt: state.startedAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
      completedAt: state.completedAt?.toISOString() || '',
      downloadUrl: state.downloadUrl || '',
      error: state.error || '',
      metadata: state.metadata ? JSON.stringify(state.metadata) : '',
    };
  }

  private deserializeState(data: Record<string, string>): TaskState {
    return {
      id: data.id,
      userId: data.userId,
      prompt: data.prompt || '',
      status: data.status as TaskState['status'],
      progress: parseInt(data.progress, 10) || 0,
      startedAt: new Date(data.startedAt),
      updatedAt: new Date(data.updatedAt),
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      downloadUrl: data.downloadUrl || undefined,
      error: data.error || undefined,
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
    };
  }
}
