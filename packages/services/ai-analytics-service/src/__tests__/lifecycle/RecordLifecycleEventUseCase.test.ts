import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordLifecycleEventUseCase } from '../../application/use-cases/lifecycle/RecordLifecycleEventUseCase';
import type { RecordLifecycleEventRequest } from '../../application/use-cases/lifecycle/RecordLifecycleEventUseCase';
import type { ILifecycleRepository } from '../../domains/repositories/ILifecycleRepository';
import { USER_LIFECYCLE_EVENT_TYPES } from '@aiponge/shared-contracts';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

describe('RecordLifecycleEventUseCase', () => {
  let useCase: RecordLifecycleEventUseCase;
  let mockRepository: ILifecycleRepository;

  const baseRequest: RecordLifecycleEventRequest = {
    eventType: USER_LIFECYCLE_EVENT_TYPES.SESSION_STARTED,
    userId: 'user-123',
    tier: 'explorer',
    platform: 'ios',
    sessionId: 'session-abc',
    metadata: {},
    correlationId: 'cor-001',
    source: 'user-service',
  };

  beforeEach(() => {
    mockRepository = {
      insertLifecycleEvent: vi.fn().mockResolvedValue('evt-001'),
      insertLifecycleEventsBatch: vi.fn().mockResolvedValue({ accepted: 0, rejected: 0 }),
      insertSubscriptionChange: vi.fn().mockResolvedValue('sub-001'),
      upsertAcquisitionAttribution: vi.fn().mockResolvedValue('acq-001'),
      upsertDailyMetrics: vi.fn().mockResolvedValue(undefined),
      upsertCohortSnapshot: vi.fn().mockResolvedValue(undefined),
      getLifecycleEventsByDateRange: vi.fn().mockResolvedValue([]),
      getActiveUserCountByTierAndPlatform: vi.fn().mockResolvedValue([]),
      getUserCohort: vi.fn().mockResolvedValue([]),
      getDormantUsers: vi.fn().mockResolvedValue([]),
      getDailyMetrics: vi.fn().mockResolvedValue([]),
      getCohortSnapshots: vi.fn().mockResolvedValue([]),
      getSubscriptionHistory: vi.fn().mockResolvedValue([]),
      getAcquisitionBreakdown: vi.fn().mockResolvedValue([]),
      getRevenueByTierAndPeriod: vi.fn().mockResolvedValue([]),
      getChurnRateByTier: vi.fn().mockResolvedValue([]),
      getConversionFunnel: vi.fn().mockResolvedValue([]),
      getTotalUserCount: vi.fn().mockResolvedValue(0),
      getPaidUserCount: vi.fn().mockResolvedValue(0),
      getCurrentMRR: vi.fn().mockResolvedValue(0),
      getActiveUsersToday: vi.fn().mockResolvedValue(0),
      getTrialConversionRate: vi.fn().mockResolvedValue(0),
    } as unknown as ILifecycleRepository;

    useCase = new RecordLifecycleEventUseCase(mockRepository);
    vi.clearAllMocks();
  });

  it('should record a single event and return eventId with success true', async () => {
    (mockRepository.insertLifecycleEvent as ReturnType<typeof vi.fn>).mockResolvedValue('evt-42');

    const result = await useCase.execute(baseRequest);

    expect(result.eventId).toBe('evt-42');
    expect(result.success).toBe(true);
    expect(mockRepository.insertLifecycleEvent).toHaveBeenCalledOnce();
    expect(mockRepository.insertLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: USER_LIFECYCLE_EVENT_TYPES.SESSION_STARTED,
        userId: 'user-123',
        correlationId: 'cor-001',
        source: 'user-service',
      })
    );
  });

  it('should call insertSubscriptionChange as side effect for tier_changed event', async () => {
    (mockRepository.insertLifecycleEvent as ReturnType<typeof vi.fn>).mockResolvedValue('evt-tier');

    const request: RecordLifecycleEventRequest = {
      ...baseRequest,
      eventType: USER_LIFECYCLE_EVENT_TYPES.TIER_CHANGED,
      metadata: {
        fromTier: 'explorer',
        toTier: 'personal',
        billingCycle: 'monthly',
        trigger: 'upgrade',
        grossAmount: '9.99',
        store: 'apple',
      },
    };

    const result = await useCase.execute(request);

    expect(result.success).toBe(true);
    expect(result.eventId).toBe('evt-tier');
    expect(mockRepository.insertSubscriptionChange).toHaveBeenCalledOnce();
    expect(mockRepository.insertSubscriptionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        fromTier: 'explorer',
        toTier: 'personal',
        billingCycle: 'monthly',
        trigger: 'upgrade',
        grossAmount: '9.99',
        platform: 'ios',
        correlationId: 'cor-001',
      })
    );
  });

  it('should call upsertAcquisitionAttribution as side effect for signed_up event', async () => {
    (mockRepository.insertLifecycleEvent as ReturnType<typeof vi.fn>).mockResolvedValue('evt-signup');

    const request: RecordLifecycleEventRequest = {
      ...baseRequest,
      eventType: USER_LIFECYCLE_EVENT_TYPES.SIGNED_UP,
      metadata: {
        acquisitionSource: 'referral',
        campaign: 'launch-2026',
        referralCode: 'FRIEND10',
      },
    };

    const result = await useCase.execute(request);

    expect(result.success).toBe(true);
    expect(result.eventId).toBe('evt-signup');
    expect(mockRepository.upsertAcquisitionAttribution).toHaveBeenCalledOnce();
    expect(mockRepository.upsertAcquisitionAttribution).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        platform: 'ios',
        store: 'apple',
        acquisitionSource: 'referral',
        campaign: 'launch-2026',
        referralCode: 'FRIEND10',
      })
    );
  });

  it('should not trigger side effects for regular events', async () => {
    (mockRepository.insertLifecycleEvent as ReturnType<typeof vi.fn>).mockResolvedValue('evt-regular');

    const request: RecordLifecycleEventRequest = {
      ...baseRequest,
      eventType: USER_LIFECYCLE_EVENT_TYPES.SESSION_STARTED,
      metadata: {},
    };

    const result = await useCase.execute(request);

    expect(result.success).toBe(true);
    expect(result.eventId).toBe('evt-regular');
    expect(mockRepository.insertSubscriptionChange).not.toHaveBeenCalled();
    expect(mockRepository.upsertAcquisitionAttribution).not.toHaveBeenCalled();
  });

  it('should still return success when a side effect fails (tier_changed)', async () => {
    (mockRepository.insertLifecycleEvent as ReturnType<typeof vi.fn>).mockResolvedValue('evt-fail-side');
    (mockRepository.insertSubscriptionChange as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB write failed')
    );

    const request: RecordLifecycleEventRequest = {
      ...baseRequest,
      eventType: USER_LIFECYCLE_EVENT_TYPES.TIER_CHANGED,
      metadata: { fromTier: 'explorer', toTier: 'personal', trigger: 'upgrade' },
    };

    const result = await useCase.execute(request);

    expect(result.success).toBe(true);
    expect(result.eventId).toBe('evt-fail-side');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to insert subscription history for tier change',
      expect.objectContaining({
        eventId: 'evt-fail-side',
        error: 'DB write failed',
      })
    );
  });

  it('should still return success when a side effect fails (signed_up)', async () => {
    (mockRepository.insertLifecycleEvent as ReturnType<typeof vi.fn>).mockResolvedValue('evt-fail-acq');
    (mockRepository.upsertAcquisitionAttribution as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Attribution insert error')
    );

    const request: RecordLifecycleEventRequest = {
      ...baseRequest,
      eventType: USER_LIFECYCLE_EVENT_TYPES.SIGNED_UP,
      metadata: {},
    };

    const result = await useCase.execute(request);

    expect(result.success).toBe(true);
    expect(result.eventId).toBe('evt-fail-acq');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to upsert acquisition attribution for signup',
      expect.objectContaining({
        userId: 'user-123',
        error: 'Attribution insert error',
      })
    );
  });
});
