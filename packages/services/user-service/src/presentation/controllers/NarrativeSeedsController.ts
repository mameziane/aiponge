/**
 * Narrative Seeds Controller
 * Exposes endpoint for extracting personalized narrative context
 * Called by music-service during lyrics generation
 */

import { Request, Response } from 'express';
import { GetNarrativeSeedsUseCase, NarrativeSeedsRequest } from '@application/use-cases/insights';
import { getLogger } from '@config/service-urls';
import { createControllerHelpers } from '@aiponge/platform-core';
import { ServiceErrors, sendSuccess } from '../utils/response-helpers';

const logger = getLogger('user-service-narrative-seeds-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class NarrativeSeedsController {
  constructor(private readonly getNarrativeSeedsUseCase: GetNarrativeSeedsUseCase) {}

  async getNarrativeSeeds(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId;

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to extract narrative seeds',
      handler: async () => {
        const request: NarrativeSeedsRequest = {
          userId: userId as string,
          maxSeeds: req.query.maxSeeds ? parseInt(req.query.maxSeeds as string, 10) : 20,
          timeframeDays: req.query.timeframeDays ? parseInt(req.query.timeframeDays as string, 10) : 30,
          includeEmotionalContext: req.query.includeEmotionalContext !== 'false',
        };

        logger.debug('Getting narrative seeds', { userId, request });

        return this.getNarrativeSeedsUseCase.execute(request);
      },
    });
  }
}
