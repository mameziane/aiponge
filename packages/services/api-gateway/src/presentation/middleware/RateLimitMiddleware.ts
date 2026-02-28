import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { extractAuthContext } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('api-gateway:ratelimit');

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  authenticatedMaxRequests?: number;
  keyType?: 'per-user' | 'per-ip' | 'global';
  segment?: string;
}

export function rateLimitMiddleware(
  config: RateLimitConfig
): (req: Request, res: Response, next: NextFunction) => void {
  const isProduction = process.env.NODE_ENV === 'production';
  const FALLBACK_DIVISOR = isProduction
    ? parseInt(process.env.RATE_LIMIT_FALLBACK_DIVISOR || '4', 10)
    : parseInt(process.env.RATE_LIMIT_FALLBACK_DIVISOR || '1', 10);
  const effectiveMax = Math.ceil(config.maxRequests / FALLBACK_DIVISOR);
  const effectiveAuthMax = config.authenticatedMaxRequests
    ? Math.ceil(config.authenticatedMaxRequests / FALLBACK_DIVISOR)
    : undefined;

  if (isProduction && FALLBACK_DIVISOR > 1) {
    logger.warn('Rate limiter operating in degraded in-memory mode', {
      originalMax: config.maxRequests,
      effectiveMax,
      divisor: FALLBACK_DIVISOR,
    });
  }

  const limiter = rateLimit({
    windowMs: config.windowMs,
    max: (req: Request, res: Response) => {
      const userId = res.locals.userId as string | undefined;
      if (userId && effectiveAuthMax) return effectiveAuthMax;
      return effectiveMax;
    },
    keyGenerator: (req: Request, res: Response) => {
      const keyType = config.keyType || 'per-ip';
      const segment = config.segment || '';

      const userId = res.locals.userId as string | undefined;
      if (userId) {
        const key = `user:${userId}`;
        return segment ? `${segment}:${key}` : key;
      }

      let baseKey: string;
      switch (keyType) {
        case 'per-user':
          baseKey = extractAuthContext(req).userId || `ip:${req.ip || 'unknown'}`;
          break;
        case 'global':
          baseKey = 'global';
          break;
        case 'per-ip':
        default:
          baseKey = `ip:${req.ip || 'unknown'}`;
      }

      return segment ? `${segment}:${baseKey}` : baseKey;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
    },
  });

  return limiter;
}
