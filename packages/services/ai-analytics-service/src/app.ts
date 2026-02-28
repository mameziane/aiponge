/**
 * AI Analytics Service - Express App Factory
 * Creates the Express app instance without starting server for testing and E2E validation
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { TimescaleAnalyticsRepository } from './infrastructure/repositories/TimescaleAnalyticsRepository';
import { createRedisCache, type ICache } from '@aiponge/platform-core';
import { MetricsCollectorService } from './application/services/MetricsCollectorService';
import { ProviderAnalyticsService } from './application/provider-analytics/ProviderAnalyticsService';
import { SystemHealthService } from './application/system-health/SystemHealthService';
import { GenerateTherapeuticInsightsReportUseCase } from './application/use-cases/GenerateTherapeuticInsightsReportUseCase';
import { GenerateBookExportReportUseCase } from './application/use-cases/GenerateBookExportReportUseCase';
import { GenerateLyricsCollectionReportUseCase } from './application/use-cases/GenerateLyricsCollectionReportUseCase';
import { getLogger } from './config/service-urls';
import { getAnalyticsCache } from './infrastructure/events/AnalyticsEventSubscriber';
import { AnalyticsError } from './application/errors';
import {
  serializeError,
  initSentry,
  isSentryInitialized,
  createSentryCorrelationMiddleware,
  setupSentryErrorHandler,
  createIntervalScheduler,
  extractAuthContext,
  getResponseHelpers,
} from '@aiponge/platform-core';
const { sendSuccess, ServiceErrors } = getResponseHelpers();
import { StructuredErrors } from '@aiponge/shared-contracts';
import { FraudDetectionService } from './application/services/FraudDetectionService';

initSentry('ai-analytics-service');

// Environment configuration

const logger = getLogger('ai-analytics-service-app');

const NODE_ENV = process.env.NODE_ENV || 'development';
const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Creates AI Analytics Service Express app instance
 * This is used for both testing and production server
 */
export function createApp(): express.Application {
  const app = express();

  // Initialize services
  const { repository, cache, metricsCollector, providerAnalytics, systemHealth } = initializeServices();

  // Setup middleware
  setupMiddleware(app);

  // Setup routes
  setupRoutes(app, { repository, cache, metricsCollector, providerAnalytics, systemHealth });

  // Setup error handling
  setupErrorHandling(app);

  return app;
}

function createMockRepository(): TimescaleAnalyticsRepository {
  return {
    getMetrics: async () => [],
    getAggregatedMetrics: async () => [],
    deleteUserData: async () => ({ deletedRecords: 0 }),
    exportUserData: async () => ({ activityLogs: [] }),
    getProviderUsageSummary: async () => ({ providers: [], totalRequests: 0, totalCost: 0, successRate: 0, byProvider: {} }),
    recordMetric: async () => {},
    recordMetrics: async () => {},
    healthCheck: async () => ({ status: 'unhealthy' as const, details: { mock: true } }),
  } as unknown as TimescaleAnalyticsRepository;
}

function createMockCache(): ICache {
  const store = new Map<string, { value: string; expiry: number }>();
  return {
    ping: async () => true,
    isReady: () => true,
    get: async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiry < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set: async (key: string, value: string, ttlSeconds?: number) => {
      store.set(key, { value, expiry: Date.now() + (ttlSeconds || 3600) * 1000 });
      return true;
    },
    setex: async (_key: string, _ttl: number, _value: string) => true,
    del: async (key: string) => {
      store.delete(key);
      return true;
    },
    exists: async (key: string) => store.has(key),
    mget: async (...keys: string[]) => keys.map(k => store.get(k)?.value ?? null),
    mset: async (_keyValues: Record<string, string>, _ttl?: number) => true,
    incr: async (_key: string) => 1,
    incrby: async (_key: string, amount: number) => amount,
    decr: async (_key: string) => -1,
    expire: async (_key: string, _seconds: number) => true,
    ttl: async (_key: string) => -1,
    keys: async (_pattern: string) => Array.from(store.keys()),
    flushdb: async () => { store.clear(); return true; },
    disconnect: async () => {},
    pipeline: (() => ({})) as unknown as ICache['pipeline'],
    publish: async (_channel: string, _message: string) => 0,
    subscribe: async (_channel: string, _callback: (message: string) => void) => {},
  };
}

