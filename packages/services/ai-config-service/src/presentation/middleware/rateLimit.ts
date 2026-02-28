/**
 * Rate Limiting Middleware
 * Implements rate limiting and request throttling for API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../../config/service-urls';
import { serializeError, createIntervalScheduler } from '@aiponge/platform-core';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';

const logger = getLogger('rate-limit-middleware');

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (_req: Request) => string;
}

/**
 * In-memory rate limit store (in production, use Redis or similar)
 */
class InMemoryRateLimitStore {
  private store: RateLimitStore = {};

  get(key: string): { count: number; resetTime: number } | undefined {
    const entry = this.store[key];
    if (!entry) return undefined;

    // Clean expired entries
    if (Date.now() > entry.resetTime) {
      delete this.store[key];
      return undefined;
    }

    return entry;
  }

  increment(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now();
    const entry = this.store[key];

    if (!entry || now > entry.resetTime) {
      this.store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
    } else {
      this.store[key].count++;
    }

    return this.store[key];
  }

  reset(key: string): void {
    delete this.store[key];
  }

  // Clean up expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of Object.entries(this.store)) {
      if (now > entry.resetTime) {
        delete this.store[key];
      }
    }
  }
}

const store = new InMemoryRateLimitStore();

// Clean up expired entries every 5 minutes
const rateLimitCleanupScheduler = createIntervalScheduler({
  name: 'rate-limit-cleanup',
  serviceName: 'ai-config-service',
  intervalMs: 5 * 60 * 1000,
  handler: () => store.cleanup(),
});
rateLimitCleanupScheduler.start();

/**
 * Create rate limiting middleware
 */
export function createRateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = defaultKeyGenerator,
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyGenerator(req);
      const entry = store.increment(key, windowMs);

      if (entry.count > maxRequests) {
        const resetTimeSeconds = Math.ceil((entry.resetTime - Date.now()) / 1000);

        res.set({
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(entry.resetTime / 1000).toString(),
          'Retry-After': resetTimeSeconds.toString(),
        });

        logger.warn('Rate limit exceeded', {
          key,
          currentCount: entry.count,
          maxRequests,
          resetTimeSeconds,
        });

        return StructuredErrors.rateLimited(res, 'Too many requests, please slow down', {
          service: 'ai-config-service',
          correlationId: getCorrelationId(req),
          details: {
            retryAfter: resetTimeSeconds,
            limit: maxRequests,
            windowMs,
          },
        });
      }

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, maxRequests - entry.count).toString(),
        'X-RateLimit-Reset': Math.ceil(entry.resetTime / 1000).toString(),
      });

      // If configured to skip on success/failure, intercept response
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalEnd = res.end.bind(res);
        let responseEnded = false;

        (res as unknown as Record<string, unknown>).end = function (this: Response, ...args: unknown[]) {
          if (!responseEnded) {
            responseEnded = true;

            const shouldSkip =
              (skipSuccessfulRequests && res.statusCode < 400) || (skipFailedRequests && res.statusCode >= 400);

            if (shouldSkip) {
              // Decrement count since we're skipping this request
              const currentEntry = store.get(key);
              if (currentEntry && currentEntry.count > 0) {
                currentEntry.count--;
              }
            }
          }

          return (originalEnd as (...a: unknown[]) => Response).apply(this, args);
        };
      }

      next();
    } catch (error) {
      logger.error('Rate limit middleware error', {
        error: serializeError(error),
      });
      next(error);
    }
  };
}

/**
 * Default key generator - use IP address and service ID
 */
function defaultKeyGenerator(req: Request): string {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const serviceId = (req as Request & { auth?: { serviceId?: string } }).auth?.serviceId || 'anonymous';
  return `${ip}:${serviceId}`;
}

/**
 * Key generator based on service ID only
 */
function serviceKeyGenerator(req: Request): string {
  return (req as Request & { auth?: { serviceId?: string } }).auth?.serviceId || 'anonymous';
}

/**
 * Key generator based on API key
 */
function _apiKeyGenerator(req: Request): string {
  const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '');
  return apiKey?.substring(0, 12) || 'anonymous';
}

/**
 * Default rate limiting middleware for all routes
 */
export const rateLimitMiddleware = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute per service
  keyGenerator: serviceKeyGenerator,
});

/**
 * Strict rate limiting for expensive operations
 */
export const strictRateLimitMiddleware = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20, // 20 requests per minute per service
  keyGenerator: serviceKeyGenerator,
});

/**
 * Lenient rate limiting for health checks and monitoring
 */
export const lenientRateLimitMiddleware = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 300, // 300 requests per minute per service
  keyGenerator: serviceKeyGenerator,
  skipSuccessfulRequests: true, // Don't count successful health checks
});

/**
 * IP-based rate limiting for public endpoints
 */
export const ipRateLimitMiddleware = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 50, // 50 requests per 15 minutes per IP
  keyGenerator: defaultKeyGenerator,
});

/**
 * Burst protection middleware for high-frequency operations
 */
export const burstProtectionMiddleware = createRateLimit({
  windowMs: 10 * 1000, // 10 seconds
  maxRequests: 10, // 10 requests per 10 seconds
  keyGenerator: serviceKeyGenerator,
});
