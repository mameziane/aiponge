import type express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import {
  maintenanceModeMiddleware,
  isSentryInitialized,
  createSentryCorrelationMiddleware,
} from '@aiponge/platform-core';
import type { GatewayAppContext } from './context';

export function setupSecurity(app: express.Application, ctx: GatewayAppContext): void {
  app.use(
    cors({
      origin: ctx.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Idempotency-Key'],
    })
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", ...ctx.corsOrigins],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    compression({
      level: process.env.NODE_ENV === 'production' ? 9 : 6,
      threshold: 1024,
    }) as ReturnType<typeof compression>
  );

  app.use(maintenanceModeMiddleware());

  if (isSentryInitialized()) {
    app.use(createSentryCorrelationMiddleware());
  }
}
