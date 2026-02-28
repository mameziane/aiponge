/**
 * HTTP Configurations
 *
 * Pre-configured HTTP client settings for different service types
 */

import { HttpClient } from './http-client';

/**
 * Parse and validate a positive integer from environment variable
 * @throws {Error} if value is invalid (non-numeric or not positive)
 */
function parsePositiveInt(envVar: string, defaultValue: number, minValue = 1): number {
  const value = process.env[envVar];
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < minValue) {
    throw new Error(
      `Invalid ${envVar}: "${value}". Must be a positive integer >= ${minValue}. ` + `Default is ${defaultValue}.`
    );
  }
  return parsed;
}

/**
 * Service-specific HTTP client configurations
 * Timeout and retry values can be overridden via environment variables
 */
export const HttpConfigs = {
  // Fast health checks
  health: {
    timeout: parsePositiveInt('HEALTH_CHECK_TIMEOUT_MS', 5000, 100),
    retries: parsePositiveInt('HEALTH_CHECK_RETRIES', 1, 0),
    useServiceAuth: false,
  },

  // Internal service communication - uses service authentication
  internal: {
    timeout: parsePositiveInt('INTERNAL_SERVICE_TIMEOUT_MS', 10000, 100),
    retries: parsePositiveInt('INTERNAL_SERVICE_RETRIES', 3, 0),
    useServiceAuth: true,
  },

  // External API calls - never use service auth for external APIs
  external: {
    timeout: parsePositiveInt('EXTERNAL_SERVICE_TIMEOUT_MS', 30000, 100),
    retries: parsePositiveInt('EXTERNAL_SERVICE_RETRIES', 2, 0),
    useServiceAuth: false,
  },

  // AI service calls (longer timeout for music generation) - external, no service auth
  // Music generation can take 60-120 seconds, so we use 120s timeout
  ai: {
    timeout: parsePositiveInt('AI_REQUEST_TIMEOUT_MS', 120000, 1000),
    retries: parsePositiveInt('AI_REQUEST_RETRIES', 2, 0),
    useServiceAuth: false,
  },

  // Storage operations - external, no service auth
  storage: {
    timeout: parsePositiveInt('STORAGE_SERVICE_TIMEOUT_MS', 30000, 100),
    retries: parsePositiveInt('STORAGE_SERVICE_RETRIES', 3, 0),
    useServiceAuth: false,
  },
} as const;

/**
 * Create HTTP client for specific service type
 * @param type - The HttpConfig profile to use
 * @param serviceName - Optional service name for timeout hierarchy resolution
 */
export function createServiceHttpClient(type: keyof typeof HttpConfigs, serviceName?: string): HttpClient {
  return new HttpClient({ ...HttpConfigs[type], serviceName });
}
