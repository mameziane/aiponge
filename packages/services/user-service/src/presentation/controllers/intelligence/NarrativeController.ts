import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { createControllerHelpers } from '@aiponge/platform-core';
import { ServiceErrors } from '../../utils/response-helpers';
import { InsightsError } from '../../../application/errors';
import { GetNarrativeHistoryUseCase } from '../../../application/use-cases/intelligence';

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class IntelligenceNarrativeController {
  async getLatestNarrative(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get latest narrative',
      handler: async () => {
        const userId = req.params.userId || (req.query.userId as string);
        if (!userId) {
          throw InsightsError.userIdRequired();
        }
        const useCase = ServiceFactory.createGeneratePersonalNarrativeUseCase();
        return useCase.execute({ userId: userId as string });
      },
    });
  }

  async getNarrativeHistory(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get narrative history',
      handler: async () => {
        const userId = req.params.userId as string;
        const limit = parseInt(req.query.limit as string) || 20;
        const useCase = new GetNarrativeHistoryUseCase();
        return useCase.execute({ userId, limit });
      },
    });
  }

  async respondToNarrative(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to respond to narrative',
      handler: async () => {
        const narrativeId = req.params.id as string;
        const { userId, userReflection } = req.body;
        if (!userId || !userReflection) {
          throw InsightsError.validationError('userReflection', 'userId and userReflection are required');
        }
        const useCase = ServiceFactory.createGeneratePersonalNarrativeUseCase();
        return useCase.respondToNarrative({ narrativeId, userId, userReflection });
      },
    });
  }
}
