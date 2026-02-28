import * as Sentry from '@sentry/node';
import type { Express, Request, Response, NextFunction } from 'express';

let sentryInitialized = false;

export function initSentry(serviceName: string): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  const isProd = process.env.NODE_ENV === 'production';

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    serverName: serviceName,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || (isProd ? '0.1' : '1.0')),
    sendDefaultPii: false,
  });

  sentryInitialized = true;
}

export function isSentryInitialized(): boolean {
  return sentryInitialized;
}

export function createSentryCorrelationMiddleware() {
  if (!sentryInitialized) {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  return (req: Request, _res: Response, next: NextFunction): void => {
    const correlationId = (req.headers['x-correlation-id'] as string) || (req.headers['correlation-id'] as string);

    if (correlationId) {
      Sentry.getCurrentScope().setTag('correlationId', correlationId);
    }

    next();
  };
}

export function setupSentryErrorHandler(app: Express): void {
  if (!sentryInitialized) return;
  Sentry.setupExpressErrorHandler(app);
}

export { Sentry };
