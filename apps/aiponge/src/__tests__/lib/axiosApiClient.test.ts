import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      put: vi.fn(),
    })),
  },
  create: vi.fn(() => ({
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  })),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-corr-id'),
}));

vi.mock('../../lib/apiConfig', () => ({
  getApiGatewayUrl: vi.fn(() => 'http://localhost:8080'),
}));

vi.mock('../../lib/authMiddleware', () => ({
  createAuthHeader: vi.fn(() => ({})),
}));

vi.mock('../../utils/errorSerialization', () => ({
  serializeError: vi.fn((error: unknown) => ({ message: (error as Error)?.message || 'Unknown error' })),
  isBackendError: vi.fn(() => false),
  parseBackendError: vi.fn((error: unknown) => error),
  logError: vi.fn(),
}));

vi.mock('../../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../contracts', () => ({
  validateResponseContract: vi.fn(() => ({ valid: true })),
  formatContractViolation: vi.fn(() => ''),
}));

vi.mock('../../lib/interceptors/requestMeta', () => ({
  createRequestMetaInterceptor: vi.fn(() => vi.fn((config: unknown) => config)),
}));

vi.mock('../../lib/interceptors/authRefresh', () => ({
  createAuthRefreshInterceptor: vi.fn(() => vi.fn(() => Promise.reject())),
}));

vi.mock('../../lib/interceptors/errorLogging', () => ({
  createErrorLoggingInterceptor: vi.fn(() => vi.fn(() => Promise.reject())),
}));

import axios from 'axios';
import { apiClient, apiRequest } from '../../lib/axiosApiClient';

describe('AxiosApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should have created an axios-based client', () => {
      expect(apiClient).toBeDefined();
      expect(typeof apiClient.setAuthTokenRetriever).toBe('function');
      expect(typeof apiClient.setLoggingOut).toBe('function');
    });
  });

  describe('auth token retriever', () => {
    it('should allow setting auth token retriever', () => {
      const mockRetriever = vi.fn(() => 'test-token');
      expect(() => apiClient.setAuthTokenRetriever(mockRetriever)).not.toThrow();
    });
  });

  describe('logging out state', () => {
    it('should allow setting logging out state', () => {
      expect(() => apiClient.setLoggingOut(true)).not.toThrow();
      expect(() => apiClient.setLoggingOut(false)).not.toThrow();
    });
  });

  describe('backend error reporter', () => {
    it('should allow setting backend error reporter', () => {
      const mockReporter = vi.fn();
      expect(() => apiClient.setBackendErrorReporter(mockReporter)).not.toThrow();
    });
  });

  describe('exports', () => {
    it('should export apiClient instance', () => {
      expect(apiClient).toBeDefined();
    });

    it('should export apiRequest function', () => {
      expect(typeof apiRequest).toBe('function');
    });
  });
});
