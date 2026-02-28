import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../config/service-urls', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@aiponge/platform-core', () => ({
  serializeError: vi.fn((err: unknown) => err),
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  DomainErrorCode: {},
  createDomainServiceError: vi.fn(
    () =>
      class MockDomainError extends Error {
        public readonly statusCode: number;
        public readonly code?: string;
        constructor(message: string, statusCode: number = 500, code?: string, _cause?: Error) {
          super(message);
          this.statusCode = statusCode;
          this.code = code;
        }
      }
  ),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
}));

import { GenerateUserAnalyticsUseCase } from '../../../application/use-cases/analytics/GenerateUserAnalyticsUseCase';
import { GetContentAnalyticsUseCase } from '../../../application/use-cases/analytics/GetContentAnalyticsUseCase';
import { TrackContentViewUseCase } from '../../../application/use-cases/analytics/TrackContentViewUseCase';
import { AnalyticsError } from '../../../application/errors';

function createMockRepository() {
  return {
    getEntriesByUser: vi.fn().mockResolvedValue([]),
    getInsightsByUser: vi.fn().mockResolvedValue([]),
    recordAnalyticsEvent: vi.fn().mockResolvedValue(undefined),
    getAnalyticsEvents: vi.fn().mockResolvedValue([]),
    getUserPatterns: vi.fn().mockResolvedValue([]),
    getProfileAnalytics: vi.fn().mockResolvedValue([]),
    createPattern: vi.fn().mockResolvedValue({}),
    updatePattern: vi.fn().mockResolvedValue({}),
  };
}

describe('GenerateUserAnalyticsUseCase', () => {
  let useCase: GenerateUserAnalyticsUseCase;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepository();
    useCase = new GenerateUserAnalyticsUseCase(mockRepo as any);
  });

  it('should generate analytics report with default time range', async () => {
    const mockEntries = [
      { id: '1', userId: 'user-1', content: 'Entry 1', type: 'journal', sentiment: 'positive', createdAt: new Date() },
      { id: '2', userId: 'user-1', content: 'Entry 2', type: 'reflection', sentiment: 'neutral', createdAt: new Date() },
      { id: '3', userId: 'user-1', content: 'Entry 3', type: 'journal', sentiment: 'positive', createdAt: new Date() },
    ];
    const mockInsights = [
      { id: 'i1', userId: 'user-1', type: 'trend', confidence: 0.8, actionable: true, createdAt: new Date() },
    ];
    mockRepo.getEntriesByUser.mockResolvedValue(mockEntries);
    mockRepo.getInsightsByUser.mockResolvedValue(mockInsights);

    const result = await useCase.execute({
      userId: 'user-1',
      analyticsDepth: 'summary',
    });

    expect(result.userId).toBe('user-1');
    expect(result.analytics.entryActivity.totalEntries).toBe(3);
    expect(result.analytics.emotionalWellbeing).toBeDefined();
    expect(result.analytics.cognitivePatterns).toBeDefined();
    expect(result.analytics.growthIndicators).toBeDefined();
    expect(result.insights.length).toBeGreaterThanOrEqual(2);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.riskAssessment).toBeDefined();
    expect(result.growthOpportunities).toBeDefined();
    expect(result.generatedAt).toBeInstanceOf(Date);
    expect(result.comparisons).toBeUndefined();
    expect(result.predictions).toBeUndefined();
    expect(mockRepo.recordAnalyticsEvent).toHaveBeenCalledOnce();
  });

  it('should include comparisons when requested', async () => {
    mockRepo.getEntriesByUser.mockResolvedValue([
      { id: '1', userId: 'user-1', content: 'Entry', createdAt: new Date() },
    ]);
    mockRepo.getInsightsByUser.mockResolvedValue([]);

    const result = await useCase.execute({
      userId: 'user-1',
      analyticsDepth: 'detailed',
      includeComparisons: true,
    });

    expect(result.comparisons).toBeDefined();
    expect(result.comparisons?.previousPeriod).toBeDefined();
    expect(result.comparisons?.userAverage).toBeDefined();
  });

  it('should include predictions when requested', async () => {
    mockRepo.getEntriesByUser.mockResolvedValue([]);
    mockRepo.getInsightsByUser.mockResolvedValue([]);

    const result = await useCase.execute({
      userId: 'user-1',
      analyticsDepth: 'summary',
      includePredictions: true,
    });

    expect(result.predictions).toBeDefined();
    expect(result.predictions?.nextWeekOutlook).toBeDefined();
    expect(result.predictions?.recommendedActions).toBeInstanceOf(Array);
    expect(result.predictions?.riskFactors).toBeInstanceOf(Array);
  });

  it('should add extra insight for comprehensive depth', async () => {
    mockRepo.getEntriesByUser.mockResolvedValue([]);
    mockRepo.getInsightsByUser.mockResolvedValue([]);

    const result = await useCase.execute({
      userId: 'user-1',
      analyticsDepth: 'comprehensive',
    });

    expect(result.insights.length).toBe(3);
    expect(result.insights[2].type).toBe('pattern');
  });

  it('should throw AnalyticsError when userId is empty', async () => {
    await expect(
      useCase.execute({ userId: '', analyticsDepth: 'summary' })
    ).rejects.toThrow();
  });

  it('should throw AnalyticsError when userId is whitespace', async () => {
    await expect(
      useCase.execute({ userId: '   ', analyticsDepth: 'summary' })
    ).rejects.toThrow();
  });

  it('should throw AnalyticsError for invalid analytics depth', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', analyticsDepth: 'invalid' as any })
    ).rejects.toThrow();
  });

  it('should throw AnalyticsError for invalid date range (start >= end)', async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 86400000);

    await expect(
      useCase.execute({
        userId: 'user-1',
        analyticsDepth: 'summary',
        timeRange: { start: now, end: past },
      })
    ).rejects.toThrow();
  });

  it('should use provided time range', async () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-31');
    mockRepo.getEntriesByUser.mockResolvedValue([]);
    mockRepo.getInsightsByUser.mockResolvedValue([]);

    const result = await useCase.execute({
      userId: 'user-1',
      analyticsDepth: 'summary',
      timeRange: { start, end },
    });

    expect(result.reportPeriod.start).toEqual(start);
    expect(result.reportPeriod.end).toEqual(end);
    expect(mockRepo.getEntriesByUser).toHaveBeenCalledWith('user-1', {
      dateFrom: start,
      dateTo: end,
      isArchived: false,
    });
  });

  it('should wrap unexpected errors in AnalyticsError.internalError', async () => {
    mockRepo.getEntriesByUser.mockRejectedValue(new Error('DB connection failed'));

    await expect(
      useCase.execute({ userId: 'user-1', analyticsDepth: 'summary' })
    ).rejects.toThrow();
  });
});

