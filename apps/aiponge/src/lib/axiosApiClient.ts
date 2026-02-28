import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { getApiGatewayUrl } from './apiConfig';
import { logError } from '../utils/errorSerialization';
import { logger } from './logger';
import { validateResponseContract, formatContractViolation } from '../contracts';
import { createRequestMetaInterceptor } from './interceptors/requestMeta';
import { createAuthRefreshInterceptor, AuthRefreshDeps } from './interceptors/authRefresh';
import { createErrorLoggingInterceptor } from './interceptors/errorLogging';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _idempotencyKey?: string;
    correlationId?: string;
    _retry?: boolean;
  }
}

interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeout?: number;
}

class AxiosApiClient {
  private axiosInstance: AxiosInstance;
  private pendingRequests: Map<string, Promise<unknown>> = new Map();
  private authTokenRetriever: (() => string | null) | null = null;
  private backendErrorReporter: ((error: unknown) => void) | null = null;
  private isLoggingOut: boolean = false;
  private refreshTokenRetriever: (() => { refreshToken: string | null; sessionId: string | null }) | null = null;
  private tokenUpdater: ((tokens: { token: string; refreshToken: string; sessionId: string }) => void) | null = null;
  private logoutHandler: (() => Promise<void>) | null = null;

  constructor() {
    const baseURL = getApiGatewayUrl();

    this.axiosInstance = axios.create({
      baseURL,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.axiosInstance.interceptors.request.use(
      createRequestMetaInterceptor({
        getAuthToken: () => this.authTokenRetriever?.() ?? null,
      })
    );

    const authRefreshDeps: AuthRefreshDeps = {
      getRefreshTokens: () => this.refreshTokenRetriever?.() ?? { refreshToken: null, sessionId: null },
      updateTokens: tokens => this.tokenUpdater?.(tokens),
      logout: async () => {
        if (this.logoutHandler) await this.logoutHandler();
      },
      isLoggingOut: () => this.isLoggingOut,
    };

    this.axiosInstance.interceptors.response.use(
      response => response,
      createAuthRefreshInterceptor(this.axiosInstance, authRefreshDeps)
    );

    this.axiosInstance.interceptors.response.use(
      response => response,
      createErrorLoggingInterceptor({
        isLoggingOut: () => this.isLoggingOut,
        reportError: error => this.backendErrorReporter?.(error),
      })
    );
  }

  setAuthTokenRetriever(retriever: () => string | null): void {
    this.authTokenRetriever = retriever;
  }

  setBackendErrorReporter(reporter: (error: unknown) => void): void {
    this.backendErrorReporter = reporter;
  }

  setLoggingOut(value: boolean): void {
    this.isLoggingOut = value;
  }

  setRefreshTokenRetriever(retriever: () => { refreshToken: string | null; sessionId: string | null }): void {
    this.refreshTokenRetriever = retriever;
  }

  setTokenUpdater(updater: (tokens: { token: string; refreshToken: string; sessionId: string }) => void): void {
    this.tokenUpdater = updater;
  }

  setLogoutHandler(handler: () => Promise<void>): void {
    this.logoutHandler = handler;
  }

  async request<T = unknown>(url: string, config?: AxiosRequestConfig & RequestOptions): Promise<T> {
    const method = config?.method || 'GET';
    const dedupeKey = `${method}:${url}`;

    if (method === 'GET' && this.pendingRequests.has(dedupeKey)) {
      logger.debug('Deduplicating in-flight request', { url });
      return this.pendingRequests.get(dedupeKey) as Promise<T>;
    }

    const executeRequest = async (): Promise<T> => {
      const response = await this.axiosInstance.request<T>({ url, ...config });
      return response.data;
    };

    try {
      if (method === 'GET') {
        const promise = executeRequest().finally(() => {
          this.pendingRequests.delete(dedupeKey);
        });
        this.pendingRequests.set(dedupeKey, promise);
        return await promise;
      }

      const response = await this.axiosInstance.request<T>({ url, ...config });

      if (method === 'POST') {
        logger.debug('POST response received', {
          url,
          status: response.status,
          hasData: response.data !== undefined,
          dataType: typeof response.data,
          dataKeys: response.data && typeof response.data === 'object' ? Object.keys(response.data) : [],
        });
      }

      const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
      if (isDev) {
        const validation = validateResponseContract(method, url, response.data);
        if (!validation.valid) {
          const errorMessage = formatContractViolation(validation);
          logger.error('[CONTRACT VIOLATION]', {
            endpoint: validation.endpoint,
            method: validation.method,
            errors: validation.errors?.issues.map(i => ({
              path: i.path.join('.'),
              message: i.message,
              expected: i.code,
            })),
            responseSample: JSON.stringify(response.data).slice(0, 500),
          });
          logger.warn(errorMessage);
        }
      }

      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError & { config?: { correlationId?: string } };
      const correlationId = axiosError.config?.correlationId;

      if (axios.isAxiosError(error) && error.response?.status === 401 && this.isLoggingOut) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as { error?: { message?: string }; message?: string } | undefined;
        const backendError = new Error(
          responseData?.error?.message || responseData?.message || error.message
        ) as Error & { response?: { status?: number; data: unknown } };
        backendError.response = {
          status: error.response?.status,
          data: error.response?.data,
        };

        logError(backendError, 'API Request', url, correlationId);
        throw backendError;
      }

      logError(error, 'API Request', url, correlationId);
      throw error;
    }
  }

  async get<T = unknown>(url: string, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  async post<T = unknown>(url: string, data?: unknown, options?: Omit<RequestOptions, 'method' | 'data'>): Promise<T> {
    return this.request<T>(url, { ...options, method: 'POST', data });
  }

  async patch<T = unknown>(url: string, data?: unknown, options?: Omit<RequestOptions, 'method' | 'data'>): Promise<T> {
    return this.request<T>(url, { ...options, method: 'PATCH', data });
  }

  async put<T = unknown>(url: string, data?: unknown, options?: Omit<RequestOptions, 'method' | 'data'>): Promise<T> {
    return this.request<T>(url, { ...options, method: 'PUT', data });
  }

  async delete<T = unknown>(url: string, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }

  async upload<T = unknown>(url: string, formData: FormData, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      data: formData,
      headers: { ...options?.headers, 'Content-Type': 'multipart/form-data' },
    });
  }
}

export const apiClient = new AxiosApiClient();

interface ApiRequestOptions extends RequestOptions {
  method?: string;
  data?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

export async function apiRequest<T = unknown>(url: string, options?: ApiRequestOptions): Promise<T> {
  const method = options?.method?.toUpperCase() || 'GET';
  const data = options?.data;

  switch (method) {
    case 'GET':
      return apiClient.get<T>(url, options);
    case 'POST':
      return apiClient.post<T>(url, data, options);
    case 'PUT':
      return apiClient.put<T>(url, data, options);
    case 'PATCH':
      return apiClient.patch<T>(url, data, options);
    case 'DELETE':
      return apiClient.delete<T>(url, options);
    default:
      return apiClient.get<T>(url, options);
  }
}

export type { RequestOptions };

export type { ServiceResponse, ServiceError } from '@aiponge/shared-contracts';
import type { ServiceResponse } from '@aiponge/shared-contracts';

/** @deprecated Use ServiceResponse<T> from @aiponge/shared-contracts instead */
export type ApiResponse<T> = ServiceResponse<T>;

export function extractErrorMessage(response: ServiceResponse<unknown>): string {
  if (response.error?.message) {
    return response.error.message;
  }
  return 'Unknown error';
}
