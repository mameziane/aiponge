import { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { logger } from '../logger';

export interface AuthRefreshDeps {
  getRefreshTokens: () => { refreshToken: string | null; sessionId: string | null };
  updateTokens: (tokens: { token: string; refreshToken: string; sessionId: string }) => void;
  logout: () => Promise<void>;
  isLoggingOut: () => boolean;
}

const AUTH_MUTATION_PATHS = ['/auth/login', '/auth/register', '/auth/guest', '/auth/refresh', '/auth/logout', '/auth/verify'];

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
}

function hasValidBearerToken(config: InternalAxiosRequestConfig | undefined): boolean {
  const headers = config?.headers;
  const authHeader = headers?.['Authorization'] || headers?.get?.('Authorization');
  const str = typeof authHeader === 'string' ? authHeader : '';
  return str.startsWith('Bearer ') && str !== 'Bearer null' && str !== 'Bearer undefined' && str.length > 10;
}

export function createAuthRefreshInterceptor(axiosInstance: AxiosInstance, deps: AuthRefreshDeps) {
  return async (error: AxiosError): Promise<unknown> => {
    const status = error.response?.status;
    const requestUrl = error.config?.url || '';

    if (status !== 401) return Promise.reject(error);
    if (deps.isLoggingOut()) return Promise.reject(error);

    const isAuthMutation = AUTH_MUTATION_PATHS.some(path => requestUrl.includes(path));
    if (isAuthMutation) return Promise.reject(error);

    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    if (requestUrl.includes('/auth/refresh') || originalRequest._retry) {
      // Intentionally silent: logout failure during auth recovery is non-actionable
      deps.logout().catch(() => {});
      return Promise.reject(error);
    }

    if (!hasValidBearerToken(originalRequest)) {
      logger.warn('401 without valid auth header - NOT logging out (client race condition)', { url: requestUrl });
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (newToken: string) => {
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            resolve(axiosInstance(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const tokens = deps.getRefreshTokens();
      if (!tokens.refreshToken || !tokens.sessionId) {
        throw new Error('No refresh token available');
      }

      const response = await axiosInstance.post('/api/v1/auth/refresh', {
        refreshToken: tokens.refreshToken,
        sessionId: tokens.sessionId,
      });

      const payload = response.data?.data ?? response.data;
      const { token, refreshToken: newRefreshToken, sessionId: newSessionId } = payload;

      deps.updateTokens({ token, refreshToken: newRefreshToken, sessionId: newSessionId });
      originalRequest.headers['Authorization'] = `Bearer ${token}`;
      processQueue(null, token);
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      // Intentionally silent: logout failure during auth recovery is non-actionable
      await deps.logout().catch(() => {});
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  };
}
