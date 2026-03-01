import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { getLogger } from '@config/service-urls';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';
import { InsightsError } from '../../../application/errors';
import {
  GetReflectionsUseCase,
  GetReflectionByIdUseCase,
  UpdateReflectionUseCase,
  DeleteReflectionUseCase,
} from '../../../application/use-cases/intelligence';
import { createControllerHelpers, serializeError, extractAuthContext } from '@aiponge/platform-core';

const logger = getLogger('intelligence-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class IntelligenceReflectionController {
  async createReflection(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to create reflection',
      successStatus: 201,
      handler: async () => {
        const useCase = ServiceFactory.createReflectionUseCase();
        return useCase.execute(req.body);
      },
    });
  }

  async getReflections(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get reflections',
      handler: async () => {
        const userId = req.params.userId as string;
        const useCase = new GetReflectionsUseCase();
        return useCase.execute({ userId });
      },
    });
  }

  async getReflectionById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const userId = req.query.userId as string;
      const useCase = new GetReflectionByIdUseCase();
      const result = await useCase.execute({ id, userId });
      if (!result) {
        ServiceErrors.notFound(res, 'Reflection', req);
        return;
      }
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Get reflection by id error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get reflection', req);
    }
  }

  async updateReflection(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to update reflection',
      handler: async () => {
        const id = req.params.id as string;
        const { userId, ...data } = req.body;
        const useCase = new UpdateReflectionUseCase();
        return useCase.execute({ id, userId, data });
      },
    });
  }

  async deleteReflectionById(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to delete reflection',
      handler: async () => {
        const id = req.params.id as string;
        const { userId } = req.body;
        const useCase = new DeleteReflectionUseCase();
        return useCase.execute({ id, userId });
      },
    });
  }

  async continueReflectionDialogue(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to continue reflection dialogue',
      handler: async () => {
        const reflectionId = req.params.id as string;
        const { userId, userResponse } = req.body;
        if (!userId || !userResponse) {
          throw InsightsError.validationError('userResponse', 'userId and userResponse are required');
        }
        const useCase = ServiceFactory.createContinueReflectionDialogueUseCase();
        return useCase.execute({ reflectionId, userId, userResponse });
      },
    });
  }

  async getReflectionThread(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get reflection thread',
      handler: async () => {
        const reflectionId = req.params.id as string;
        const userId = req.query.userId as string;
        if (!userId) {
          throw InsightsError.userIdRequired();
        }
        const repository = ServiceFactory.createIntelligenceRepository();
        const reflection = await repository.findReflectionById(reflectionId, userId);
        if (!reflection) {
          throw InsightsError.reflectionNotFound(reflectionId);
        }
        const turns = await repository.findReflectionTurnsByReflectionId(reflectionId);
        return { reflection, turns };
      },
    });
  }
}
