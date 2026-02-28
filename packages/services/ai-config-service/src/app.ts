/**
 * AI Config Service - Express App Factory
 * Unified service combining Provider Management and Template Management
 */

import express, { type Express, type RequestHandler, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { providerRoutes } from './presentation/routes/providerRoutes';
import { musicRoutes } from './presentation/routes/musicRoutes';
import frameworkRoutes from './presentation/routes/frameworkRoutes';
import { loggingMiddleware, errorLoggingMiddleware } from './presentation/middleware/logging';
import { initializeProviderProxy } from './infrastructure/providers/services/ProviderProxyFactory';
import { getDbFactory } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from './config/service-urls';
import {
  getServiceUrl,
  initSentry,
  isSentryInitialized,
  createSentryCorrelationMiddleware,
  setupSentryErrorHandler,
  createResilienceStatsHandler,
  errorMessage,
} from '@aiponge/platform-core';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';

initSentry('ai-config-service');
import { TemplateService } from './domains/templates/application/services/TemplateService';
import { ExecutionService } from './domains/templates/application/services/ExecutionService';
import { CacheService } from './domains/templates/application/services/CacheService';
import { ContentTemplateRepository } from './infrastructure/templates/repositories/ContentTemplateRepository';
import { createDrizzleRepository } from './infrastructure/database/DatabaseConnectionFactory';
import { ConfigEventPublisher } from './infrastructure/events/ConfigEventPublisher';
import { TemplateController } from './presentation/controllers/TemplateController';
import { ExecutionController } from './presentation/controllers/ExecutionController';
import { ImportExportController } from './presentation/controllers/ImportExportController';
import { createRoutes as createTemplateRoutes } from './presentation/routes/templateRoutes';

const logger = getLogger('ai-config-service-app');

/**
 * Creates AI Config Service Express app instance
 * Combines Provider + Template domains in a single service
 */
export function createApp(): express.Application {
  const app = express();

  setupMiddleware(app);
  setupRoutes(app);
  setupErrorHandling(app);

  return app;
}

function setupMiddleware(app: express.Application): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || [
        getServiceUrl('system-service'),
        getServiceUrl('storage-service'),
        getServiceUrl('user-service'),
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Service-Token', 'X-Request-ID'],
    })
  );

  app.use(
    compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
      threshold: 1024,
    }) as RequestHandler
  );

  app.use(
    express.json({
      limit: '10mb',
      verify: (req, res, buf) => {
        try {
          JSON.parse(buf.toString());
        } catch (error) {
          const err = new Error('Invalid JSON payload');
          (err as Error & { type: string }).type = 'entity.parse.failed';
          throw err;
        }
      },
    })
  );

  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  if (isSentryInitialized()) {
    app.use(createSentryCorrelationMiddleware());
  }
  app.use(loggingMiddleware);
}

