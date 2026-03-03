import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { ComputeDailyMetricsUseCase } from '../../application/use-cases/lifecycle/ComputeDailyMetricsUseCase';
import type { ILifecycleRepository } from '../../domains/repositories/ILifecycleRepository';
import type { LifecycleEventEntity, TierPlatformCount } from '../../domains/entities/Lifecycle';
import { USER_LIFECYCLE_EVENT_TYPES } from '@aiponge/shared-contracts';

function makeEvent(overrides: Partial<LifecycleEventEntity> = {}): LifecycleEventEntity {
  return {
    id: 'evt-001',
    eventType: 'user.session_started',
    userId: 'user-001',
    tier: 'explorer',
    platform: 'ios',
    sessionId: 'sess-001',
    metadata: {},
    correlationId: 'cor-001',
    source: 'user-service',
    createdAt: new Date('2026-03-01T12:00:00Z'),
    ...overrides,
  };
}

function createMockRepository(): {
  [K in keyof ILifecycleRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    // Write
    insertLifecycleEvent: vi.fn(),
    insertLifecycleEventsBatch: vi.fn(),
    insertSubscriptionChange: vi.fn(),
    upsertAcquisitionAttribution: vi.fn(),
    upsertDailyMetrics: vi.fn().mockResolvedValue(undefined),
    upsertCohortSnapshot: vi.fn(),
    // Read - Scheduler Aggregation
    getLifecycleEventsByDateRange: vi.fn().mockResolvedValue([]),
    getActiveUserCountByTierAndPlatform: vi.fn().mockResolvedValue([]),
    getUserCohort: vi.fn(),
    getDormantUsers: vi.fn(),
    // Read - Dashboard API
    getDailyMetrics: vi.fn(),
    getCohortSnapshots: vi.fn(),
    getSubscriptionHistory: vi.fn(),
    getAcquisitionBreakdown: vi.fn(),
    getRevenueByTierAndPeriod: vi.fn(),
    getChurnRateByTier: vi.fn(),
    getConversionFunnel: vi.fn(),
    // Read - KPI Computation
    getTotalUserCount: vi.fn(),
    getPaidUserCount: vi.fn(),
    getCurrentMRR: vi.fn(),
    getActiveUsersToday: vi.fn(),
    getTrialConversionRate: vi.fn(),
  };
}

