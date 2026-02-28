/**
 * Check Quota Use Case
 * Unified quota check combining subscription limits + credits in one call
 *
 * This is the single source of truth for "can this user perform this action?"
 * Centralizes all quota logic to prevent duplication across services.
 *
 * Uses TierConfigClient for database-driven tier configuration with fallback.
 */

import { SubscriptionRepository } from '@infrastructure/repositories';
import { ICreditRepository } from '@domains/credits';
import { getLogger } from '@config/service-urls';
import {
  isAdmin,
  type UserRole,
  isPaidTier,
  normalizeTier,
  type SubscriptionTier,
  TIER_IDS,
} from '@aiponge/shared-contracts';
import { TierConfigClient, serializeError } from '@aiponge/platform-core';
import { BillingError } from '@application/errors';

const logger = getLogger('check-quota-use-case');

export interface CheckQuotaRequest {
  userId: string;
  action: 'songs' | 'lyrics' | 'insights';
  creditCost?: number;
  userRole?: UserRole;
}

export interface CheckQuotaResponse {
  success: boolean;
  allowed: boolean;
  reason?: string;
  code?: 'ALLOWED' | 'SUBSCRIPTION_LIMIT_EXCEEDED' | 'INSUFFICIENT_CREDITS' | 'ADMIN_BYPASS';
  subscription: {
    tier: SubscriptionTier;
    isPaidTier: boolean;
    usage: {
      current: number;
      limit: number;
      remaining: number;
    };
    resetAt?: Date;
  };
  credits: {
    currentBalance: number;
    required: number;
    hasCredits: boolean;
    shortfall?: number;
  };
  shouldUpgrade: boolean;
  upgradeMessage?: string;
}

export class CheckQuotaUseCase {
  private tierConfigClient: TierConfigClient;

  constructor(
    private subscriptionRepository: SubscriptionRepository,
    private creditRepository: ICreditRepository
  ) {
    this.tierConfigClient = new TierConfigClient();
  }

  async execute(request: CheckQuotaRequest): Promise<CheckQuotaResponse> {
    try {
      if (!request.userId?.trim()) {
        throw BillingError.userIdRequired();
      }

      if (!['songs', 'lyrics', 'insights'].includes(request.action)) {
        throw BillingError.invalidActionType(request.action);
      }

      // Get subscription tier first to fetch tier-specific credit cost
      const tierRaw = await this.subscriptionRepository.getSubscriptionTier(request.userId);
      const tier = normalizeTier(tierRaw);

      // Use tier-specific credit cost from database config (with fallback)
      const tierCreditCost = await this.tierConfigClient.getCreditCost(tier, request.action);
      const creditCost = request.creditCost ?? tierCreditCost;

      // Admin bypass - admins can always perform actions
      if (request.userRole && isAdmin(request.userRole)) {
        logger.info('Admin bypass for quota check', { userId: request.userId, action: request.action });
        return this.buildAdminBypassResponse();
      }

      const tierIsPremium = isPaidTier(tier);

      // Paid tier users have unlimited subscription limits
      if (tierIsPremium) {
        // Still need to check credits for paid actions
        const creditCheck = await this.checkCredits(request.userId, creditCost);

        return {
          success: true,
          allowed: creditCheck.hasCredits,
          reason: creditCheck.hasCredits
            ? undefined
            : `Insufficient credits. Required: ${creditCost}, Available: ${creditCheck.currentBalance}`,
          code: creditCheck.hasCredits ? 'ALLOWED' : 'INSUFFICIENT_CREDITS',
          subscription: {
            tier,
            isPaidTier: true,
            usage: { current: 0, limit: -1, remaining: -1 },
          },
          credits: creditCheck,
          shouldUpgrade: false,
        };
      }

      // Explorer tier - check subscription limits first using TierConfigClient
      const usageCheck = await this.subscriptionRepository.checkUsageLimit(request.userId, request.action);
      const usage = await this.subscriptionRepository.getCurrentUsage(request.userId);
      const limits = await this.tierConfigClient.getLimits(tier);

      const limitField =
        request.action === 'songs'
          ? 'songsPerMonth'
          : request.action === 'lyrics'
            ? 'lyricsPerMonth'
            : 'insightsPerMonth';

      const usageField =
        request.action === 'songs'
          ? usage?.songsGenerated
          : request.action === 'lyrics'
            ? usage?.lyricsGenerated
            : usage?.insightsGenerated;

      const currentUsage = usageField || 0;
      const limit = limits[limitField];
      const remaining = Math.max(0, limit - currentUsage);

      // Check subscription limit first
      if (!usageCheck.allowed) {
        return {
          success: true,
          allowed: false,
          reason: `You've reached your monthly limit of ${limit} ${request.action}`,
          code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
          subscription: {
            tier,
            isPaidTier: false,
            usage: { current: currentUsage, limit, remaining },
            resetAt: usageCheck.resetAt,
          },
          credits: {
            currentBalance: 0,
            required: creditCost,
            hasCredits: false,
          },
          shouldUpgrade: true,
          upgradeMessage: `Upgrade to a paid plan for unlimited ${request.action}`,
        };
      }

      // Check credits
      const creditCheck = await this.checkCredits(request.userId, creditCost);

      logger.debug('Quota check completed', {
        userId: request.userId,
        action: request.action,
        tier,
        creditCost,
        subscriptionAllowed: usageCheck.allowed,
        creditCheck: creditCheck.hasCredits,
        allowed: creditCheck.hasCredits,
      });

      return {
        success: true,
        allowed: creditCheck.hasCredits,
        reason: creditCheck.hasCredits
          ? undefined
          : `Insufficient credits. Required: ${creditCost}, Available: ${creditCheck.currentBalance}`,
        code: creditCheck.hasCredits ? 'ALLOWED' : 'INSUFFICIENT_CREDITS',
        subscription: {
          tier,
          isPaidTier: false,
          usage: { current: currentUsage, limit, remaining },
          resetAt: usageCheck.resetAt,
        },
        credits: creditCheck,
        shouldUpgrade: !creditCheck.hasCredits,
        upgradeMessage: !creditCheck.hasCredits ? 'Purchase more credits to continue' : undefined,
      };
    } catch (error) {
      logger.error('Failed to check quota', {
        userId: request.userId,
        error: serializeError(error),
      });
      throw error;
    }
  }

  private async checkCredits(
    userId: string,
    required: number
  ): Promise<{
    currentBalance: number;
    required: number;
    hasCredits: boolean;
    shortfall?: number;
  }> {
    if (required <= 0) {
      return { currentBalance: 0, required: 0, hasCredits: true };
    }

    const balance = await this.creditRepository.getBalance(userId);
    const currentBalance = balance?.currentBalance ?? 0;
    const hasCredits = currentBalance >= required;

    return {
      currentBalance,
      required,
      hasCredits,
      shortfall: hasCredits ? undefined : required - currentBalance,
    };
  }

  private buildAdminBypassResponse(): CheckQuotaResponse {
    return {
      success: true,
      allowed: true,
      code: 'ADMIN_BYPASS',
      subscription: {
        tier: TIER_IDS.STUDIO,
        isPaidTier: true,
        usage: { current: 0, limit: -1, remaining: -1 },
      },
      credits: {
        currentBalance: 999999,
        required: 0,
        hasCredits: true,
      },
      shouldUpgrade: false,
    };
  }
}
