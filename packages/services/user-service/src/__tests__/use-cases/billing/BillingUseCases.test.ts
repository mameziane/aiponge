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
  TierConfigClient: class MockTierConfigClient {
    getCreditCost = vi.fn().mockResolvedValue(10);
    getLimits = vi.fn().mockResolvedValue({
      songsPerMonth: 5,
      lyricsPerMonth: 10,
      insightsPerMonth: 3,
    });
  },
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  isAdmin: vi.fn((role: string) => role === 'admin'),
  isPaidTier: vi.fn((tier: string) => ['personal', 'practice', 'studio'].includes(tier)),
  normalizeTier: vi.fn((tier: string | null | undefined) => tier || 'explorer'),
  TIER_IDS: {
    GUEST: 'guest',
    EXPLORER: 'explorer',
    PERSONAL: 'personal',
    PRACTICE: 'practice',
    STUDIO: 'studio',
  },
}));

import { CheckQuotaUseCase } from '../../../application/use-cases/billing/CheckQuotaUseCase';
import { CheckUsageEligibilityUseCase } from '../../../application/use-cases/billing/CheckUsageEligibilityUseCase';
import { DeductCreditsUseCase } from '../../../application/use-cases/billing/DeductCreditsUseCase';
import { GetCreditBalanceUseCase } from '../../../application/use-cases/billing/GetCreditBalanceUseCase';
import { GetTransactionHistoryUseCase } from '../../../application/use-cases/billing/GetTransactionHistoryUseCase';
import { RefundCreditsUseCase } from '../../../application/use-cases/billing/RefundCreditsUseCase';
import { ValidateCreditsUseCase } from '../../../application/use-cases/billing/ValidateCreditsUseCase';

function createMockCreditRepository() {
  return {
    initializeCredits: vi.fn(),
    getBalance: vi.fn(),
    hasCredits: vi.fn(),
    reserveCredits: vi.fn(),
    commitReservation: vi.fn(),
    cancelReservation: vi.fn(),
    settleReservation: vi.fn(),
    refundCredits: vi.fn(),
    getTransactionHistory: vi.fn(),
    getTransactionById: vi.fn(),
    updateTransactionStatus: vi.fn(),
    cleanupOrphanedReservations: vi.fn(),
  };
}

function createMockSubscriptionRepository() {
  return {
    createSubscription: vi.fn(),
    getSubscriptionByUserId: vi.fn(),
    getSubscriptionByRevenueCatId: vi.fn(),
    updateSubscription: vi.fn(),
    initializeUserSubscription: vi.fn(),
    getCurrentUsage: vi.fn(),
    incrementUsage: vi.fn(),
    checkUsageLimit: vi.fn(),
    resetMonthlyUsage: vi.fn(),
    hasEntitlement: vi.fn(),
    getSubscriptionTier: vi.fn(),
    createSubscriptionEvent: vi.fn(),
    getSubscriptionEvents: vi.fn(),
    processWebhook: vi.fn(),
  };
}

