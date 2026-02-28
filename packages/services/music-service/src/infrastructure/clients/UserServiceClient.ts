/**
 * UserServiceClient - HTTP client for user-service integration
 * Handles credit validation, deduction, and refund operations
 */

import { createServiceClient, type HttpClient, getServiceUrl, getLogger } from '../../config/service-urls';
import { withServiceResilience, tryParseServiceResponse, signUserIdHeader } from '@aiponge/platform-core';
import {
  ValidateCreditsResponseSchema,
  DeductCreditsResponseSchema,
  RefundCreditsResponseSchema,
  type CreditBalance,
  type CreditTransaction,
  type ValidateCreditsRequest,
  type ValidateCreditsResponse,
  type DeductCreditsRequest,
  type DeductCreditsResponse,
  type RefundCreditsRequest,
  type RefundCreditsResponse,
} from '@aiponge/shared-contracts/credits';
import { QuotaCheckResponseSchema } from '@aiponge/shared-contracts';

const logger = getLogger('music-service:user-client');

export type {
  CreditBalance,
  CreditTransaction,
  ValidateCreditsRequest,
  ValidateCreditsResponse,
  DeductCreditsRequest,
  DeductCreditsResponse,
  RefundCreditsRequest,
  RefundCreditsResponse,
};

const SERVICE_NAME = 'user-service';

const ACCESSIBLE_CREATORS_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  creatorIds: string[];
  expiresAt: number;
}

const accessibleCreatorsCache = new Map<string, CacheEntry>();

import type { IUserServiceClient } from '../../domains/music-catalog/ports/IUserServiceClient';

export class UserServiceClient implements IUserServiceClient {
  private httpClient: HttpClient;

  constructor() {
    const { httpClient } = createServiceClient('user-service');
    this.httpClient = httpClient;
    logger.debug('User service client initialized');
  }

  /**
   * Invalidate cached accessible creator IDs for a user
   * Called when follow/unfollow events are received
   */
  static invalidateAccessibleCreatorsCache(userId: string): void {
    if (accessibleCreatorsCache.has(userId)) {
      accessibleCreatorsCache.delete(userId);
      logger.info('Invalidated accessible creators cache', { userId });
    }
  }

  /**
   * Invalidate all cached accessible creator IDs
   * Called when librarian role changes or bulk relationship updates
   */
  static invalidateAllAccessibleCreatorsCache(): void {
    const size = accessibleCreatorsCache.size;
    accessibleCreatorsCache.clear();
    if (size > 0) {
      logger.info('Cleared all accessible creators cache', { entriesCleared: size });
    }
  }

