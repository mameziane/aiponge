/**
 * Database Configuration Utilities
 *
 * Database and Redis connection configuration
 */

import { ServiceDefinition } from '../types';
import { DomainError } from '../error-handling/errors.js';

/**
 * Get database URL with environment override
 * @throws {Error} If DATABASE_URL is not set
 */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new DomainError(
      'DATABASE_URL environment variable is required. ' + 'Set it in your .env file or environment.',
      500
    );
  }
  return url;
}

/**
 * Get Redis URL with environment override.
 * In production, REDIS_URL must be explicitly set — no silent localhost fallback.
 */
export function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (url) return url;

  if (process.env.NODE_ENV === 'production') {
    throw new DomainError(
      'REDIS_URL environment variable is required in production. ' + 'Set it in your deployment environment.',
      500
    );
  }

  return 'redis://localhost:6379';
}

/**
 * Parse service dependencies from environment
 */
export function getServiceDependencies(): ServiceDefinition[] {
  const deps = process.env.SERVICE_DEPENDENCIES;
  if (!deps) return [];

  try {
    return JSON.parse(deps);
  } catch {
    return [];
  }
}
