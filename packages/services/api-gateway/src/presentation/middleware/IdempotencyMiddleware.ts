/**
 * Idempotency Key Middleware
 * Prevents duplicate mutations from retried requests by caching responses
 *
 * Features:
 * - Redis-backed storage for multi-instance deployments
 * - Automatic fallback to in-memory LRU cache (bounded at 10,000 entries) when Redis unavailable
 * - User-scoped keys (userId or IP) to prevent cross-user collisions
 * - Only caches successful (2xx) responses — errors allow retries
 * - 24-hour TTL for idempotency keys
 * - Processing-state tracking to handle concurrent duplicate requests
 */

import { Request, Response, NextFunction } from 'express';
import type Redis from 'ioredis';
import type { Cluster as RedisCluster } from 'ioredis';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';
import { serializeError } from '@aiponge/platform-core';

type RedisClient = Redis | RedisCluster;

const logger = getLogger('api-gateway:idempotency');

const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const REDIS_KEY_PREFIX = 'idempotency:';
const TTL_SECONDS = 24 * 60 * 60;
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_IN_MEMORY_ENTRIES = 10_000;
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface CachedResponse {
  status: 'processing' | 'completed';
  statusCode?: number;
  contentType?: string;
  body?: string;
  createdAt: number;
}

/**
 * In-memory LRU cache for idempotency when Redis is unavailable.
 * Bounded at MAX_IN_MEMORY_ENTRIES with oldest-first eviction.
 */
class InMemoryIdempotencyStore {
  private store = new Map<string, CachedResponse>();

  get(key: string): CachedResponse | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    const ageMs = Date.now() - entry.createdAt;

    if (entry.status === 'processing' && ageMs > PROCESSING_TIMEOUT_MS) {
      this.store.delete(key);
      return undefined;
    }

    if (entry.status === 'completed' && ageMs > TTL_SECONDS * 1000) {
      this.store.delete(key);
      return undefined;
    }

    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  set(key: string, value: CachedResponse): void {
    if (this.store.size >= MAX_IN_MEMORY_ENTRIES && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

interface IdempotencyConfig {
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
}

function buildScopedKey(req: Request, res: Response, idempotencyKey: string): string {
  const userId = res.locals.userId as string | undefined;
  if (userId) {
    return `${REDIS_KEY_PREFIX}${userId}:${idempotencyKey}`;
  }

  const ip = extractClientIP(req);
  return `${REDIS_KEY_PREFIX}${ip}:${idempotencyKey}`;
}

function extractClientIP(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = (typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0]).split(',');
    return ips[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    return realIp.trim();
  }

  return req.ip || 'unknown';
}

/**
 * Create idempotency middleware that checks for duplicate mutation requests.
 *
 * Shares the Redis connection from the rate-limiter module via getter functions
 * so we don't open a second connection.
 */
export function createIdempotencyMiddleware(
  _config: IdempotencyConfig,
  getRedisClient: () => RedisClient | null,
  isRedisReady: () => boolean,
  waitForSettled?: () => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  const memoryStore = new InMemoryIdempotencyStore();
  let redisInitSettled = false;
  const settlePromise = waitForSettled
    ? waitForSettled()
        .then(() => {
          redisInitSettled = true;
        })
        .catch(() => {
          redisInitSettled = true;
        })
    : Promise.resolve().then(() => {
        redisInitSettled = true;
      });

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!MUTATION_METHODS.has(req.method)) {
      next();
      return;
    }

    const idempotencyKey = req.headers[IDEMPOTENCY_HEADER] as string | undefined;
    if (!idempotencyKey) {
      next();
      return;
    }

    if (idempotencyKey.length > 128) {
      StructuredErrors.validation(res, 'X-Idempotency-Key must be at most 128 characters.', {
        service: 'api-gateway',
        correlationId: getCorrelationId(req),
      });
      return;
    }

    const scopedKey = buildScopedKey(req, res, idempotencyKey);

    void (async () => {
      try {
        if (!redisInitSettled) {
          await settlePromise;
        }
        const cached = await lookupEntry(scopedKey, getRedisClient, isRedisReady, memoryStore);

        if (cached) {
          if (cached.status === 'processing') {
            logger.debug('Duplicate request still processing', { key: idempotencyKey });
            StructuredErrors.conflict(
              res,
              'A request with this idempotency key is already being processed. Please wait and retry.',
              { service: 'api-gateway', correlationId: getCorrelationId(req), details: { retryAfter: 30 } }
            );
            return;
          }

          if (cached.status === 'completed' && cached.statusCode !== undefined) {
            logger.debug('Returning cached idempotent response', {
              key: idempotencyKey,
              statusCode: cached.statusCode,
            });
            res
              .status(cached.statusCode)
              .set('Content-Type', cached.contentType || 'application/json')
              .set('X-Idempotent-Replayed', 'true')
              .send(cached.body || '');
            return;
          }
        }

        const processingEntry: CachedResponse = {
          status: 'processing',
          createdAt: Date.now(),
        };
        await storeEntry(
          scopedKey,
          processingEntry,
          PROCESSING_TIMEOUT_MS / 1000,
          getRedisClient,
          isRedisReady,
          memoryStore
        );

        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);
        let responseCaptured = false;

        const captureAndCache = (body: unknown): void => {
          if (responseCaptured) return;
          responseCaptured = true;

          if (res.statusCode >= 200 && res.statusCode < 300) {
            const serializedBody = typeof body === 'string' ? body : JSON.stringify(body);
            const contentType = (res.getHeader('Content-Type') as string) || 'application/json';

            const completedEntry: CachedResponse = {
              status: 'completed',
              statusCode: res.statusCode,
              contentType,
              body: serializedBody,
              createdAt: Date.now(),
            };

            storeEntry(scopedKey, completedEntry, TTL_SECONDS, getRedisClient, isRedisReady, memoryStore).catch(err => {
              logger.warn('Failed to store idempotency response', { error: serializeError(err) });
            });
          } else {
            removeEntry(scopedKey, getRedisClient, isRedisReady, memoryStore).catch(err => {
              logger.warn('Failed to remove idempotency key after error response', { error: serializeError(err) });
            });
          }
        };

        res.json = function (body?: unknown): Response {
          captureAndCache(body);
          return originalJson(body);
        };

        res.send = function (body?: unknown): Response {
          captureAndCache(body);
          return originalSend(body);
        };

        res.on('close', () => {
          if (!responseCaptured && !res.writableEnded) {
            removeEntry(scopedKey, getRedisClient, isRedisReady, memoryStore).catch(err =>
              logger.warn('Failed to remove idempotency entry on close', { key: scopedKey, err: String(err) })
            );
          }
        });

        next();
      } catch (error) {
        logger.error('Idempotency middleware error, proceeding without idempotency', {
          error: serializeError(error),
        });
        next();
      }
    })();
  };
}