  /**
   * Get credit balance for a user
   */
  async getCreditBalance(userId: string): Promise<{
    success: boolean;
    balance?: CreditBalance;
    error?: string;
  }> {
    return withServiceResilience(
      'user-service',
      'getCreditBalance',
      async () => {
        try {
          const data = await this.httpClient.get<{
            success?: boolean;
            data?: CreditBalance;
            error?: string;
          }>(getServiceUrl(SERVICE_NAME) + `/api/credits/${userId}/balance`);

          if (data && data.success && data.data) {
            return {
              success: true,
              balance: data.data,
            };
          } else {
            return {
              success: false,
              error: data?.error || 'Failed to get credit balance',
            };
          }
        } catch (error) {
          logger.error('Failed to get credit balance', {
            error: error instanceof Error ? error.message : String(error),
            userId,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get credit balance',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Validate if user has sufficient credits
   */
  async validateCredits(request: ValidateCreditsRequest): Promise<ValidateCreditsResponse> {
    return withServiceResilience(
      'user-service',
      'validateCredits',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success?: boolean;
            data?: { hasCredits: boolean; currentBalance: number; required: number };
            error?: string;
          }>(getServiceUrl(SERVICE_NAME) + `/api/credits/${request.userId}/validate`, request);

          if (data && data.success && data.data) {
            const validationResult = tryParseServiceResponse(
              ValidateCreditsResponseSchema,
              {
                success: true,
                hasCredits: data.data.hasCredits,
                currentBalance: data.data.currentBalance,
                required: data.data.required,
              },
              'user-service',
              'validateCredits'
            );

            if (validationResult.success) {
              return validationResult.data;
            }

            return {
              success: true,
              hasCredits: data.data.hasCredits,
              currentBalance: data.data.currentBalance,
              required: data.data.required,
            } as ValidateCreditsResponse;
          } else {
            logger.warn('Invalid credit validation response structure', {
              hasData: !!data,
              dataKeys: data ? Object.keys(data) : [],
              fullResponse: data,
            });
            return {
              success: false,
              hasCredits: false,
              currentBalance: 0,
              required: request.amount,
              error: 'Invalid response from credit validation service',
            };
          }
        } catch (error) {
          logger.error('Failed to validate credits', {
            error: error instanceof Error ? error.message : String(error),
            userId: request.userId,
            amount: request.amount,
          });
          return {
            success: false,
            hasCredits: false,
            currentBalance: 0,
            required: request.amount,
            error: error instanceof Error ? error.message : 'Failed to validate credits',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Deduct credits from user account (atomic operation)
   */
  async deductCredits(request: DeductCreditsRequest): Promise<DeductCreditsResponse> {
    return withServiceResilience(
      'user-service',
      'deductCredits',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success?: boolean;
            transactionId?: string;
            newBalance?: number;
            error?: string;
          }>(getServiceUrl(SERVICE_NAME) + `/api/credits/${request.userId}/deduct`, request);

          if (data && data.success) {
            const deductResult = tryParseServiceResponse(
              DeductCreditsResponseSchema,
              { success: true, transactionId: data.transactionId, newBalance: data.newBalance },
              'user-service',
              'deductCredits'
            );

            return deductResult.success
              ? deductResult.data
              : { success: true as const, transactionId: data.transactionId, newBalance: data.newBalance };
          } else {
            return {
              success: false,
              error: data?.error || 'Failed to deduct credits',
            };
          }
        } catch (error) {
          logger.error('Failed to deduct credits', {
            error: error instanceof Error ? error.message : String(error),
            userId: request.userId,
            amount: request.amount,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to deduct credits',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Refund credits to user account
   */
  async refundCredits(request: RefundCreditsRequest): Promise<RefundCreditsResponse> {
    return withServiceResilience(
      'user-service',
      'refundCredits',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success?: boolean;
            transactionId?: string;
            newBalance?: number;
            error?: string;
          }>(getServiceUrl(SERVICE_NAME) + `/api/credits/${request.userId}/refund`, request);

          if (data && data.success) {
            return {
              success: true,
              transactionId: data.transactionId,
              newBalance: data.newBalance,
            };
          } else {
            return {
              success: false,
              error: data?.error || 'Failed to refund credits',
            };
          }
        } catch (error) {
          logger.error('Failed to refund credits', {
            error: error instanceof Error ? error.message : String(error),
            userId: request.userId,
            amount: request.amount,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to refund credits',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Get transaction history for a user
   */
  async getTransactionHistory(
    userId: string,
    params: { limit?: number; offset?: number } = {}
  ): Promise<{
    success: boolean;
    transactions?: CreditTransaction[];
    total?: number;
    error?: string;
  }> {
    return withServiceResilience(
      'user-service',
      'getTransactionHistory',
      async () => {
        try {
          const queryParams = new URLSearchParams();
          queryParams.append('userId', userId);
          if (params.limit) queryParams.append('limit', params.limit.toString());
          if (params.offset) queryParams.append('offset', params.offset.toString());

          const data = await this.httpClient.get<{
            success?: boolean;
            transactions?: CreditTransaction[];
            total?: number;
            error?: string;
          }>(getServiceUrl(SERVICE_NAME) + `/api/credits/transactions?${queryParams.toString()}`);

          if (data && data.success) {
            return {
              success: true,
              transactions: data.transactions,
              total: data.total,
            };
          } else {
            return {
              success: false,
              error: data?.error || 'Failed to get transaction history',
            };
          }
        } catch (error) {
          logger.error('Failed to get transaction history', {
            error: error instanceof Error ? error.message : String(error),
            userId,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get transaction history',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Check if user-profile service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.httpClient.getWithResponse<{ status?: string }>(
        getServiceUrl(SERVICE_NAME) + '/health'
      );
      return response.status === 200 && response.data.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Increment puzzle listen count for Self-Portrait Puzzle feature
   * Fire-and-forget - failures are logged but don't block the caller
   */
  async incrementPuzzleListens(userId: string): Promise<void> {
    try {
      return await withServiceResilience(
        'user-service',
        'incrementPuzzleListens',
        async () => {
          await this.httpClient.patch(
            getServiceUrl(SERVICE_NAME) + `/api/profile/puzzle-progress`,
            { incrementListens: 1 },
            {
              headers: {
                'x-user-id': userId,
              },
            }
          );
          logger.debug('Puzzle listen count incremented', { userId });
        },
        'internal-service'
      );
    } catch (error) {
      logger.warn('Failed to increment puzzle listen count (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
    }
  }

  /**
   * Get user display name for content attribution
   */
  async getUserDisplayName(userId: string): Promise<{
    success: boolean;
    displayName?: string;
    error?: string;
  }> {
    return withServiceResilience(
      'user-service',
      'getUserDisplayName',
      async () => {
        try {
          const url = getServiceUrl(SERVICE_NAME) + `/api/profiles/${userId}`;
          logger.info('Fetching user display name', { userId, url });

          const data = await this.httpClient.get<{
            success?: boolean;
            data?: {
              profile?: {
                displayName?: string;
                name?: string;
              };
            };
            error?: string;
          }>(url, {
            headers: { 'x-user-id': userId },
          });

          if (data?.success && data.data?.profile) {
            const displayName = data.data.profile.displayName || data.data.profile.name;
            logger.info('User display name fetched successfully', {
              userId,
              displayName: displayName || 'not set',
            });
            return {
              success: true,
              displayName: displayName || undefined,
            };
          } else {
            logger.warn('Profile fetch returned unsuccessful response', {
              userId,
              hasData: !!data,
              success: data?.success,
              hasProfile: !!data?.data?.profile,
            });
            return {
              success: false,
              error: data?.error || 'Profile not found or missing displayName',
            };
          }
        } catch (error) {
          logger.error('Failed to fetch user display name', {
            error: error instanceof Error ? error.message : String(error),
            userId,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch user profile',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Get accessible creator IDs for a user
   * Returns all creator IDs whose content the user can access
   * (self + librarians + explicitly followed creators)
   *
   * Cached with 60-second TTL, invalidated via Redis events on follow/unfollow
   */
  async getAccessibleCreatorIds(userId: string): Promise<{
    success: boolean;
    creatorIds?: string[];
    error?: string;
  }> {
    const now = Date.now();
    const cached = accessibleCreatorsCache.get(userId);
    if (cached && cached.expiresAt > now) {
      logger.debug('Returning cached accessible creator IDs', { userId, count: cached.creatorIds.length });
      return {
        success: true,
        creatorIds: cached.creatorIds,
      };
    }

    return withServiceResilience(
      'user-service',
      'getAccessibleCreatorIds',
      async () => {
        try {
          const signedHeaders = signUserIdHeader(userId);
          const data = await this.httpClient.get<{
            success?: boolean;
            data?: { creatorIds: string[] };
            error?: string;
          }>(getServiceUrl(SERVICE_NAME) + '/api/creator-members/accessible-creators', {
            headers: { ...signedHeaders, 'x-gateway-service': 'api-gateway' },
          });

          if (data?.success && data.data) {
            accessibleCreatorsCache.set(userId, {
              creatorIds: data.data.creatorIds,
              expiresAt: now + ACCESSIBLE_CREATORS_CACHE_TTL_MS,
            });
            return {
              success: true,
              creatorIds: data.data.creatorIds,
            };
          }

          return {
            success: false,
            error: data?.error || 'Failed to get accessible creator IDs',
          };
        } catch (error) {
          logger.error('Failed to get accessible creator IDs', {
            error: error instanceof Error ? error.message : String(error),
            userId,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get accessible creator IDs',
          };
        }
      },
      'internal-service'
    );
  }

  /**
   * Get all librarian user IDs
   * Used for unauthenticated access to determine whose content is publicly visible
   */
  async getLibrarianIds(): Promise<{
    success: boolean;
    librarianIds?: string[];
    error?: string;
    errorCode?: 'NETWORK_ERROR' | 'SERVICE_UNAVAILABLE' | 'INVALID_RESPONSE' | 'UNKNOWN';
  }> {
    return withServiceResilience(
      'user-service',
      'getLibrarianIds',
      async () => {
        const data = await this.httpClient.get<{
          success?: boolean;
          data?: { librarianIds: string[] };
          error?: string;
        }>(getServiceUrl(SERVICE_NAME) + '/api/creator-members/librarians');

        if (data?.success && data.data) {
          if (!Array.isArray(data.data.librarianIds)) {
            logger.error('Invalid librarian IDs response - not an array', {
              response: typeof data.data.librarianIds,
            });
            return {
              success: false,
              error: 'Invalid response format from user service',
              errorCode: 'INVALID_RESPONSE' as const,
            };
          }

          return {
            success: true,
            librarianIds: data.data.librarianIds,
          };
        }

        return {
          success: false,
          error: data?.error || 'Failed to get librarian IDs',
          errorCode: 'SERVICE_UNAVAILABLE' as const,
        };
      },
      'internal-service'
    );
  }

  /**
   * Unlock chapters by trigger - called after milestone events like first song generation
   * Fire-and-forget - failures are logged but don't block the caller
   */
  async unlockChaptersForTrigger(
    userId: string,
    trigger: string
  ): Promise<{ success: boolean; unlockedCount?: number; error?: string }> {
    return withServiceResilience(
      'user-service',
      'unlockChaptersForTrigger',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success?: boolean;
            data?: { unlockedCount: number; trigger: string };
            error?: string;
          }>(
            getServiceUrl(SERVICE_NAME) + '/api/books/unlock-chapters',
            { trigger },
            {
              headers: {
                'x-user-id': userId,
              },
            }
          );

          if (data?.success && data.data) {
            logger.info('Chapters unlocked successfully', {
              userId,
              trigger,
              unlockedCount: data.data.unlockedCount,
            });
            return {
              success: true,
              unlockedCount: data.data.unlockedCount,
            };
          }

          return {
            success: false,
            error: data?.error || 'Failed to unlock chapters',
          };
        } catch (error) {
          logger.warn('Failed to unlock chapters (non-blocking)', {
            error: error instanceof Error ? error.message : String(error),
            userId,
            trigger,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to unlock chapters',
          };
        }
      },
      'internal-service'
    );
  }

  async checkQuota(
    userId: string,
    action: string,
    userRole: string,
    count: number = 1
  ): Promise<{
    success: boolean;
    allowed?: boolean;
    reason?: string;
    code?: string;
    subscription?: {
      tier: string;
      isPaidTier: boolean;
      usage: { current: number; limit: number; remaining: number };
      resetAt?: string;
    };
    credits?: {
      currentBalance: number;
      required: number;
      hasCredits: boolean;
      shortfall?: number;
    };
    shouldUpgrade?: boolean;
    upgradeMessage?: string;
    error?: string;
  }> {
    return withServiceResilience(
      'user-service',
      'checkQuota',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success?: boolean;
            data?: {
              allowed: boolean;
              reason?: string;
              code?: string;
              subscription?: {
                tier: string;
                isPaidTier: boolean;
                usage: { current: number; limit: number; remaining: number };
                resetAt?: string;
              };
              credits?: { currentBalance: number; required: number; hasCredits: boolean; shortfall?: number };
              shouldUpgrade?: boolean;
              upgradeMessage?: string;
            };
            error?: string;
          }>(getServiceUrl(SERVICE_NAME) + `/api/quota/${userId}/check`, {
            action,
            userRole,
            count,
          });

          if (data?.success && data.data) {
            tryParseServiceResponse(QuotaCheckResponseSchema, data, 'user-service', 'checkQuota');

            return {
              success: true,
              ...data.data,
            };
          }

          return {
            success: false,
            allowed: false,
            error: data?.error || 'Quota check failed',
          };
        } catch (error) {
          logger.error('Failed to check quota', {
            error: error instanceof Error ? error.message : String(error),
            userId,
            action,
          });
          return {
            success: false,
            allowed: false,
            error: error instanceof Error ? error.message : 'Failed to check quota',
          };
        }
      },
      'internal-service'
    );
  }

  async incrementUsage(userId: string, type: string): Promise<{ success: boolean; error?: string }> {
    return withServiceResilience(
      'user-service',
      'incrementUsage',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success?: boolean;
            error?: string;
          }>(getServiceUrl(SERVICE_NAME) + `/api/subscriptions/${userId}/increment-usage`, { type });

          return { success: !!data?.success };
        } catch (error) {
          logger.error('Failed to increment usage', {
            error: error instanceof Error ? error.message : String(error),
            userId,
            type,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to increment usage',
          };
        }
      },
      'internal-service'
    );
  }

  async reserveCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; reservationId?: string; error?: string }> {
    return withServiceResilience(
      'user-service',
      'reserveCredits',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success?: boolean;
            data?: { reservationId: string };
            error?: string;
          }>(getServiceUrl(SERVICE_NAME) + `/api/credits/${userId}/reserve`, {
            amount,
            description,
            metadata,
          });

          if (data?.success && data.data?.reservationId) {
            return { success: true, reservationId: data.data.reservationId };
          }

          return { success: false, error: data?.error || 'Failed to reserve credits' };
        } catch (error) {
          logger.error('Failed to reserve credits', {
            error: error instanceof Error ? error.message : String(error),
            userId,
            amount,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to reserve credits',
          };
        }
      },
      'internal-service'
    );
  }

  async settleReservation(
    reservationId: string,
    userId: string,
    actualAmount: number,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; settledAmount?: number; refundedAmount?: number; error?: string }> {
    return withServiceResilience(
      'user-service',
      'settleReservation',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success?: boolean;
            data?: { settledAmount?: number; refundedAmount?: number };
            error?: string;
          }>(
            getServiceUrl(SERVICE_NAME) + `/api/credits/reservations/${reservationId}/settle`,
            {
              actualAmount,
              metadata,
            },
            {
              headers: { 'x-user-id': userId },
            }
          );

          if (data?.success) {
            return {
              success: true,
              settledAmount: data.data?.settledAmount,
              refundedAmount: data.data?.refundedAmount,
            };
          }

          return { success: false, error: data?.error || 'Failed to settle reservation' };
        } catch (error) {
          logger.error('Failed to settle reservation', {
            error: error instanceof Error ? error.message : String(error),
            reservationId,
            actualAmount,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to settle reservation',
          };
        }
      },
      'internal-service'
    );
  }

  async cancelReservation(
    reservationId: string,
    userId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    return withServiceResilience(
      'user-service',
      'cancelReservation',
      async () => {
        try {
          const data = await this.httpClient.post<{
            success?: boolean;
            error?: string;
          }>(
            getServiceUrl(SERVICE_NAME) + `/api/credits/reservations/${reservationId}/cancel`,
            {
              reason,
            },
            {
              headers: { 'x-user-id': userId },
            }
          );

          return { success: !!data?.success };
        } catch (error) {
          logger.error('Failed to cancel reservation', {
            error: error instanceof Error ? error.message : String(error),
            reservationId,
            reason,
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to cancel reservation',
          };
        }
      },
      'internal-service'
    );
  }
}
