/**
 * Rate Limiting Middleware
 * Configurable rate limiting for different endpoint types
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('rate-limit');

export interface RateLimitConfig {
  windowMs?: number;
  max?: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  skip?: (req: Request, res: Response) => boolean;
}

// Default rate limit configurations for different endpoint types
const rateLimitConfigs: Record<string, RateLimitConfig> = {
  'music-generation': {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    message: 'Too many music generation requests. Please try again later.',
    standardHeaders: true,

    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },

  'audio-processing': {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute
    message: 'Too many audio processing requests. Please try again later.',
    standardHeaders: true,
  },

  'status-check': {
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: 'Too many status check requests. Please try again later.',
    standardHeaders: true,
  },

  'result-access': {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many result access requests. Please try again later.',
    standardHeaders: true,
  },

  'template-operations': {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: 'Too many template operations. Please try again later.',
    standardHeaders: true,
  },

  analytics: {
    windowMs: 60 * 1000, // 1 minute
    max: 50, // 50 requests per minute
    message: 'Too many analytics requests. Please try again later.',
    standardHeaders: true,
  },

  'library-operations': {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many library operations. Please try again later.',
    standardHeaders: true,
  },

  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 minutes
    message: 'Too many requests. Please try again later.',
    standardHeaders: true,
  },
};

/**
 * Rate limiting middleware factory
 */
export function rateLimitMiddleware(configKey: string, customConfig?: RateLimitConfig) {
  const baseConfig = rateLimitConfigs[configKey] || rateLimitConfigs['general'];
  const finalConfig = { ...baseConfig, ...customConfig };

  return rateLimit({
    windowMs: finalConfig.windowMs,
    max: finalConfig.max,
    message: finalConfig.message,
    standardHeaders: finalConfig.standardHeaders,
    legacyHeaders: finalConfig.legacyHeaders,
    skipSuccessfulRequests: finalConfig.skipSuccessfulRequests,
    skipFailedRequests: finalConfig.skipFailedRequests,
    skip: finalConfig.skip,
    keyGenerator: (req: Request): string => {
      const userId = (req as Request & { user?: { id?: string } }).user?.id;
      return userId || req.ip || 'unknown';
    },
    handler: (req: Request, res: Response) => {
      logger.warn('🚦 Rate limit exceeded', {
        module: 'rate_limit',
        operation: 'onLimitReached',
        clientIP: req.ip,
        path: req.path,
        phase: 'rate_limit_exceeded',
      });
      const msg = typeof finalConfig.message === 'string' ? finalConfig.message : 'Too many requests';
      StructuredErrors.rateLimited(res, msg, {
        service: 'music-service',
        correlationId: getCorrelationId(req),
      });
    },
  });
}

/**
 * Global rate limiter for all endpoints
 */
export const globalRateLimit = rateLimitMiddleware('general');

/**
 * Stricter rate limiter for expensive operations
 */
export const strictRateLimit = rateLimitMiddleware('music-generation', {
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: 'Rate limit exceeded for this expensive operation. Please try again later.',
});

/**
 * Lenient rate limiter for read operations
 */
export const lenientRateLimit = rateLimitMiddleware('general', {
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute
  message: 'Rate limit exceeded. Please try again later.',
});

/**
 * Development rate limiter (more permissive)
 */
export const developmentRateLimit = rateLimitMiddleware('general', {
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'development' ? 10000 : 100, // Very high limit in development
  skip: (req: Request) => process.env.NODE_ENV === 'development' && req.path.includes('/dev'),
});
