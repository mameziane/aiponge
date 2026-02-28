/**
 * Request Validation Middleware
 * Provides input validation and sanitization for API requests
 */

import { Request, Response, NextFunction } from 'express';
import { getValidation } from '@aiponge/platform-core';
import { serializeError } from '@aiponge/platform-core';
import { StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';
import { ServiceErrors } from '../utils/response-helpers';

const logger = getLogger('validation-middleware');

const { validateBody, validateQuery, validateParams, validateRequest } = getValidation();

export { validateBody, validateQuery, validateParams, validateRequest };

/**
 * General request validation middleware (checks for required fields, data types, etc.)
 */
export const requestValidationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.get('Content-Type');

      if (!contentType || !contentType.includes('application/json')) {
        return StructuredErrors.validation(res, 'Content-Type must be application/json for POST/PUT/PATCH requests', {
          service: 'ai-config-service',
          correlationId: getCorrelationId(req),
        });
      }
    }

    if (req.body && JSON.stringify(req.body).length > 10 * 1024 * 1024) {
      return StructuredErrors.validation(res, 'Request payload is too large', {
        service: 'ai-config-service',
        correlationId: getCorrelationId(req),
        details: { maxSize: '10MB' },
      });
    }

    next();
  } catch (error) {
    logger.error('Error in request validation', {
      error: serializeError(error),
    });
    ServiceErrors.fromException(res, error, 'An error occurred during request validation', req);
    return;
  }
};

/**
 * Sanitize request data to prevent injection attacks
 */
export const sanitizationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const sanitizeObject = (obj: unknown): unknown => {
      if (typeof obj === 'string') {
        return obj
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      }

      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }

      if (obj && typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
      }

      return obj;
    };

    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    if (req.query) {
      req.query = sanitizeObject(req.query) as typeof req.query;
    }

    next();
  } catch (error) {
    logger.error('Error in sanitization', {
      error: serializeError(error),
    });
    next(error);
  }
};
