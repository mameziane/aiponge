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

import { TraceRepository } from '../infrastructure/repositories/TraceRepository';
import { requestTraces, traceSpans } from '../schema/analytics-schema';

function createMockDb() {
  const mockChain: Record<string, ReturnType<typeof vi.fn>> = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };

  return {
    insert: vi.fn().mockReturnValue(mockChain),
    select: vi.fn().mockReturnValue(mockChain),
    update: vi.fn().mockReturnValue(mockChain),
    delete: vi.fn().mockReturnValue(mockChain),
    _chain: mockChain,
  };
}

describe('TraceRepository', () => {
  let repository: TraceRepository;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    repository = new TraceRepository(mockDb);
  });

  describe('createTrace', () => {
    it('should create a trace and return the created record', async () => {
      const traceData = {
        correlationId: 'corr-123',
        userId: 'user-1',
        startTime: new Date(),
        status: 'active',
        entryService: 'api-gateway',
        entryOperation: 'POST /users',
        httpMethod: 'POST',
        httpPath: '/users',
        spanCount: 0,
      };

      const expectedResult = { ...traceData, id: 1 };
      mockDb._chain.returning.mockResolvedValue([expectedResult]);

      const result = await repository.createTrace(traceData as unknown as Record<string, unknown>);

      expect(mockDb.insert).toHaveBeenCalledWith(requestTraces);
      expect(mockDb._chain.values).toHaveBeenCalledWith(traceData);
      expect(result).toEqual(expectedResult);
    });

    it('should handle upsert on conflict', async () => {
      const traceData = {
        correlationId: 'corr-123',
        status: 'completed',
        endTime: new Date(),
        totalDuration: 150,
      };

      mockDb._chain.returning.mockResolvedValue([traceData]);

      await repository.createTrace(traceData as unknown as Record<string, unknown>);

      expect(mockDb._chain.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: requestTraces.correlationId,
          set: expect.objectContaining({
            status: traceData.status,
            endTime: traceData.endTime,
            totalDuration: traceData.totalDuration,
          }),
        })
      );
    });
  });

  describe('createSpan', () => {
    it('should create a span and increment trace span count', async () => {
      const spanData = {
        spanId: 'span-1',
        correlationId: 'corr-123',
        service: 'user-service',
        operation: 'createUser',
        startTime: new Date(),
        status: 'completed',
      };

      const expectedSpan = { ...spanData, id: 1 };
      mockDb._chain.returning.mockResolvedValue([expectedSpan]);

      const result = await repository.createSpan(spanData as unknown as Record<string, unknown>);

      expect(mockDb.insert).toHaveBeenCalledWith(traceSpans);
      expect(mockDb._chain.values).toHaveBeenCalledWith(spanData);
      expect(mockDb.update).toHaveBeenCalledWith(requestTraces);
      expect(mockDb._chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          spanCount: expect.anything(),
        })
      );
      expect(result).toEqual(expectedSpan);
    });
  });

  describe('getTraceByCorrelationId', () => {
    it('should return null when trace is not found', async () => {
      mockDb._chain.limit.mockResolvedValue([]);

      const result = await repository.getTraceByCorrelationId('nonexistent');

      expect(result).toBeNull();
    });

    it('should return trace with spans when found', async () => {
      const traceData = {
        correlationId: 'corr-123',
        userId: 'user-1',
        startTime: new Date('2025-01-01T00:00:00Z'),
        endTime: new Date('2025-01-01T00:00:01Z'),
        totalDuration: 1000,
        status: 'completed',
        entryService: 'api-gateway',
        entryOperation: 'GET /data',
        httpMethod: 'GET',
        httpPath: '/data',
        httpStatusCode: 200,
        errorMessage: null,
      };

      const spanData = [{
        spanId: 'span-1',
        parentSpanId: null,
        service: 'api-gateway',
        operation: 'handleRequest',
        startTime: new Date('2025-01-01T00:00:00Z'),
        duration: 500,
        status: 'completed',
        errorCode: null,
        errorMessage: null,
        riskLevel: null,
        metadata: null,
      }];

      mockDb._chain.limit.mockResolvedValueOnce([traceData]);
      mockDb._chain.orderBy.mockResolvedValueOnce(spanData);

      const result = await repository.getTraceByCorrelationId('corr-123');

      expect(result).not.toBeNull();
      expect(result!.correlationId).toBe('corr-123');
      expect(result!.status).toBe('completed');
      expect(result!.spans).toHaveLength(1);
      expect(result!.spans[0].spanId).toBe('span-1');
    });
  });

  describe('searchTraces', () => {
    it('should search with no filters and return results', async () => {
      const traces = [{ correlationId: 'corr-1' }, { correlationId: 'corr-2' }];
      mockDb._chain.offset.mockResolvedValue(traces);

      const result = await repository.searchTraces({});

      expect(result).toEqual(traces);
    });

    it('should apply userId filter', async () => {
      mockDb._chain.offset.mockResolvedValue([]);

      await repository.searchTraces({ userId: 'user-1' });

      expect(mockDb._chain.where).toHaveBeenCalled();
    });

    it('should apply status filter', async () => {
      mockDb._chain.offset.mockResolvedValue([]);

      await repository.searchTraces({ status: 'error' });

      expect(mockDb._chain.where).toHaveBeenCalled();
    });

    it('should apply duration filters', async () => {
      mockDb._chain.offset.mockResolvedValue([]);

      await repository.searchTraces({ minDuration: 100, maxDuration: 5000 });

      expect(mockDb._chain.where).toHaveBeenCalled();
    });

    it('should apply time range filters', async () => {
      mockDb._chain.offset.mockResolvedValue([]);

      await repository.searchTraces({
        since: new Date('2025-01-01'),
        until: new Date('2025-01-31'),
      });

      expect(mockDb._chain.where).toHaveBeenCalled();
    });

    it('should limit results to max 100', async () => {
      mockDb._chain.offset.mockResolvedValue([]);

      await repository.searchTraces({ limit: 200 });

      expect(mockDb._chain.limit).toHaveBeenCalledWith(100);
    });

    it('should default limit to 50', async () => {
      mockDb._chain.offset.mockResolvedValue([]);

      await repository.searchTraces({});

      expect(mockDb._chain.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('getSlowRequests', () => {
    it('should return slow requests with slowest span info', async () => {
      const slowTrace = {
        correlationId: 'corr-slow',
        userId: 'user-1',
        startTime: new Date('2025-01-01'),
        totalDuration: 5000,
        httpMethod: 'POST',
        httpPath: '/heavy',
        status: 'completed',
      };

      const slowestSpan = [{
        service: 'db-service',
        operation: 'complexQuery',
        duration: 4000,
      }];

      mockDb._chain.limit.mockResolvedValueOnce([slowTrace]);
      mockDb._chain.limit.mockResolvedValueOnce(slowestSpan);

      const result = await repository.getSlowRequests(1000, new Date('2025-01-01'));

      expect(result).toHaveLength(1);
      expect(result[0].correlationId).toBe('corr-slow');
      expect(result[0].totalDuration).toBe(5000);
      expect(result[0].slowestSpan).toEqual({
        service: 'db-service',
        operation: 'complexQuery',
        duration: 4000,
      });
    });

    it('should handle traces without spans', async () => {
      const trace = {
        correlationId: 'corr-1',
        userId: null,
        startTime: new Date(),
        totalDuration: 2000,
        httpMethod: 'GET',
        httpPath: '/test',
        status: 'completed',
      };

      mockDb._chain.limit.mockResolvedValueOnce([trace]);
      mockDb._chain.limit.mockResolvedValueOnce([]);

      const result = await repository.getSlowRequests(1000, new Date());

      expect(result[0].slowestSpan).toBeNull();
    });
  });

  describe('getTraceStats', () => {
    it('should return aggregated trace statistics', async () => {
      const statsResult = [{
        totalTraces: 100,
        avgDuration: 250.5,
        p95Duration: 800,
        p99Duration: 1500,
        errorCount: 5,
      }];

      const serviceStats = [
        { service: 'api-gateway', avgDuration: 300, count: 50 },
        { service: 'user-service', avgDuration: 150, count: 30 },
      ];

      mockDb._chain.where.mockResolvedValueOnce(statsResult);
      mockDb._chain.limit.mockResolvedValueOnce(serviceStats);

      const result = await repository.getTraceStats(new Date());

      expect(result.totalTraces).toBe(100);
      expect(result.avgDuration).toBe(251);
      expect(result.p95Duration).toBe(800);
      expect(result.p99Duration).toBe(1500);
      expect(result.errorRate).toBe(0.05);
      expect(result.topSlowServices).toHaveLength(2);
    });

    it('should handle empty stats', async () => {
      mockDb._chain.where.mockResolvedValueOnce([{
        totalTraces: 0,
        avgDuration: null,
        p95Duration: null,
        p99Duration: null,
        errorCount: 0,
      }]);
      mockDb._chain.limit.mockResolvedValueOnce([]);

      const result = await repository.getTraceStats(new Date());

      expect(result.totalTraces).toBe(0);
      expect(result.avgDuration).toBe(0);
      expect(result.errorRate).toBe(0);
      expect(result.topSlowServices).toHaveLength(0);
    });
  });

  describe('updateTraceEnd', () => {
    it('should update trace end time and duration', async () => {
      const startTime = new Date('2025-01-01T00:00:00Z');
      const endTime = new Date('2025-01-01T00:00:01Z');

      mockDb._chain.limit.mockResolvedValue([{ startTime }]);

      await repository.updateTraceEnd('corr-123', endTime, 'completed', 200);

      expect(mockDb.update).toHaveBeenCalledWith(requestTraces);
      expect(mockDb._chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          endTime,
          totalDuration: 1000,
          status: 'completed',
          httpStatusCode: 200,
        })
      );
    });

    it('should not update if trace is not found', async () => {
      mockDb._chain.limit.mockResolvedValue([]);

      await repository.updateTraceEnd('nonexistent', new Date(), 'completed');

      expect(mockDb.update).toHaveBeenCalledTimes(0);
    });
  });

  describe('cleanupOldTraces', () => {
    it('should delete old spans and traces', async () => {
      mockDb._chain.returning.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const result = await repository.cleanupOldTraces(new Date('2024-01-01'));

      expect(mockDb.delete).toHaveBeenCalledTimes(2);
      expect(result).toBe(3);
    });

    it('should return 0 when no traces to clean', async () => {
      mockDb._chain.returning.mockResolvedValue([]);

      const result = await repository.cleanupOldTraces(new Date());

      expect(result).toBe(0);
    });
  });
});