describe('CheckQuotaUseCase', () => {
  let useCase: CheckQuotaUseCase;
  let mockCreditRepo: ReturnType<typeof createMockCreditRepository>;
  let mockSubRepo: ReturnType<typeof createMockSubscriptionRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreditRepo = createMockCreditRepository();
    mockSubRepo = createMockSubscriptionRepository();
    useCase = new CheckQuotaUseCase(mockSubRepo as any, mockCreditRepo as any);
  });

  it('should throw when userId is empty', async () => {
    await expect(useCase.execute({ userId: '', action: 'songs' })).rejects.toThrow('User ID is required');
  });

  it('should throw when userId is whitespace', async () => {
    await expect(useCase.execute({ userId: '   ', action: 'songs' })).rejects.toThrow('User ID is required');
  });

  it('should throw for invalid action type', async () => {
    await expect(useCase.execute({ userId: 'user1', action: 'invalid' as any })).rejects.toThrow('Invalid action type');
  });

  it('should return admin bypass response for admin users', async () => {
    mockSubRepo.getSubscriptionTier.mockResolvedValue('explorer');

    const result = await useCase.execute({
      userId: 'admin1',
      action: 'songs',
      userRole: 'admin' as any,
    });

    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ADMIN_BYPASS');
    expect(result.credits.currentBalance).toBe(999999);
    expect(result.shouldUpgrade).toBe(false);
  });

  it('should allow paid tier user with sufficient credits', async () => {
    mockSubRepo.getSubscriptionTier.mockResolvedValue('personal');
    mockCreditRepo.getBalance.mockResolvedValue({ currentBalance: 100, totalSpent: 50, remaining: 100, userId: 'user1' });

    const result = await useCase.execute({ userId: 'user1', action: 'songs' });

    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
    expect(result.subscription.isPaidTier).toBe(true);
    expect(result.shouldUpgrade).toBe(false);
  });

  it('should deny paid tier user with insufficient credits', async () => {
    mockSubRepo.getSubscriptionTier.mockResolvedValue('personal');
    mockCreditRepo.getBalance.mockResolvedValue({ currentBalance: 2, totalSpent: 98, remaining: 2, userId: 'user1' });

    const result = await useCase.execute({ userId: 'user1', action: 'songs' });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('INSUFFICIENT_CREDITS');
    expect(result.credits.shortfall).toBe(8);
  });

  it('should deny explorer tier user when subscription limit exceeded', async () => {
    mockSubRepo.getSubscriptionTier.mockResolvedValue('explorer');
    mockSubRepo.checkUsageLimit.mockResolvedValue({ allowed: false, resetAt: new Date('2026-03-01') });
    mockSubRepo.getCurrentUsage.mockResolvedValue({ songsGenerated: 5, lyricsGenerated: 0, insightsGenerated: 0 });

    const result = await useCase.execute({ userId: 'user1', action: 'songs' });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('SUBSCRIPTION_LIMIT_EXCEEDED');
    expect(result.shouldUpgrade).toBe(true);
    expect(result.upgradeMessage).toContain('Upgrade');
  });

  it('should allow explorer tier user within limits and with credits', async () => {
    mockSubRepo.getSubscriptionTier.mockResolvedValue('explorer');
    mockSubRepo.checkUsageLimit.mockResolvedValue({ allowed: true });
    mockSubRepo.getCurrentUsage.mockResolvedValue({ songsGenerated: 2, lyricsGenerated: 0, insightsGenerated: 0 });
    mockCreditRepo.getBalance.mockResolvedValue({ currentBalance: 50, totalSpent: 50, remaining: 50, userId: 'user1' });

    const result = await useCase.execute({ userId: 'user1', action: 'songs' });

    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ALLOWED');
    expect(result.subscription.isPaidTier).toBe(false);
  });

  it('should use custom creditCost when provided', async () => {
    mockSubRepo.getSubscriptionTier.mockResolvedValue('personal');
    mockCreditRepo.getBalance.mockResolvedValue({ currentBalance: 15, totalSpent: 85, remaining: 15, userId: 'user1' });

    const result = await useCase.execute({ userId: 'user1', action: 'songs', creditCost: 20 });

    expect(result.allowed).toBe(false);
    expect(result.credits.required).toBe(20);
  });

  it('should allow when creditCost is zero (free action)', async () => {
    mockSubRepo.getSubscriptionTier.mockResolvedValue('personal');

    const result = await useCase.execute({ userId: 'user1', action: 'songs', creditCost: 0 });

    expect(result.allowed).toBe(true);
    expect(result.credits.hasCredits).toBe(true);
  });
});

