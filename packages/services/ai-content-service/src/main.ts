// Load environment variables first (never override Replit Secrets)
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env'), override: false });

// Set MaxListeners before any imports or EventEmitter setup
process.setMaxListeners(15);

/**
 * AI Content Service - Refactored with Shared Bootstrap Pattern
 * Unified Entry Point with Content Generation, Templates, and AI Processing
 */

import {
  createLogger,
  createOrchestrationBootstrap,
  createStandardHealthManager,
  ServiceLocator,
  logAndTrackError,
  validateSchema,
  initSentry,
  isSentryInitialized,
  createSentryCorrelationMiddleware,
  setupSentryErrorHandler,
  initAuditService,
  SimpleAuditPersister,
  setupGracefulShutdown,
  registerShutdownHook,
  failFastValidation,
  initTracing,
  initResponseHelpers,
} from '@aiponge/platform-core';
import { contractRegistry, CURRENT_CONTRACT_VERSION } from '@aiponge/shared-contracts';
import ws from 'ws';
import express from 'express';

// Configure Neon to use ws for WebSocket connections
if (typeof global !== 'undefined') {
  (global as Record<string, unknown>).WebSocket = ws;
}

// Configuration
import { contentServiceConfig, validateConfig } from './config/service-config';

// Import route modules
import { createContentRoutes } from './presentation/routes/content-routes';
import { createTierConfigRoutes } from './presentation/routes/tier-config-routes';
import { createAIRoutes } from './presentation/routes/ai-routes';

// Controllers
import { ContentController } from './presentation/controllers/ContentController';
import { TemplateController } from './presentation/controllers/TemplateController';
import { HealthController } from './presentation/controllers/HealthController';
import { TextAnalysisController } from './presentation/controllers/TextAnalysisController';
import { ReflectionController } from './presentation/controllers/ReflectionController';
import { QuoteController } from './presentation/controllers/QuoteController';
import { ImageController } from './presentation/controllers/ImageController';

// Repository implementations
import { DrizzleContentRepository } from './infrastructure/database/repositories/ContentRepository';
import { createDrizzleRepository, getDatabase } from './infrastructure/database/DatabaseConnectionFactory';

// Services
import { ContentAIService } from './domains/services/ContentAIService';
import { ContentTemplateService } from './domains/services/ContentTemplateService';

// Infrastructure clients
import { ProvidersServiceClient } from './infrastructure/clients/ProvidersServiceClient';

// Use cases
import {
  GenerateContentUseCase,
  ManageTemplatesUseCase,
  AnalyzeTextUseCase,
  GenerateReflectionUseCase,
  GenerateQuoteUseCase,
  GenerateImageUseCase,
} from './application/use-cases';

// Event subscribers
import { startConfigEventSubscriber } from './infrastructure/events/ConfigEventSubscriber';

// Database schema
import * as schema from './schema/content-schema';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
initSentry('ai-content-service');

// Initialize ServiceLocator to load ports from services.config.ts
ServiceLocator.initialize();
failFastValidation('ai-content-service');

// Configuration
const SERVICE_NAME = 'ai-content-service';
const { ServiceErrors: contentServiceErrors } = initResponseHelpers(SERVICE_NAME);
const defaultPort = ServiceLocator.getServicePort('ai-content-service');
const PORT = Number(process.env.PORT || process.env.AI_CONTENT_SERVICE_PORT || defaultPort);

// Initialize structured logger
const logger = createLogger(SERVICE_NAME);

/**
 * Start the AI Content Service using shared bootstrap pattern
 */
