import type { Request, Response, NextFunction } from 'express';
import type express from 'express';
import { setupSentryErrorHandler } from '@aiponge/platform-core';
import { getLogger } from '../config/service-urls';
import { ServiceErrors } from '../presentation/utils/response-helpers';
import type { GatewayAppContext } from './context';

export function setupErrorHandling(app: express.Application, _ctx: GatewayAppContext): void {
  setupSentryErrorHandler(app as unknown as import('express').Express);

  app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    const logger = getLogger('APIGateway');
    logger.error('Gateway error occurred', { error: error instanceof Error ? error.message : String(error) });
    ServiceErrors.fromException(res, error, 'Internal gateway error', req);
  });
}