function initializeServices() {
  let repository: TimescaleAnalyticsRepository;
  let cache: ICache;
  let usingMockRepository = false;

  const useMockFallback = NODE_ENV === 'test' || NODE_ENV === 'development';

  try {
    const analyticsDbUrl = process.env.AI_ANALYTICS_DATABASE_URL || process.env.ANALYTICS_DB_URL || DATABASE_URL;
    if (analyticsDbUrl) {
      const url = new URL(analyticsDbUrl);
      const useSsl =
        process.env.DATABASE_SSL === 'true' ||
        ['require', 'verify-full', 'verify-ca'].includes(url.searchParams.get('sslmode') || '') ||
        NODE_ENV === 'production';
      const dbConfig = {
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.substring(1),
        user: url.username,
        password: decodeURIComponent(url.password),
        ssl: useSsl,
      };
      repository = new TimescaleAnalyticsRepository(dbConfig);
      logger.info('Using database analytics repository', { host: dbConfig.host, database: dbConfig.database });
    } else if (useMockFallback) {
      logger.info('Using in-memory analytics repository (no AI_ANALYTICS_DATABASE_URL or DATABASE_URL configured)');
      usingMockRepository = true;
      repository = createMockRepository();
    } else {
      throw AnalyticsError.validationError(
        'AI_ANALYTICS_DATABASE_URL',
        'AI_ANALYTICS_DATABASE_URL or DATABASE_URL is required for analytics service in production'
      );
    }

    try {
      cache = createRedisCache({ serviceName: 'ai-analytics-service', keyPrefix: 'aiponge:analytics:' });
    } catch (cacheError) {
      if (useMockFallback) {
        logger.warn('Redis unavailable, using in-memory cache fallback');
        cache = createMockCache();
      } else {
        throw cacheError;
      }
    }
  } catch (error) {
    if (useMockFallback) {
      logger.warn('Failed to initialize database/cache, using in-memory fallbacks');
      usingMockRepository = true;
      repository = createMockRepository();
      cache = createMockCache();
    } else {
      logger.error('CRITICAL: Failed to initialize analytics database', { error });
      throw error;
    }
  }

  const metricsCollector = new MetricsCollectorService(repository, cache);
  const providerAnalytics = new ProviderAnalyticsService(repository, metricsCollector, cache);
  const systemHealth = new SystemHealthService(repository, metricsCollector);

  return { repository, cache, metricsCollector, providerAnalytics, systemHealth };
}

function setupMiddleware(app: express.Application): void {
  // Security and performance middleware
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(compression() as express.RequestHandler);

  // Parse CORS origins from environment variable (comma-separated)
  // Production requires CORS_ALLOWED_ORIGINS to be set; fallback to localhost in development
  const corsOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : NODE_ENV === 'production'
      ? ['https://admin.aiponge.com', 'https://api.aiponge.com']
      : true;

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: NODE_ENV === 'production' ? 1000 : 10000,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
  });
  app.use('/api/', limiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  if (isSentryInitialized()) {
    app.use(createSentryCorrelationMiddleware());
  }

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.debug('{} {} - {} ({}ms)', { data0: req.method, data1: req.path, data2: res.statusCode, data3: duration });
    });
    next();
  });
}