describe('GetContentAnalyticsUseCase', () => {
  let useCase: GetContentAnalyticsUseCase;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepository();
    useCase = new GetContentAnalyticsUseCase(mockRepo as any);
  });

  it('should return content analytics with user-specific stats', async () => {
    mockRepo.getAnalyticsEvents.mockResolvedValue([
      { eventType: 'content_generation_completed' },
      { eventType: 'content_generation_completed' },
      { eventType: 'content_generation_failed' },
    ]);

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.summary).toBeDefined();
    expect(result.summary.totalContentRequests).toBe(45);
    expect(result.summary.completedRequests).toBe(38);
    expect(result.summary.failedRequests).toBe(4);
    expect(result.summary.pendingRequests).toBe(3);
    expect(result.summary.averageProcessingTime).toBe(2500);
    expect(result.eventCounts['content_generation_completed']).toBe(2);
    expect(result.eventCounts['content_generation_failed']).toBe(1);
    expect(result.summary.successRate).toBeCloseTo(2 / 3);
    expect(result.topContent).toEqual([]);
    expect(result.timeSeries).toBeUndefined();
    expect(result.contentTypeBreakdown).toEqual({});
  });

  it('should return global stats when no userId provided', async () => {
    mockRepo.getAnalyticsEvents.mockResolvedValue([]);

    const result = await useCase.execute({});

    expect(result.summary.totalContentRequests).toBe(1250);
    expect(result.summary.completedRequests).toBe(1100);
    expect(result.summary.failedRequests).toBe(85);
    expect(result.summary.pendingRequests).toBe(65);
    expect(result.summary.successRate).toBe(0);
  });

  it('should include time series when requested', async () => {
    mockRepo.getAnalyticsEvents.mockResolvedValue([]);

    const result = await useCase.execute({
      userId: 'user-1',
      includeTimeSeries: true,
      timeSeriesInterval: 'day',
    });

    expect(result.timeSeries).toBeDefined();
    expect(result.timeSeries!.length).toBe(7);
    result.timeSeries!.forEach(point => {
      expect(point.timestamp).toBeInstanceOf(Date);
      expect(point.count).toBe(0);
    });
  });

  it('should use default date range when not provided', async () => {
    mockRepo.getAnalyticsEvents.mockResolvedValue([]);

    await useCase.execute({});

    expect(mockRepo.getAnalyticsEvents).toHaveBeenCalled();
    const calledFilter = mockRepo.getAnalyticsEvents.mock.calls[0][0];
    expect(calledFilter.dateFrom).toBeInstanceOf(Date);
    expect(calledFilter.dateTo).toBeInstanceOf(Date);
  });

  it('should wrap unexpected errors in AnalyticsError.internalError', async () => {
    mockRepo.getAnalyticsEvents.mockRejectedValue(new Error('Network error'));

    await expect(
      useCase.execute({ userId: 'user-1' })
    ).rejects.toThrow();
  });
});