function setupRoutes(app: express.Application): void {
  const startTime = Date.now();
  const getUptime = () => Math.floor((Date.now() - startTime) / 1000);

  app.get('/api/admin/resilience-stats', createResilienceStatsHandler('ai-config-service'));

  // Kubernetes-compatible health probes
  // GET /health/live - Liveness probe
  app.get('/health/live', (req: Request, res: Response) => {
    res.status(200).json({
      alive: true,
      service: 'ai-config-service',
      timestamp: new Date().toISOString(),
      uptime: getUptime(),
    });
  });

  // GET /health/ready - Readiness probe
  app.get('/health/ready', async (req: Request, res: Response) => {
    try {
      const dbHealth = await getDbFactory().healthCheck();
      const ready = dbHealth.status === 'healthy';

      res.status(ready ? 200 : 503).json({
        ready,
        service: 'ai-config-service',
        timestamp: new Date().toISOString(),
        uptime: getUptime(),
        components: {
          database: { healthy: dbHealth.status === 'healthy', status: dbHealth.status },
        },
      });
    } catch (error) {
      StructuredErrors.serviceUnavailable(res, `Health readiness check failed: ${errorMessage(error)}`, {
        service: 'ai-config-service',
        correlationId: getCorrelationId(req),
      });
    }
  });

  // GET /health/startup - Startup probe
  app.get('/health/startup', (req: Request, res: Response) => {
    res.status(200).json({
      started: true,
      service: 'ai-config-service',
      timestamp: new Date().toISOString(),
      uptime: getUptime(),
    });
  });

  // GET /health - Detailed health check
  app.get('/health', async (req: Request, res: Response) => {
    try {
      const dbHealth = await getDbFactory().healthCheck();
      const serviceHealth = {
        service: 'ai-config-service',
        status: dbHealth.status === 'healthy' ? 'healthy' : 'degraded',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: getUptime(),
        environment: process.env.NODE_ENV || 'development',
        domains: ['providers', 'templates'],
        memory: process.memoryUsage(),
        components: {
          database: dbHealth,
        },
      };

      const statusCode = serviceHealth.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(serviceHealth);
    } catch (error) {
      StructuredErrors.serviceUnavailable(res, `Health check failed: ${errorMessage(error)}`, {
        service: 'ai-config-service',
        correlationId: getCorrelationId(req),
      });
    }
  });

  app.get('/ping', (req: Request, res: Response) => {
    res.json({
      message: 'pong',
      service: 'ai-config-service',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/providers', providerRoutes);
  app.use('/api/music', musicRoutes);
  app.use('/api/frameworks', frameworkRoutes);

  const contentTemplateRepository = createDrizzleRepository(ContentTemplateRepository);
  const templateService = new TemplateService(contentTemplateRepository, ConfigEventPublisher);
  const cacheService = new CacheService();
  const executionService = new ExecutionService(templateService);

  const templateController = new TemplateController(templateService, cacheService);
  const executionController = new ExecutionController(executionService, cacheService);
  const importExportController = new ImportExportController(templateService, cacheService);

  const templateRoutes = createTemplateRoutes(templateController, executionController, importExportController);
  app.use('/api/templates', templateRoutes);

  app.get('/', (req: Request, res: Response) => {
    res.json({
      service: 'ai-config-service',
      version: '1.0.0',
      description: 'Unified AI Configuration Service - Provider Management + Template Management',
      endpoints: {
        providers: '/api/providers',
        music: '/api/music',
        templates: '/api/templates',
        frameworks: '/api/frameworks',
        health: '/health',
        ping: '/ping',
      },
      domains: {
        providers: 'AI Provider configuration and orchestration',
        music: 'Music generation with polling and completion',
        templates: 'AI Template management and execution',
        frameworks: 'Psychological framework configuration',
      },
    });
  });
}

function setupErrorHandling(app: express.Application): void {
  setupSentryErrorHandler(app as unknown as Express);
  app.use(errorLoggingMiddleware);

  app.use((err: Error & { type?: string; status?: number; statusCode?: number }, req: Request, res: Response, next: NextFunction) => {
    const opts = { service: 'ai-config-service', correlationId: getCorrelationId(req) };

    if (err.type === 'entity.parse.failed') {
      return StructuredErrors.validation(res, 'Invalid JSON payload', {
        ...opts,
        details: { parseError: err.message },
      });
    }

    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return StructuredErrors.fromException(res, err, err.message || 'Client error occurred', opts);
    }

    logger.error('Unhandled error: {}', { data0: err.message, stack: err.stack });

    StructuredErrors.internal(
      res,
      process.env.NODE_ENV === 'production' ? 'An internal server error occurred' : err.message,
      opts
    );
  });

  app.use((req: Request, res: Response) => {
    StructuredErrors.notFound(res, `Route ${req.method} ${req.path} not found`, {
      service: 'ai-config-service',
      correlationId: getCorrelationId(req),
      details: {
        availableRoutes: ['GET /', 'GET /health', 'GET /ping', '/api/providers/*', '/api/music/*', '/api/templates/*'],
      },
    });
  });
}

export async function initializeServices(): Promise<void> {
  logger.debug('🔄 Initializing AI Config Service domains...');

  try {
    const sql = getDbFactory().getSQLConnection();
    await sql`SELECT 1`;
    logger.debug('✅ Database connection established');

    await initializeProviderProxy({
      enableHealthChecking: process.env.NODE_ENV !== 'test',
    });
    logger.debug('✅ Provider proxy initialized');

    logger.debug('✅ All domains initialized successfully');
  } catch (error) {
    logger.error('❌ Service initialization failed: {}', { data0: errorMessage(error) });
    throw error;
  }
}
