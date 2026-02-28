/**
 * Response Caching Middleware
 *
 * SCALABILITY: Caches frequently accessed read-only endpoints to reduce backend load
 * - Supports both Redis (distributed) and in-memory (single instance) caching
 * - Automatic cache invalidation via TTL
 * - Per-endpoint cache configuration
 * - Conditional caching based on request characteristics
 *
 * Expected impact: 50-70% reduction in backend calls for cached endpoints
 * Reduces API Gateway RPS bottleneck by serving cached responses
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import Redis from 'ioredis';
import { getLogger } from '../../config/service-urls';
import { trackCacheHit, trackCacheMiss, trackCacheEviction } from '../../utils/metrics';
import { serializeError, isFeatureEnabled } from '@aiponge/platform-core';
import { FEATURE_FLAGS } from '@aiponge/shared-contracts/common';

const logger = getLogger('api-gateway:response-cache');

interface CacheEntry {
  body: string;
  contentType: string;
  statusCode: number;
  headers: Record<string, string>;
  cachedAt: number;
  expiresAt: number;
  staleUntil?: number;
}

interface CDNCacheConfig {
  sMaxAgeSec?: number;
  maxAgeSec?: number;
  scope?: 'public' | 'private';
  staleWhileRevalidateSec?: number;
  noStore?: boolean;
}

interface CacheConfig {
  ttlMs: number;
  staleWhileRevalidateMs?: number;
  maxSize?: number;
  keyPrefix?: string;
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  varyByHeaders?: string[];
  excludeWhen?: (req: Request) => boolean;
  cdn?: CDNCacheConfig;
}

interface CacheResult {
  entry: CacheEntry | null;
  isStale: boolean;
}

const revalidationInProgress = new Set<string>();

const REVALIDATION_LOCK_KEY_PREFIX = 'api-gateway:revalidate:';
const REVALIDATION_LOCK_TTL_SEC = 35;
const STATS_KEY_PREFIX = 'api-gateway:cache:stats:';

const DEFAULT_CONFIG: CacheConfig = {
  ttlMs: parseInt(process.env.CACHE_TTL_DEFAULT || '60000'),
  maxSize: 1000,
  keyPrefix: 'api-gateway:cache:',
  varyByHeaders: ['accept-language'],
};

let redisClient: Redis | null = null;
let redisAvailable = false;
let isCacheInitialized = false;
let cacheInitPromise: Promise<void> | null = null;

const memoryCache = new Map<string, CacheEntry>();
let cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  redisErrors: 0,
};

function statIncrBy(field: 'hits' | 'misses' | 'evictions' | 'redisErrors', amount = 1): void {
  cacheStats[field] += amount;
  if (redisAvailable && redisClient) {
    void redisClient.incrby(`${STATS_KEY_PREFIX}${field}`, amount).catch(() => {});
  }
}

async function tryAcquireRevalidationLock(cacheKey: string): Promise<boolean> {
  const lockKey = `${REVALIDATION_LOCK_KEY_PREFIX}${cacheKey}`;
  if (redisAvailable && redisClient) {
    try {
      const result = await redisClient.set(lockKey, '1', 'EX', REVALIDATION_LOCK_TTL_SEC, 'NX');
      return result === 'OK';
    } catch (error) {
      logger.warn('Redis revalidation lock acquire failed, falling back to local set', {
        error: serializeError(error),
      });
    }
  }
  if (revalidationInProgress.has(cacheKey)) return false;
  revalidationInProgress.add(cacheKey);
  return true;
}

async function releaseRevalidationLock(cacheKey: string): Promise<void> {
  revalidationInProgress.delete(cacheKey);
  if (redisAvailable && redisClient) {
    try {
      await redisClient.del(`${REVALIDATION_LOCK_KEY_PREFIX}${cacheKey}`);
    } catch (error) {
      logger.warn('Redis revalidation lock release failed', { error: serializeError(error) });
    }
  }
}

async function initializeRedis(config: CacheConfig['redis']): Promise<void> {
  if (!config) {
    isCacheInitialized = true;
    return;
  }

  try {
    redisClient = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 1,
      retryStrategy: (times: number) => {
        const delay = Math.min(1000 + times * 1000, 30000);
        return delay;
      },
      lazyConnect: true,
    });

    redisClient.on('error', err => {
      logger.warn('Redis cache connection error', { error: err.message });
      redisAvailable = false;
    });

    redisClient.on('ready', () => {
      logger.debug('Redis cache client ready');
      redisAvailable = true;
    });

    await redisClient.connect();
    redisAvailable = true;
    isCacheInitialized = true;
    logger.debug('Redis response cache initialized');
  } catch (error) {
    logger.warn('Failed to initialize Redis cache, using in-memory fallback', {
      error: serializeError(error),
    });
    redisAvailable = false;
    isCacheInitialized = true;
  }
}

function generateCacheKey(req: Request, config: CacheConfig): string {
  const parts: string[] = [config.keyPrefix || DEFAULT_CONFIG.keyPrefix!, req.method, req.originalUrl || req.url];

  const varyHeaders = config.varyByHeaders || DEFAULT_CONFIG.varyByHeaders!;
  for (const header of varyHeaders) {
    const value = req.get(header);
    if (value) {
      parts.push(`${header}:${value}`);
    }
  }

  return parts.join('|');
}

async function getFromCache(key: string): Promise<CacheResult> {
  const now = Date.now();

  if (redisAvailable && redisClient) {
    try {
      const data = await redisClient.get(key);
      if (data) {
        const entry: CacheEntry = JSON.parse(data);
        if (now < entry.expiresAt) {
          return { entry, isStale: false };
        }
        if (entry.staleUntil && now < entry.staleUntil) {
          return { entry, isStale: true };
        }
        await redisClient.del(key);
      }
      return { entry: null, isStale: false };
    } catch (error) {
      statIncrBy('redisErrors');
      logger.warn('Redis cache get error', { error: serializeError(error) });
    }
  }

  const entry = memoryCache.get(key);
  if (entry) {
    if (now < entry.expiresAt) {
      memoryCache.delete(key);
      memoryCache.set(key, entry);
      return { entry, isStale: false };
    }
    if (entry.staleUntil && now < entry.staleUntil) {
      memoryCache.delete(key);
      memoryCache.set(key, entry);
      return { entry, isStale: true };
    }
    memoryCache.delete(key);
  }
  return { entry: null, isStale: false };
}

async function setInCache(key: string, entry: CacheEntry, config: CacheConfig): Promise<void> {
  if (config.staleWhileRevalidateMs) {
    entry.staleUntil = entry.expiresAt + config.staleWhileRevalidateMs;
  }

  if (redisAvailable && redisClient) {
    try {
      const totalTtlMs = config.ttlMs + (config.staleWhileRevalidateMs || 0);
      const ttlSeconds = Math.ceil(totalTtlMs / 1000);
      await redisClient.setex(key, ttlSeconds, JSON.stringify(entry));
      return;
    } catch (error) {
      statIncrBy('redisErrors');
      logger.warn('Redis cache set error', { error: serializeError(error) });
    }
  }

  const maxSize = config.maxSize || DEFAULT_CONFIG.maxSize!;
  while (memoryCache.size >= maxSize) {
    const lruKey = memoryCache.keys().next().value;
    if (lruKey === undefined) break;
    memoryCache.delete(lruKey);
    statIncrBy('evictions');
    trackCacheEviction('response_cache', 'lru_eviction');
    logger.debug('LRU eviction in response cache (size limit {})', { data0: String(maxSize) });
  }

  memoryCache.set(key, entry);
}

async function revalidateInBackground(originalReq: Request, cacheKey: string, config: CacheConfig): Promise<void> {
  try {
    logger.debug('Stale-while-revalidate: starting background refresh', {
      path: originalReq.path,
      cacheKey: cacheKey.substring(0, 50) + '...',
    });

    const http = await import('http');
    const url = new URL(originalReq.originalUrl || originalReq.url, `http://localhost:${process.env.PORT || 3001}`);

    const sanitizedHeaders = { ...(originalReq.headers as Record<string, string | string[] | undefined>) };
    delete sanitizedHeaders['authorization'];
    delete sanitizedHeaders['cookie'];
    delete sanitizedHeaders['x-api-key'];

    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3001,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        ...sanitizedHeaders,
        'x-cache-revalidate': 'true',
        host: 'localhost',
      },
      timeout: 30000,
    };

    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          const entry: CacheEntry = {
            body,
            contentType: res.headers['content-type'] || 'application/json',
            statusCode: res.statusCode,
            headers: {
              'Cache-Control': String(res.headers['cache-control'] || ''),
              ETag: String(res.headers['etag'] || ''),
            },
            cachedAt: Date.now(),
            expiresAt: Date.now() + config.ttlMs,
          };
          void setInCache(cacheKey, entry, config);
          logger.debug('Stale-while-revalidate: cache refreshed', { path: originalReq.path });
        }
        void releaseRevalidationLock(cacheKey);
      });
    });

    req.on('error', error => {
      logger.warn('Stale-while-revalidate: background refresh failed', {
        path: originalReq.path,
        error: error.message,
      });
      void releaseRevalidationLock(cacheKey);
    });

    req.on('timeout', () => {
      req.destroy();
      void releaseRevalidationLock(cacheKey);
    });

    req.end();
  } catch (error) {
    logger.warn('Stale-while-revalidate: failed to start background refresh', {
      error: serializeError(error),
    });
    void releaseRevalidationLock(cacheKey);
  }
}

function buildCdnCacheControlHeader(cdn: CDNCacheConfig, statusCode: number): string {
  if (statusCode >= 400 || cdn.noStore) {
    return 'no-store';
  }
  const parts: string[] = [cdn.scope || 'public'];
  if (cdn.maxAgeSec !== undefined) {
    parts.push(`max-age=${cdn.maxAgeSec}`);
  }
  if (cdn.sMaxAgeSec !== undefined) {
    parts.push(`s-maxage=${cdn.sMaxAgeSec}`);
  }
  if (cdn.staleWhileRevalidateSec !== undefined) {
    parts.push(`stale-while-revalidate=${cdn.staleWhileRevalidateSec}`);
  }
  return parts.join(', ');
}

function computeETag(body: string): string {
  return `"${crypto.createHash('md5').update(body).digest('hex').slice(0, 16)}"`;
}

export function createResponseCacheMiddleware(
  config: Partial<CacheConfig> = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const mergedConfig: CacheConfig = { ...DEFAULT_CONFIG, ...config };

  if (mergedConfig.redis) {
    cacheInitPromise = initializeRedis(mergedConfig.redis);
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (cacheInitPromise && !isCacheInitialized) {
      await cacheInitPromise;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    if (req.headers['x-cache-revalidate'] === 'true') {
      return next();
    }

    // Allow cache bypass via standard Cache-Control header or custom header
    // Librarians/admins can use this to see fresh content immediately after publishing
    if (req.headers['cache-control'] === 'no-cache' || req.headers['x-bypass-cache'] === 'true') {
      res.set('X-Cache', 'BYPASS');
      return next();
    }

    if (mergedConfig.excludeWhen && mergedConfig.excludeWhen(req)) {
      return next();
    }

    const cacheKey = generateCacheKey(req, mergedConfig);

    try {
      const { entry: cached, isStale } = await getFromCache(cacheKey);

      if (cached) {
        statIncrBy('hits');
        trackCacheHit(req.path, redisAvailable ? 'redis' : 'memory');
        res.set('X-Cache', isStale ? 'STALE' : 'HIT');
        res.set('X-Cache-Age', String(Math.floor((Date.now() - cached.cachedAt) / 1000)));
        res.set('Content-Type', cached.contentType);

        for (const [key, value] of Object.entries(cached.headers)) {
          res.set(key, value);
        }

        res.status(cached.statusCode).send(cached.body);

        if (isStale) {
          tryAcquireRevalidationLock(cacheKey)
            .then(acquired => {
              if (acquired) void revalidateInBackground(req, cacheKey, mergedConfig);
            })
            .catch(() => {});
        }
        return;
      }
    } catch (error) {
      logger.warn('Cache lookup error', { error: serializeError(error) });
    }

    statIncrBy('misses');
    trackCacheMiss(req.path, redisAvailable ? 'redis' : 'memory');
    res.set('X-Cache', 'MISS');

    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);
    let responseBody: string = '';

    res.send = function (body: unknown): Response {
      responseBody = typeof body === 'string' ? body : JSON.stringify(body);

      const cdnEnabled = isFeatureEnabled(FEATURE_FLAGS.CDN_CACHE_HEADERS);
      if (cdnEnabled && mergedConfig.cdn) {
        const ccHeader = buildCdnCacheControlHeader(mergedConfig.cdn, res.statusCode);
        res.set('Cache-Control', ccHeader);

        const varyFields = mergedConfig.varyByHeaders?.filter(h => h !== 'authorization') || [];
        if (varyFields.length > 0) {
          res.set('Vary', varyFields.join(', '));
        }

        if (responseBody && res.statusCode >= 200 && res.statusCode < 300) {
          res.set('ETag', computeETag(responseBody));
        }
      }

      if (cdnEnabled && res.statusCode >= 400 && !res.get('Cache-Control')) {
        res.set('Cache-Control', 'no-store');
      }

      return originalSend(body);
    };

    res.json = function (body: unknown): Response {
      if (!res.get('Content-Type')) {
        res.set('Content-Type', 'application/json');
      }
      return res.send(JSON.stringify(body));
    };

    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300 && responseBody) {
        const entry: CacheEntry = {
          body: responseBody,
          contentType: res.get('Content-Type') || 'application/json',
          statusCode: res.statusCode,
          headers: {
            'Cache-Control': res.get('Cache-Control') || '',
            ETag: res.get('ETag') || '',
          },
          cachedAt: Date.now(),
          expiresAt: Date.now() + mergedConfig.ttlMs,
        };

        void setInCache(cacheKey, entry, mergedConfig);
      }
    });

    next();
  };
}

export const CACHE_PRESETS = {
  catalog: {
    ttlMs: parseInt(process.env.CACHE_TTL_CATALOG || '60000'),
    staleWhileRevalidateMs: parseInt(process.env.CACHE_STALE_CATALOG || '120000'),
    varyByHeaders: ['authorization', 'accept-language'],
    cdn: { scope: 'private' as const, sMaxAgeSec: 60, maxAgeSec: 30, staleWhileRevalidateSec: 120 },
  },
  config: {
    ttlMs: parseInt(process.env.CACHE_TTL_PROVIDERS || '600000'),
    varyByHeaders: [],
    cdn: { scope: 'public' as const, sMaxAgeSec: 600, maxAgeSec: 300 },
  },
  library: {
    ttlMs: parseInt(process.env.CACHE_TTL_LIBRARY || '60000'),
    varyByHeaders: ['authorization', 'accept-language'],
    excludeWhen: (req: Request) => !req.headers.authorization,
    cdn: { scope: 'private' as const, maxAgeSec: 60 },
  },
  explore: {
    ttlMs: parseInt(process.env.CACHE_TTL_EXPLORE || '120000'),
    staleWhileRevalidateMs: parseInt(process.env.CACHE_STALE_EXPLORE || '300000'),
    varyByHeaders: ['authorization', 'accept-language'],
    excludeWhen: (req: Request) => !req.headers.authorization,
    cdn: { scope: 'private' as const, maxAgeSec: 120, staleWhileRevalidateSec: 300 },
  },
  genres: {
    ttlMs: parseInt(process.env.CACHE_TTL_STATIC || '3600000'),
    varyByHeaders: ['accept-language'],
    cdn: { scope: 'public' as const, sMaxAgeSec: 3600, maxAgeSec: 1800 },
  },
  moods: {
    ttlMs: parseInt(process.env.CACHE_TTL_STATIC || '3600000'),
    varyByHeaders: ['accept-language'],
    cdn: { scope: 'public' as const, sMaxAgeSec: 3600, maxAgeSec: 1800 },
  },
  templates: {
    ttlMs: parseInt(process.env.CACHE_TTL_TEMPLATES || '1800000'),
    varyByHeaders: ['accept-language'],
    cdn: { scope: 'public' as const, sMaxAgeSec: 1800, maxAgeSec: 900 },
  },
  staticMetadata: {
    ttlMs: parseInt(process.env.CACHE_TTL_STATIC || '3600000'),
    varyByHeaders: ['accept-language'],
    cdn: { scope: 'public' as const, sMaxAgeSec: 86400, maxAgeSec: 3600, staleWhileRevalidateSec: 86400 },
  },
};

export async function getCacheStats(): Promise<typeof cacheStats & { memoryCacheSize: number }> {
  if (redisAvailable && redisClient) {
    try {
      const fields = ['hits', 'misses', 'evictions', 'redisErrors'] as const;
      const values = await redisClient.mget(fields.map(f => `${STATS_KEY_PREFIX}${f}`));
      return {
        hits: parseInt(values[0] ?? '0') || 0,
        misses: parseInt(values[1] ?? '0') || 0,
        evictions: parseInt(values[2] ?? '0') || 0,
        redisErrors: parseInt(values[3] ?? '0') || 0,
        memoryCacheSize: memoryCache.size,
      };
    } catch {}
  }
  return { ...cacheStats, memoryCacheSize: memoryCache.size };
}

export function clearCache(): void {
  memoryCache.clear();
  cacheStats = { hits: 0, misses: 0, evictions: 0, redisErrors: 0 };
  if (redisAvailable && redisClient) {
    const fields = ['hits', 'misses', 'evictions', 'redisErrors'];
    void redisClient.del(fields.map(f => `${STATS_KEY_PREFIX}${f}`)).catch(() => {});
  }
  logger.info('Response cache cleared');
}

export async function invalidateCachePattern(pattern: string): Promise<number> {
  let count = 0;

  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
      count++;
    }
  }

  if (redisAvailable && redisClient) {
    try {
      const luaScript = `
        local keys = redis.call('KEYS', ARGV[1])
        if #keys > 0 then
          return redis.call('DEL', unpack(keys))
        end
        return 0
      `;
      const deleted = (await redisClient.eval(luaScript, 0, `*${pattern}*`)) as number;
      count += deleted;
    } catch (error) {
      logger.warn('Redis cache invalidation error', { error: serializeError(error) });
    }
  }

  logger.info('Cache invalidated', { pattern, count });
  return count;
}

export async function shutdownResponseCache(): Promise<void> {
  if (redisClient && redisAvailable) {
    try {
      await redisClient.quit();
      logger.info('Response cache Redis connection closed');
    } catch (error) {
      logger.warn('Error closing response cache Redis connection', {
        error: serializeError(error),
      });
    }
  }
  memoryCache.clear();
}
