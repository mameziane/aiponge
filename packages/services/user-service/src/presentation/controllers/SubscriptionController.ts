/**
 * Subscription Controller
 * Handles subscription management, usage tracking, and RevenueCat webhook processing
 */

import { Request, Response } from 'express';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess, sendCreated } from '../utils/response-helpers';
import { SubscriptionRepository } from '@infrastructure/repositories';
import { CheckUsageEligibilityUseCase } from '@application/use-cases/billing';
import { SUBSCRIPTION_TIERS, TIER_IDS } from '@infrastructure/database/schemas/subscription-schema';
import { createControllerHelpers, serializeError } from '@aiponge/platform-core';
import { SUBSCRIPTION_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('subscription-controller');

const CREDIT_COST_PER_SONG = 15;

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class SubscriptionController {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly checkUsageEligibilityUseCase: CheckUsageEligibilityUseCase
  ) {}

  async getSubscriptionStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string;

      const subscription = await this.subscriptionRepository.getSubscriptionByUserId(userId);

      if (!subscription) {
        sendSuccess(res, {
          userId,
          subscriptionTier: TIER_IDS.GUEST,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          entitlements: [],
        });
        return;
      }

      sendSuccess(res, subscription);
    } catch (error) {
      logger.error('Get subscription status error', {
        error: serializeError(error),
        userId: req.params.userId,
      });
      ServiceErrors.fromException(res, error, 'Failed to get subscription status', req);
      return;
    }
  }

  async getUsageLimits(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get usage limits',
      handler: async () => {
        const userId = req.params.userId as string;

        const usage = await this.subscriptionRepository.getCurrentUsage(userId);
        const tier = await this.subscriptionRepository.getSubscriptionTier(userId);

        return { tier, usage };
      },
    });
  }

  async checkUsageLimit(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId as string;
    const { type } = req.body;

    if (!['songs', 'lyrics', 'insights'].includes(type)) {
      ServiceErrors.badRequest(res, 'Invalid usage type. Must be songs, lyrics, or insights', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to check usage limit',
      handler: async () => this.subscriptionRepository.checkUsageLimit(userId, type),
    });
  }

  async incrementUsage(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId as string;
    const { type } = req.body;

    if (!['songs', 'lyrics', 'insights'].includes(type)) {
      ServiceErrors.badRequest(res, 'Invalid usage type. Must be songs, lyrics, or insights', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to increment usage',
      handler: async () => this.subscriptionRepository.incrementUsage(userId, type),
    });
  }

  async checkEntitlement(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to check entitlement',
      handler: async () => {
        const userId = req.params.userId as string;
        const entitlement = req.params.entitlement as string;

        const hasAccess = await this.subscriptionRepository.hasEntitlement(userId, entitlement);

        return { userId, entitlement, hasAccess };
      },
    });
  }

  async processRevenueCatWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhookData = req.body;

      logger.info('Received RevenueCat webhook', {
        type: webhookData.type,
        appUserId: webhookData.event?.app_user_id,
      });

      await this.subscriptionRepository.processWebhook(webhookData);

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
      });
    } catch (error) {
      logger.error('RevenueCat webhook processing error', { error });
      res.status(200).json({
        success: false,
        error: {
          type: 'InternalError',
          code: 'WEBHOOK_PROCESSING_FAILED',
          message: 'Webhook processing failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  async createSubscription(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string;

      const existingSubscription = await this.subscriptionRepository.getSubscriptionByUserId(userId);

      if (existingSubscription) {
        const updated = await this.subscriptionRepository.updateSubscription(existingSubscription.id, req.body);

        sendSuccess(res, updated);
        return;
      }

      const subscription = await this.subscriptionRepository.createSubscription({
        userId,
        ...req.body,
      });

      sendCreated(res, subscription);
    } catch (error) {
      logger.error('Create subscription error', {
        error: serializeError(error),
        userId: req.params.userId,
      });
      ServiceErrors.fromException(res, error, 'Failed to create subscription', req);
      return;
    }
  }

  async getSubscriptionEvents(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string;

      const subscription = await this.subscriptionRepository.getSubscriptionByUserId(userId);

      if (!subscription) {
        ServiceErrors.notFound(res, 'Subscription', req);
        return;
      }

      const events = await this.subscriptionRepository.getSubscriptionEvents(subscription.id);

      sendSuccess(res, events);
    } catch (error) {
      logger.error('Get subscription events error', {
        error: serializeError(error),
        userId: req.params.userId,
      });
      ServiceErrors.fromException(res, error, 'Failed to get subscription events', req);
      return;
    }
  }

  async checkUsageEligibility(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string;
      const { featureType } = req.body;

      if (!['songs', 'lyrics', 'insights'].includes(featureType)) {
        ServiceErrors.badRequest(res, 'Invalid feature type. Must be songs, lyrics, or insights', req);
        return;
      }

      const result = await this.checkUsageEligibilityUseCase.execute({
        userId,
        featureType,
      });

      if (result.allowed) {
        sendSuccess(res, result);
      } else {
        ServiceErrors.forbidden(res, result.reason || 'Usage limit exceeded', req);
      }
    } catch (error) {
      logger.error('Check usage eligibility error', {
        error: serializeError(error),
        userId: req.params.userId,
      });
      ServiceErrors.fromException(res, error, 'Failed to check usage eligibility', req);
      return;
    }
  }

  async checkQuota(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string;
      const { action, creditCost, userRole } = req.body;

      if (!['songs', 'lyrics', 'insights'].includes(action)) {
        ServiceErrors.badRequest(res, 'Invalid action type. Must be songs, lyrics, or insights', req);
        return;
      }

      const { ServiceFactory } = await import('../../infrastructure/composition/ServiceFactory');
      const checkQuotaUseCase = ServiceFactory.createCheckQuotaUseCase();

      const result = await checkQuotaUseCase.execute({
        userId,
        action,
        creditCost,
        userRole,
      });

      if (result.allowed) {
        sendSuccess(res, result);
      } else {
        ServiceErrors.forbidden(res, result.reason || 'Quota exceeded', req);
      }
    } catch (error) {
      logger.error('Check quota error', {
        error: serializeError(error),
        userId: req.params.userId,
      });
      ServiceErrors.fromException(res, error, 'Failed to check quota', req);
      return;
    }
  }

  async getConfig(_req: Request, res: Response): Promise<void> {
    await handleRequest({
      req: _req,
      res,
      errorMessage: 'Failed to get subscription config',
      handler: async () => {
        const exposedTiers = {
          guest: SUBSCRIPTION_TIERS.guest,
          explorer: SUBSCRIPTION_TIERS.explorer,
          personal: SUBSCRIPTION_TIERS.personal,
          practice: SUBSCRIPTION_TIERS.practice,
          studio: SUBSCRIPTION_TIERS.studio,
        };

        return {
          tiers: exposedTiers,
          creditCostPerSong: CREDIT_COST_PER_SONG,
          defaultTier: TIER_IDS.GUEST,
        };
      },
    });
  }
}
