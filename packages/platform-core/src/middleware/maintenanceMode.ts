import { Request, Response, NextFunction } from 'express';
import { sendErrorResponse } from '../error-handling/errors.js';

export function maintenanceModeMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';

    if (!isMaintenanceMode) {
      next();
      return;
    }

    if (req.path === '/health/live' || req.path === '/health/startup') {
      next();
      return;
    }

    if (req.path === '/health/ready') {
      sendErrorResponse(res, 503, 'Service is in maintenance mode', {
        details: { maintenance: true },
      });
      return;
    }

    if (req.path.startsWith('/health')) {
      next();
      return;
    }

    if (req.path.includes('/admin')) {
      next();
      return;
    }

    const retryAfter = process.env.MAINTENANCE_RETRY_AFTER || '300';
    const message =
      process.env.MAINTENANCE_MESSAGE || 'Service is temporarily unavailable for maintenance. Please try again later.';

    res.setHeader('Retry-After', retryAfter);
    sendErrorResponse(res, 503, message, {
      details: { maintenance: true, retryAfter: parseInt(retryAfter) },
    });
  };
}