describe('ComputeDailyMetricsUseCase', () => {
  let useCase: ComputeDailyMetricsUseCase;
  let mockRepo: ReturnType<typeof createMockRepository>;
  const testDate = new Date('2026-03-01T10:00:00Z');

  beforeEach(() => {
    mockRepo = createMockRepository();
    useCase = new ComputeDailyMetricsUseCase(mockRepo as unknown as ILifecycleRepository);
  });

  it('computes daily metrics for a given date', async () => {
    const events: LifecycleEventEntity[] = [
      makeEvent({
        eventType: USER_LIFECYCLE_EVENT_TYPES.SIGNED_UP,
        userId: 'user-001',
        tier: 'explorer',
        platform: 'ios',
      }),
      makeEvent({
        eventType: USER_LIFECYCLE_EVENT_TYPES.SESSION_ENDED,
        userId: 'user-002',
        tier: 'explorer',
        platform: 'ios',
        metadata: { durationSeconds: 300 },
      }),
      makeEvent({
        eventType: USER_LIFECYCLE_EVENT_TYPES.CONTENT_GENERATED,
        userId: 'user-003',
        tier: 'explorer',
        platform: 'ios',
        metadata: { contentType: 'music' },
      }),
    ];

    const activeUserCounts: TierPlatformCount[] = [{ tier: 'explorer', platform: 'ios', count: 42 }];

    mockRepo.getLifecycleEventsByDateRange.mockResolvedValue(events);
    mockRepo.getActiveUserCountByTierAndPlatform.mockResolvedValue(activeUserCounts);

    const result = await useCase.execute(testDate);

    // 3 events with tier=explorer, platform=ios produce buckets:
    // explorer:ios, all:ios, explorer:all, all:all = 4 rows
    expect(result.rowsComputed).toBe(4);
    expect(mockRepo.upsertDailyMetrics).toHaveBeenCalledTimes(4);

    // Verify the specific tier:platform bucket was upserted with correct aggregations
    const calls = mockRepo.upsertDailyMetrics.mock.calls.map((c: unknown[]) => c[0]);
    const explorerIos = calls.find((m: Record<string, unknown>) => m.tier === 'explorer' && m.platform === 'ios');
    expect(explorerIos).toBeDefined();
    expect(explorerIos.date).toBe('2026-03-01');
    expect(explorerIos.newSignups).toBe(1);
    expect(explorerIos.contentGenerated).toBe(1);
    expect(explorerIos.avgSessionDuration).toBe('300.00');
    expect(explorerIos.activeUsers).toBe(42);

    // Verify date range passed to repository
    expect(mockRepo.getLifecycleEventsByDateRange).toHaveBeenCalledWith(expect.any(Date), expect.any(Date));
  });

  it('handles empty event data (no events for the date)', async () => {
    mockRepo.getLifecycleEventsByDateRange.mockResolvedValue([]);
    mockRepo.getActiveUserCountByTierAndPlatform.mockResolvedValue([]);

    const result = await useCase.execute(testDate);

    expect(result.rowsComputed).toBe(0);
    expect(mockRepo.upsertDailyMetrics).not.toHaveBeenCalled();
  });

  it('aggregates session durations correctly', async () => {
    const events: LifecycleEventEntity[] = [
      makeEvent({
        eventType: USER_LIFECYCLE_EVENT_TYPES.SESSION_ENDED,
        userId: 'user-001',
        tier: 'personal',
        platform: 'ios',
        metadata: { durationSeconds: 120 },
      }),
      makeEvent({
        eventType: USER_LIFECYCLE_EVENT_TYPES.SESSION_ENDED,
        userId: 'user-002',
        tier: 'personal',
        platform: 'ios',
        metadata: { durationSeconds: 480 },
      }),
      makeEvent({
        eventType: USER_LIFECYCLE_EVENT_TYPES.SESSION_ENDED,
        userId: 'user-003',
        tier: 'personal',
        platform: 'ios',
        metadata: { durationSeconds: 0 },
      }),
    ];

    mockRepo.getLifecycleEventsByDateRange.mockResolvedValue(events);
    mockRepo.getActiveUserCountByTierAndPlatform.mockResolvedValue([]);

    await useCase.execute(testDate);

    const calls = mockRepo.upsertDailyMetrics.mock.calls.map((c: unknown[]) => c[0]);
    const personalIos = calls.find((m: Record<string, unknown>) => m.tier === 'personal' && m.platform === 'ios');
    expect(personalIos).toBeDefined();
    // Average of 120 + 480 + 0 = 600 / 3 = 200
    expect(personalIos.avgSessionDuration).toBe('200.00');
  });

  it('processes revenue from payment events', async () => {
    const events: LifecycleEventEntity[] = [
      makeEvent({
        eventType: USER_LIFECYCLE_EVENT_TYPES.PAYMENT_SUCCEEDED,
        userId: 'user-001',
        tier: 'practice',
        platform: 'ios',
        metadata: {
          grossAmount: 9.99,
          transactionId: 'txn-001',
          currency: 'USD',
          store: 'apple',
          billingCycle: 'monthly',
          tier: 'practice',
        },
      }),
      makeEvent({
        eventType: USER_LIFECYCLE_EVENT_TYPES.PAYMENT_SUCCEEDED,
        userId: 'user-002',
        tier: 'practice',
        platform: 'ios',
        metadata: {
          grossAmount: 9.99,
          transactionId: 'txn-002',
          currency: 'USD',
          store: 'apple',
          billingCycle: 'monthly',
          tier: 'practice',
        },
      }),
      makeEvent({
        eventType: USER_LIFECYCLE_EVENT_TYPES.REFUND_PROCESSED,
        userId: 'user-003',
        tier: 'practice',
        platform: 'ios',
        metadata: { amount: 9.99, transactionId: 'txn-003' },
      }),
    ];

    mockRepo.getLifecycleEventsByDateRange.mockResolvedValue(events);
    mockRepo.getActiveUserCountByTierAndPlatform.mockResolvedValue([]);

    await useCase.execute(testDate);

    const calls = mockRepo.upsertDailyMetrics.mock.calls.map((c: unknown[]) => c[0]);
    const practiceIos = calls.find((m: Record<string, unknown>) => m.tier === 'practice' && m.platform === 'ios');
    expect(practiceIos).toBeDefined();

    // Gross = 9.99 + 9.99 = 19.98
    expect(practiceIos.grossRevenue).toBe('19.98');
    // Net = gross * 0.85 (App Store Small Business Program) = 19.98 * 0.85 = 16.983
    expect(practiceIos.netRevenue).toBe('16.98');
    // Refunds = 9.99
    expect(practiceIos.refunds).toBe('9.99');
  });
});