async function lookupEntry(
  scopedKey: string,
  getRedisClient: () => RedisClient | null,
  isRedisReady: () => boolean,
  memoryStore: InMemoryIdempotencyStore
): Promise<CachedResponse | undefined> {
  const client = getRedisClient();

  if (client && isRedisReady()) {
    try {
      const raw = await client.get(scopedKey);
      if (raw) {
        const entry = JSON.parse(raw) as CachedResponse;
        if (entry.status === 'processing') {
          const age = Date.now() - entry.createdAt;
          if (age > PROCESSING_TIMEOUT_MS) {
            await client.del(scopedKey);
            return undefined;
          }
        }
        return entry;
      }
      return undefined;
    } catch (error) {
      logger.warn('Redis lookup failed for idempotency, falling back to memory', {
        error: serializeError(error),
      });
    }
  }

  return memoryStore.get(scopedKey);
}

async function storeEntry(
  scopedKey: string,
  entry: CachedResponse,
  ttlSeconds: number,
  getRedisClient: () => RedisClient | null,
  isRedisReady: () => boolean,
  memoryStore: InMemoryIdempotencyStore
): Promise<void> {
  const client = getRedisClient();

  if (client && isRedisReady()) {
    try {
      await client.set(scopedKey, JSON.stringify(entry), 'EX', Math.ceil(ttlSeconds));
      return;
    } catch (error) {
      logger.warn('Redis store failed for idempotency, falling back to memory', {
        error: serializeError(error),
      });
    }
  }

  memoryStore.set(scopedKey, entry);
}

async function removeEntry(
  scopedKey: string,
  getRedisClient: () => RedisClient | null,
  isRedisReady: () => boolean,
  memoryStore: InMemoryIdempotencyStore
): Promise<void> {
  const client = getRedisClient();

  if (client && isRedisReady()) {
    try {
      await client.del(scopedKey);
      return;
    } catch (error) {
      logger.warn('Redis remove failed for idempotency', { error: serializeError(error) });
    }
  }

  memoryStore.delete(scopedKey);
}

export function getIdempotencyCacheStats(isRedisReady: () => boolean): {
  available: boolean;
  mode: 'redis' | 'memory';
} {
  const redisUp = isRedisReady();
  return {
    available: true,
    mode: redisUp ? 'redis' : 'memory',
  };
}
