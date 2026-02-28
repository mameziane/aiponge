/**
 * AI Content Service - Express App Factory
 * Creates the Express app instance without starting server for testing and E2E validation
 */

import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createMinimalContentRoutes } from './presentation/routes/content-routes';
import { errorHandlerMiddleware, notFoundHandler } from './presentation/middleware/errorHandler';
import { createRequestLogger } from './presentation/middleware/logging';
import {
  initSentry,
  isSentryInitialized,
  createSentryCorrelationMiddleware,
  setupSentryErrorHandler,
  createResilienceStatsHandler,
} from '@aiponge/platform-core';

initSentry('ai-content-service');

/**
 * Creates AI Content Service Express app instance
 * This is used for both testing and production server
 */
export function createApp(): Express {
  const app = express();

  // Setup middleware
  setupMiddleware(app);

  // Setup routes
  setupRoutes(app);

  // Setup error handling
  setupErrorHandling(app);

  return app;
}

function setupMiddleware(app: Express): void {
  // Security middleware
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
    : process.env.NODE_ENV === 'production'
      ? ['https://admin.aiponge.com', 'https://api.aiponge.com']
      : true;

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      optionsSuccessStatus: 200,
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 1000 : 10000,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
  });
  app.use('/api', limiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  if (isSentryInitialized()) {
    app.use(createSentryCorrelationMiddleware());
  }

  // Request logging
  app.use(createRequestLogger('ai-content-service'));
}

function setupRoutes(app: Express): void {
  // Setup minimal routes that work immediately
  app.use('/api', createMinimalContentRoutes());

  app.get('/api/admin/resilience-stats', createResilienceStatsHandler('ai-content-service'));

  // Basic health endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'ai-content-service',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mode: 'minimal',
    });
  });

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      service: 'ai-content-service',
      version: process.env.npm_package_version || '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        content: '/api/content',
        generate: '/api/content/generate',
        aiTextAnalyze: '/api/ai/text/analyze',
        aiReflectionGenerate: '/api/ai/reflection/generate',
        aiHealth: '/api/ai/health',
      },
    });
  });
}

function setupErrorHandling(app: Express): void {
  setupSentryErrorHandler(app);
  app.use(notFoundHandler);
  app.use(errorHandlerMiddleware);
}

export const app = createApp();
