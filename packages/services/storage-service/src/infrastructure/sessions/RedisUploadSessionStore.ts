/**
 * Redis Upload Session Store
 * Persists upload sessions to Redis for horizontal scaling
 */

import { Redis } from 'ioredis';
import { getLogger } from '../../config/service-urls';
import { StorageError } from '../../application/errors';

const logger = getLogger('storage-service-redis-sessions');

export interface UploadSession {
  uploadId: string;
  userId: string;
  originalName: string;
  mimeType: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  contentType: string;
  title?: string;
  tags?: string[];
  createdAt: Date;
  lastChunkAt: Date;
  expiresAt: Date;
  tempStoragePath: string;
}

export class RedisUploadSessionStore {
  private readonly KEY_PREFIX = 'upload:session';
  private readonly DEFAULT_TTL = 86400;

  constructor(private readonly _redis: Redis) {
    logger.info('RedisUploadSessionStore initialized');
  }

  async createSession(session: Omit<UploadSession, 'createdAt' | 'lastChunkAt'>): Promise<UploadSession> {
    const now = new Date();
    const fullSession: UploadSession = {
      ...session,
      createdAt: now,
      lastChunkAt: now,
    };

    await this._redis.hset(this.getKey(session.uploadId), this.serialize(fullSession));

    const ttl = Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000);
    await this._redis.expire(this.getKey(session.uploadId), ttl > 0 ? ttl : this.DEFAULT_TTL);

    await this._redis.sadd(this.getUserKey(session.userId), session.uploadId);

    logger.info('Session created', { uploadId: session.uploadId, userId: session.userId });
    return fullSession;
  }

  async getSession(uploadId: string): Promise<UploadSession | null> {
    const data = await this._redis.hgetall(this.getKey(uploadId));
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserialize(data);
  }

  async updateSession(uploadId: string, updates: Partial<UploadSession>): Promise<UploadSession | null> {
    const current = await this.getSession(uploadId);
    if (!current) return null;

    const updated: UploadSession = {
      ...current,
      ...updates,
      lastChunkAt: new Date(),
    };

    await this._redis.hset(this.getKey(uploadId), this.serialize(updated));
    return updated;
  }

  async addChunk(uploadId: string, chunkIndex: number): Promise<void> {
    const session = await this.getSession(uploadId);
    if (!session) throw StorageError.sessionNotFound(uploadId);

    if (!session.uploadedChunks.includes(chunkIndex)) {
      session.uploadedChunks.push(chunkIndex);
      session.uploadedChunks.sort((a, b) => a - b);
    }
    session.lastChunkAt = new Date();

    await this._redis.hset(this.getKey(uploadId), this.serialize(session));
  }

  async deleteSession(uploadId: string): Promise<void> {
    const session = await this.getSession(uploadId);
    if (session) {
      await this._redis.srem(this.getUserKey(session.userId), uploadId);
    }
    await this._redis.del(this.getKey(uploadId));
    logger.info('Session deleted', { uploadId });
  }

  async getUserSessions(userId: string): Promise<UploadSession[]> {
    const sessionIds = await this._redis.smembers(this.getUserKey(userId));
    const sessions = await Promise.all(sessionIds.map(id => this.getSession(id)));
    return sessions.filter((s): s is UploadSession => s !== null);
  }

  async cleanupExpiredSessions(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, foundKeys] = await this._redis.scan(cursor, 'MATCH', `${this.KEY_PREFIX}:*`, 'COUNT', 100);
      cursor = newCursor;
      keys.push(...foundKeys.filter(k => !k.includes(':user:')));
    } while (cursor !== '0');

    for (const key of keys) {
      const data = await this._redis.hgetall(key);
      if (!data || Object.keys(data).length === 0) continue;

      const session = this.deserialize(data);
      if (session.expiresAt.getTime() < now) {
        await this._redis.srem(this.getUserKey(session.userId), session.uploadId);
        await this._redis.del(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up expired sessions', { count: cleaned });
    }

    return cleaned;
  }

  private getKey(uploadId: string): string {
    return `${this.KEY_PREFIX}:${uploadId}`;
  }

  private getUserKey(userId: string): string {
    return `${this.KEY_PREFIX}:user:${userId}`;
  }

  private serialize(session: UploadSession): Record<string, string> {
    return {
      uploadId: session.uploadId,
      userId: session.userId,
      originalName: session.originalName,
      mimeType: session.mimeType,
      totalSize: session.totalSize.toString(),
      chunkSize: session.chunkSize.toString(),
      totalChunks: session.totalChunks.toString(),
      uploadedChunks: JSON.stringify(session.uploadedChunks),
      contentType: session.contentType,
      title: session.title || '',
      tags: JSON.stringify(session.tags || []),
      createdAt: session.createdAt.toISOString(),
      lastChunkAt: session.lastChunkAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      tempStoragePath: session.tempStoragePath,
    };
  }

  private deserialize(data: Record<string, string>): UploadSession {
    return {
      uploadId: data.uploadId,
      userId: data.userId,
      originalName: data.originalName,
      mimeType: data.mimeType,
      totalSize: parseInt(data.totalSize, 10),
      chunkSize: parseInt(data.chunkSize, 10),
      totalChunks: parseInt(data.totalChunks, 10),
      uploadedChunks: JSON.parse(data.uploadedChunks || '[]'),
      contentType: data.contentType,
      title: data.title || undefined,
      tags: JSON.parse(data.tags || '[]'),
      createdAt: new Date(data.createdAt),
      lastChunkAt: new Date(data.lastChunkAt),
      expiresAt: new Date(data.expiresAt),
      tempStoragePath: data.tempStoragePath,
    };
  }
}

let storeInstance: RedisUploadSessionStore | null = null;
let redisInstance: Redis | null = null;

export async function initializeUploadSessionStore(redisUrl?: string): Promise<RedisUploadSessionStore> {
  if (storeInstance) return storeInstance;

  const url = redisUrl || process.env.REDIS_URL;
  if (!url) {
    throw StorageError.serviceUnavailable('REDIS_URL not configured for upload session store');
  }

  redisInstance = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  storeInstance = new RedisUploadSessionStore(redisInstance);
  return storeInstance;
}

export function getUploadSessionStore(): RedisUploadSessionStore {
  if (!storeInstance) {
    throw StorageError.serviceUnavailable(
      'Upload session store not initialized - call initializeUploadSessionStore() first'
    );
  }
  return storeInstance;
}

export async function shutdownUploadSessionStore(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
  storeInstance = null;
  logger.info('Upload session store shutdown complete');
}
