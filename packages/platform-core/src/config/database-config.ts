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
 * Get Redis URL with environment override
 */
export function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
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
