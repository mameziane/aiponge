/**
 * CSRF Protection Middleware
 * Defense-in-depth for state-changing requests
 *
 * Since the API uses JWT tokens via Authorization header (not cookies),
 * traditional CSRF attacks are mitigated. However, this middleware adds
 * additional protection by validating Origin/Referer headers for
 * state-changing operations (POST, PUT, DELETE, PATCH).
 */

import { Request, Response, NextFunction } from 'express';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';
import { environmentConfig } from '../../config/environment';

const logger = getLogger('csrf-protection');

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  if (environmentConfig.corsOrigins.length > 0) {
    origins.push(...environmentConfig.corsOrigins);
  }

  environmentConfig.corsFrontendPorts.forEach(port => {
    origins.push(`http://${environmentConfig.corsFrontendHost}:${port}`);
    origins.push(`https://${environmentConfig.corsFrontendHost}:${port}`);
  });

  const frontendUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5000';
  origins.push(frontendUrl);
  origins.push(frontendUrl.replace('http://', 'https://'));

  if (process.env.REPLIT_DOMAINS) {
    process.env.REPLIT_DOMAINS.split(',').forEach(domain => {
      origins.push(`https://${domain.trim()}`);
    });
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }

  return origins;
}

function extractOrigin(req: Request): string | null {
  const origin = req.get('Origin');
  if (origin) return origin;

  const referer = req.get('Referer');
  if (referer) {
    try {
      const url = new URL(referer);
      return url.origin;
    } catch (error) {
      logger.warn('Failed to parse Referer header for origin extraction', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  return null;
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');

  return allowedOrigins.some(allowed => {
    const normalizedAllowed = allowed.toLowerCase().replace(/\/$/, '');
    return normalizedOrigin === normalizedAllowed;
  });
}

export function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  const origin = extractOrigin(req);
  const allowedOrigins = getAllowedOrigins();

  if (!origin) {
    if (req.headers.authorization) {
      logger.debug('CSRF check bypassed: API client with Authorization header', {
        method: req.method,
        path: req.path,
      });
      return next();
    }

    logger.warn('CSRF check: No origin header on state-changing request', {
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
    });
    return StructuredErrors.forbidden(res, 'Request origin could not be verified', {
      service: 'api-gateway',
      correlationId: getCorrelationId(req),
      details: { code: 'CSRF_ORIGIN_REQUIRED' },
    });
  }

  if (!isOriginAllowed(origin, allowedOrigins)) {
    logger.warn('CSRF check failed: Origin not allowed', {
      method: req.method,
      path: req.path,
      origin,
      allowedOrigins: allowedOrigins.slice(0, 5),
    });
    return StructuredErrors.forbidden(res, 'Request origin not allowed', {
      service: 'api-gateway',
      correlationId: getCorrelationId(req),
      details: { code: 'CSRF_ORIGIN_DENIED' },
    });
  }

  logger.debug('CSRF check passed', { origin, path: req.path });
  next();
}

export function createCsrfProtectionMiddleware(
  options: {
    skipPaths?: string[];
    requireOriginForApi?: boolean;
  } = {}
) {
  const { skipPaths = [], requireOriginForApi = false } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    if (!requireOriginForApi && req.headers.authorization && SAFE_METHODS.includes(req.method) === false) {
      return next();
    }

    return csrfProtectionMiddleware(req, res, next);
  };
}
