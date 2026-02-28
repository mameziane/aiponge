// Load environment variables first (never override Replit Secrets)
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
config({ path: resolve(process.cwd(), '.env'), override: false });

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set MaxListeners before any imports or EventEmitter setup
process.setMaxListeners(15);

/**
 * API Gateway - Migrated to use modular packages
 * Centralized gateway with orchestration support
 */

import {
  createStandardBootstrap,
  createLogger,
  createStandardHealthManager,
  ServiceLocator,
  logAndTrackError,
  setupGracefulShutdown,
  registerShutdownHook,
  getSSEManager,
  initTracing,
  initValidation,
} from '@aiponge/platform-core';
import { contractRegistry, CURRENT_CONTRACT_VERSION } from '@aiponge/shared-contracts';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createApp } from './app';
import { SERVICE_URLS } from './config/service-urls.js';

// Event subscribers
import { startSystemEventSubscriber } from './infrastructure/events/SystemEventSubscriber';
import { shutdownRedisRateLimit } from './presentation/middleware/RedisRateLimitMiddleware';
import { shutdownResponseCache } from './presentation/middleware/ResponseCacheMiddleware';

// Initialize ServiceLocator to load ports from services.config.ts
ServiceLocator.initialize();

const SERVICE_NAME = 'api-gateway';
initValidation(SERVICE_NAME);
const defaultPort = ServiceLocator.getServicePort('api-gateway');
const PORT = Number(process.env.PORT || process.env.API_GATEWAY_PORT || defaultPort);
const logger = createLogger(SERVICE_NAME);

// ✅ Global error handlers now managed centrally by platform-core bootstrap
// No need for individual service error handler registration

/**
 * Start the API Gateway using shared bootstrap pattern
 */
async function main(): Promise<void> {
  try {
    await initTracing({ serviceName: SERVICE_NAME, serviceVersion: '1.0.0' });

    logger.info('🚀 Starting API Gateway...', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'initialization',
    });

    // Create health manager for service monitoring
    const healthManager = createStandardHealthManager(SERVICE_NAME, '1.0.0');

    // Create bootstrap using platform-core
    const bootstrap = createStandardBootstrap(SERVICE_NAME, PORT, {
      middleware: {
        cors: true,
        helmet: false, // Disable Helmet to allow static file serving (CSP was blocking uploads)
        compression: true,
        requestLogger: process.env.NODE_ENV === 'development',
        bodyParser: false, // Disable body parsing in bootstrap - we'll handle it in createApp() AFTER auth proxy routes
      },
    });

    // Create the full app with all routes (admin, member, etc.)
    const fullApp = createApp();

    // Start the service using the standard bootstrap pattern
    await bootstrap.start({
      customMiddleware: (app: express.Application) => {
        // ── Storage Streaming Proxy ──────────────────────────────────────
        // File uploads/downloads need raw HTTP stream piping, not buffered
        // axios proxying. Two paths only:
        //   /api/v1/storage/* — canonical API path (rewrites to /api/storage/* for microservice)
        //   /uploads/*        — static file serving
        const storageTarget = SERVICE_URLS.storageService;

        app.use(
          '/uploads',
          createProxyMiddleware({
            target: storageTarget,
            changeOrigin: true,
            pathRewrite: path => {
              return '/uploads' + path;
            },
          })
        );

        app.use(
          '/api/v1/storage',
          createProxyMiddleware({
            target: storageTarget,
            changeOrigin: true,
            pathRewrite: path => {
              return '/api/storage' + path;
            },
          })
        );

        logger.info('Storage streaming proxy configured', { target: storageTarget });
      },
      customRoutes: (app: express.Application) => {
        // Mount all routes from the full app
        app.use(fullApp);

        logger.info('✅ API Gateway full routes configured', {
          service: SERVICE_NAME,
          component: 'routes',
          phase: 'configuration_complete',
          routes: ['admin', 'user', 'health', 'dynamic'],
        });
      },
      afterStart: async () => {
        contractRegistry.register({ name: 'api-gateway-api', version: CURRENT_CONTRACT_VERSION, deprecated: false });
        logger.info('🚀 API Gateway started successfully with full routing', {
          service: SERVICE_NAME,
          port: PORT,
          phase: 'startup_complete',
          routes: ['admin', 'user', 'health', 'dynamic'],
        });

        // Start event subscribers (fire-and-forget, non-blocking)
        startSystemEventSubscriber().catch(err => {
          logger.warn('Failed to start system event subscriber (non-critical)', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      },
    });

    // Setup graceful shutdown with server reference
    setupGracefulShutdown(bootstrap.getServer());
    registerShutdownHook(async () => {
      await shutdownRedisRateLimit();
      await shutdownResponseCache();
      getSSEManager().shutdown();
    });
  } catch (error) {
    const { correlationId } = logAndTrackError(
      error,
      'API Gateway startup failed - critical routing infrastructure unavailable',
      {
        service: SERVICE_NAME,
        phase: 'startup_failure',
        port: PORT,
        failedOperations: 'service_locator_init,health_manager_init,bootstrap_creation,route_setup,server_start',
      },
      'API_GATEWAY_STARTUP_FAILURE',
      500 // Critical - gateway infrastructure failure
    );

    logger.error('💥 API Gateway startup failed - routing infrastructure unavailable', {
      service: SERVICE_NAME,
      phase: 'startup_failed_exit',
      correlationId,
      exitCode: 1,
    });

    process.exit(1);
  }
}

// Error handlers managed by platform-core bootstrap

// Start the API Gateway
main().catch(error => {
  const { correlationId } = logAndTrackError(
    error,
    'Unhandled error during API Gateway startup - routing infrastructure failure',
    {
      service: SERVICE_NAME,
      phase: 'unhandled_startup_error',
      context: 'top_level_promise_rejection',
      port: PORT,
    },
    'API_GATEWAY_UNHANDLED_STARTUP_ERROR',
    500 // Critical - gateway infrastructure failure
  );

  logger.error('💥 API Gateway catastrophic failure - routing unavailable', {
    service: SERVICE_NAME,
    phase: 'catastrophic_failure_exit',
    correlationId,
    exitCode: 1,
  });

  process.exit(1);
});
