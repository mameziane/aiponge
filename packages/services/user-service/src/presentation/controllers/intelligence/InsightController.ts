import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { createControllerHelpers } from '@aiponge/platform-core';
import { ServiceErrors } from '../../utils/response-helpers';

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class IntelligenceInsightController {
  async getInsightsByEntry(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get insights by entry',
      handler: async () => {
        const entryId = req.params.entryId as string;
        const repository = ServiceFactory.createIntelligenceRepository();
        const result = await repository.findInsightsByEntryId(entryId);
        return { insights: result };
      },
    });
  }

  async createInsight(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to create insight',
      successStatus: 201,
      handler: async () => {
        const useCase = ServiceFactory.createInsightUseCase();
        return useCase.execute(req.body);
      },
    });
  }

  async getInsights(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get insights',
      handler: async () => {
        const userId = req.params.userId as string;
        const useCase = ServiceFactory.createGetInsightsUseCase();
        return useCase.execute({ userId });
      },
    });
  }

  async updateUserGoalsFromInsights(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to update user goals from insights',
      handler: async () => {
        const userId = req.params.userId as string;
        const useCase = ServiceFactory.createUpdateUserGoalsFromInsightsUseCase();
        return useCase.execute({ userId, ...req.body });
      },
    });
  }
}
