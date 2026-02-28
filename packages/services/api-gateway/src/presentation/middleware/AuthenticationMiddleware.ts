/**
 * API Gateway Authentication Middleware - Updated to use Standardized JWT
 */

import { RequestHandler } from 'express';
import { StandardAuthMiddleware } from '@aiponge/platform-core';

interface APIGatewayAuthConfig {
  allowApiKey?: boolean;
  roles?: string[];
  skipAuth?: boolean;
  skipPaths?: string[];
}

/**
 * Initialize standardized authentication middleware
 */
const standardAuthMiddleware = new StandardAuthMiddleware('api-gateway');

/**
 * Main authentication middleware - now uses standardized implementation
 */
export function authenticationMiddleware(config: APIGatewayAuthConfig = {}): RequestHandler {
  return standardAuthMiddleware.authenticate({
    allowApiKey: config.allowApiKey,
    allowServiceAuth: true, // API Gateway always allows service auth
    skipPaths: config.skipPaths || ['/health', '/metrics'],
    // Note: roles and skipAuth handled separately
  });
}

/**
 * Role-based authorization middleware
 */
export function requireRoles(roles: string[]): RequestHandler {
  return authenticationMiddleware({ roles: roles });
}

/**
 * API key only authentication
 */
export function requireApiKey(): RequestHandler {
  return authenticationMiddleware({ allowApiKey: true });
}

/**
 * Service-to-service authentication only
 */
export function requireServiceAuth(): RequestHandler {
  return authenticationMiddleware({ roles: ['service'] });
}

/**
 * Development middleware that skips authentication
 */
export function skipAuth(): RequestHandler {
  return authenticationMiddleware({});
}
