/**
 * AI Analytics Service - Express App Factory
 * Creates the Express app instance without starting server for testing and E2E validation.
 * Route handlers, controllers, and service initialization are in dedicated modules.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import {
  serializeError,
  initSentry,
  isSentryInitialized,
  createSentryCorrelationMiddleware,
  setupSentryErrorHandler,
  getResponseHelpers,
} from '@aiponge/platform-core';
import { createServiceRegistry } from './infrastructure/ServiceFactory';
import { setupRoutes } from './presentation/routes';
import { getLogger } from './config/service-urls';

initSentry('ai-analytics-service');

const logger = getLogger('ai-analytics-service-app');
const { ServiceErrors } = getResponseHelpers();
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Creates AI Analytics Service Express app instance.
 * Used for both testing and production server.
 */
export function createApp(): express.Application {
  const app = express();
  const registry = createServiceRegistry();

  setupMiddleware(app);
  setupRoutes(app, registry);
  setupErrorHandling(app);

  return app;
}

function setupMiddleware(app: express.Application): void {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(compression() as express.RequestHandler);

  const corsOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : NODE_ENV === 'production'
      ? ['https://admin.aiponge.com', 'https://api.aiponge.com']
      : true;

  app.use(cors({ origin: corsOrigins, credentials: true }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: NODE_ENV === 'production' ? 1000 : 10000,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
  });
  app.use('/api/', limiter);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  if (isSentryInitialized()) {
    app.use(createSentryCorrelationMiddleware());
  }

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.debug('{} {} - {} ({}ms)', { data0: req.method, data1: req.path, data2: res.statusCode, data3: duration });
    });
    next();
  });
}

function setupErrorHandling(app: express.Application): void {
  setupSentryErrorHandler(app as unknown as import('express').Express);

  app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error:', { error: serializeError(error) });

    if (res.headersSent) {
      return next(error);
    }

    ServiceErrors.fromException(res, error, 'Internal Server Error', req);
  });
}
