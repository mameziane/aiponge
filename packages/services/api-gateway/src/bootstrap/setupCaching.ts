import type express from 'express';
import { createResponseCacheMiddleware, CACHE_PRESETS } from '../presentation/middleware/ResponseCacheMiddleware';
import type { GatewayAppContext } from './context';

export function setupCaching(app: express.Application, ctx: GatewayAppContext): void {
  const cacheTemplates = createResponseCacheMiddleware({
    ...CACHE_PRESETS.templates,
    ...ctx.cacheConfig,
  });

  const cacheProviders = createResponseCacheMiddleware({
    ...CACHE_PRESETS.config,
    ...ctx.cacheConfig,
  });

  app.use('/api/v1/templates', cacheTemplates);
  app.use('/api/v1/providers', cacheProviders);
}
