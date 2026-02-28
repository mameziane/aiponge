import { Request, Response } from 'express';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';
import { createControllerHelpers, extractAuthContext } from '@aiponge/platform-core';
import { ServiceErrors } from '../../utils/response-helpers';

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class IntelligenceIllustrationController {
  async addIllustration(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to add illustration',
      handler: async () => {
        const entryId = req.params.entryId as string;
        const { userId } = extractAuthContext(req);
        const { url } = req.body;
        const useCase = ServiceFactory.createAddIllustrationUseCase();
        return useCase.execute({ entryId, userId, url });
      },
    });
  }

  async removeIllustration(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to remove illustration',
      handler: async () => {
        const entryId = req.params.entryId as string;
        const imageId = (req.params.illustrationId || req.params.imageId) as string;
        const { userId } = extractAuthContext(req);
        const useCase = ServiceFactory.createRemoveIllustrationUseCase();
        return useCase.execute({ imageId, entryId, userId });
      },
    });
  }

  async getIllustrations(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get illustrations',
      handler: async () => {
        const entryId = req.params.entryId as string;
        const { userId } = extractAuthContext(req);
        const useCase = ServiceFactory.createGetIllustrationsUseCase();
        return useCase.execute({ entryId, userId });
      },
    });
  }

  async reorderIllustrations(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to reorder illustrations',
      handler: async () => {
        const entryId = req.params.entryId as string;
        const { userId } = extractAuthContext(req);
        const { imageIds, illustrationIds } = req.body;
        const useCase = ServiceFactory.createReorderIllustrationsUseCase();
        return useCase.execute({ entryId, userId, imageIds: illustrationIds || imageIds });
      },
    });
  }
}