describe('CheckUsageEligibilityUseCase', () => {
  let useCase: CheckUsageEligibilityUseCase;
  let mockSubRepo: ReturnType<typeof createMockSubscriptionRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubRepo = createMockSubscriptionRepository();
    useCase = new CheckUsageEligibilityUseCase(mockSubRepo as any);
  });

  it('should throw when userId is empty', async () => {
    await expect(useCase.execute({ userId: '', featureType: 'songs' })).rejects.toThrow('User ID is required');
  });

  it('should throw for invalid featureType', async () => {
    await expect(useCase.execute({ userId: 'user1', featureType: 'invalid' as any })).rejects.toThrow('Invalid feature type');
  });

  it('should allow paid tier users with unlimited access', async () => {
    mockSubRepo.getSubscriptionTier.mockResolvedValue('personal');

    const result = await useCase.execute({ userId: 'user1', featureType: 'songs' });

    expect(result.allowed).toBe(true);
    expect(result.isPaidTier).toBe(true);
    expect(result.usage.limit).toBe(-1);
    expect(result.shouldUpgrade).toBe(false);
  });

  it('should return usage info for free tier user within limits', async () => {
    mockSubRepo.getSubscriptionTier.mockResolvedValue('explorer');
    mockSubRepo.checkUsageLimit.mockResolvedValue({ allowed: true });
    mockSubRepo.getCurrentUsage.mockResolvedValue({ songsGenerated: 2, lyricsGenerated: 3, insightsGenerated: 1 });

    const result = await useCase.execute({ userId: 'user1', featureType: 'lyrics' });

    expect(result.allowed).toBe(true);
    expect(result.isPaidTier).toBe(false);
    expect(result.usage.current).toBe(3);
    expect(result.shouldUpgrade).toBe(false);
  });

  it('should deny free tier user who exceeded limits', async () => {
    mockSubRepo.getSubscriptionTier.mockResolvedValue('explorer');
    mockSubRepo.checkUsageLimit.mockResolvedValue({ allowed: false, resetAt: new Date('2026-03-01') });
    mockSubRepo.getCurrentUsage.mockResolvedValue({ songsGenerated: 5, lyricsGenerated: 0, insightsGenerated: 0 });

    const result = await useCase.execute({ userId: 'user1', featureType: 'songs' });

    expect(result.allowed).toBe(false);
    expect(result.shouldUpgrade).toBe(true);
    expect(result.reason).toContain('monthly limit');
    expect(result.upgradeMessage).toContain('Upgrade');
  });

  it('should propagate repository errors', async () => {
    mockSubRepo.getSubscriptionTier.mockRejectedValue(new Error('DB connection failed'));

    await expect(useCase.execute({ userId: 'user1', featureType: 'songs' })).rejects.toThrow('DB connection failed');
  });
});

