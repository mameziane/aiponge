import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { createControllerHelpers } from '@aiponge/platform-core';
import { ServiceErrors } from '../../utils/response-helpers';

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class IntelligenceEntryAnalysisController {
  async analyzeEntry(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to analyze entry',
      handler: async () => {
        const id = req.params.id as string;
        const { userId } = req.body;
        const useCase = ServiceFactory.createAnalyzeEntryUseCase();
        return useCase.execute({ entryId: id, userId });
      },
    });
  }

  async batchAnalyzeEntries(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to batch analyze entries',
      handler: async () => {
        const useCase = ServiceFactory.createBatchAnalyzeEntriesUseCase();
        return useCase.execute(req.body);
      },
    });
  }

  async detectEntryPatterns(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to detect entry patterns',
      handler: async () => {
        const userId = req.params.userId as string;
        const useCase = ServiceFactory.createDetectEntryPatternsUseCase();
        return useCase.execute({ userId });
      },
    });
  }
}
