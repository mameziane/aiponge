/**
 * Content Controller - HTTP request handlers for content operations
 * Coordinates between HTTP layer and use cases
 */

import { Request, Response, NextFunction } from 'express';
import { GenerateContentUseCase } from '../../application/use-cases/GenerateContentUseCase';
import { ManageTemplatesUseCase } from '../../application/use-cases/ManageTemplatesUseCase';
import { ContentType } from '../../domains/entities/Content';
import { GenerationParameters, GenerationOptions } from '../../domains/entities/GenerationRequest';
import { ContentRepository } from '../../infrastructure/database/repositories/ContentRepository';
import { getLogger } from '../../config/service-urls';
import { serializeError, getResponseHelpers } from '@aiponge/platform-core';
const { sendSuccess, sendCreated, ServiceErrors } = getResponseHelpers();

const logger = getLogger('ai-content-service-contentcontroller');

export interface ContentGenerationRequest {
  userId: string;
  prompt: string;
  contentType: ContentType;
  parameters?: GenerationParameters;
  options?: GenerationOptions;
}

export interface ContentQueryParams {
  userId?: string;
  contentType?: string;
  status?: string;
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
}

export class ContentController {
  constructor(
    private readonly generateContentUseCase: GenerateContentUseCase,
    private readonly _manageTemplatesUseCase: ManageTemplatesUseCase,
    private readonly contentRepository?: ContentRepository
  ) {}

  async generateContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requestData: ContentGenerationRequest = req.body;

      if (!requestData.userId || !requestData.prompt || !requestData.contentType) {
        ServiceErrors.badRequest(res, 'userId, prompt, and contentType are required', req);
        return;
      }

      const result = await this.generateContentUseCase.execute({
        userId: requestData.userId,
        prompt: requestData.prompt,
        contentType: requestData.contentType,
        parameters: requestData.parameters || {},
        options: requestData.options || {},
      });

      if (result.success) {
        sendCreated(res, {
          content: result.content?.content || '',
          contentType: requestData.contentType,
          templateId: requestData.options?.templateId,
          metadata: {
            requestId: result.requestId,
            wordCount: result.processingMetadata?.wordCount,
            generationTime: result.processingMetadata?.generationTime,
            qualityScore: result.quality?.metrics?.overall,
          },
        });
      } else {
        const errorMessage =
          typeof result.error === 'string' ? result.error : result.error?.message || 'Content generation failed';
        ServiceErrors.badRequest(res, errorMessage, req, {
          type: 'ContentGenerationError',
          code: 'CONTENT_GENERATION_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in generateContent:', { error: serializeError(error) });
      next(error);
    }
  }

  async getContentById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const includeMetadata = req.query.includeMetadata === 'true';

      if (!this.contentRepository) {
        ServiceErrors.serviceUnavailable(res, 'Content repository not available', req);
        return;
      }

      const content = await this.contentRepository.getContent(id);

      if (!content) {
        ServiceErrors.notFound(res, `Content with ID ${id}`, req);
        return;
      }

      const response: Record<string, unknown> = {
        id: content.id,
        requestId: content.requestId,
        content: content.content,
        contentType: content.contentType,
        status: content.status,
        isApproved: content.isApproved,
        isPublished: content.isPublished,
        version: content.version,
        createdAt: content.createdAt,
        updatedAt: content.updatedAt,
      };

      if (includeMetadata) {
        response.metadata = content.metadata;
        response.analysis = content.analysis;
        response.formattedContent = content.formattedContent;
      }

