/**
 * Centralized Redis Cache Implementation
 *
 * Provides consistent Redis caching across all microservices with
 * service-specific key prefixes to prevent collisions.
 *
 * @example
 * import { createRedisCache } from '@aiponge/platform-core';
 *
 * const cache = createRedisCache({
 *   serviceName: 'ai-analytics-service',
 *   keyPrefix: 'aiponge:analytics:',
 *   defaultDb: 0,
 * });
 */

import Redis, { Cluster as RedisCluster } from 'ioredis';
import { createLogger } from '../logging/logger.js';
import { serializeError } from '../logging/error-serializer.js';
import { DomainError } from '../error-handling/errors.js';

export interface RedisCacheConfig {
  serviceName: string;
  keyPrefix: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
  clusterNodes?: Array<{ host: string; port: number }>;
}

function parseClusterNodes(): Array<{ host: string; port: number }> | null {
  const nodesEnv = process.env.REDIS_CLUSTER_NODES;
  if (!nodesEnv) return null;

  try {
    return nodesEnv.split(',').map(node => {
      const [host, portStr] = node.trim().split(':');
      return { host, port: parseInt(portStr || '6379') };
    });
  } catch {
    return null;
  }
}

const DEFAULT_TTL_SECONDS = 86400; // 24 hours -- safety net to prevent memory leaks

const L1_MAX_ENTRIES = parseInt(process.env.CACHE_L1_MAX_ENTRIES || '1000', 10);
const L1_ENABLED = process.env.CACHE_L1_ENABLED !== 'false';

interface L1Entry {
  value: string;
  expiresAt: number;
}

class InMemoryLRU {
  private cache = new Map<string, L1Entry>();
  private readonly maxEntries: number;

  constructor(maxEntries: number) {
    this.maxEntries = maxEntries;
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds: number): void {
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export interface ICache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  setex(key: string, ttlSeconds: number, value: string): Promise<boolean>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  mset(keyValues: Record<string, string>, ttlSeconds?: number): Promise<boolean>;
  incr(key: string): Promise<number>;
  incrby(key: string, amount: number): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  flushdb(): Promise<boolean>;
  ping(): Promise<boolean>;
  isReady(): boolean;
  disconnect(): Promise<void>;
  pipeline(): ReturnType<Redis['pipeline']>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, callback: (message: string) => void): Promise<void>;
}

export class RedisCache implements ICache {
  private client: Redis | RedisCluster;
  private isConnected = false;
  private readonly keyPrefix: string;
  private readonly logger;
  private readonly isCluster: boolean;
  private readonly isClusterMode: boolean;
  private readonly l1Cache: InMemoryLRU | null;
  private invalidationEnabled = false;
  private readonly invalidationChannel: string;
  // Tracks all duplicate subscriber connections so they can be properly
  // shut down during disconnect(). Without storing these references the
  // connections dangle — they self-reconnect forever and can't be cleaned up.
  private readonly subscribers: Redis[] = [];

  private prefixKey(key: string): string {
    if (this.isClusterMode) {
      return `{${this.keyPrefix}}${key}`;
    }
    return `${this.keyPrefix}${key}`;
  }

  constructor(config: RedisCacheConfig) {
    this.keyPrefix = config.keyPrefix;
    this.invalidationChannel = `cache:invalidate:${config.keyPrefix}`;
    this.logger = createLogger(`${config.serviceName}-redis`);
    this.l1Cache = L1_ENABLED ? new InMemoryLRU(L1_MAX_ENTRIES) : null;

    const clusterNodes = config.clusterNodes || parseClusterNodes();
    this.isClusterMode = !!process.env.REDIS_CLUSTER_NODES;

    if (clusterNodes && clusterNodes.length > 0) {
      this.isCluster = true;
      this.client = new RedisCluster(clusterNodes, {
        redisOptions: {
          password: config.password || process.env.REDIS_PASSWORD,
          maxRetriesPerRequest: config.maxRetriesPerRequest ?? 3,
          enableReadyCheck: config.enableReadyCheck ?? true,
          lazyConnect: config.lazyConnect ?? true,
        },
        clusterRetryStrategy: times => Math.min(times * 100, 3000),
      });
      this.logger.info('Redis Cluster mode enabled', { nodes: clusterNodes.length });
    } else {
      this.isCluster = false;
      const redisUrl = process.env.REDIS_URL;
      const redisConfigured = !!(config.host || redisUrl || process.env.REDIS_HOST);
      const sharedOpts = {
        maxRetriesPerRequest: redisConfigured ? (config.maxRetriesPerRequest ?? 3) : 0,
        enableReadyCheck: config.enableReadyCheck ?? true,
        lazyConnect: config.lazyConnect ?? true,
        retryStrategy: redisConfigured ? undefined : ((() => null) as () => null),
      };
      if (redisUrl && !config.host) {
        // Use the full connection string (e.g. redis://user:pass@host:port/db)
        this.client = new Redis(redisUrl, sharedOpts);
      } else {
        this.client = new Redis({
          host: config.host || process.env.REDIS_HOST || 'localhost',
          port: config.port || parseInt(process.env.REDIS_PORT || '6379'),
          password: config.password || process.env.REDIS_PASSWORD,
          db: config.db ?? parseInt(process.env.REDIS_DB || '0'),
          ...sharedOpts,
        });
      }
      if (!redisConfigured) {
        this.logger.info('Redis not configured — operating in memory-only mode');
      }
    }

    this.client.on('connect', () => {
      this.logger.info(`Connected to Redis ${this.isCluster ? 'cluster' : 'server'}`);
      this.isConnected = true;
    });

    this.client.on('error', (err: Error) => {
      this.logger.error('Redis connection error', { error: err.message });
      this.isConnected = false;
    });

    this.client.on('close', () => {
      this.logger.info('Redis connection closed');
      this.isConnected = false;
    });
  }

