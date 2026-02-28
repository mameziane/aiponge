import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import http from 'http';
import https from 'https';
import { DomainError } from '../error-handling';
import { HttpClientConfig } from '../types';
import { timeoutHierarchy } from '../config/timeout-hierarchy.js';
import { getLogger } from '../logging/logger.js';

const httpClientLogger = getLogger('http-client');

class HttpClientError extends DomainError {
  constructor(message: string, statusCode: number, errorCode: string, details?: Record<string, unknown>) {
    super(message, statusCode, undefined, errorCode, details);
    this.name = 'HttpClientError';
  }
}

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

function jitter(baseDelay: number): number {
  return baseDelay * (0.5 + Math.random());
}

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
  ok: boolean;
}

export class HttpClient {
  private client: AxiosInstance;
  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;
  private config: Required<Omit<HttpClientConfig, 'getTracingHeaders' | 'serviceName' | 'skipRetries' | 'maxSockets'>> &
    Pick<HttpClientConfig, 'getTracingHeaders' | 'serviceName' | 'skipRetries' | 'maxSockets'>;

  constructor(config: HttpClientConfig = {}) {
    if (!config.timeout && !config.serviceName) {
      httpClientLogger.debug(
        'HttpClient created without explicit timeout or serviceName — using default service-tier timeout. ' +
          'Pass serviceName to HttpClientConfig for per-service timeout enforcement.'
      );
    }
    const resolvedTimeout = config.timeout || timeoutHierarchy.getServiceTimeout(config.serviceName);

    const maxSockets = config.maxSockets ?? 20;
    const maxFreeSockets = 5;
    const agentTimeout = parseInt(process.env.HTTP_CLIENT_AGENT_TIMEOUT_MS || '60000', 10);

    this.httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets,
      maxFreeSockets,
      timeout: agentTimeout,
    });

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets,
      maxFreeSockets,
      timeout: agentTimeout,
    });

    this.config = {
      baseUrl: config.baseUrl || '',
      timeout: resolvedTimeout,
      retries: config.skipRetries ? 0 : config.retries || 3,
      retryDelay: config.retryDelay || 1000,
      maxRedirects: config.maxRedirects || 5,
      headers: config.headers || {},
      useServiceAuth: config.useServiceAuth || false,
      propagateTracing: config.propagateTracing ?? false,
      getTracingHeaders: config.getTracingHeaders,
      serviceName: config.serviceName,
      skipRetries: config.skipRetries,
      maxSockets,
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl || undefined,
      timeout: this.config.timeout,
      maxRedirects: this.config.maxRedirects,
      validateStatus: status => status < 500,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(config => {
      const correlationId =
        process.env.CORRELATION_ID || config.headers?.['x-correlation-id'] || this.generateCorrelationId();

      if (!config.headers) {
        config.headers = new axios.AxiosHeaders();
      }
      config.headers['x-correlation-id'] = correlationId;
      config.headers['user-agent'] = `platform-core-http-client/1.0.0`;

      if (this.config.useServiceAuth && process.env.SERVICE_AUTH_KEY) {
        config.headers['x-service-key'] = process.env.SERVICE_AUTH_KEY;
      }

      if (this.config.propagateTracing && this.config.getTracingHeaders) {
        const tracingHeaders = this.config.getTracingHeaders();
        for (const [key, value] of Object.entries(tracingHeaders)) {
          config.headers[key] = value;
        }
      }

      const timeoutRemaining = parseInt(config.headers?.['x-timeout-remaining'] as string, 10);
      if (timeoutRemaining > 0 && timeoutRemaining < ((config.timeout as number) || this.config.timeout)) {
        config.timeout = Math.max(timeoutRemaining - 500, 1000);
      }

      const method = (config.method || 'GET').toUpperCase();
      if ((method === 'POST' || method === 'PATCH') && !config.headers['x-idempotency-key']) {
        config.headers['x-idempotency-key'] = crypto.randomUUID();
      }

      return config;
    });

    const MAX_CUMULATIVE_RETRIES = parseInt(process.env.HTTP_MAX_CUMULATIVE_RETRIES || '3', 10);

    this.client.interceptors.response.use(
      response => response,
      async error => {
        const config = error.config;

        const incomingRetryCount = parseInt(config?.headers?.['x-retry-count'] || '0', 10);
        const localRetryCount = config?.__retryCount || 0;
        const cumulativeRetries = incomingRetryCount + localRetryCount;

        if (cumulativeRetries >= MAX_CUMULATIVE_RETRIES) {
          throw this.transformError(error);
        }

        if (this.shouldRetry(error, config) && localRetryCount < this.config.retries) {
          config.__retryCount = localRetryCount + 1;
          if (!config.headers) config.headers = {};
          config.headers['x-retry-count'] = String(incomingRetryCount + config.__retryCount);
          const baseDelay = this.config.retryDelay * Math.pow(2, config.__retryCount - 1);
          const delay = jitter(baseDelay);
          await this.sleep(delay);
          return this.client.request(config);
        }

        throw this.transformError(error);
      }
    );
  }

  private shouldRetry(error: Record<string, unknown>, config?: AxiosRequestConfig & { __retryCount?: number }): boolean {
    const method = (String(config?.method || '')).toUpperCase();
    const hasIdempotencyKey = (config?.headers as Record<string, unknown> | undefined)?.['x-idempotency-key'];

    if (!IDEMPOTENT_METHODS.has(method) && !hasIdempotencyKey) {
      return false;
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return true;
    }
    const response = error.response as Record<string, unknown> | undefined;
    if (response && typeof response.status === 'number' && response.status >= 500) {
      return true;
    }
    return false;
  }

  private transformError(error: Record<string, unknown>): HttpClientError {
    const response = error.response as Record<string, unknown> | undefined;
    const config = error.config as Record<string, unknown> | undefined;
    if (response) {
      const status = response.status as number;
      const data = response.data as Record<string, unknown> | undefined;
      const errorObj = data?.error as Record<string, unknown> | undefined;
      const message =
        (errorObj?.message as string) || (data?.message as string) || (error.message as string) || `HTTP ${status} Error`;
      return new HttpClientError(message, status, 'HTTP_ERROR', {
        url: config?.url as string,
        method: config?.method as string,
        status,
        data,
      });
    } else if (error.request) {
      return new HttpClientError('Network error - unable to reach service', 503, 'NETWORK_ERROR', {
        url: config?.url as string,
        method: config?.method as string,
        code: error.code as string,
      });
    } else {
      return new HttpClientError((error.message as string) || 'Unknown HTTP client error', 500, 'HTTP_CLIENT_ERROR');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateCorrelationId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private toHttpResponse<T>(response: { data: T; status: number; headers: Record<string, unknown> }): HttpResponse<T> {
    return {
      data: response.data,
      status: response.status,
      headers: response.headers as Record<string, string>,
      ok: response.status >= 200 && response.status < 300,
    };
  }

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  async getWithResponse<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.client.get<T>(url, config);
    return this.toHttpResponse(response);
  }

  async postWithResponse<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.client.post<T>(url, data, config);
    return this.toHttpResponse(response);
  }

  async putWithResponse<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.client.put<T>(url, data, config);
    return this.toHttpResponse(response);
  }

  async patchWithResponse<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.client.patch<T>(url, data, config);
    return this.toHttpResponse(response);
  }

  async deleteWithResponse<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.client.delete<T>(url, config);
    return this.toHttpResponse(response);
  }

  async healthCheck(url: string, timeout = 5000): Promise<boolean> {
    try {
      await this.client.get(`${url}/health`, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  getAxiosInstance(): AxiosInstance {
    return this.client;
  }
}
