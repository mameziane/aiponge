import type express from 'express';
import { GatewayConfig as GwConfig } from '../config/GatewayConfig';
import { rateLimitMiddleware } from '../presentation/middleware/RateLimitMiddleware';
import {
  createRedisRateLimitMiddleware,
  onRedisStateChange,
} from '../presentation/middleware/RedisRateLimitMiddleware';
import { optionalJwtAuthMiddleware } from '../presentation/middleware/jwtAuthMiddleware';
import type { GatewayAppContext } from './context';

export function setupRateLimiting(app: express.Application, ctx: GatewayAppContext): void {
  const apiLimit = ctx.redisConfig.isEnabled
    ? createRedisRateLimitMiddleware({
        windowMs: GwConfig.rateLimit.defaults.windowMs,
        maxRequests: GwConfig.rateLimit.defaults.maxRequests,
        authenticatedMaxRequests: GwConfig.rateLimit.defaults.maxRequests * 2,
        redis: ctx.redisConfig.redis,
      })
    : rateLimitMiddleware({
        windowMs: GwConfig.rateLimit.defaults.windowMs,
        maxRequests: GwConfig.rateLimit.defaults.maxRequests,
        authenticatedMaxRequests: GwConfig.rateLimit.defaults.maxRequests * 2,
      });

  if (ctx.redisConfig.isEnabled) {
    let loggedConnected = false;

    const unsubscribe = onRedisStateChange(event => {
      switch (event.type) {
        case 'connected':
          if (!loggedConnected) {
            ctx.logger.info('Rate limiting: Redis connected');
            loggedConnected = true;
          }
          break;
        case 'disconnected':
        case 'failed':
          if (loggedConnected) {
            ctx.logger.warn('Rate limiting: Redis disconnected, using in-memory fallback');
            loggedConnected = false;
          }
          break;
      }
    });
    (app as unknown as Record<string, unknown>)._redisUnsubscribe = unsubscribe;
  } else {
    ctx.logger.debug('In-memory rate limiting enabled (development mode)');
  }

  app.use('/api/v1', optionalJwtAuthMiddleware, apiLimit);
}
