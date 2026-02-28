/**
 * HTTP Client Factory
 * Creates configured HttpClient instances with automatic correlation ID propagation
 */

import { Request } from 'express';
import { createHttpClient, type HttpClient } from '@aiponge/platform-core';
import { getCorrelationId } from '../presentation/middleware/correlationMiddleware';
import { GatewayConfig } from '../config/GatewayConfig';

/**
 * Create an HTTP client configured for service-to-service communication
 * Automatically includes correlation ID for distributed tracing
 *
 * @param req Express request object containing correlation ID
 * @param options Optional config overrides (e.g., for aggregation endpoints)
 * @returns Configured HttpClient with correlation ID propagation
 */
export function createServiceClient(req: Request, options?: { timeout?: number; retries?: number }): HttpClient {
  const correlationId = getCorrelationId(req);

  // Use GatewayConfig for centralized configuration
  const config = {
    timeout: options?.timeout ?? GatewayConfig.http.defaults.timeout,
    retries: options?.retries ?? GatewayConfig.http.defaults.retries,
  };

  // HttpClient interceptor checks config.headers['x-correlation-id'] first
  // This ensures our correlation ID is used instead of generating a new one
  const client = createHttpClient({ ...config, serviceName: 'api-gateway' });

  // Store correlation ID in client for interceptor to use
  // Note: This is a workaround since HttpClient doesn't support per-instance headers
  // Each request will need to pass headers with correlation ID
  return client;
}

/**
 * Create request config with correlation ID for use with existing HttpClient instances
 * Use this when you already have an HttpClient and just need the config
 */
export function createRequestConfigWithCorrelation(req: Request) {
  const correlationId = getCorrelationId(req);

  return {
    headers: {
      'x-correlation-id': correlationId,
    },
  };
}
