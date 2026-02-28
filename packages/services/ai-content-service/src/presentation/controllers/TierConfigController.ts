import { Request, Response } from 'express';
import { TierConfigService, createTierConfigService } from '@domains/services/TierConfigService';
import { DrizzleTierConfigRepository } from '@infrastructure/database/repositories/TierConfigRepository';
import { createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { tierConfigJsonSchema, TierConfigJson } from '@schema/content-schema';
import { getLogger } from '@config/service-urls';
import { createControllerHelpers, serializeError, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors, sendSuccess } = getResponseHelpers();

const logger = getLogger('tier-config-controller');

const { handleRequest } = createControllerHelpers('ai-content-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

const tierConfigService = createTierConfigService(createDrizzleRepository(DrizzleTierConfigRepository));

export class TierConfigController {
  async getAllConfigs(_req: Request, res: Response): Promise<void> {
    await handleRequest({
      req: _req,
      res,
      errorMessage: 'Failed to get tier configs',
      handler: async () => tierConfigService.getAllConfigs(),
    });
  }

  async getConfig(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get tier config',
      handler: async () => {
        const tier = String(req.params.tier);
        return tierConfigService.getConfig(tier);
      },
    });
  }

  async getFeatures(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get tier features',
      handler: async () => {
        const tier = String(req.params.tier);
        return tierConfigService.getFeatures(tier);
      },
    });
  }

  async getLimits(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get tier limits',
      handler: async () => {
        const tier = String(req.params.tier);
        return tierConfigService.getLimits(tier);
      },
    });
  }

  async checkFeature(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to check tier feature',
      handler: async () => {
        const tier = String(req.params.tier);
        const feature = String(req.params.feature);
        const hasFeature = await tierConfigService.hasFeature(tier, feature as Parameters<typeof tierConfigService.hasFeature>[1]);
        return { hasFeature };
      },
    });
  }

  async checkLimit(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to check tier limit',
      handler: async () => {
        const tier = String(req.params.tier);
        const action = String(req.params.action);
        const { currentUsage } = req.query;
        const usage = parseInt(currentUsage as string, 10) || 0;
        const hasReachedLimit = await tierConfigService.hasReachedLimit(tier, action as Parameters<typeof tierConfigService.hasReachedLimit>[1], usage);
        const limit = await tierConfigService.getLimit(tier, `${action}PerMonth` as Parameters<typeof tierConfigService.getLimit>[1]);
        return { hasReachedLimit, limit, currentUsage: usage };
      },
    });
  }

  async checkBookDepth(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to check book depth',
      handler: async () => {
        const tier = String(req.params.tier);
        const { depth } = req.query;
        const requestedDepth = (depth as string) || 'standard';
        const canGenerate = await tierConfigService.canGenerateBookAtDepth(tier, requestedDepth as Parameters<typeof tierConfigService.canGenerateBookAtDepth>[1]);
        const maxDepth = await tierConfigService.getMaxBookDepth(tier);
        return { canGenerate, maxDepth, requestedDepth };
      },
    });
  }

  async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const tier = String(req.params.tier);
      const updates = req.body;

      const result = await tierConfigService.updateTierConfig(tier, updates);
      if (!result) {
        ServiceErrors.notFound(res, 'Tier config', req);
        return;
      }

      logger.info('Tier config updated', { tier, updates });
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Failed to update tier config', { tier: req.params.tier, error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update tier config', req);
    }
  }

  async upsertConfig(req: Request, res: Response): Promise<void> {
    const tier = String(req.params.tier);
    const parseResult = tierConfigJsonSchema.safeParse(req.body);
    if (!parseResult.success) {
      ServiceErrors.badRequest(res, 'Invalid config format', req, { errors: parseResult.error.errors });
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to upsert tier config',
      handler: async () => {
        const result = await tierConfigService.upsertTierConfig(tier, parseResult.data as TierConfigJson);
        logger.info('Tier config upserted', { tier });
        return result;
      },
    });
  }

  async invalidateCache(_req: Request, res: Response): Promise<void> {
    await handleRequest({
      req: _req,
      res,
      errorMessage: 'Failed to invalidate cache',
      handler: async () => {
        tierConfigService.invalidateCache();
        logger.info('Tier config cache invalidated');
        return { message: 'Cache invalidated' };
      },
    });
  }
}

export const tierConfigController = new TierConfigController();