  async get(key: string): Promise<string | null> {
    const prefixedKey = this.prefixKey(key);

    if (this.l1Cache) {
      const l1Result = this.l1Cache.get(prefixedKey);
      if (l1Result !== null) return l1Result;
    }

    try {
      const result = await this.client.get(prefixedKey);
      if (result !== null && this.l1Cache) {
        const ttl = await this.client.ttl(prefixedKey);
        if (ttl > 0) this.l1Cache.set(prefixedKey, result, Math.min(ttl, 300));
      }
      return result;
    } catch (error) {
      this.logger.error('Get error (Redis down, L1 miss)', { error: serializeError(error) });
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);
    const effectiveTtl = ttlSeconds ?? DEFAULT_TTL_SECONDS;
    if (!ttlSeconds) {
      this.logger.warn('set() called without explicit TTL, using default 24h', { key });
    }

    if (this.l1Cache) {
      this.l1Cache.set(prefixedKey, value, Math.min(effectiveTtl, 300));
    }

    try {
      const result = await this.client.setex(prefixedKey, effectiveTtl, value);
      if (result === 'OK' && this.invalidationEnabled) {
        this.client.publish(this.invalidationChannel, prefixedKey).catch(err =>
          this.logger.warn('Cache invalidation publish failed on set', {
            key: prefixedKey,
            error: serializeError(err),
          })
        );
      }
      return result === 'OK';
    } catch (error) {
      this.logger.error('Set error (wrote to L1 only)', { error: serializeError(error) });
      return this.l1Cache !== null;
    }
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<boolean> {
    return this.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);

    if (this.l1Cache) {
      this.l1Cache.delete(prefixedKey);
    }

    try {
      const result = await this.client.del(prefixedKey);
      if (result === 1 && this.invalidationEnabled) {
        this.client.publish(this.invalidationChannel, prefixedKey).catch(err =>
          this.logger.warn('Cache invalidation publish failed on delete', {
            key: prefixedKey,
            error: serializeError(err),
          })
        );
      }
      return result === 1;
    } catch (error) {
      this.logger.error('Delete error', { error: serializeError(error) });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(this.prefixKey(key));
      return result === 1;
    } catch (error) {
      this.logger.error('Exists error', { error: serializeError(error) });
      return false;
    }
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    try {
      const prefixedKeys = keys.map(k => this.prefixKey(k));
      return await this.client.mget(...prefixedKeys);
    } catch (error) {
      this.logger.error('MGet error', { error: serializeError(error) });
      return keys.map((): null => null);
    }
  }

  async mset(keyValues: Record<string, string>, ttlSeconds?: number): Promise<boolean> {
    try {
      const effectiveTtl = ttlSeconds ?? DEFAULT_TTL_SECONDS;
      if (!ttlSeconds) {
        this.logger.warn('mset() called without explicit TTL, using default 24h');
      }
      const pipe = this.client.pipeline();
      for (const [key, value] of Object.entries(keyValues)) {
        pipe.setex(this.prefixKey(key), effectiveTtl, value);
      }
      const results = await pipe.exec();
      return results !== null && results.every(([err]) => !err);
    } catch (error) {
      this.logger.error('MSet error', { error: serializeError(error) });
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(this.prefixKey(key));
    } catch (error) {
      this.logger.error('Increment error', { error: serializeError(error) });
      return 0;
    }
  }

