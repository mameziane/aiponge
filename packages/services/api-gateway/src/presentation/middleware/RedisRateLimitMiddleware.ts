import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis, { Cluster as RedisCluster } from 'ioredis';
import { getLogger } from '../../config/service-urls';
import { EventEmitter } from 'events';
import { RATE_LIMIT } from '@aiponge/shared-contracts';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('api-gateway-redis-ratelimit');

const redisStateEmitter = new EventEmitter();
redisStateEmitter.setMaxListeners(10);

export type RedisStateEvent =
  | { type: 'connecting'; attempt: number }
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'failed'; attempt: number; retryIn: number };

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  authenticatedMaxRequests?: number;
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
}

let redisClient: Redis | RedisCluster | null = null;
let redisAvailable = false;
let isConnecting = false;
let retryTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let redisLimiter: ReturnType<typeof rateLimit> | null = null;

const MIN_RETRY_DELAY = RATE_LIMIT.MIN_RETRY_DELAY_MS;
const MAX_RETRY_DELAY = RATE_LIMIT.MAX_RETRY_DELAY_MS;

function getRetryDelay(): number {
  const baseDelay = Math.min(MIN_RETRY_DELAY * Math.pow(2, retryAttempt), MAX_RETRY_DELAY);
  const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.floor(baseDelay + jitter);
}

async function initializeRedisClient(config: RateLimitConfig['redis']): Promise<void> {
  if (!config) return;

  isConnecting = true;
  redisStateEmitter.emit('state-change', { type: 'connecting', attempt: retryAttempt + 1 } as RedisStateEvent);

  try {
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (error) {
        logger.warn('Failed to quit existing Redis client during re-initialization', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      redisClient = null;
    }

    const clusterNodes = process.env.REDIS_CLUSTER_NODES;
    if (clusterNodes) {
      const nodes = clusterNodes.split(',').map(node => {
        const [host, port] = node.trim().split(':');
        return { host, port: parseInt(port || '6379') };
      });
      redisClient = new RedisCluster(nodes, {
        redisOptions: { password: config.password },
        scaleReads: 'slave',
      });
    } else {
      redisClient = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db || 0,
        retryStrategy: times => Math.min(1000 + times * 1000, 30000),
        lazyConnect: true,
      });
    }

    redisClient.on('error', (err: Error) => {
      logger.debug('Redis connection error', { error: err.message });
      redisAvailable = false;
    });

    redisClient.on('ready', () => {
      logger.debug('Redis client ready for rate limiting');
      isConnecting = false;
      redisAvailable = true;
      retryAttempt = 0;
      if (retryTimeoutHandle) {
        clearTimeout(retryTimeoutHandle);
        retryTimeoutHandle = null;
      }
      redisStateEmitter.emit('state-change', { type: 'connected' } as RedisStateEvent);
    });

    redisClient.on('end', () => {
      logger.debug('Redis connection ended');
      isConnecting = false;
      redisAvailable = false;
      redisLimiter = null;
      redisStateEmitter.emit('state-change', { type: 'disconnected' } as RedisStateEvent);
    });

    if (!clusterNodes) {
      await (redisClient as Redis).connect();
    }

    isConnecting = false;
    redisAvailable = true;
    logger.debug('Redis rate limiting initialized successfully');
    redisStateEmitter.emit('state-change', { type: 'connected' } as RedisStateEvent);
  } catch (error) {
    logger.debug(`Failed to connect to Redis (attempt ${retryAttempt + 1})`, { error: serializeError(error) });
    isConnecting = false;
    redisAvailable = false;
    redisClient = null;
    redisLimiter = null;

    const retryDelay = getRetryDelay();
    retryAttempt++;
    redisStateEmitter.emit('state-change', {
      type: 'failed',
      attempt: retryAttempt,
      retryIn: retryDelay,
    } as RedisStateEvent);
    retryTimeoutHandle = setTimeout(() => {
      initializeRedisClient(config);
    }, retryDelay);
  }
}

export function createRedisRateLimitMiddleware(config: RateLimitConfig) {
  if (config.redis) {
    initializeRedisClient(config.redis);
  }

  const prefix = config.redis?.keyPrefix || 'api-gateway:ratelimit:';

  const FALLBACK_DIVISOR =
    process.env.NODE_ENV === 'production' ? parseInt(process.env.RATE_LIMIT_FALLBACK_DIVISOR || '4', 10) : 1;

  const maxFn = (req: Request, res: Response) => {
    const userId = res.locals.userId as string | undefined;
    if (userId && config.authenticatedMaxRequests) return config.authenticatedMaxRequests;
    return config.maxRequests;
  };

  const fallbackMaxFn = (req: Request, res: Response) => {
    const userId = res.locals.userId as string | undefined;
    const base = userId && config.authenticatedMaxRequests ? config.authenticatedMaxRequests : config.maxRequests;
    return Math.ceil(base / FALLBACK_DIVISOR);
  };

  const keyGenFn = (req: Request, res: Response) => {
    const userId = res.locals.userId as string | undefined;
    if (userId) return `user:${userId}`;
    return `ip:${extractClientIP(req)}`;
  };

  const commonOpts = {
    windowMs: config.windowMs,
    keyGenerator: keyGenFn,
    passOnStoreError: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
    },
  };

  const fallbackLimiter = rateLimit({ ...commonOpts, max: fallbackMaxFn });

  if (process.env.NODE_ENV === 'production' && FALLBACK_DIVISOR > 1) {
    logger.warn('In-memory rate limit fallback uses reduced limits', {
      divisor: FALLBACK_DIVISOR,
    });
  }

  return (req: Request, res: Response, next: () => void) => {
    if (redisAvailable && redisClient) {
      if (!redisLimiter) {
        redisLimiter = rateLimit({
          ...commonOpts,
          max: maxFn,
          store: new RedisStore({
            sendCommand: (...args: string[]) =>
              (redisClient as Redis).call(...(args as [string, ...string[]])) as Promise<string>,
            prefix,
          }),
        });
      }
      return redisLimiter(req, res, next);
    }

    return fallbackLimiter(req, res, next);
  };
}

function extractClientIP(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = (typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0]).split(',');
    return ips[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') return realIp.trim();
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp && typeof cfIp === 'string') return cfIp.trim();
  return req.ip || 'unknown';
}

export async function shutdownRedisRateLimit(): Promise<void> {
  if (retryTimeoutHandle) {
    clearTimeout(retryTimeoutHandle);
    retryTimeoutHandle = null;
  }
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis rate limit connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis rate limit connection', { error: serializeError(error) });
    }
  }
}

export function getRedisRateLimitStatus() {
  return {
    connected: redisClient !== null,
    available: redisAvailable && (redisClient?.status === 'ready' || false),
    isConnecting,
    retryAttempt,
  };
}

export async function waitForRedisSettled(timeoutMs: number = 3000): Promise<void> {
  if (redisAvailable) return;
  const start = Date.now();
  while (isConnecting && Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

export function onRedisStateChange(callback: (event: RedisStateEvent) => void): () => void {
  redisStateEmitter.on('state-change', callback);
  return () => redisStateEmitter.off('state-change', callback);
}

export function cleanupRedisStateListeners(): void {
  redisStateEmitter.removeAllListeners('state-change');
}

export function getSharedRedisClient(): Redis | RedisCluster | null {
  return redisClient;
}

export function isSharedRedisReady(): boolean {
  return redisAvailable && (redisClient?.status === 'ready' || false);
}
