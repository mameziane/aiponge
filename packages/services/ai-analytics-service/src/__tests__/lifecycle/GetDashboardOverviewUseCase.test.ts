import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetDashboardOverviewUseCase } from '../../application/use-cases/lifecycle/GetDashboardOverviewUseCase';
import type { ILifecycleRepository } from '../../domains/repositories/ILifecycleRepository';
import type { ChurnRateRow } from '../../domains/entities/Lifecycle';

vi.mock('@aiponge/platform-core', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

function createMockRepository(
  overrides: Partial<Record<keyof ILifecycleRepository, unknown>> = {}
): ILifecycleRepository {
  return {
    // Write
    insertLifecycleEvent: vi.fn().mockResolvedValue('evt-1'),
    insertLifecycleEventsBatch: vi.fn().mockResolvedValue({ accepted: 0, rejected: 0 }),
    insertSubscriptionChange: vi.fn().mockResolvedValue('sub-1'),
    upsertAcquisitionAttribution: vi.fn().mockResolvedValue('acq-1'),
    upsertDailyMetrics: vi.fn().mockResolvedValue(undefined),
    upsertCohortSnapshot: vi.fn().mockResolvedValue(undefined),

    // Read - Scheduler Aggregation
    getLifecycleEventsByDateRange: vi.fn().mockResolvedValue([]),
    getActiveUserCountByTierAndPlatform: vi.fn().mockResolvedValue([]),
    getUserCohort: vi.fn().mockResolvedValue([]),
    getDormantUsers: vi.fn().mockResolvedValue([]),

    // Read - Dashboard API
    getDailyMetrics: vi.fn().mockResolvedValue([]),
    getCohortSnapshots: vi.fn().mockResolvedValue([]),
    getSubscriptionHistory: vi.fn().mockResolvedValue([]),
    getAcquisitionBreakdown: vi.fn().mockResolvedValue([]),
    getRevenueByTierAndPeriod: vi.fn().mockResolvedValue([]),
    getChurnRateByTier: vi.fn().mockResolvedValue([]),
    getConversionFunnel: vi.fn().mockResolvedValue([]),

    // Read - KPI Computation
    getTotalUserCount: vi.fn().mockResolvedValue(0),
    getPaidUserCount: vi.fn().mockResolvedValue(0),
    getCurrentMRR: vi.fn().mockResolvedValue(0),
    getActiveUsersToday: vi.fn().mockResolvedValue(0),
    getTrialConversionRate: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as ILifecycleRepository;
}

describe('GetDashboardOverviewUseCase', () => {
  let useCase: GetDashboardOverviewUseCase;
  let mockRepository: ILifecycleRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computes dashboard overview with KPIs', () => {
    it('should return correct MRR, ARR, total users, conversion rate, ARPU, and active users', async () => {
      const churnData: ChurnRateRow[] = [
        { period: '2026-02', tier: 'personal', startingUsers: 50, churned: 5, churnRate: 0.1 },
        { period: '2026-02', tier: 'practice', startingUsers: 30, churned: 3, churnRate: 0.1 },
      ];

      mockRepository = createMockRepository({
        getTotalUserCount: vi.fn().mockResolvedValue(1000),
        getPaidUserCount: vi.fn().mockResolvedValue(200),
        getCurrentMRR: vi.fn().mockResolvedValue(5000),
        getActiveUsersToday: vi.fn().mockResolvedValue(350),
        getTrialConversionRate: vi.fn().mockResolvedValue(0.25),
        getChurnRateByTier: vi.fn().mockResolvedValue(churnData),
      });
      useCase = new GetDashboardOverviewUseCase(mockRepository);

      const result = await useCase.execute();

      expect(result.totalUsers).toBe(1000);
      expect(result.paidUsers).toBe(200);
      expect(result.mrr).toBe(5000);
      expect(result.arr).toBe(60000); // 5000 * 12
      expect(result.conversionRate).toBe(0.2); // 200 / 1000
      expect(result.arpu).toBe(25); // 5000 / 200
      expect(result.activeUsersToday).toBe(350);
      expect(result.trialConversionRate).toBe(0.25);
    });

    it('should compute churnRate from churned users and paid users', async () => {
      const churnData: ChurnRateRow[] = [
        { period: '2026-02', tier: 'personal', startingUsers: 100, churned: 10, churnRate: 0.1 },
        { period: '2026-02', tier: 'practice', startingUsers: 50, churned: 5, churnRate: 0.1 },
      ];

      mockRepository = createMockRepository({
        getTotalUserCount: vi.fn().mockResolvedValue(500),
        getPaidUserCount: vi.fn().mockResolvedValue(100),
        getCurrentMRR: vi.fn().mockResolvedValue(2000),
        getActiveUsersToday: vi.fn().mockResolvedValue(80),
        getTrialConversionRate: vi.fn().mockResolvedValue(0.15),
        getChurnRateByTier: vi.fn().mockResolvedValue(churnData),
      });
      useCase = new GetDashboardOverviewUseCase(mockRepository);

      const result = await useCase.execute();

      // totalChurned = 10 + 5 = 15
      // churnRate = 15 / (100 + 15) = 15 / 115
      const expectedChurnRate = 15 / (100 + 15);
      expect(result.churnRate).toBeCloseTo(expectedChurnRate, 10);
    });

    it('should call repository methods with correct date range for trial conversion and churn', async () => {
      mockRepository = createMockRepository();
      useCase = new GetDashboardOverviewUseCase(mockRepository);

      await useCase.execute();

      expect(mockRepository.getTotalUserCount).toHaveBeenCalledOnce();
      expect(mockRepository.getPaidUserCount).toHaveBeenCalledOnce();
      expect(mockRepository.getCurrentMRR).toHaveBeenCalledOnce();
      expect(mockRepository.getActiveUsersToday).toHaveBeenCalledOnce();
      expect(mockRepository.getTrialConversionRate).toHaveBeenCalledWith(expect.any(Date), expect.any(Date));
      expect(mockRepository.getChurnRateByTier).toHaveBeenCalledWith(expect.any(Date), expect.any(Date));
    });
  });

  describe('handles zero values gracefully', () => {
    it('should return zero conversion rate when there are no users', async () => {
      mockRepository = createMockRepository({
        getTotalUserCount: vi.fn().mockResolvedValue(0),
        getPaidUserCount: vi.fn().mockResolvedValue(0),
        getCurrentMRR: vi.fn().mockResolvedValue(0),
        getActiveUsersToday: vi.fn().mockResolvedValue(0),
        getTrialConversionRate: vi.fn().mockResolvedValue(0),
        getChurnRateByTier: vi.fn().mockResolvedValue([]),
      });
      useCase = new GetDashboardOverviewUseCase(mockRepository);

      const result = await useCase.execute();

      expect(result.totalUsers).toBe(0);
      expect(result.paidUsers).toBe(0);
      expect(result.conversionRate).toBe(0); // totalUsers is 0, so 0
    });

    it('should return zero ARPU and zero churnRate when there are no paid users', async () => {
      mockRepository = createMockRepository({
        getTotalUserCount: vi.fn().mockResolvedValue(500),
        getPaidUserCount: vi.fn().mockResolvedValue(0),
        getCurrentMRR: vi.fn().mockResolvedValue(0),
        getActiveUsersToday: vi.fn().mockResolvedValue(100),
        getTrialConversionRate: vi.fn().mockResolvedValue(0),
        getChurnRateByTier: vi.fn().mockResolvedValue([]),
      });
      useCase = new GetDashboardOverviewUseCase(mockRepository);

      const result = await useCase.execute();

      expect(result.arpu).toBe(0); // paidUsers is 0
      expect(result.churnRate).toBe(0); // paidUsers is 0
      expect(result.mrr).toBe(0);
      expect(result.arr).toBe(0);
    });

    it('should use default 5% churn rate for LTV when no churn data exists and no paid users', async () => {
      mockRepository = createMockRepository({
        getTotalUserCount: vi.fn().mockResolvedValue(100),
        getPaidUserCount: vi.fn().mockResolvedValue(0),
        getCurrentMRR: vi.fn().mockResolvedValue(0),
        getActiveUsersToday: vi.fn().mockResolvedValue(50),
        getTrialConversionRate: vi.fn().mockResolvedValue(0),
        getChurnRateByTier: vi.fn().mockResolvedValue([]),
      });
      useCase = new GetDashboardOverviewUseCase(mockRepository);

      const result = await useCase.execute();

      // arpu = 0 (no paid users), monthlyChurnRate defaults to 0.05
      // ltv = 0 / 0.05 = 0
      expect(result.ltv).toBe(0);
    });
  });

  describe('computes LTV correctly', () => {
    it('should compute LTV as ARPU / monthlyChurnRate when churnRate > 0', async () => {
      // Setup: 100 paid users, MRR = 1000, churned = 20
      const churnData: ChurnRateRow[] = [
        { period: '2026-02', tier: 'personal', startingUsers: 80, churned: 20, churnRate: 0.25 },
      ];

      mockRepository = createMockRepository({
        getTotalUserCount: vi.fn().mockResolvedValue(500),
        getPaidUserCount: vi.fn().mockResolvedValue(100),
        getCurrentMRR: vi.fn().mockResolvedValue(1000),
        getActiveUsersToday: vi.fn().mockResolvedValue(200),
        getTrialConversionRate: vi.fn().mockResolvedValue(0.3),
        getChurnRateByTier: vi.fn().mockResolvedValue(churnData),
      });
      useCase = new GetDashboardOverviewUseCase(mockRepository);

      const result = await useCase.execute();

      // arpu = 1000 / 100 = 10
      // totalChurned = 20
      // churnRate = 20 / (100 + 20) = 20/120 = 0.1667
      // monthlyChurnRate = churnRate (since churnRate > 0)
      // ltv = arpu / monthlyChurnRate = 10 / (20/120) = 10 * 120/20 = 60
      const expectedChurnRate = 20 / 120;
      const expectedArpu = 10;
      const expectedLtv = expectedArpu / expectedChurnRate;

      expect(result.arpu).toBe(expectedArpu);
      expect(result.churnRate).toBeCloseTo(expectedChurnRate, 10);
      expect(result.ltv).toBeCloseTo(expectedLtv, 10);
    });

    it('should use default 5% churn rate for LTV when churnRate is 0 but there are paid users', async () => {
      // Paid users exist but no one has churned
      mockRepository = createMockRepository({
        getTotalUserCount: vi.fn().mockResolvedValue(200),
        getPaidUserCount: vi.fn().mockResolvedValue(50),
        getCurrentMRR: vi.fn().mockResolvedValue(500),
        getActiveUsersToday: vi.fn().mockResolvedValue(100),
        getTrialConversionRate: vi.fn().mockResolvedValue(0.4),
        getChurnRateByTier: vi.fn().mockResolvedValue([]), // No churn data
      });
      useCase = new GetDashboardOverviewUseCase(mockRepository);

      const result = await useCase.execute();

      // arpu = 500 / 50 = 10
      // churnRate = 0 (no churned, but paidUsers > 0 => totalChurned=0, churnRate = 0/(50+0)=0)
      // Actually: paidUsers=50, totalChurned=0 => churnRate = 0/50 = 0
      // Wait, the code: churnRate = paidUsers > 0 ? totalChurned / (paidUsers + totalChurned) : 0
      // totalChurned = 0, so churnRate = 0 / (50 + 0) = 0
      // monthlyChurnRate = churnRate > 0 ? churnRate : 0.05 => defaults to 0.05
      // ltv = 10 / 0.05 = 200
      expect(result.churnRate).toBe(0);
      expect(result.arpu).toBe(10);
      expect(result.ltv).toBe(200); // 10 / 0.05
    });

    it('should compute LTV correctly with multiple churn rows across tiers', async () => {
      const churnData: ChurnRateRow[] = [
        { period: '2026-02', tier: 'personal', startingUsers: 60, churned: 6, churnRate: 0.1 },
        { period: '2026-02', tier: 'practice', startingUsers: 30, churned: 3, churnRate: 0.1 },
        { period: '2026-02', tier: 'studio', startingUsers: 10, churned: 1, churnRate: 0.1 },
      ];

      mockRepository = createMockRepository({
        getTotalUserCount: vi.fn().mockResolvedValue(1000),
        getPaidUserCount: vi.fn().mockResolvedValue(100),
        getCurrentMRR: vi.fn().mockResolvedValue(2500),
        getActiveUsersToday: vi.fn().mockResolvedValue(400),
        getTrialConversionRate: vi.fn().mockResolvedValue(0.2),
        getChurnRateByTier: vi.fn().mockResolvedValue(churnData),
      });
      useCase = new GetDashboardOverviewUseCase(mockRepository);

      const result = await useCase.execute();

      // arpu = 2500 / 100 = 25
      // totalChurned = 6 + 3 + 1 = 10
      // churnRate = 10 / (100 + 10) = 10/110
      // ltv = 25 / (10/110) = 25 * 110/10 = 275
      const expectedChurnRate = 10 / 110;
      const expectedLtv = 25 / expectedChurnRate;

      expect(result.churnRate).toBeCloseTo(expectedChurnRate, 10);
      expect(result.ltv).toBeCloseTo(expectedLtv, 10);
    });
  });
});