  async incrby(key: string, amount: number): Promise<number> {
    try {
      return await this.client.incrby(this.prefixKey(key), amount);
    } catch (error) {
      this.logger.error('IncrBy error', { error: serializeError(error) });
      return 0;
    }
  }

  async decr(key: string): Promise<number> {
    try {
      return await this.client.decr(this.prefixKey(key));
    } catch (error) {
      this.logger.error('Decrement error', { error: serializeError(error) });
      return 0;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(this.prefixKey(key), seconds);
      return result === 1;
    } catch (error) {
      this.logger.error('Expire error', { error: serializeError(error) });
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(this.prefixKey(key));
    } catch (error) {
      this.logger.error('TTL error', { error: serializeError(error) });
      return -1;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      const prefixedPattern = this.prefixKey(pattern);
      const keys = await this.client.keys(prefixedPattern);
      return keys.map((k: string) => k.replace(this.keyPrefix, ''));
    } catch (error) {
      this.logger.error('Keys error', { error: serializeError(error) });
      return [];
    }
  }

  async flushdb(): Promise<boolean> {
    try {
      const result = await this.client.flushdb();
      return result === 'OK';
    } catch (error) {
      this.logger.error('FlushDB error', { error: serializeError(error) });
      return false;
    }
  }

  pipeline() {
    return this.client.pipeline();
  }

  async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown> {
    try {
      return await this.client.eval(script, numKeys, ...args);
    } catch (error) {
      this.logger.error('Eval error', { error: serializeError(error) });
      throw error;
    }
  }

  async publish(channel: string, message: string): Promise<number> {
    try {
      return await this.client.publish(channel, message);
    } catch (error) {
      this.logger.error('Publish error', { error: serializeError(error) });
      return 0;
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    let subscriber: Redis;
    if (this.isCluster) {
      const cluster = this.client as RedisCluster;
      const nodes = cluster.nodes('master');
      if (nodes.length === 0) throw new DomainError('No cluster master nodes available for subscribe', 503);
      subscriber = nodes[0].duplicate();
    } else {
      subscriber = (this.client as Redis).duplicate();
    }
    // MUST attach error handler before any async operation — ioredis emits 'error'
    // BEFORE rejecting the subscribe promise, so an unhandled listener crashes Node.js.
    subscriber.on('error', (err: Error) => {
      this.logger.error('Redis subscriber error', { channel, error: err.message });
    });
    subscriber.on('message', (receivedChannel: string, message: string) => {
      if (receivedChannel === channel) {
        callback(message);
      }
    });
    // Store reference so disconnect() can cleanly shut down all subscriber
    // connections. Without this the duplicate connections dangle indefinitely,
    // consuming a Redis connection slot and reconnecting forever on drops.
    this.subscribers.push(subscriber);
    await subscriber.subscribe(channel);
  }

  async enableCrossInstanceInvalidation(): Promise<void> {
    if (this.invalidationEnabled || !this.l1Cache) return;
    try {
      await this.subscribe(this.invalidationChannel, (key: string) => {
        this.l1Cache!.delete(key);
      });
      this.invalidationEnabled = true;
      this.logger.info('Cross-instance L1 cache invalidation enabled', { channel: this.invalidationChannel });
    } catch (error) {
      this.logger.error('Failed to enable cross-instance invalidation', { error: serializeError(error) });
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Ping error', { error: serializeError(error) });
      return false;
    }
  }

  isReady(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  async disconnect(): Promise<void> {
    // Shut down all pub/sub subscriber connections first.
    // These are duplicate connections created in subscribe() — if not explicitly
    // quit, they continue reconnecting indefinitely after the main client closes.
    for (const sub of this.subscribers) {
      try {
        if (sub.status === 'ready') {
          await sub.unsubscribe();
          await sub.quit();
        } else {
          sub.disconnect();
        }
      } catch {
        sub.disconnect();
      }
    }
    this.subscribers.length = 0;

    try {
      await this.client.quit();
      this.logger.info('Redis connection closed gracefully');
    } catch (error) {
      this.logger.error('Disconnect error', { error: serializeError(error) });
      this.client.disconnect();
    }
  }

  getClient(): Redis | RedisCluster {
    return this.client;
  }
}

export function createRedisCache(config: RedisCacheConfig): RedisCache {
  const cache = new RedisCache(config);
  const redisConfigured = !!(
    config.host ||
    config.clusterNodes?.length ||
    process.env.REDIS_URL ||
    process.env.REDIS_HOST ||
    process.env.REDIS_CLUSTER_NODES
  );
  if (redisConfigured) {
    cache.enableCrossInstanceInvalidation().catch(() => {});
  }
  return cache;
}