function setupRoutes(app: express.Application, services: {
  repository: TimescaleAnalyticsRepository;
  cache: ICache;
  metricsCollector: MetricsCollectorService;
  providerAnalytics: ProviderAnalyticsService;
  systemHealth: SystemHealthService;
}): void {
  const { repository, cache, metricsCollector, providerAnalytics, systemHealth } = services;

  // Kubernetes-compatible health probes
  // GET /health - Detailed health check
  app.get('/health', async (req, res) => {
    try {
      const health = await systemHealth.healthCheck();
      const isHealthy = health.status === 'healthy';
      res.status(isHealthy ? 200 : 503).json({
        service: 'ai-analytics-service',
        status: health.status || 'healthy',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        components: health,
      });
    } catch (error) {
      ServiceErrors.serviceUnavailable(res, error instanceof Error ? error.message : 'Unknown error', req);
    }
  });

  // GET /health/live - Liveness probe (is the process running?)
  app.get('/health/live', (req, res) => {
    res.status(200).json({
      alive: true,
      service: 'ai-analytics-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // GET /health/ready - Readiness probe (can the service handle traffic?)
  app.get('/health/ready', async (req, res) => {
    try {
      const dbHealthy = await cache.ping();
      const cacheHealthy = await cache.isReady();
      const ready = dbHealthy && cacheHealthy;

      res.status(ready ? 200 : 503).json({
        ready,
        service: 'ai-analytics-service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        components: {
          database: { healthy: dbHealthy },
          cache: { healthy: cacheHealthy },
        },
      });
    } catch (error) {
      ServiceErrors.serviceUnavailable(res, error instanceof Error ? error.message : 'Unknown error', req);
    }
  });

  // GET /health/startup - Startup probe (has initialization completed?)
  app.get('/health/startup', (req, res) => {
    res.status(200).json({
      started: true,
      service: 'ai-analytics-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Analytics API routes
  app.get('/api/analytics/dashboard', async (req, res) => {
    try {
      const [providerSummary, health] = await Promise.all([
        repository.getProviderUsageSummary(),
        systemHealth.healthCheck(),
      ]);

      sendSuccess(res, {
        providers: providerSummary,
        system: {
          status: health.status,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
      });
    } catch (error) {
      logger.error('Failed to get dashboard metrics', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to get dashboard metrics', req);
      return;
    }
  });

  app.post('/api/analytics/track', async (req, res) => {
    try {
      const { eventType, eventData, userId } = req.body;
      if (!eventType) {
        ServiceErrors.badRequest(res, 'eventType is required', req);
        return;
      }

      await metricsCollector.recordMetric({
        name: eventType,
        value: 1,
        timestamp: new Date(),
        serviceName: 'ai-analytics-service',
        source: userId || 'anonymous',
        metricType: 'counter',
        tags: eventData ? Object.fromEntries(
          Object.entries(eventData).map(([k, v]) => [k, String(v)])
        ) : undefined,
      });

      sendSuccess(res, {
        event: 'tracked',
        eventType,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to track event', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to track event', req);
      return;
    }
  });

  // Analytics summary for admin dashboard (queries actual database)
  app.get('/api/analytics/summary', async (_req, res) => {
    try {
      // Query provider usage stats
      const providerStats = await repository.getProviderUsageSummary();

      // Get recent events from cache (static import, no dynamic loading)
      const cache = getAnalyticsCache();

      sendSuccess(res, {
        providerUsage: providerStats,
        userActivity: {
          totalEvents: cache.recentEvents.length,
          recentEvents: cache.recentEvents.slice(-20),
        },
        cacheStats: {
          providerCount: cache.providerStats.size,
          metricCount: cache.metrics.size,
        },
      });
    } catch (error) {
      logger.error('Failed to get analytics summary', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to retrieve analytics summary', error, _req);
    }
  });

  app.get('/api/analytics/metrics', async (req, res) => {
    try {
      const { serviceName, metricName, startTime, endTime, metricType, source } = req.query;

      const filter = {
        serviceName: serviceName as string,
        metricName: metricName as string,
        startTime: startTime ? new Date(startTime as string) : undefined,
        endTime: endTime ? new Date(endTime as string) : undefined,
        metricType: metricType as string,
        source: source as string,
      };

      const metrics = await repository.getMetrics(filter);
      sendSuccess(res, {
        metrics,
        count: metrics.length,
      });
    } catch (error) {
      logger.error('Failed to get metrics', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get metrics', req);
      return;
    }
  });

  // Request Tracing Routes - Dynamic imports for ESM compatibility
  // Use closure to store loaded modules for route handlers
  const traceModules: {
    TraceRepository: (new (db: unknown) => Record<string, unknown>) | null;
    GetRequestTraceUseCase: (new (repo: unknown) => { execute: (params: unknown) => Promise<Record<string, unknown>> }) | null;
    SearchTracesUseCase: (new (repo: unknown) => { execute: (params: unknown) => Promise<unknown> }) | null;
    GetSlowRequestsUseCase: (new (repo: unknown) => { execute: (params: unknown) => Promise<unknown> }) | null;
    traceRepository: Record<string, unknown> | null;
  } = {
    TraceRepository: null,
    GetRequestTraceUseCase: null,
    SearchTracesUseCase: null,
    GetSlowRequestsUseCase: null,
    traceRepository: null,
  };

  void (async () => {
    try {
      const traceRepoModule = await import('./infrastructure/repositories/TraceRepository');
      traceModules.TraceRepository = traceRepoModule.TraceRepository as unknown as typeof traceModules.TraceRepository;
      const useCasesModule = await import('./application/use-cases/tracing');
      traceModules.GetRequestTraceUseCase = useCasesModule.GetRequestTraceUseCase as unknown as typeof traceModules.GetRequestTraceUseCase;
      traceModules.SearchTracesUseCase = useCasesModule.SearchTracesUseCase as unknown as typeof traceModules.SearchTracesUseCase;
      traceModules.GetSlowRequestsUseCase = useCasesModule.GetSlowRequestsUseCase as unknown as typeof traceModules.GetSlowRequestsUseCase;

      if (DATABASE_URL) {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const { Pool } = await import('pg');
        const connStr = DATABASE_URL.includes('sslmode=require')
          ? DATABASE_URL.replace('sslmode=require', 'sslmode=verify-full')
          : DATABASE_URL;
        const pool = new Pool({ connectionString: connStr });
        const db = drizzle(pool);
        traceModules.traceRepository = new traceModules.TraceRepository!(db);
      }
      logger.debug('Trace modules loaded successfully');
    } catch (err) {
      logger.warn('TraceRepository initialization skipped', { error: serializeError(err) });
    }
  })();

  app.get('/api/traces/:correlationId', async (req, res) => {
    try {
      if (!traceModules.traceRepository) {
        return ServiceErrors.serviceUnavailable(res, 'Trace repository not available', req);
      }

      const { correlationId } = req.params;
      const useCase = new traceModules.GetRequestTraceUseCase!(traceModules.traceRepository);
      const result = await useCase.execute({ correlationId });

      if (!result.success) {
        ServiceErrors.notFound(res, `Trace ${correlationId}`, req);
        return;
      }

      sendSuccess(res, result.trace);
    } catch (error) {
      logger.error('Failed to get trace', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to retrieve trace', error, req);
    }
  });

  app.get('/api/traces', async (req, res) => {
    try {
      if (!traceModules.traceRepository) {
        return ServiceErrors.serviceUnavailable(res, 'Trace repository not available', req);
      }

      const useCase = new traceModules.SearchTracesUseCase!(traceModules.traceRepository);
      const result = await useCase.execute({
        userId: req.query.userId as string,
        service: req.query.service as string,
        operation: req.query.operation as string,
        status: req.query.status as string,
        minDuration: req.query.minDuration ? parseInt(req.query.minDuration as string) : undefined,
        maxDuration: req.query.maxDuration ? parseInt(req.query.maxDuration as string) : undefined,
        since: req.query.since as string,
        until: req.query.until as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      });

      return res.json(result);
    } catch (error) {
      logger.error('Failed to search traces', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to search traces', error, req);
    }
  });

  app.get('/api/traces/slow', async (req, res) => {
    try {
      if (!traceModules.traceRepository) {
        return ServiceErrors.serviceUnavailable(res, 'Trace repository not available', req);
      }

      const useCase = new traceModules.GetSlowRequestsUseCase!(traceModules.traceRepository);
      const result = await useCase.execute({
        threshold: req.query.threshold ? parseInt(req.query.threshold as string) : undefined,
        since: req.query.since as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      });

      return res.json(result);
    } catch (error) {
      logger.error('Failed to get slow requests', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to retrieve slow requests', error, req);
    }
  });

  app.get('/api/traces/stats', async (req, res) => {
    try {
      if (!traceModules.traceRepository) {
        return ServiceErrors.serviceUnavailable(res, 'Trace repository not available', req);
      }

      const since = req.query.since
        ? parseTimeRange(req.query.since as string)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

      const stats = await (traceModules.traceRepository as Record<string, (...args: unknown[]) => Promise<unknown>>).getTraceStats(since);

      sendSuccess(res, stats);
    } catch (error) {
      logger.error('Failed to get trace stats', { error: serializeError(error) });
      ServiceErrors.internal(res, 'Failed to retrieve trace statistics', error, req);
    }
  });

  function parseTimeRange(timeRange: string): Date {
    const now = new Date();
    const match = timeRange.match(/^(\d+)(m|h|d)$/);

    if (!match) {
      return new Date(timeRange);
    }

    const [, value, unit] = match;
    const amount = parseInt(value, 10);

    switch (unit) {
      case 'm':
        return new Date(now.getTime() - amount * 60 * 1000);
      case 'h':
        return new Date(now.getTime() - amount * 60 * 60 * 1000);
      case 'd':
        return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
      default:
        return now;
    }
  }

  // Report generation use cases
  const therapeuticInsightsUseCase = new GenerateTherapeuticInsightsReportUseCase();
  const bookExportUseCase = new GenerateBookExportReportUseCase();
  const lyricsCollectionUseCase = new GenerateLyricsCollectionReportUseCase();

  const MAX_PDF_STORAGE = 100;
  const tempPdfStorage = new Map<string, { buffer: Buffer; expiresAt: number }>();

  const pdfCleanupScheduler = createIntervalScheduler({
    name: 'temp-pdf-cleanup',
    serviceName: 'ai-analytics-service',
    intervalMs: 10 * 60 * 1000,
    handler: () => {
      const now = Date.now();
      for (const [id, data] of tempPdfStorage.entries()) {
        if (data.expiresAt < now) {
          tempPdfStorage.delete(id);
          logger.debug('Cleaned up expired PDF', { id });
        }
      }
    },
  });
  pdfCleanupScheduler.start();

  function storeTempPdf(id: string, buffer: Buffer, expiresAt: number): void {
    while (tempPdfStorage.size >= MAX_PDF_STORAGE) {
      const lruKey = tempPdfStorage.keys().next().value;
      if (lruKey === undefined) break;
      tempPdfStorage.delete(lruKey);
      logger.info('LRU eviction in temp PDF storage (max {})', { data0: String(MAX_PDF_STORAGE) });
    }
    tempPdfStorage.set(id, { buffer, expiresAt });
  }

  function getTempPdf(id: string): { buffer: Buffer; expiresAt: number } | undefined {
    const entry = tempPdfStorage.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      tempPdfStorage.delete(id);
      return undefined;
    }
    tempPdfStorage.delete(id);
    tempPdfStorage.set(id, entry);
    return entry;
  }

  /**
   * POST /api/reports/insights
   * Generate a comprehensive therapeutic insights report as PDF
   */
  app.post('/api/reports/insights', async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';
      const { timeRangeDays = 90, includeSections = {} } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      logger.info('Generating therapeutic insights report', {
        userId,
        timeRangeDays,
        requestId,
      });

      const result = await therapeuticInsightsUseCase.execute({
        userId,
        timeRangeDays,
        includeSections,
        requestId,
      });

      if (!result.success) {
        if (result.code === 'INSUFFICIENT_DATA') {
          ServiceErrors.badRequest(res, result.error || 'Insufficient data', req, {
            code: result.code,
            entryCount: result.entryCount,
          });
        } else {
          ServiceErrors.internal(res, result.error || 'Report generation failed', undefined, req);
        }
        return;
      }

      const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      storeTempPdf(result.reportId!, result.pdfBuffer!, expiresAt);

      // Construct the download URL
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
      const gatewayUrl = process.env.EXPO_PUBLIC_API_URL || process.env.API_GATEWAY_URL || `${protocol}://${host}`;
      const downloadUrl = `${gatewayUrl}/api/app/reports/download/${result.reportId}`;

      sendSuccess(res, {
        reportId: result.reportId,
        downloadUrl,
        entryCount: result.entryCount,
        timeRangeDays: result.timeRangeDays,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to generate therapeutic insights report', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate report', req);
      return;
    }
  });

  /**
   * GET /api/reports/download/:reportId
   * Download a previously generated report
   */
  app.get('/api/reports/download/:reportId', (req, res) => {
    const { reportId } = req.params;

    const pdfData = getTempPdf(reportId);
    if (!pdfData) {
      ServiceErrors.notFound(res, 'Report', req);
      return;
    }

    if (pdfData.expiresAt < Date.now()) {
      tempPdfStorage.delete(reportId);
      StructuredErrors.gone(res, 'Report has expired');
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="aiponge-insights-report.pdf"`);
    res.setHeader('Content-Length', pdfData.buffer.length);
    res.send(pdfData.buffer);
  });

  /**
   * POST /api/reports/book-export
   * Generate a personal book export report as PDF
   */
  app.post('/api/reports/book-export', async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';
      const { format = 'chapters', dateFrom, dateTo } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      logger.info('Generating book export report', {
        userId,
        format,
        dateFrom,
        dateTo,
        requestId,
      });

      const result = await bookExportUseCase.execute({
        userId,
        format,
        dateFrom,
        dateTo,
        requestId,
      });

      if (!result.success) {
        if (result.code === 'NO_ENTRIES') {
          ServiceErrors.badRequest(res, result.error || 'No entries found', req, {
            code: result.code,
            entryCount: result.entryCount,
          });
        } else {
          ServiceErrors.internal(res, result.error || 'Report generation failed', undefined, req);
        }
        return;
      }

      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      storeTempPdf(result.reportId!, result.pdfBuffer!, expiresAt);

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
      const gatewayUrl = process.env.EXPO_PUBLIC_API_URL || process.env.API_GATEWAY_URL || `${protocol}://${host}`;
      const downloadUrl = `${gatewayUrl}/api/app/reports/download/${result.reportId}`;

      sendSuccess(res, {
        reportId: result.reportId,
        downloadUrl,
        entryCount: result.entryCount,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to generate book export report', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate report', req);
      return;
    }
  });

  /**
   * POST /api/reports/lyrics
   * Generate a lyrics collection report as PDF
   */
  app.post('/api/reports/lyrics', async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';
      const { includeFavoritesOnly = false, trackId } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      logger.info('Generating lyrics report', {
        userId,
        includeFavoritesOnly,
        trackId,
        requestId,
      });

      const result = await lyricsCollectionUseCase.execute({
        userId,
        includeFavoritesOnly,
        trackId,
        requestId,
      });

      if (!result.success) {
        if (result.code === 'NO_LYRICS') {
          ServiceErrors.badRequest(res, result.error || 'No lyrics found', req, {
            code: result.code,
            lyricsCount: result.lyricsCount,
          });
        } else {
          ServiceErrors.internal(res, result.error || 'Report generation failed', undefined, req);
        }
        return;
      }

      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      storeTempPdf(result.reportId!, result.pdfBuffer!, expiresAt);

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
      const gatewayUrl = process.env.EXPO_PUBLIC_API_URL || process.env.API_GATEWAY_URL || `${protocol}://${host}`;
      const downloadUrl = `${gatewayUrl}/api/app/reports/download/${result.reportId}`;

      sendSuccess(res, {
        reportId: result.reportId,
        downloadUrl,
        lyricsCount: result.lyricsCount,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to generate lyrics collection report', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate report', req);
      return;
    }
  });

  // GDPR Article 17: User data deletion endpoint
  app.delete('/api/users/:userId/data', async (req, res) => {
    const { userId } = req.params;
    const { userId: requestedBy } = extractAuthContext(req);

    logger.info('GDPR: User data deletion request received', { userId, requestedBy });

    try {
      // Use repository's deleteUserData method if available, otherwise succeed silently
      // (no analytics data to delete if repository is a mock)
      if (repository.deleteUserData) {
        const result = await repository.deleteUserData(userId);
        logger.info('GDPR: User analytics data deletion completed', { userId, deletedRecords: result.deletedRecords });
      } else {
        logger.info('GDPR: No analytics data to delete (mock repository)', { userId });
      }

      sendSuccess(res, { userId, deletedAt: new Date().toISOString() });
    } catch (error) {
      logger.error('GDPR: User data deletion failed', {
        userId,
        error: serializeError(error),
      });
      ServiceErrors.internal(res, 'Failed to delete user analytics data', error, req);
    }
  });

  // GDPR Article 20: User analytics data export endpoint
  app.get('/api/users/:userId/export', async (req, res) => {
    const { userId } = req.params;

    logger.info('GDPR: User analytics data export request received', { userId });

    try {
      // Use repository's exportUserData method if available, otherwise return empty data
      let activityLogs: { eventType: string; timestamp: string }[] = [];

      if (repository.exportUserData) {
        const exportData = await repository.exportUserData(userId);
        activityLogs = exportData.activityLogs;
      } else {
        logger.info('GDPR: No analytics data to export (mock repository)', { userId });
      }

      logger.info('GDPR: User analytics data export completed', {
        userId,
        activityLogCount: activityLogs.length,
      });

      sendSuccess(res, {
        analyticsData: {
          activityLogs,
        },
      });
    } catch (error) {
      logger.error('GDPR: User analytics data export failed', {
        userId,
        error: serializeError(error),
      });
      ServiceErrors.internal(res, 'Failed to export user analytics data', error, req);
    }
  });

  // Root endpoint
  app.get('/', (req, res) => {
    sendSuccess(res, {
      service: 'ai-analytics-service',
      version: process.env.npm_package_version || '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        analytics: '/api/analytics',
        metrics: '/api/analytics/metrics',
      },
    });
  });

  // ===== FRAUD DETECTION ENDPOINTS =====

  const fraudService = new FraudDetectionService(repository);

  app.get('/api/analytics/fraud/user/:userId', async (req, res) => {
    try {
      const lookbackHours = req.query.lookbackHours ? Number(req.query.lookbackHours) : 24;
      const result = await fraudService.analyzeUser(req.params.userId, lookbackHours);
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Fraud analysis failed for user', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to analyze user for fraud', req);
    }
  });

  app.get('/api/analytics/fraud/ip/:ipAddress', async (req, res) => {
    try {
      const lookbackHours = req.query.lookbackHours ? Number(req.query.lookbackHours) : 24;
      const result = await fraudService.analyzeIp(req.params.ipAddress, lookbackHours);
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Fraud analysis failed for IP', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to analyze IP for fraud', req);
    }
  });

  // 404 handler
  app.use('*', (req, res) => {
    ServiceErrors.notFound(res, `Route ${req.originalUrl}`, req);
  });
}

function setupErrorHandling(app: express.Application): void {
  setupSentryErrorHandler(app as unknown as import('express').Express);

  // Global error handler
  app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error:', { error: serializeError(error) });

    if (res.headersSent) {
      return next(error);
    }

    ServiceErrors.fromException(res, error, 'Internal Server Error', req);
  });
}
