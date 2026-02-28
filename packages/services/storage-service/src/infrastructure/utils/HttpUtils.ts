/**
 * HTTP Utilities with Resilience Patterns
 * Wrapper around HttpClient for storage service specific needs
 */

import { createHttpClient, logAndTrackError } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('http-utils');

interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  timeoutMs: number;
  exponentialBackoff?: boolean;
}

interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/**
 * Standard timeout configurations by service type
 */
export const TIMEOUT_CONFIGS = {
  STORAGE: { maxRetries: 2, delayMs: 1000, timeoutMs: 30000 }, // 30s for storage operations
  AI: { maxRetries: 2, delayMs: 2000, timeoutMs: 60000 }, // 60s for AI operations
  HEALTH: { maxRetries: 1, delayMs: 500, timeoutMs: 5000 }, // 5s for health checks
  GENERAL: { maxRetries: 2, delayMs: 1000, timeoutMs: 10000 }, // 10s for general operations
} as const;

// Create HTTP clients with different configurations
const storageClient = createHttpClient({
  timeout: TIMEOUT_CONFIGS.STORAGE.timeoutMs,
  retries: TIMEOUT_CONFIGS.STORAGE.maxRetries,
  retryDelay: TIMEOUT_CONFIGS.STORAGE.delayMs,
  serviceName: 'storage-service',
});

const aiClient = createHttpClient({
  timeout: TIMEOUT_CONFIGS.AI.timeoutMs,
  retries: TIMEOUT_CONFIGS.AI.maxRetries,
  retryDelay: TIMEOUT_CONFIGS.AI.delayMs,
  serviceName: 'storage-service',
});

const healthClient = createHttpClient({
  timeout: TIMEOUT_CONFIGS.HEALTH.timeoutMs,
  retries: TIMEOUT_CONFIGS.HEALTH.maxRetries,
  retryDelay: TIMEOUT_CONFIGS.HEALTH.delayMs,
  serviceName: 'storage-service',
});

const generalClient = createHttpClient({
  timeout: TIMEOUT_CONFIGS.GENERAL.timeoutMs,
  retries: TIMEOUT_CONFIGS.GENERAL.maxRetries,
  retryDelay: TIMEOUT_CONFIGS.GENERAL.delayMs,
  serviceName: 'storage-service',
});

/**
 * HTTP request with resilience patterns using StandardHttpClient
 */
export async function resilientFetch(
  url: string,
  options: HttpRequestOptions = {},
  config: RetryConfig = TIMEOUT_CONFIGS.GENERAL
): Promise<Response> {
  // Map config to appropriate client
  let client;
  if (config === TIMEOUT_CONFIGS.STORAGE) {
    client = storageClient;
  } else if (config === TIMEOUT_CONFIGS.AI) {
    client = aiClient;
  } else if (config === TIMEOUT_CONFIGS.HEALTH) {
    client = healthClient;
  } else {
    client = generalClient;
  }

  const method = options.method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  try {
    let data: unknown;

    switch (method) {
      case 'GET':
        data = await client.get(url, { headers, timeout: options.timeout });
        break;
      case 'POST':
        data = await client.post(url, options.body, { headers, timeout: options.timeout });
        break;
      case 'PUT':
        data = await client.put(url, options.body, { headers, timeout: options.timeout });
        break;
      case 'DELETE':
        data = await client.delete(url, { headers, timeout: options.timeout });
        break;
      case 'HEAD':
      case 'PATCH':
      default: {
        // For other methods, use native fetch as HttpClient doesn't support them
        const response = await fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
        });
        return response;
      }
    }

    // Convert data to fetch-compatible Response
    const body =
      data instanceof ArrayBuffer || data instanceof Buffer || typeof data === 'string' ? data : JSON.stringify(data);

    const fetchResponse = new Response(body, {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
    });

    return fetchResponse;
  } catch (error) {
    const configType =
      config === TIMEOUT_CONFIGS.STORAGE
        ? 'STORAGE'
        : config === TIMEOUT_CONFIGS.AI
          ? 'AI'
          : config === TIMEOUT_CONFIGS.HEALTH
            ? 'HEALTH'
            : 'GENERAL';

    const { error: wrappedError, correlationId } = logAndTrackError(
      error,
      `Storage service HTTP request failed - ${configType} operation unavailable`,
      {
        module: 'http_utils',
        operation: 'makeRequest',
        method,
        url: url.replace(/\/\/.*@/, '//***@'), // Hide auth credentials
        configType,
        timeout: config.timeoutMs,
        maxRetries: config.maxRetries,
        phase: 'request_failed',
      },
      'STORAGE_SERVICE_HTTP_REQUEST_FAILURE',
      502 // Bad gateway - external service failure
    );

    logger.error(`Storage HTTP request failed with correlation ${correlationId}`, {
      correlationId,
      url: url.replace(/\/\/.*@/, '//***@'),
      method,
      configType,
    });

    throw wrappedError;
  }
}

/**
 * Convenience methods with predefined configurations
 */
export const HttpUtils = {
  // Storage operations (30s timeout, 2 retries)
  storageRequest: (url: string, options?: HttpRequestOptions) => resilientFetch(url, options, TIMEOUT_CONFIGS.STORAGE),

  // AI service operations (60s timeout, 2 retries)
  aiRequest: (url: string, options?: HttpRequestOptions) => resilientFetch(url, options, TIMEOUT_CONFIGS.AI),

  // Health check operations (5s timeout, 1 retry)
  healthRequest: (url: string, options?: HttpRequestOptions) => resilientFetch(url, options, TIMEOUT_CONFIGS.HEALTH),

  // General operations (10s timeout, 2 retries)
  generalRequest: (url: string, options?: HttpRequestOptions) => resilientFetch(url, options, TIMEOUT_CONFIGS.GENERAL),
};