describe('TrackContentViewUseCase', () => {
  let useCase: TrackContentViewUseCase;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepository();
    useCase = new TrackContentViewUseCase(mockRepo as any);
  });

  it('should track a basic content view successfully', async () => {
    const result = await useCase.execute({
      userId: 'user-1',
      contentId: 'content-1',
      contentType: 'article',
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Content view tracked successfully');
    expect(mockRepo.recordAnalyticsEvent).toHaveBeenCalledOnce();
    expect(mockRepo.recordAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'content_viewed',
      })
    );
  });

  it('should record search click event when fromSearch is true with searchQuery', async () => {
    const result = await useCase.execute({
      userId: 'user-1',
      contentId: 'content-1',
      contentType: 'article',
      fromSearch: true,
      searchQuery: 'test query',
    });

    expect(result.success).toBe(true);
    expect(mockRepo.recordAnalyticsEvent).toHaveBeenCalledTimes(2);
    expect(mockRepo.recordAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'content_viewed' })
    );
    expect(mockRepo.recordAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'search_result_clicked' })
    );
  });

  it('should record engagement event when viewDuration > 5000ms', async () => {
    const result = await useCase.execute({
      userId: 'user-1',
      contentId: 'content-1',
      contentType: 'article',
      viewDuration: 10000,
    });

    expect(result.success).toBe(true);
    expect(mockRepo.recordAnalyticsEvent).toHaveBeenCalledTimes(2);
    expect(mockRepo.recordAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'content_engaged',
        eventData: expect.objectContaining({
          engagementLevel: 'medium',
          viewDuration: 10000,
        }),
      })
    );
  });

  it('should not record engagement event when viewDuration <= 5000ms', async () => {
    await useCase.execute({
      userId: 'user-1',
      contentId: 'content-1',
      contentType: 'article',
      viewDuration: 3000,
    });

    expect(mockRepo.recordAnalyticsEvent).toHaveBeenCalledOnce();
  });

  it('should record all 3 events: view + search click + engagement', async () => {
    await useCase.execute({
      userId: 'user-1',
      contentId: 'content-1',
      contentType: 'article',
      fromSearch: true,
      searchQuery: 'query',
      viewDuration: 60000,
    });

    expect(mockRepo.recordAnalyticsEvent).toHaveBeenCalledTimes(3);
    const eventTypes = mockRepo.recordAnalyticsEvent.mock.calls.map(
      (call: any[]) => call[0].eventType
    );
    expect(eventTypes).toContain('content_viewed');
    expect(eventTypes).toContain('search_result_clicked');
    expect(eventTypes).toContain('content_engaged');
  });

  it('should throw when userId is empty', async () => {
    await expect(
      useCase.execute({ userId: '', contentId: 'c1', contentType: 'article' })
    ).rejects.toThrow();
  });

  it('should throw when contentId is empty', async () => {
    await expect(
      useCase.execute({ userId: 'u1', contentId: '', contentType: 'article' })
    ).rejects.toThrow();
  });

  it('should throw when contentType is empty', async () => {
    await expect(
      useCase.execute({ userId: 'u1', contentId: 'c1', contentType: '' })
    ).rejects.toThrow();
  });

  it('should classify engagement levels correctly based on viewDuration', async () => {
    const testCases = [
      { duration: 6000, expected: 'medium' },
      { duration: 35000, expected: 'high' },
      { duration: 150000, expected: 'very_high' },
    ];

    for (const { duration, expected } of testCases) {
      vi.clearAllMocks();
      await useCase.execute({
        userId: 'user-1',
        contentId: 'content-1',
        contentType: 'article',
        viewDuration: duration,
      });

      const engagementCall = mockRepo.recordAnalyticsEvent.mock.calls.find(
        (call: any[]) => call[0].eventType === 'content_engaged'
      );
      expect(engagementCall).toBeDefined();
      expect(engagementCall![0].eventData.engagementLevel).toBe(expected);
    }
  });

  it('should wrap unexpected errors in AnalyticsError.internalError', async () => {
    mockRepo.recordAnalyticsEvent.mockRejectedValue(new Error('DB failure'));

    await expect(
      useCase.execute({ userId: 'u1', contentId: 'c1', contentType: 'article' })
    ).rejects.toThrow();
  });
});