      sendSuccess(res, response);
    } catch (error) {
      logger.error('Error in getContentById:', { error: serializeError(error) });
      next(error);
    }
  }

  async getContentList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query: ContentQueryParams = req.query;

      if (!this.contentRepository) {
        ServiceErrors.serviceUnavailable(res, 'Content repository not available', req);
        return;
      }

      let contents;

      if (query.userId) {
        contents = await this.contentRepository.findContentByUser(query.userId, query.limit || 50, query.offset || 0);
      } else if (query.contentType) {
        contents = await this.contentRepository.findContentByType(
          query.contentType,
          query.limit || 50,
          query.offset || 0
        );
      } else {
        contents = await this.contentRepository.findContentByUser('', query.limit || 50, query.offset || 0);
      }

      const response = contents.map((content: Record<string, unknown>) => ({
        id: content.id,
        requestId: content.requestId,
        contentType: content.contentType,
        status: content.status,
        isApproved: content.isApproved,
        isPublished: content.isPublished,
        version: content.version,
        createdAt: content.createdAt,
        updatedAt: content.updatedAt,
        ...(query.includeMetadata && {
          metadata: content.metadata,
          analysis: content.analysis,
        }),
      }));

      sendSuccess(res, {
        contents: response,
        total: response.length,
        offset: query.offset || 0,
        limit: query.limit || 50,
      });
    } catch (error) {
      logger.error('Error in getContentList:', { error: serializeError(error) });
      next(error);
    }
  }

  async updateContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updates = req.body;

      if (!this.contentRepository) {
        ServiceErrors.serviceUnavailable(res, 'Content repository not available', req);
        return;
      }

      const existingContent = await this.contentRepository.getContent(id);
      if (!existingContent) {
        ServiceErrors.notFound(res, `Content with ID ${id}`, req);
        return;
      }

      await this.contentRepository.updateContent(id, updates);

      sendSuccess(res, {
        message: 'Content updated successfully',
        contentId: id,
      });
    } catch (error) {
      logger.error('Error in updateContent:', { error: serializeError(error) });
      next(error);
    }
  }

  async deleteContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!this.contentRepository) {
        ServiceErrors.serviceUnavailable(res, 'Content repository not available', req);
        return;
      }

      const success = await this.contentRepository.deleteContent(id);

      if (!success) {
        ServiceErrors.notFound(res, `Content with ID ${id}`, req);
        return;
      }

      sendSuccess(res, {
        message: 'Content deleted successfully',
        contentId: id,
      });
    } catch (error) {
      logger.error('Error in deleteContent:', { error: serializeError(error) });
      next(error);
    }
  }

  async getContentStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { timeframe } = req.query as { timeframe?: 'day' | 'week' | 'month' };

      if (!this.contentRepository) {
        ServiceErrors.serviceUnavailable(res, 'Content repository not available', req);
        return;
      }

      const [contentStats, requestStats] = await Promise.all([
        this.contentRepository.getContentStats(timeframe),
        this.contentRepository.getRequestStats(timeframe),
      ]);

      sendSuccess(res, {
        contentStats,
        requestStats,
        timeframe: timeframe || 'all',
      });
    } catch (error) {
      logger.error('Error in getContentStats:', { error: serializeError(error) });
      next(error);
    }
  }

  async searchContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, contentType, status, isPublished, limit, offset } = req.query;

      if (!q || typeof q !== 'string') {
        ServiceErrors.badRequest(res, 'Search query (q) is required', req);
        return;
      }

      if (!this.contentRepository) {
        ServiceErrors.serviceUnavailable(res, 'Content repository not available', req);
        return;
      }

      const filters = {
        contentType: contentType as string,
        status: status as string,
        isPublished: isPublished === 'true' ? true : isPublished === 'false' ? false : undefined,
      };

      const results = await this.contentRepository.searchContent(q, filters);

      sendSuccess(res, {
        results: results.slice(
          parseInt(offset as string) || 0,
          (parseInt(offset as string) || 0) + (parseInt(limit as string) || 50)
        ),
        total: results.length,
        query: q,
        filters,
      });
    } catch (error) {
      logger.error('Error in searchContent:', { error: serializeError(error) });
      next(error);
    }
  }

  async submitFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        resultId,
        userId,
        overallRating,
        qualityRating,
        relevanceRating,
        creativityRating,
        usefulnessRating,
        feedback,
        improvements,
      } = req.body;

      if (!resultId || !userId || !overallRating) {
        ServiceErrors.badRequest(res, 'resultId, userId, and overallRating are required', req);
        return;
      }

      if (overallRating < 1 || overallRating > 5) {
        ServiceErrors.badRequest(res, 'overallRating must be between 1 and 5', req);
        return;
      }

      if (!this.contentRepository) {
        ServiceErrors.serviceUnavailable(res, 'Content repository not available', req);
        return;
      }

      const feedbackData = await this.contentRepository.createFeedback({
        resultId,
        userId,
        overallRating,
        qualityRating: qualityRating || null,
        relevanceRating: relevanceRating || null,
        creativityRating: creativityRating || null,
        usefulnessRating: usefulnessRating || null,
        feedback: feedback || null,
        improvements: improvements || [],
        metadata: {
          feedbackType: 'manual',
          source: 'api',
        },
      });

      logger.info('Content feedback submitted', { resultId, userId, overallRating });

      sendCreated(res, feedbackData);
    } catch (error) {
      logger.error('Error in submitFeedback:', { error: serializeError(error) });
      next(error);
    }
  }
}