async function main(): Promise<void> {
  try {
    await initTracing({ serviceName: SERVICE_NAME, serviceVersion: '1.0.0' });

    logger.info('🚀 Starting AI Content Service...', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'initialization',
    });

    // Validate configuration first (errors will be logged on failure)
    validateConfig();

    // Initialize ServiceLocator for this service
    ServiceLocator.initialize();

    // Create health manager for service monitoring
    const healthManager = createStandardHealthManager(SERVICE_NAME, '1.0.0');

    // Create enhanced orchestration-aware bootstrap
    const bootstrap = createOrchestrationBootstrap(SERVICE_NAME, PORT, {
      registration: {
        capabilities: [
          'content-generation',
          'template-management',
          'text-analysis',
          'reflection-generation',
          'ai-processing',
          'provider-integration',
          'analytics-tracking',
        ],
        features: {
          contentGeneration: 'AI-powered content creation with multiple formats and styles',
          templateManagement: 'Content template creation, management, and reuse',
          textAnalysis: 'Advanced text analysis and quality assessment',
          reflectionGeneration: 'AI-generated reflection prompts and insights',
          aiProcessing: 'Multi-provider AI model integration and optimization',
          providerIntegration: 'Seamless integration with AI provider services',
          analyticsTracking: 'Content generation analytics and performance tracking',
        },
        endpoints: {
          content: '/api/content',
          templates: '/api/templates',
          analysis: '/api/analysis',
          reflections: '/api/reflections',
          ai: '/api/ai',
          health: '/health',
        },
      },
      middleware: {
        cors: true,
        helmet: true,
        compression: true,
        requestLogger: true,
      },
    });

    // Initialize repositories using DatabaseConnectionFactory
    const contentRepository = createDrizzleRepository(DrizzleContentRepository);

    // Initialize infrastructure clients
    const providersServiceClient = new ProvidersServiceClient();
    const { TemplateServiceClient } = await import('./infrastructure/clients/TemplateServiceClient');
    const templateClient = new TemplateServiceClient();

    // Initialize domain services
    const contentAIService = new ContentAIService(providersServiceClient as unknown as ConstructorParameters<typeof ContentAIService>[0], undefined, templateClient);
    const contentTemplateService = new ContentTemplateService(getDatabase());

    // Initialize use cases
    const generateContentUseCase = new GenerateContentUseCase(
      contentAIService,
      contentTemplateService,
      contentRepository as unknown as Record<string, unknown>
    );

    const manageTemplatesUseCase = new ManageTemplatesUseCase(contentTemplateService);
    const analyzeTextUseCase = new AnalyzeTextUseCase(contentAIService);
    const generateReflectionUseCase = new GenerateReflectionUseCase(contentAIService);
    const generateQuoteUseCase = new GenerateQuoteUseCase(contentAIService);

    // Initialize controllers
    const contentController = new ContentController(generateContentUseCase, manageTemplatesUseCase, contentRepository);

    const templateController = new TemplateController(manageTemplatesUseCase, contentTemplateService);

    const textAnalysisController = new TextAnalysisController(analyzeTextUseCase);
    const reflectionController = new ReflectionController(generateReflectionUseCase);
    const quoteController = new QuoteController(generateQuoteUseCase);
    const generateImageUseCase = new GenerateImageUseCase();
    const imageController = new ImageController(generateImageUseCase);
    const healthController = new HealthController();

    // Mount API routes using proper routing
    const contentRoutes = createContentRoutes(contentController, templateController, healthController);
    const tierConfigRoutes = createTierConfigRoutes();
    const aiRoutes = createAIRoutes(
      textAnalysisController,
      reflectionController,
      contentController,
      healthController,
      quoteController,
      imageController
    );

    // Status endpoint
    const statusRouter = express.Router();
    statusRouter.get('/api/content/status', (req, res) => {
      res.json({
        service: SERVICE_NAME,
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        description: 'AI Content Service with content generation, templates, and AI processing',
        endpoints: {
          content: '/api/content',
          templates: '/api/templates',
          analysis: '/api/analysis',
          reflections: '/api/reflections',
          ai: '/api/ai',
          tierConfig: '/api/config/tiers',
        },
      });
    });

    statusRouter.delete('/api/users/:userId/data', async (req, res) => {
      try {
        const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
        if (internalSecret) {
          const authHeader = req.headers['x-service-auth'] || req.headers['x-internal-secret'];
          if (authHeader !== internalSecret) {
            contentServiceErrors.forbidden(res, 'Internal service auth required', req);
            return;
          }
        }
        const { userId } = req.params;
        const db = getDatabase();
        await db.delete(schema.contentAnalytics).where(eq(schema.contentAnalytics.userId, userId));
        await db.delete(schema.contentFeedback).where(eq(schema.contentFeedback.userId, userId));
        await db.delete(schema.contentRequests).where(eq(schema.contentRequests.userId, userId));
        logger.info('GDPR user data deletion completed', { userId });
        res.json({ success: true, message: 'User content data deleted' });
      } catch (error) {
        logger.error('GDPR user data deletion failed', {
          userId: req.params.userId,
          error: error instanceof Error ? error.message : String(error),
        });
        contentServiceErrors.internal(res, 'Failed to delete user content data', error, req);
      }
    });

    // Schema validation in development mode
    if (process.env.NODE_ENV === 'development') {
      const { getSQLConnection } = await import('./infrastructure/database/DatabaseConnectionFactory');
      const validationResult = await validateSchema({
        serviceName: SERVICE_NAME,
        schema,
        sql: getSQLConnection(),
        failOnMismatch: false,
      });
      if (!validationResult.success) {
        logger.warn('Schema validation found mismatches - run "npm run db:push" to sync database');
      }
    }

    // Initialize audit service with shared persister for cross-service audit logging
    {
      const db = getDatabase();
      initAuditService(new SimpleAuditPersister(db));
      logger.debug('Audit service initialized with SimpleAuditPersister');
    }

    // Start the service with enhanced orchestration support
    await bootstrap.start({
      healthManager,
      customRoutes: (bootstrapApp: express.Application) => {
        if (isSentryInitialized()) {
          bootstrapApp.use(createSentryCorrelationMiddleware());
        }

        // Register all routes
        bootstrapApp.use('/api', contentRoutes);
        bootstrapApp.use('/api/ai', aiRoutes);
        bootstrapApp.use('/api/config', tierConfigRoutes);
        bootstrapApp.use('/', statusRouter);

        setupSentryErrorHandler(bootstrapApp as unknown as import('express').Express);
      },
      beforeStart: async () => {
        logger.debug('🔍 Initializing AI content service dependencies...');
        // Any pre-startup dependencies can be initialized here
      },
      afterStart: async () => {
        contractRegistry.register({
          name: 'ai-content-service-api',
          version: CURRENT_CONTRACT_VERSION,
          deprecated: false,
        });
        logger.debug('📍 AI content service registration and readiness reporting completed');
        registerShutdownHook(async () => {
          const { DatabaseConnectionFactory } = await import('./infrastructure/database/DatabaseConnectionFactory');
          await DatabaseConnectionFactory.close();
        });
      },
    });

    setupGracefulShutdown(bootstrap.getServer());

    logger.info('🎉 AI Content Service started successfully!', {
      service: SERVICE_NAME,
      port: PORT,
      phase: 'running',
      orchestrationEnabled: true,
    });

    // Start event subscribers (fire-and-forget, non-blocking)
    startConfigEventSubscriber().catch(err => {
      logger.warn('Failed to start config event subscriber (non-critical)', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  } catch (error) {
    const { correlationId } = logAndTrackError(
      error,
      'AI Content Service startup failed - content generation capabilities unavailable',
      {
        service: SERVICE_NAME,
        phase: 'startup_failure',
        port: PORT,
        failedOperations:
          'config_validation,service_locator_init,health_manager_init,bootstrap_creation,dependency_injection,route_setup,server_start',
      },
      'AI_CONTENT_SERVICE_STARTUP_FAILURE',
      500 // Critical - content generation will be unavailable
    );

    logger.error('💥 AI Content Service startup failed - content generation unavailable', {
      service: SERVICE_NAME,
      phase: 'startup_failed_exit',
      correlationId,
      exitCode: 1,
    });

    process.exit(1);
  }
}

// ✅ Global error handlers now managed centrally by platform-core ErrorHandlerManager
// No individual service error handler registration needed

// Start the service
main().catch(error => {
  const { correlationId } = logAndTrackError(
    error,
    'Unhandled error during AI Content Service startup - content generation failure',
    {
      service: SERVICE_NAME,
      phase: 'unhandled_startup_error',
      context: 'top_level_promise_rejection',
      port: PORT,
    },
    'AI_CONTENT_SERVICE_UNHANDLED_STARTUP_ERROR',
    500 // Critical - content generation infrastructure failure
  );

  logger.error('💥 AI Content Service catastrophic failure - content generation unavailable', {
    service: SERVICE_NAME,
    phase: 'catastrophic_failure_exit',
    correlationId,
    exitCode: 1,
  });

  process.exit(1);
});
