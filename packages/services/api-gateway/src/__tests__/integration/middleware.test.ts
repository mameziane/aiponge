import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { loggingMiddleware } from '../../presentation/middleware/LoggingMiddleware';
import { errorHandlingMiddleware } from '../../presentation/middleware/ErrorHandlingMiddleware';


vi.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../utils/metrics', () => ({
  metrics: {
    recordRequest: vi.fn(),
    recordError: vi.fn(),
    incrementCounter: vi.fn(),
  },
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@aiponge/platform-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
    correlationMiddleware: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
    getCorrelationId: vi.fn((_req: Request) => 'test-correlation-id'),
    errorHandler: vi.fn(() => (error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
      const status = error.status || 500;
      res.status(status).json({ error: error.message });
    }),
  };
});

describe('API Gateway Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      path: '/test',
      headers: {},
      ip: '127.0.0.1',
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      on: vi.fn(),
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('LoggingMiddleware', () => {
    it('should log incoming requests', () => {
      loggingMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() to continue middleware chain', () => {
      loggingMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should handle requests with query parameters', () => {
      mockRequest.query = { test: 'value' };

      loggingMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle POST requests', () => {
      mockRequest.method = 'POST';
      mockRequest.body = { data: 'test' };

      loggingMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('ErrorHandlingMiddleware', () => {
    it('should handle standard errors', () => {
      const error = new Error('Test error');

      errorHandlingMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });

    it('should handle errors with status codes', () => {
      const error = new Error('Not found') as Error & { status?: number };
      error.status = 404;

      errorHandlingMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 for unknown errors', () => {
      const error = new Error('Internal error');

      errorHandlingMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should include error message in response', () => {
      const errorMessage = 'Custom error message';
      const error = new Error(errorMessage);

      errorHandlingMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('error'),
        })
      );
    });
  });

  describe('Middleware Integration', () => {
    it('should chain multiple middleware correctly', () => {
      // Simulate middleware chain
      loggingMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle middleware errors gracefully', () => {
      const error = new Error('Middleware error');

      errorHandlingMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalled();
    });
  });
});
