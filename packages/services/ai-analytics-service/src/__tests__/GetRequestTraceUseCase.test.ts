import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500, cause?: Error) {
      super(message);
      this.statusCode = statusCode;
      if (cause) this.cause = cause;
    }
  },
}));

vi.mock('../config/service-urls', () => ({
  getLogger: () => mockLogger,
  getServiceUrls: () => ({}),
}));

import { GetRequestTraceUseCase } from '../application/use-cases/tracing/GetRequestTraceUseCase';

describe('GetRequestTraceUseCase', () => {
  let useCase: GetRequestTraceUseCase;
  let mockTraceRepository: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTraceRepository = {
      getTraceByCorrelationId: vi.fn(),
    };

    useCase = new GetRequestTraceUseCase(mockTraceRepository);
  });

  it('should return error when correlationId is empty', async () => {
    const result = await useCase.execute({ correlationId: '' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Correlation ID is required');
  });

  it('should return error when trace is not found', async () => {
    mockTraceRepository.getTraceByCorrelationId.mockResolvedValue(null);

    const result = await useCase.execute({ correlationId: 'abc-123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Trace not found');
    expect(result.error).toContain('abc-123');
  });

  it('should return trace when found', async () => {
    const mockTrace = {
      correlationId: 'abc-123',
      userId: 'user-1',
      startTime: '2024-01-01T00:00:00Z',
      endTime: '2024-01-01T00:00:01Z',
      totalDuration: 1000,
      status: 'completed',
      entryService: 'api-gateway',
      entryOperation: 'POST /api/content',
      httpMethod: 'POST',
      httpPath: '/api/content',
      httpStatusCode: 200,
      errorMessage: null,
      spans: [
        {
          spanId: 'span-1',
          parentSpanId: null,
          service: 'api-gateway',
          operation: 'handle_request',
          startTime: '2024-01-01T00:00:00Z',
          duration: 1000,
          status: 'completed',
          errorCode: null,
          errorMessage: null,
          riskLevel: null,
          metadata: {},
        },
      ],
    };

    mockTraceRepository.getTraceByCorrelationId.mockResolvedValue(mockTrace);

    const result = await useCase.execute({ correlationId: 'abc-123' });

    expect(result.success).toBe(true);
    expect(result.trace).toEqual(mockTrace);
    expect(mockTraceRepository.getTraceByCorrelationId).toHaveBeenCalledWith('abc-123');
  });

  it('should handle repository errors gracefully', async () => {
    mockTraceRepository.getTraceByCorrelationId.mockRejectedValue(new Error('Database connection failed'));

    const result = await useCase.execute({ correlationId: 'abc-123' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database connection failed');
  });

  it('should handle non-Error throws gracefully', async () => {
    mockTraceRepository.getTraceByCorrelationId.mockRejectedValue('string error');

    const result = await useCase.execute({ correlationId: 'abc-123' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to retrieve trace');
  });
});
