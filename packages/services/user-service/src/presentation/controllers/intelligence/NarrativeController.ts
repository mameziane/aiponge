import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { createControllerHelpers } from '@aiponge/platform-core';
import { ServiceErrors } from '../../utils/response-helpers';

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
        const userId = req.params.userId || req.query.userId as string;
        if (!userId) {
          throw new Error('userId is required');
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
        const repository = ServiceFactory.createIntelligenceRepository();
        const narratives = await repository.findNarrativesByUserId(userId, limit);
        return { narratives, count: narratives.length };
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
          throw new Error('userId and userReflection are required');
        }
        const useCase = ServiceFactory.createGeneratePersonalNarrativeUseCase();
        return useCase.respondToNarrative({ narrativeId, userId, userReflection });
      },
    });
  }
}
