/**
 * Shared Proxy Helpers
 * Utilities for proxying requests to backend services
 */

import { Request, Response } from 'express';
import { ServiceLocator } from '@aiponge/platform-core';
import { sendStructuredError, createStructuredError, getCorrelationId } from '@aiponge/shared-contracts';
import { getLogger } from '../../../config/service-urls';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-proxy-helpers');

const PROXY_TIMEOUT_MS = 30_000;

export function createRequestAbortController(
  req: Request,
  timeoutMs: number = PROXY_TIMEOUT_MS
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onClose = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  req.once('close', onClose);
  const cleanup = () => {
    clearTimeout(timeoutId);
    req.removeListener('close', onClose);
  };
  return { controller, cleanup };
}

const createProxyFunction =
  (serviceName: string) =>
  async (req: Request, res: Response, path: string, method: string = 'GET'): Promise<void> => {
    const serviceUrl = ServiceLocator.getServiceUrl(serviceName);

    const queryString =
      Object.keys(req.query).length > 0
        ? '?' + new URLSearchParams(req.query as Record<string, string>).toString()
        : '';

    const targetUrl = `${serviceUrl}${path}${queryString}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
    };

    if (req.headers['x-user-id']) {
      headers['x-user-id'] = req.headers['x-user-id'] as string;
    }

    if (req.headers['x-user-role']) {
      headers['x-user-role'] = req.headers['x-user-role'] as string;
    }

    if (req.headers['authorization']) {
      headers['authorization'] = req.headers['authorization'] as string;
    }

    const { controller, cleanup } = createRequestAbortController(req);

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (method !== 'GET' && method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    try {
      const response = await gatewayFetch(targetUrl, fetchOptions);

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await response.json();
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        res.status(response.status).type(contentType).send(text);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`Proxy to ${serviceName} timed out after ${PROXY_TIMEOUT_MS}ms`, { path, method });
        sendStructuredError(
          res,
          504,
          createStructuredError('TIMEOUT', 'TimeoutError', `Request to ${serviceName} timed out`, {
            service: 'api-gateway',
            correlationId: getCorrelationId(req),
            details: { code: 'PROXY_TIMEOUT', serviceName },
          })
        );
        return;
      }
      logger.error(`Proxy to ${serviceName} failed`, { path, method, error });
      sendStructuredError(
        res,
        502,
        createStructuredError(
          'EXTERNAL_SERVICE_ERROR',
          'ExternalServiceError',
          `Failed to proxy request to ${serviceName}`,
          {
            service: 'api-gateway',
            correlationId: getCorrelationId(req),
            details: { code: 'PROXY_ERROR', serviceName },
          }
        )
      );
    } finally {
      cleanup();
    }
  };

export const proxyToSystemService = createProxyFunction('system-service');
export const proxyToAiContentService = createProxyFunction('ai-content-service');

export const proxyToUserService = async (
  req: Request,
  res: Response,
  path: string,
  method: string = 'GET'
): Promise<void> => {
  const userServiceUrl = ServiceLocator.getServiceUrl('user-service');

  const queryString =
    Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query as Record<string, string>).toString() : '';

  const targetUrl = `${userServiceUrl}${path}${queryString}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-request-id': (req.headers['x-request-id'] as string) || 'unknown',
  };

  if (req.headers['x-user-id']) {
    headers['x-user-id'] = req.headers['x-user-id'] as string;
  }

  if (req.headers['x-user-role']) {
    headers['x-user-role'] = req.headers['x-user-role'] as string;
  }

  if (req.headers['authorization']) {
    headers['authorization'] = req.headers['authorization'] as string;
  }

  const { controller, cleanup } = createRequestAbortController(req);

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (method !== 'GET' && method !== 'HEAD' && req.body) {
    fetchOptions.body = JSON.stringify(req.body);
  }

  try {
    const response = await gatewayFetch(targetUrl, fetchOptions);

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).type(contentType).send(text);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('Proxy to user-service timed out after ' + PROXY_TIMEOUT_MS + 'ms', { path, method });
      sendStructuredError(
        res,
        504,
        createStructuredError('TIMEOUT', 'TimeoutError', 'Request to user-service timed out', {
          service: 'api-gateway',
          correlationId: getCorrelationId(req),
          details: { code: 'PROXY_TIMEOUT', serviceName: 'user-service' },
        })
      );
      return;
    }
    logger.error('Proxy to user-service failed', { path, method, error });
    sendStructuredError(
      res,
      502,
      createStructuredError(
        'EXTERNAL_SERVICE_ERROR',
        'ExternalServiceError',
        'Failed to proxy request to user-service',
        {
          service: 'api-gateway',
          correlationId: getCorrelationId(req),
          details: { code: 'PROXY_ERROR', serviceName: 'user-service' },
        }
      )
    );
  } finally {
    cleanup();
  }
};
