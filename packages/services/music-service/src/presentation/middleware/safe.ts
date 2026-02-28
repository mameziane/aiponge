import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getLogger } from '../../config/service-urls';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('music-service:safe');

export function safe(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch((error: unknown) => {
      logger.error('Unhandled route error', {
        method: req.method,
        path: req.path,
        error: serializeError(error),
      });
      next(error);
    });
  };
}
