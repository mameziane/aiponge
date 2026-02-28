import type { Logger } from '@aiponge/platform-core';
import { GatewayCore } from '../services/GatewayCore';
import { GatewayRoutes } from '../presentation/routes/GatewayRoutes';
import { HealthRoutes } from '../presentation/routes/health.routes';
import { DynamicRouter } from '../services/DynamicRouter';
import { DynamicRoutesHandler } from '../presentation/routes/dynamic.routes';
import { GatewayConfig as GwConfig } from '../config/GatewayConfig';
import { environmentConfig } from '../config/environment';
import { getLogger } from '../config/service-urls';

export interface GatewayAppContext {
  logger: Logger;
  corsOrigins: string[];
  gatewayCore: GatewayCore;
  dynamicRouter: DynamicRouter;
  dynamicRoutesHandler: DynamicRoutesHandler;
  gatewayRoutes: GatewayRoutes;
  healthRoutes: HealthRoutes;
  redisConfig: {
    isEnabled: boolean;
    redis: (typeof GwConfig.rateLimit)['redis'];
  };
  cacheConfig: Record<string, unknown>;
}

export function buildGatewayContext(): GatewayAppContext {
  const logger = getLogger('api-gateway-app');

  const corsOrigins =
    environmentConfig.corsOrigins.length > 0
      ? environmentConfig.corsOrigins
      : environmentConfig.corsFrontendPorts.map(port => `http://${environmentConfig.corsFrontendHost}:${port}`);

  const gatewayCore = new GatewayCore({
    proxyTimeout: environmentConfig.defaultRequestTimeoutMs,
    retries: environmentConfig.defaultRetries,
  });

  const dynamicRouter = new DynamicRouter();
  const dynamicRoutesHandler = new DynamicRoutesHandler(dynamicRouter);
  const gatewayRoutes = new GatewayRoutes(gatewayCore);
  const healthRoutes = new HealthRoutes();

  const redisConfig = {
    isEnabled: GwConfig.rateLimit.isRedisEnabled,
    redis: GwConfig.rateLimit.redis,
  };

  const cacheConfig = redisConfig.isEnabled ? { redis: redisConfig.redis } : {};

  return {
    logger,
    corsOrigins,
    gatewayCore,
    dynamicRouter,
    dynamicRoutesHandler,
    gatewayRoutes,
    healthRoutes,
    redisConfig,
    cacheConfig,
  };
}
