/**
 * Authentication Middleware
 *
 * Express middleware for JWT authentication and authorization
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { DomainError } from '../error-handling';
import { generateCorrelationId } from '../logging';
import { sendErrorResponse } from '../error-handling/errors.js';
import { StandardJWTService } from './jwt-service';
import { AuthenticatedRequest, AuthOptions } from './types';

export class StandardAuthMiddleware {
  private jwtService: StandardJWTService;
  private serviceName: string;

  constructor(serviceName: string, secret?: string) {
    this.serviceName = serviceName;
    this.jwtService = new StandardJWTService(secret);
  }

  authenticate(options: AuthOptions = {}) {
    return (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthenticatedRequest;

      authReq.correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId();
      res.setHeader('x-correlation-id', authReq.correlationId);

      if (options.skipPaths?.some(path => req.path.startsWith(path))) {
        return next();
      }

      try {
        if (options.allowServiceAuth) {
          const serviceKey = req.headers['x-service-key'] as string;
          const expectedServiceKey = process.env.SERVICE_AUTH_KEY;

          if (
            serviceKey &&
            expectedServiceKey &&
            serviceKey.length === expectedServiceKey.length &&
            crypto.timingSafeEqual(Buffer.from(serviceKey), Buffer.from(expectedServiceKey))
          ) {
            authReq.user = {
              id: 'service',
              email: `${this.serviceName}@internal.service`,
              roles: ['service'],
              permissions: [],
            };
            return next();
          }
        }

        if (options.allowApiKey) {
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
          throw new DomainError('Missing authorization header', 401);
        }

        const token = authHeader.replace('Bearer ', '');
        if (!token) {
          throw new DomainError('Missing token', 401);
        }

        const decoded = this.jwtService.verify(token);
        authReq.user = decoded;

        next();
      } catch (error) {
        if (error instanceof DomainError) {
          const statusCode = error.statusCode;
          const code =
            statusCode === 401 ? 'AUTHENTICATION_FAILED' : statusCode === 403 ? 'AUTHORIZATION_FAILED' : 'AUTH_ERROR';
          const type =
            statusCode === 401 ? 'AuthenticationError' : statusCode === 403 ? 'AuthorizationError' : 'AuthError';
          return sendErrorResponse(res, statusCode, error.message, {
            code,
            type,
            correlationId: authReq.correlationId,
          });
        }
        next(error);
      }
    };
  }

  getJwtService(): StandardJWTService {
    return this.jwtService;
  }
}
