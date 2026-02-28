import { InternalAxiosRequestConfig } from 'axios';
import { nanoid } from 'nanoid';
import { createAuthHeader } from '../authMiddleware';
import { logger } from '../logger';

interface RequestMetaDeps {
  getAuthToken: () => string | null;
}

export function createRequestMetaInterceptor(deps: RequestMetaDeps) {
  return (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const correlationId = nanoid(10);
    config.headers['X-Correlation-ID'] = correlationId;

    const token = deps.getAuthToken();
    const authHeaders = createAuthHeader(token);
    Object.assign(config.headers, authHeaders);

    const method = config.method?.toUpperCase() || 'GET';
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (!config.headers['X-Idempotency-Key']) {
        const idempotencyKey = config._idempotencyKey || nanoid(21);
        config.headers['X-Idempotency-Key'] = idempotencyKey;
        config._idempotencyKey = idempotencyKey;
      }
    }

    const isProtectedEndpoint = !config.url?.includes('/api/v1/auth/');
    if (isProtectedEndpoint) {
      logger.debug(`API ${method} ${config.url}`, {
        correlationId,
        hasToken: !!token,
        tokenLength: token?.length || 0,
      });
    } else {
      logger.debug(`API ${method} ${config.url}`, { correlationId });
    }

    config.correlationId = correlationId;

    return config;
  };
}
