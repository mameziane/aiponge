/**
 * DynamicServiceClient
 * Simple HTTP client for internal service-to-service communication
 * Wrapped with circuit breaker protection per target service
 */

import { withServiceResilience, DomainError } from '@aiponge/platform-core';

const DEFAULT_PORT = process.env.PORT || '3010';
const DEFAULT_HOST = process.env.HOST || '0.0.0.0';

export class DynamicServiceClient {
  private static instance: DynamicServiceClient;

  private constructor() {}

  static getInstance(): DynamicServiceClient {
    if (!DynamicServiceClient.instance) {
      DynamicServiceClient.instance = new DynamicServiceClient();
    }
    return DynamicServiceClient.instance;
  }

  async makeRequest(
    serviceName: string,
    path: string,
    options?: { method?: string; body?: unknown; timeout?: number }
  ): Promise<unknown> {
    const method = options?.method || 'GET';

    return withServiceResilience(serviceName, method, async () => {
      const port = DEFAULT_PORT;
      const host = DEFAULT_HOST === '0.0.0.0' ? 'localhost' : DEFAULT_HOST;
      const url = `http://${host}:${port}${path}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options?.timeout || 10000);

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: options?.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new DomainError(`HTTP ${response.status}: ${response.statusText}`, response.status);
        }

        return await response.json();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new DomainError(`Request to ${serviceName}${path} timed out`, 504);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }
}
