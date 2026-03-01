import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { createControllerHelpers } from '@aiponge/platform-core';
import { ServiceErrors } from '../../utils/response-helpers';
import { InsightsError } from '../../../application/errors';
import { GetMoodCheckinsUseCase } from '../../../application/use-cases/intelligence';

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class IntelligenceMoodController {
  async recordMoodCheckin(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to record mood check-in',
      successStatus: 201,
      handler: async () => {
        const { userId, mood, emotionalIntensity, content, triggerTag } = req.body;
        if (!userId || !mood || emotionalIntensity === undefined) {
          throw InsightsError.validationError('mood', 'userId, mood, and emotionalIntensity are required');
        }
        const useCase = ServiceFactory.createRecordMoodCheckInUseCase();
        return useCase.execute({ userId, mood, emotionalIntensity, content, triggerTag });
      },
    });
  }

  async getMoodCheckins(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get mood check-ins',
      handler: async () => {
        const userId = req.params.userId as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const useCase = new GetMoodCheckinsUseCase();
        return useCase.execute({ userId, limit });
      },
    });
  }

  async respondToMoodMicroQuestion(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to respond to mood micro-question',
      handler: async () => {
        const checkinId = req.params.id as string;
        const { microQuestionResponse } = req.body;
        if (!microQuestionResponse) {
          throw InsightsError.validationError('microQuestionResponse', 'microQuestionResponse is required');
        }
        const repository = ServiceFactory.createIntelligenceRepository();
        return repository.updateMoodCheckin(checkinId, {
          microQuestionResponse,
          respondedAt: new Date(),
        });
      },
    });
  }
}