describe('DeductCreditsUseCase', () => {
  let useCase: DeductCreditsUseCase;
  let mockCreditRepo: ReturnType<typeof createMockCreditRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreditRepo = createMockCreditRepository();
    useCase = new DeductCreditsUseCase(mockCreditRepo as any);
  });

  it('should throw when userId is empty', async () => {
    await expect(
      useCase.execute({ userId: '', amount: 10, description: 'test' })
    ).rejects.toThrow('User ID is required');
  });

  it('should throw when amount is zero', async () => {
    await expect(
      useCase.execute({ userId: 'user1', amount: 0, description: 'test' })
    ).rejects.toThrow();
  });

  it('should throw when amount is negative', async () => {
    await expect(
      useCase.execute({ userId: 'user1', amount: -5, description: 'test' })
    ).rejects.toThrow();
  });

  it('should successfully deduct credits with reserve-commit pattern', async () => {
    mockCreditRepo.reserveCredits.mockResolvedValue({
      success: true,
      transactionId: 'tx-123',
      currentBalance: 90,
    });
    mockCreditRepo.commitReservation.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: 'user1',
      amount: 10,
      description: 'Song generation',
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe('tx-123');
    expect(result.remainingBalance).toBe(90);
    expect(mockCreditRepo.reserveCredits).toHaveBeenCalledWith('user1', 10, 'Song generation', undefined);
    expect(mockCreditRepo.commitReservation).toHaveBeenCalledWith('tx-123');
  });

  it('should return failure when reservation fails (insufficient balance)', async () => {
    mockCreditRepo.reserveCredits.mockResolvedValue({
      success: false,
      error: 'Insufficient credits',
      currentBalance: 5,
    });

    const result = await useCase.execute({
      userId: 'user1',
      amount: 10,
      description: 'Song generation',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Insufficient credits');
    expect(result.remainingBalance).toBe(5);
    expect(mockCreditRepo.commitReservation).not.toHaveBeenCalled();
  });

  it('should cancel reservation when commit fails', async () => {
    mockCreditRepo.reserveCredits.mockResolvedValue({
      success: true,
      transactionId: 'tx-456',
      currentBalance: 90,
    });
    mockCreditRepo.commitReservation.mockRejectedValue(new Error('Commit failed'));
    mockCreditRepo.cancelReservation.mockResolvedValue({ success: true });

    await expect(
      useCase.execute({ userId: 'user1', amount: 10, description: 'test' })
    ).rejects.toThrow('Commit failed');

    expect(mockCreditRepo.cancelReservation).toHaveBeenCalledWith('tx-456', 'Commit failed - automatic rollback');
  });

  it('should handle orphaned transaction when both commit and cancel fail', async () => {
    mockCreditRepo.reserveCredits.mockResolvedValue({
      success: true,
      transactionId: 'tx-789',
      currentBalance: 90,
    });
    mockCreditRepo.commitReservation.mockRejectedValue(new Error('Commit failed'));
    mockCreditRepo.cancelReservation.mockRejectedValue(new Error('Cancel also failed'));

    await expect(
      useCase.execute({ userId: 'user1', amount: 10, description: 'test' })
    ).rejects.toThrow('Commit failed');

    expect(mockCreditRepo.cancelReservation).toHaveBeenCalled();
  });

  it('should handle successful reservation without transactionId', async () => {
    mockCreditRepo.reserveCredits.mockResolvedValue({
      success: true,
      currentBalance: 90,
    });

    const result = await useCase.execute({
      userId: 'user1',
      amount: 10,
      description: 'test',
    });

    expect(result.success).toBe(true);
    expect(mockCreditRepo.commitReservation).not.toHaveBeenCalled();
  });

  it('should pass metadata to reserveCredits', async () => {
    mockCreditRepo.reserveCredits.mockResolvedValue({
      success: true,
      transactionId: 'tx-meta',
      currentBalance: 90,
    });
    mockCreditRepo.commitReservation.mockResolvedValue(undefined);

    const metadata = { songId: 'song-1', action: 'generate' };
    await useCase.execute({
      userId: 'user1',
      amount: 10,
      description: 'test',
      metadata,
    });

    expect(mockCreditRepo.reserveCredits).toHaveBeenCalledWith('user1', 10, 'test', metadata);
  });
});

describe('GetCreditBalanceUseCase', () => {
  let useCase: GetCreditBalanceUseCase;
  let mockCreditRepo: ReturnType<typeof createMockCreditRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreditRepo = createMockCreditRepository();
    useCase = new GetCreditBalanceUseCase(mockCreditRepo as any);
  });

  it('should throw when userId is empty', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrow('User ID is required');
  });

  it('should return existing balance', async () => {
    const balance = { userId: 'user1', currentBalance: 75, totalSpent: 25, remaining: 75 };
    mockCreditRepo.getBalance.mockResolvedValue(balance);

    const result = await useCase.execute({ userId: 'user1' });

    expect(result).toEqual(balance);
    expect(mockCreditRepo.initializeCredits).not.toHaveBeenCalled();
  });

  it('should initialize credits when balance is null', async () => {
    mockCreditRepo.getBalance
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: 'user1', currentBalance: 100, totalSpent: 0, remaining: 100 });
    mockCreditRepo.initializeCredits.mockResolvedValue({});

    const result = await useCase.execute({ userId: 'user1' });

    expect(mockCreditRepo.initializeCredits).toHaveBeenCalledWith('user1', 100);
    expect(result?.currentBalance).toBe(100);
  });

  it('should propagate repository errors', async () => {
    mockCreditRepo.getBalance.mockRejectedValue(new Error('DB error'));

    await expect(useCase.execute({ userId: 'user1' })).rejects.toThrow('DB error');
  });
});

