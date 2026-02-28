import type {
  CreditBalance,
  CreditTransaction,
  ValidateCreditsRequest,
  ValidateCreditsResponse,
  DeductCreditsRequest,
  DeductCreditsResponse,
  RefundCreditsRequest,
  RefundCreditsResponse,
} from '@aiponge/shared-contracts/credits';

export interface IUserServiceClient {
  getCreditBalance(userId: string): Promise<{
    success: boolean;
    balance?: CreditBalance;
    error?: string;
  }>;

  validateCredits(request: ValidateCreditsRequest): Promise<ValidateCreditsResponse>;

  deductCredits(request: DeductCreditsRequest): Promise<DeductCreditsResponse>;

  refundCredits(request: RefundCreditsRequest): Promise<RefundCreditsResponse>;

  getTransactionHistory(
    userId: string,
    options?: { limit?: number; offset?: number; type?: string }
  ): Promise<{
    success: boolean;
    transactions?: CreditTransaction[];
    total?: number;
    error?: string;
  }>;

  isHealthy(): Promise<boolean>;

  incrementPuzzleListens(userId: string): Promise<void>;

  getUserDisplayName(userId: string): Promise<{
    success: boolean;
    displayName?: string;
    error?: string;
  }>;

  getAccessibleCreatorIds(userId: string): Promise<{
    success: boolean;
    creatorIds?: string[];
    error?: string;
  }>;

  getLibrarianIds(): Promise<{
    success: boolean;
    librarianIds?: string[];
    error?: string;
  }>;

  unlockChaptersForTrigger(
    userId: string,
    triggerType: string,
    triggerValue: string
  ): Promise<{ success: boolean; unlockedCount?: number; error?: string }>;

  checkQuota(
    userId: string,
    action: string,
    userRole?: string,
    count?: number
  ): Promise<{
    success: boolean;
    allowed?: boolean;
    remaining?: number;
    limit?: number;
    resetAt?: string;
    error?: string;
  }>;

  incrementUsage(
    userId: string,
    type: string
  ): Promise<{ success: boolean; error?: string }>;

  reserveCredits(
    userId: string,
    amount: number,
    operation: string,
    metadata?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    reservationId?: string;
    error?: string;
  }>;

  settleReservation(
    reservationId: string,
    userId: string,
    actualAmount: number,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; settledAmount?: number; refundedAmount?: number; error?: string }>;

  cancelReservation(
    reservationId: string,
    userId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }>;
}
