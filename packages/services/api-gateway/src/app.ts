/**
 * API Gateway Service - Application Bootstrap
 *
 * Creates the Express application with all middleware and routes.
 * Each setup function handles a single concern; ordering is explicit
 * and documented inline. See src/bootstrap/ for individual modules.
 */

import express from 'express';
import { initSentry } from '@aiponge/platform-core';

import {
  buildGatewayContext,
  setupSecurity,
  setupAuthProxy,
  setupBodyParsing,
  setupMetrics,
  setupRateLimiting,
  setupIdempotency,
  setupSse,
  setupStaticRoutes,
  setupCaching,
  setupContractVersioning,
  setupDevEndpoints,
  setupRouting,
  setupErrorHandling,
} from './bootstrap';

initSentry('api-gateway');

export interface GatewayConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
  };
  services: ServiceConfig[];
}

export interface ServiceConfig {
  name: string;
  host: string;
  port: number;
  healthEndpoint?: string;
  basePath?: string;
  url: string;
  version: string;
  timeout: number;
  retries: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Create the API Gateway Express app with all middleware and routing.
 *
 * The ordering below is intentional and security-critical:
 * 1. Security headers and CORS first
 * 2. Auth proxy BEFORE body parsing (streams must not be consumed)
 * 3. Body parsing + pagination
 * 4. Metrics collection
 * 5. Rate limiting (needs optional JWT to identify authenticated users)
 * 6. Idempotency (shares Redis with rate limiting)
 * 7. SSE real-time events
 * 8. Static routes (root health, legal pages)
 * 9. Response caching (before dynamic router)
 * 10. Dev-only endpoints (before dynamic router to avoid auth)
 * 11. All route groups (service registration → health → dynamic → persona → gateway → compat)
 * 12. Error handling (must be last)
 */
export function createApp(): express.Application {
  const app = express();
  const ctx = buildGatewayContext();

  setupSecurity(app, ctx);
  setupAuthProxy(app, ctx); // BEFORE body parsing — stream must not be consumed
  setupBodyParsing(app, ctx);
  setupMetrics(app, ctx);
  setupRateLimiting(app, ctx); // optional JWT → rate limits → Redis monitoring
  setupIdempotency(app, ctx);
  setupSse(app, ctx);
  setupStaticRoutes(app, ctx);
  setupCaching(app, ctx); // BEFORE dynamic router for cache hits
  setupContractVersioning(app, ctx);
  setupDevEndpoints(app, ctx); // BEFORE dynamic router to avoid auth middleware
  setupRouting(app, ctx); // registration → health → dynamic → admin/librarian/app → gateway → compat
  setupErrorHandling(app, ctx); // MUST be last

  app.set('gatewayCore', ctx.gatewayCore);

  return app;
}

export { GatewayCore } from './services/GatewayCore';
export { GatewayRoutes } from './presentation/routes/GatewayRoutes';
export { rateLimitMiddleware } from './presentation/middleware/RateLimitMiddleware';