describe('GetTransactionHistoryUseCase', () => {
  let useCase: GetTransactionHistoryUseCase;
  let mockCreditRepo: ReturnType<typeof createMockCreditRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreditRepo = createMockCreditRepository();
    useCase = new GetTransactionHistoryUseCase(mockCreditRepo as any);
  });

  it('should throw when userId is empty', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrow('User ID is required');
  });

  it('should return transaction history with pagination', async () => {
    const transactions = [
      { id: 'tx-1', userId: 'user1', amount: 10, type: 'deduction', status: 'completed', description: 'test', metadata: {}, createdAt: new Date() },
    ];
    mockCreditRepo.getTransactionHistory.mockResolvedValue({ transactions, total: 1 });

    const result = await useCase.execute({ userId: 'user1' });

    expect(result.transactions).toEqual(transactions);
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.limit).toBe(50);
    expect(result.pagination.offset).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  it('should use custom limit and offset', async () => {
    mockCreditRepo.getTransactionHistory.mockResolvedValue({ transactions: [], total: 100 });

    const result = await useCase.execute({ userId: 'user1', limit: 10, offset: 20 });

    expect(mockCreditRepo.getTransactionHistory).toHaveBeenCalledWith('user1', 10, 20);
    expect(result.pagination.limit).toBe(10);
    expect(result.pagination.offset).toBe(20);
    expect(result.pagination.hasMore).toBe(true);
  });

  it('should set hasMore=false when at the end', async () => {
    mockCreditRepo.getTransactionHistory.mockResolvedValue({ transactions: [], total: 30 });

    const result = await useCase.execute({ userId: 'user1', limit: 50, offset: 0 });

    expect(result.pagination.hasMore).toBe(false);
  });

  it('should propagate repository errors', async () => {
    mockCreditRepo.getTransactionHistory.mockRejectedValue(new Error('Query failed'));

    await expect(useCase.execute({ userId: 'user1' })).rejects.toThrow('Query failed');
  });
});

describe('RefundCreditsUseCase', () => {
  let useCase: RefundCreditsUseCase;
  let mockCreditRepo: ReturnType<typeof createMockCreditRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreditRepo = createMockCreditRepository();
    useCase = new RefundCreditsUseCase(mockCreditRepo as any);
  });

  it('should throw when userId is empty', async () => {
    await expect(
      useCase.execute({ userId: '', amount: 10, description: 'refund' })
    ).rejects.toThrow('User ID is required');
  });

  it('should throw when amount is zero', async () => {
    await expect(
      useCase.execute({ userId: 'user1', amount: 0, description: 'refund' })
    ).rejects.toThrow();
  });

  it('should throw when amount is negative', async () => {
    await expect(
      useCase.execute({ userId: 'user1', amount: -10, description: 'refund' })
    ).rejects.toThrow();
  });

  it('should successfully refund credits', async () => {
    const transaction = {
      id: 'tx-refund-1',
      userId: 'user1',
      amount: 10,
      type: 'refund' as const,
      status: 'completed' as const,
      description: 'Song generation failed',
      metadata: {},
      createdAt: new Date(),
    };
    mockCreditRepo.refundCredits.mockResolvedValue(transaction);

    const result = await useCase.execute({
      userId: 'user1',
      amount: 10,
      description: 'Song generation failed',
    });

    expect(result.id).toBe('tx-refund-1');
    expect(result.type).toBe('refund');
    expect(mockCreditRepo.refundCredits).toHaveBeenCalledWith('user1', 10, 'Song generation failed', undefined);
  });

  it('should pass metadata to refundCredits', async () => {
    const metadata = { originalTxId: 'tx-original' };
    mockCreditRepo.refundCredits.mockResolvedValue({
      id: 'tx-refund-2',
      userId: 'user1',
      amount: 5,
      type: 'refund',
      status: 'completed',
      description: 'partial refund',
      metadata,
      createdAt: new Date(),
    });

    await useCase.execute({
      userId: 'user1',
      amount: 5,
      description: 'partial refund',
      metadata,
    });

    expect(mockCreditRepo.refundCredits).toHaveBeenCalledWith('user1', 5, 'partial refund', metadata);
  });

  it('should propagate repository errors', async () => {
    mockCreditRepo.refundCredits.mockRejectedValue(new Error('Refund failed'));

    await expect(
      useCase.execute({ userId: 'user1', amount: 10, description: 'test' })
    ).rejects.toThrow('Refund failed');
  });
});

