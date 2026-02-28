/**
 * Image Controller - HTTP layer for centralized image generation
 * Supports album artwork, track artwork, playlist artwork, and book cover artwork
 * Uses controller-helpers wrapper for consistent response patterns
 */

import { Request, Response } from 'express';
import { GenerateImageUseCase, GenerateImageRequest } from '../../application/use-cases/GenerateImageUseCase';
import { getLogger } from '../../config/service-urls';
import { createControllerHelpers, extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors } = getResponseHelpers();
import { type ImageType, VALID_IMAGE_TYPES, isValidImageType, CONTENT_VISIBILITY } from '@aiponge/shared-contracts';

const logger = getLogger('ai-content-service-imagecontroller');
const { executeSimple } = createControllerHelpers('ai-content-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class ImageController {
  constructor(private readonly generateImageUseCase: GenerateImageUseCase) {}

  async generateImage(req: Request, res: Response): Promise<void> {
    const { userId: headerUserId } = extractAuthContext(req);
    const userId = headerUserId || req.body.userId;
    const imageType = req.body.imageType as ImageType;

    if (!imageType || !isValidImageType(imageType)) {
      ServiceErrors.badRequest(
        res,
        `Invalid or missing imageType. Must be one of: ${VALID_IMAGE_TYPES.join(', ')}`,
        req
      );
      return;
    }

    if (!req.body.variables || typeof req.body.variables !== 'object') {
      ServiceErrors.badRequest(res, 'variables object is required', req);
      return;
    }

    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to generate image',
      execute: async () => {
        const request: GenerateImageRequest = {
          imageType,
          variables: req.body.variables,
          userId,
          visibility: req.body.visibility ?? CONTENT_VISIBILITY.PERSONAL,
          destinationPath: req.body.destinationPath,
        };

        logger.info('Image generation request received', {
          imageType,
          userId,
          visibility: request.visibility,
          variableKeys: Object.keys(request.variables),
        });

        const result = await this.generateImageUseCase.execute(request);

        if (!result.success) {
          return {
            success: false,
            error: result.error,
            processingTimeMs: result.processingTimeMs,
            timestamp: new Date().toISOString(),
          };
        }

        return {
          success: true,
          data: {
            artworkUrl: result.artworkUrl,
            revisedPrompt: result.revisedPrompt,
            templateUsed: result.templateUsed,
          },
          metadata: {
            processingTimeMs: result.processingTimeMs,
            imageType,
          },
          timestamp: new Date().toISOString(),
        };
      },
      skipSuccessCheck: true,
    });
  }

  async healthCheck(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'healthy',
      service: 'ai-content-service-image',
      supportedTypes: VALID_IMAGE_TYPES,
      timestamp: new Date().toISOString(),
    });
  }
}
