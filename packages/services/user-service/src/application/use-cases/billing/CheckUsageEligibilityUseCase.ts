/**
 * Check Usage Eligibility Use Case
 * Server-side feature gating - determines if user can perform an action
 *
 * Uses TierConfigClient for database-driven tier configuration with fallback.
 */

import { SubscriptionRepository } from '@infrastructure/repositories';
import { getLogger } from '@config/service-urls';
import { isPaidTier, normalizeTier, type SubscriptionTier } from '@aiponge/shared-contracts';
import { TierConfigClient, serializeError } from '@aiponge/platform-core';
import { BillingError } from '@application/errors';

const logger = getLogger('check-usage-eligibility-use-case');

export interface CheckUsageEligibilityRequest {
  userId: string;
  featureType: 'songs' | 'lyrics' | 'insights';
}

export interface CheckUsageEligibilityResponse {
  success: boolean;
  allowed: boolean;
  tier: SubscriptionTier;
  isPaidTier: boolean;
  usage: {
    current: number;
    limit: number;
    remaining: number;
  };
  resetAt?: Date;
  reason?: string;
  shouldUpgrade: boolean;
  upgradeMessage?: string;
}

export class CheckUsageEligibilityUseCase {
  private tierConfigClient: TierConfigClient;

  constructor(private subscriptionRepository: SubscriptionRepository) {
    this.tierConfigClient = new TierConfigClient();
  }

  async execute(request: CheckUsageEligibilityRequest): Promise<CheckUsageEligibilityResponse> {
    try {
      if (!request.userId?.trim()) {
        throw BillingError.userIdRequired();
      }

      if (!['songs', 'lyrics', 'insights'].includes(request.featureType)) {
        throw BillingError.invalidFeatureType(request.featureType);
      }

      const tierRaw = await this.subscriptionRepository.getSubscriptionTier(request.userId);
      const tier = normalizeTier(tierRaw);
      const tierIsPremium = isPaidTier(tier);

      if (tierIsPremium) {
        return {
          success: true,
          allowed: true,
          tier,
          isPaidTier: true,
          usage: {
            current: 0,
            limit: -1,
            remaining: -1,
          },
          shouldUpgrade: false,
        };
      }

      const usageCheck = await this.subscriptionRepository.checkUsageLimit(request.userId, request.featureType);
      const usage = await this.subscriptionRepository.getCurrentUsage(request.userId);
      const limits = await this.tierConfigClient.getLimits(tier);

      const limitField =
        request.featureType === 'songs'
          ? 'songsPerMonth'
          : request.featureType === 'lyrics'
            ? 'lyricsPerMonth'
            : 'insightsPerMonth';

      const usageField =
        request.featureType === 'songs'
          ? usage?.songsGenerated
          : request.featureType === 'lyrics'
            ? usage?.lyricsGenerated
            : usage?.insightsGenerated;

      const currentUsage = usageField || 0;
      const limit = limits[limitField];
      const remaining = Math.max(0, limit - currentUsage);

      logger.debug('Usage eligibility checked', {
        userId: request.userId,
        featureType: request.featureType,
        tier,
        current: currentUsage,
        limit,
        allowed: usageCheck.allowed,
      });

      return {
        success: true,
        allowed: usageCheck.allowed,
        tier,
        isPaidTier: false,
        usage: {
          current: currentUsage,
          limit,
          remaining,
        },
        resetAt: usageCheck.resetAt,
        reason: usageCheck.allowed ? undefined : `You've reached your monthly limit of ${limit} ${request.featureType}`,
        shouldUpgrade: !usageCheck.allowed,
        upgradeMessage: !usageCheck.allowed ? `Upgrade to a paid plan for unlimited ${request.featureType}` : undefined,
      };
    } catch (error) {
      logger.error('Failed to check usage eligibility', {
        userId: request.userId,
        error: serializeError(error),
      });
      throw error;
    }
  }
}
