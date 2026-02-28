// Load environment variables first (never override Replit Secrets)
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env'), override: false });

// FINAL FIX: Set MaxListeners before any imports or EventEmitter setup
process.setMaxListeners(15);

// Fix EventEmitter warnings - MUST be first import
// Bootstrap migrated to platform-core

/**
 * AI Analytics Service - Migrated with Shared Bootstrap Pattern
 * Unified Entry Point for Analytics Collection, Metrics, and Insights
 */

// Migrated to use @aiponge/platform-core
import {
  createLogger,
  createOrchestrationBootstrap,
  createStandardHealthManager,
  ServiceLocator,
  logAndTrackError,
  validateSchema,
  setupGracefulShutdown,
  registerShutdownHook,
  failFastValidation,
  initTracing,
  initResponseHelpers,
} from '@aiponge/platform-core';
import { contractRegistry, CURRENT_CONTRACT_VERSION } from '@aiponge/shared-contracts';
import express from 'express';
import { createApp } from './app';
import { startAnalyticsEventSubscriber } from './infrastructure/events/AnalyticsEventSubscriber';

// Initialize ServiceLocator to load ports from services.config.ts
ServiceLocator.initialize();
failFastValidation('ai-analytics-service');

// Configuration
const SERVICE_NAME = 'ai-analytics-service';
initResponseHelpers(SERVICE_NAME);
const defaultPort = ServiceLocator.getServicePort('ai-analytics-service');
const PORT = Number(process.env.PORT || process.env.AI_ANALYTICS_SERVICE_PORT || defaultPort);

// Initialize structured logger
const logger = createLogger(SERVICE_NAME);

/**
 * Start the AI Analytics Service using shared bootstrap pattern
 */
async function main(): Promise<void> {
  try {
    await initTracing({ serviceName: SERVICE_NAME, serviceVersion: '1.0.0' });

    logger.info('🚀 Starting AI Analytics Service...', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'initialization',
    });

    // Initialize ServiceLocator for this service
    ServiceLocator.initialize();

    // Create health manager for service monitoring
    const healthManager = createStandardHealthManager(SERVICE_NAME, '1.0.0');

    // Create enhanced orchestration-aware bootstrap
    const bootstrap = createOrchestrationBootstrap(SERVICE_NAME, PORT, {
      registration: {
        capabilities: [
          'analytics_collection',
          'metrics_aggregation',
          'event_tracking',
          'user_behavior_analysis',
          'provider_analytics',
          'system_health_monitoring',
          'anomaly_detection',
          'insight_generation',
        ],
        features: {
          analyticsCollection: 'Comprehensive analytics and metrics collection',
          metricsAggregation: 'Real-time and historical data aggregation',
          eventTracking: 'User interaction and system event tracking',
          behaviorAnalysis: 'User behavior pattern detection and analysis',
          providerAnalytics: 'AI provider performance and usage analytics',
          healthMonitoring: 'System health and resource monitoring',
          anomalyDetection: 'AI-powered anomaly detection',
          insightGeneration: 'Automated insight and report generation',
        },
        endpoints: {
          events: '/api/analytics/events',
          metrics: '/api/analytics/metrics',
          providers: '/api/analytics/providers',
          health: '/api/analytics/health',
          insights: '/api/analytics/insights',
          status: '/health',
          ready: '/ready',
        },
      },
      middleware: {
        cors: true,
        helmet: true,
        compression: true,
        requestLogger: process.env.NODE_ENV === 'development',
      },
    });

    logger.debug('✅ AI Analytics Service bootstrap created', {
      service: SERVICE_NAME,
      component: 'bootstrap',
    });

    // Create the Express app with all routes, middleware, and services configured
    const analyticsApp = createApp();

    if (
      process.env.NODE_ENV === 'development' &&
      (process.env.AI_ANALYTICS_DATABASE_URL || process.env.ANALYTICS_DB_URL || process.env.DATABASE_URL)
    ) {
      try {
        const { getSQLConnection } = await import('./infrastructure/database/DatabaseConnectionFactory');
        const schema = await import('./schema/analytics-schema');
        const validationResult = await validateSchema({
          serviceName: SERVICE_NAME,
          schema,
          sql: getSQLConnection(),
          failOnMismatch: false,
        });
        if (!validationResult.success) {
          logger.warn('Schema validation found mismatches - run "npm run db:push" to sync database');
        }
      } catch (err) {
        logger.warn('Schema validation skipped - analytics database not available');
      }
    }

    // Start the service using the standard bootstrap pattern
    await bootstrap.start({
      healthManager,
      customRoutes: (app: express.Application) => {
        // Mount the complete analytics app routes
        app.use('/', analyticsApp);

        logger.debug('✅ AI Analytics service routes configured', {
          service: SERVICE_NAME,
          component: 'routes',
          phase: 'configuration_complete',
        });
      },
      afterStart: async () => {
        contractRegistry.register({
          name: 'ai-analytics-service-api',
          version: CURRENT_CONTRACT_VERSION,
          deprecated: false,
        });
        logger.info('🎯 AI Analytics Service started successfully', {
          service: SERVICE_NAME,
          port: PORT,
          phase: 'startup_complete',
        });

        registerShutdownHook(async () => {
          const { DatabaseConnectionFactory } = await import('./infrastructure/database/DatabaseConnectionFactory');
          await DatabaseConnectionFactory.close();
        });

        // Start event subscribers (fire-and-forget, non-blocking)
        startAnalyticsEventSubscriber().catch(err => {
          logger.warn('Failed to start analytics event subscriber (non-critical)', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      },
    });

    setupGracefulShutdown(bootstrap.getServer());
  } catch (error) {
    const { error: wrappedError, correlationId } = logAndTrackError(
      error,
      'AI Analytics service startup failed - monitoring system failure',
      {
        service: SERVICE_NAME,
        phase: 'startup_failure',
        port: PORT,
        failedOperations:
          'service_locator_init,health_manager_init,app_creation,orchestration_bootstrap,route_setup,server_creation,server_startup',
      },
      'AI_ANALYTICS_SERVICE_STARTUP_FAILURE',
      500 // Critical - analytics infrastructure failure
    );

    logger.error('💥 AI Analytics service startup failed - monitoring unavailable', {
      service: SERVICE_NAME,
      phase: 'startup_failed_exit',
      correlationId,
      exitCode: 1,
    });

    process.exit(1);
  }
}

// Start the service
main().catch(error => {
  const { error: wrappedError, correlationId } = logAndTrackError(
    error,
    'Unhandled error during AI Analytics service startup - monitoring system failure',
    {
      service: SERVICE_NAME,
      phase: 'unhandled_startup_error',
      context: 'top_level_promise_rejection',
      port: PORT,
    },
    'AI_ANALYTICS_SERVICE_UNHANDLED_STARTUP_ERROR',
    500 // Critical - analytics infrastructure failure
  );

  logger.error('💥 AI Analytics service catastrophic failure - monitoring unavailable', {
    service: SERVICE_NAME,
    phase: 'catastrophic_failure_exit',
    correlationId,
    exitCode: 1,
  });

  process.exit(1);
});
