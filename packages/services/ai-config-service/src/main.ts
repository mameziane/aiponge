import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env'), override: false });

process.setMaxListeners(15);

/**
 * AI Config Service - Unified Entry Point
 * Consolidates AI Providers Service + AI Template Service
 * Phase 1b of Microservices Consolidation
 */

import {
  createStandardBootstrap,
  createLogger,
  createStandardHealthManager,
  ServiceLocator,
  logAndTrackError,
  validateSchema,
  setupGracefulShutdown,
  registerShutdownHook,
  failFastValidation,
  initTracing,
  errorMessage,
  initValidation,
} from '@aiponge/platform-core';
import {
  StructuredErrors,
  getCorrelationId,
  contractRegistry,
  CURRENT_CONTRACT_VERSION,
} from '@aiponge/shared-contracts';
import express from 'express';
import { initializeServices } from './app';
import { getDbFactory } from '@infrastructure/database/DatabaseConnectionFactory';
import { TemplateService } from './domains/templates/application/services/TemplateService';
import { CacheService } from './domains/templates/application/services/CacheService';
import { ExecutionService } from './domains/templates/application/services/ExecutionService';
import { ContentTemplateRepository } from './infrastructure/templates/repositories/ContentTemplateRepository';
import { createDrizzleRepository } from './infrastructure/database/DatabaseConnectionFactory';
import { ConfigEventPublisher } from './infrastructure/events/ConfigEventPublisher';
import { TemplateController } from './presentation/controllers/TemplateController';
import { ExecutionController } from './presentation/controllers/ExecutionController';
import { ImportExportController } from './presentation/controllers/ImportExportController';
import { createRoutes as createTemplateRoutes } from './presentation/routes/templateRoutes';
import { providerRoutes } from './presentation/routes/providerRoutes';
import { musicRoutes } from './presentation/routes/musicRoutes';
import frameworkRoutes from './presentation/routes/frameworkRoutes';

ServiceLocator.initialize();
failFastValidation('ai-config-service');

const SERVICE_NAME = 'ai-config-service';
initValidation(SERVICE_NAME);
const defaultPort = ServiceLocator.getServicePort('ai-config-service');
const PORT = Number(process.env.PORT || process.env.AI_CONFIG_SERVICE_PORT || defaultPort);

const logger = createLogger(SERVICE_NAME);

async function main(): Promise<void> {
  try {
    await initTracing({ serviceName: SERVICE_NAME, serviceVersion: '1.0.0' });

    logger.info('🚀 Starting AI Config Service (Providers + Templates consolidated)...', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'initialization',
    });

    ServiceLocator.initialize();

    const healthManager = createStandardHealthManager(SERVICE_NAME, '1.0.0');

    const bootstrap = createStandardBootstrap(SERVICE_NAME, PORT, {
      middleware: {
        cors: true,
        helmet: true,
        compression: true,
        requestLogger: process.env.NODE_ENV === 'development',
      },
    });

    await initializeServices();

    logger.debug('✅ All services initialized', {
      service: SERVICE_NAME,
      phase: 'initialization_complete',
    });

    // Schema validation in development mode
    if (process.env.NODE_ENV === 'development') {
      const schema = await import('./schema/schema');
      const validationResult = await validateSchema({
        serviceName: SERVICE_NAME,
        schema,
        sql: getDbFactory().getSQLConnection(),
        failOnMismatch: false,
      });
      if (!validationResult.success) {
        logger.warn('Schema validation found mismatches - run "npm run db:push" to sync database');
      }
    }

    await bootstrap.start({
      customRoutes: (app: express.Application) => {
        app.get('/health', async (req, res) => {
          try {
            const dbHealth = await getDbFactory().healthCheck();
            const serviceHealth = {
              status: dbHealth.status === 'healthy' ? 'healthy' : 'degraded',
              timestamp: new Date().toISOString(),
              service: SERVICE_NAME,
              domains: ['providers', 'templates'],
              version: '1.0.0',
              uptime: process.uptime(),
              environment: process.env.NODE_ENV || 'development',
              database: dbHealth,
              memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
              },
            };
            res.status(serviceHealth.status === 'healthy' ? 200 : 503).json(serviceHealth);
          } catch (error) {
            StructuredErrors.serviceUnavailable(res, `Health check failed: ${errorMessage(error)}`, {
              service: SERVICE_NAME,
              correlationId: getCorrelationId(req),
            });
          }
        });

        app.get('/ping', (req, res) => {
          res.json({ message: 'pong', service: SERVICE_NAME, timestamp: new Date().toISOString() });
        });

        const contentTemplateRepository = createDrizzleRepository(ContentTemplateRepository);
        const templateService = new TemplateService(contentTemplateRepository, ConfigEventPublisher);
        const cacheService = new CacheService();
        const executionService = new ExecutionService(templateService);

        const templateController = new TemplateController(templateService, cacheService);
        const executionController = new ExecutionController(executionService, cacheService);
        const importExportController = new ImportExportController(templateService, cacheService);

        const templateRoutes = createTemplateRoutes(templateController, executionController, importExportController);

        app.use('/api/providers', providerRoutes);
        app.use('/api/templates', templateRoutes);
        app.use('/api/music', musicRoutes);
        app.use('/api/frameworks', frameworkRoutes);

        logger.debug('✅ AI Config service routes configured', {
          service: SERVICE_NAME,
          component: 'routes',
          phase: 'configuration_complete',
        });
      },
      afterStart: async () => {
        contractRegistry.register({
          name: 'ai-config-service-api',
          version: CURRENT_CONTRACT_VERSION,
          deprecated: false,
        });
        logger.info('🎯 AI Config Service started successfully', {
          service: SERVICE_NAME,
          port: PORT,
          phase: 'startup_complete',
          consolidation: 'Phase 1b complete - Providers + Templates unified',
        });

        registerShutdownHook(async () => {
          const { DatabaseConnectionFactory } = await import('./infrastructure/database/DatabaseConnectionFactory');
          await DatabaseConnectionFactory.close();
        });
      },
    });

    setupGracefulShutdown(bootstrap.getServer());
  } catch (error) {
    const { error: wrappedError, correlationId } = logAndTrackError(
      error,
      'AI Config service startup failed - critical AI infrastructure unavailable',
      {
        service: SERVICE_NAME,
        phase: 'startup_failure',
        port: PORT,
        failedOperations:
          'database_connection_test,provider_proxy_initialization,orchestration_bootstrap,route_setup,server_creation,server_startup',
      },
      'AI_CONFIG_SERVICE_STARTUP_FAILURE',
      500
    );

    logger.error('💥 AI Config service startup failed - AI capabilities unavailable', {
      service: SERVICE_NAME,
      phase: 'startup_failed_exit',
      correlationId,
      exitCode: 1,
    });

    process.exit(1);
  }
}

main().catch(error => {
  const { error: wrappedError, correlationId } = logAndTrackError(
    error,
    'Unhandled error during AI Config service startup - AI system failure',
    {
      service: SERVICE_NAME,
      phase: 'unhandled_startup_error',
      context: 'top_level_promise_rejection',
      port: PORT,
    },
    'AI_CONFIG_SERVICE_UNHANDLED_STARTUP_ERROR',
    500
  );

  logger.error('💥 AI Config service catastrophic failure - AI system unavailable', {
    service: SERVICE_NAME,
    phase: 'catastrophic_failure_exit',
    correlationId,
    exitCode: 1,
  });

  process.exit(1);
});