describe('ValidateCreditsUseCase', () => {
  let useCase: ValidateCreditsUseCase;
  let mockCreditRepo: ReturnType<typeof createMockCreditRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreditRepo = createMockCreditRepository();
    useCase = new ValidateCreditsUseCase(mockCreditRepo as any);
  });

  it('should throw when userId is empty', async () => {
    await expect(useCase.execute({ userId: '', amount: 10 })).rejects.toThrow('User ID is required');
  });

  it('should throw when amount is zero', async () => {
    await expect(useCase.execute({ userId: 'user1', amount: 0 })).rejects.toThrow();
  });

  it('should throw when amount is negative', async () => {
    await expect(useCase.execute({ userId: 'user1', amount: -5 })).rejects.toThrow();
  });

  it('should return hasCredits=true when balance is sufficient', async () => {
    mockCreditRepo.getBalance.mockResolvedValue({ userId: 'user1', currentBalance: 100, totalSpent: 0, remaining: 100 });

    const result = await useCase.execute({ userId: 'user1', amount: 50 });

    expect(result.success).toBe(true);
    expect(result.hasCredits).toBe(true);
    expect(result.currentBalance).toBe(100);
    expect(result.required).toBe(50);
    expect(result.shortfall).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('should return hasCredits=false when balance is insufficient', async () => {
    mockCreditRepo.getBalance.mockResolvedValue({ userId: 'user1', currentBalance: 5, totalSpent: 95, remaining: 5 });

    const result = await useCase.execute({ userId: 'user1', amount: 10 });

    expect(result.success).toBe(true);
    expect(result.hasCredits).toBe(false);
    expect(result.shortfall).toBe(5);
    expect(result.error).toContain('Insufficient credits');
  });

  it('should handle uninitialized user credits (null balance)', async () => {
    mockCreditRepo.getBalance.mockResolvedValue(null);

    const result = await useCase.execute({ userId: 'user1', amount: 10 });

    expect(result.success).toBe(true);
    expect(result.hasCredits).toBe(false);
    expect(result.currentBalance).toBe(0);
    expect(result.shortfall).toBe(10);
    expect(result.error).toBe('User credits not initialized');
  });

  it('should return hasCredits=true when balance equals required amount', async () => {
    mockCreditRepo.getBalance.mockResolvedValue({ userId: 'user1', currentBalance: 10, totalSpent: 90, remaining: 10 });

    const result = await useCase.execute({ userId: 'user1', amount: 10 });

    expect(result.hasCredits).toBe(true);
    expect(result.shortfall).toBeUndefined();
  });

  it('should propagate repository errors', async () => {
    mockCreditRepo.getBalance.mockRejectedValue(new Error('Connection timeout'));

    await expect(useCase.execute({ userId: 'user1', amount: 10 })).rejects.toThrow('Connection timeout');
  });
});
