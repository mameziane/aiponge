import type express from 'express';
import { GatewayConfig as GwConfig } from '../config/GatewayConfig';
import { rateLimitMiddleware } from '../presentation/middleware/RateLimitMiddleware';
import { createRedisRateLimitMiddleware } from '../presentation/middleware/RedisRateLimitMiddleware';
import { authRoutes } from '../presentation/routes/auth.routes';
import type { GatewayAppContext } from './context';

export function setupAuthProxy(app: express.Application, ctx: GatewayAppContext): void {
  const authLimit = ctx.redisConfig.isEnabled
    ? createRedisRateLimitMiddleware({
        windowMs: 15 * 60 * 1000,
        maxRequests: 50,
        redis: ctx.redisConfig.redis,
      })
    : rateLimitMiddleware({
        windowMs: 15 * 60 * 1000,
        maxRequests: 50,
      });

  app.use('/api/v1/auth', authLimit, authRoutes);
  ctx.logger.debug('✅ Auth proxy mounted before body parsing');
}
