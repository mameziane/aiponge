import type express from 'express';
import { GatewayConfig as GwConfig } from '../config/GatewayConfig';
import { createIdempotencyMiddleware } from '../presentation/middleware/IdempotencyMiddleware';
import {
  getSharedRedisClient,
  isSharedRedisReady,
  waitForRedisSettled,
} from '../presentation/middleware/RedisRateLimitMiddleware';
import type { GatewayAppContext } from './context';

export function setupIdempotency(app: express.Application, _ctx: GatewayAppContext): void {
  const idempotencyMw = createIdempotencyMiddleware(
    { redis: GwConfig.rateLimit.redis },
    getSharedRedisClient,
    isSharedRedisReady,
    waitForRedisSettled
  );
  app.use('/api/v1', idempotencyMw);
}
