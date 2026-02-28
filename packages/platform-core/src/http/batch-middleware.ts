import type { Request, Response, NextFunction } from 'express';
import { sendErrorResponse } from '../error-handling/errors.js';

export function batchLimitMiddleware(maxItems?: number) {
  const limit = maxItems || parseInt(process.env.BATCH_MAX_ITEMS || '50');
  return (req: Request, res: Response, next: NextFunction) => {
    const items = req.body.updates || req.body.trackIds || req.body.ids || [];
    if (!Array.isArray(items)) {
      sendErrorResponse(res, 400, 'Batch payload must contain an array of items');
      return;
    }
    if (items.length === 0) {
      sendErrorResponse(res, 400, 'Batch payload must contain at least one item');
      return;
    }
    if (items.length > limit) {
      sendErrorResponse(res, 400, `Batch size exceeds maximum of ${limit} items`, {
        details: { limit, received: items.length },
      });
      return;
    }
    next();
  };
}
