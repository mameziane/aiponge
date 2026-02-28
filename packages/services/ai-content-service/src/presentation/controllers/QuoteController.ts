/**
 * Quote Controller - HTTP layer for personalized quote generation
 * Uses controller-helpers wrapper for consistent response patterns
 */

import { Request, Response } from 'express';
import { GenerateQuoteUseCase, GenerateQuoteUseCaseRequest } from '../../application/use-cases/GenerateQuoteUseCase';
import { getLogger } from '../../config/service-urls';
import { createControllerHelpers, extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors } = getResponseHelpers();

const logger = getLogger('ai-content-service-quotecontroller');
const { executeSimple } = createControllerHelpers('ai-content-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class QuoteController {
  constructor(private readonly generateQuoteUseCase: GenerateQuoteUseCase) {}

  async generateQuote(req: Request, res: Response): Promise<void> {
    const { userId: headerUserId } = extractAuthContext(req);
    const userId = headerUserId || req.body.userId;

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    await executeSimple({
      req,
      res,
      errorMessage: 'Failed to generate quote',
      execute: async () => {
        const request: GenerateQuoteUseCaseRequest = {
          userId,
          userEntries: req.body.userEntries,
          emotionalState: req.body.emotionalState,
          userProfile: req.body.userProfile,
          theme: req.body.theme,
          language: (req.query.language as string) || req.body.language,
        };

        logger.info('Quote generation request received', {
          userId,
          hasEntries: !!request.userEntries,
          theme: request.theme,
          language: request.language,
        });

        const result = await this.generateQuoteUseCase.execute(request);

        return {
          success: true,
          data: {
            quote: result.quote,
            requestId: result.requestId,
            ...(result.success ? {} : { fallback: true }),
          },
          metadata: result.metadata,
          timestamp: new Date().toISOString(),
        };
      },
      skipSuccessCheck: true,
    });
  }
}
