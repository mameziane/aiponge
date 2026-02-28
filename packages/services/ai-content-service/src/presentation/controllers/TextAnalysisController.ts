/**
 * Text Analysis Controller - HTTP request handlers for text analysis operations
 * Coordinates between HTTP layer and AnalyzeTextUseCase
 */

import { Request, Response, NextFunction } from 'express';
import { getCorrelationId } from '@aiponge/shared-contracts';
import { AnalyzeTextUseCase } from '../../application/use-cases/AnalyzeTextUseCase';
// Import types from existing contracts
interface TextAnalysisRequest {
  content: string;
  analysisType: 'basic' | 'comprehensive' | 'sentiment' | 'themes';
  context?: string;
}

interface TextAnalysisResponse {
  success: boolean;
  analysis?: Record<string, unknown>;
  correlationId: string;
  metadata?: Record<string, unknown>;
  error?: string;
}
import { getLogger } from '../../config/service-urls';
import { serializeError, createControllerHelpers, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors, sendSuccess } = getResponseHelpers();

// Enhanced request interface with correlation ID
interface RequestWithCorrelationId extends Request {
  correlationId?: string;
}

const logger = getLogger('ai-content-service-textanalysiscontroller');

const { handleRequest } = createControllerHelpers('ai-content-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class TextAnalysisController {
  constructor(private readonly analyzeTextUseCase: AnalyzeTextUseCase) {}

  /**
   * Analyze text content using AI models with correlation ID tracking
   * POST /api/ai/text/analyze
   */
  async analyzeText(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const startTime = Date.now();
    const correlationId = getCorrelationId(req) || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Set correlation ID in response header
    res.setHeader('x-correlation-id', correlationId);

    try {
      const requestData: TextAnalysisRequest = req.body;

      logger.info('🧠 Text analysis request', {
        correlationId,
        userId: req.headers['user-id'] || 'anonymous',
        analysisType: requestData.analysisType,
        contentLength: requestData.content?.length,
      });

      // Validate required fields
      if (!requestData.content || !requestData.analysisType) {
        const duration = Date.now() - startTime;
        logger.warn('❌ Text analysis validation failed', {
          correlationId,
          duration,
          error: 'Content and analysisType are required',
        });

        ServiceErrors.badRequest(res, 'Content and analysisType are required', req);
        return;
      }

      // Validate analysis type
      if (!['basic', 'comprehensive', 'sentiment', 'themes'].includes(requestData.analysisType)) {
        const duration = Date.now() - startTime;
        logger.warn('❌ Invalid analysis type', {
          correlationId,
          duration,
          analysisType: requestData.analysisType,
        });

        ServiceErrors.badRequest(res, 'Invalid analysisType. Must be: basic, comprehensive, sentiment, or themes', req);
        return;
      }

      // Execute use case
      const result = await this.analyzeTextUseCase.execute({
        content: requestData.content,
        analysisType: requestData.analysisType,
        context: requestData.context
          ? {
              userId: req.headers['user-id'] as string,
              domainContext: requestData.context,
            }
          : undefined,
      });

      const duration = Date.now() - startTime;

      if (result.success) {
        logger.info('✅ Text analysis completed', {
          correlationId,
          duration,
          analysisType: requestData.analysisType,
          modelUsed: result.metadata?.modelUsed || 'unknown',
        });

        sendSuccess(res, {
          analysis: result.analysis,
          correlationId,
          metadata: {
            ...result.metadata,
            processingTimeMs: duration,
          },
        });
      } else {
        logger.error('❌ Text analysis failed', {
          correlationId,
          duration,
          error: result.error || 'Analysis failed',
        });

        ServiceErrors.internal(res, result.error || 'Text analysis failed', undefined, req);
      }
    } catch (error) {
      logger.error('Error in analyzeText:', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to analyze text', req);
      return;
    }
  }

  /**
   * Health check endpoint specifically for text analysis functionality
   * GET /api/ai/text/health
   */
  async healthCheck(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      // Test with a simple analysis
      const testResult = await this.analyzeTextUseCase.execute({
        content: 'This is a test message for health check.',
        analysisType: 'basic',
        context: {
          userId: 'health-check',
        },
      });

      if (testResult.success) {
        res.status(200).json({
          status: 'healthy',
          service: 'text-analysis',
          timestamp: new Date().toISOString(),
          testAnalysis: {
            success: true,
            processingTime: testResult.metadata.processingTimeMs,
          },
        });
      } else {
        res.status(503).json({
          status: 'degraded',
          service: 'text-analysis',
          timestamp: new Date().toISOString(),
          testAnalysis: {
            success: false,
            error: testResult.error,
          },
        });
      }
    } catch (error) {
      logger.error('Health check failed:', { error: serializeError(error) });

      res.status(503).json({
        status: 'unhealthy',
        service: 'text-analysis',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get available analysis types
   * GET /api/ai/text/types
   */
  async getAnalysisTypes(req: Request, res: Response, _next: NextFunction): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get analysis types',
      handler: async () => ({
        analysisTypes: [
          {
            type: 'basic',
            description: 'Basic sentiment and complexity analysis',
            features: ['sentiment', 'complexity'],
          },
          {
            type: 'comprehensive',
            description: 'Full analysis including sentiment, themes, topics, and complexity',
            features: ['sentiment', 'themes', 'topics', 'complexity'],
          },
          {
            type: 'sentiment',
            description: 'Detailed sentiment analysis with emotional breakdown',
            features: ['sentiment', 'emotional_details'],
          },
          {
            type: 'themes',
            description: 'Theme extraction and categorization',
            features: ['themes'],
          },
        ],
      }),
    });
  }

  /**
   * Batch analyze multiple texts
   * POST /api/ai/text/analyze/batch
   */
  async analyzeBatch(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const { requests } = req.body;

    if (!Array.isArray(requests) || requests.length === 0) {
      ServiceErrors.badRequest(res, 'Requests array is required and cannot be empty', req);
      return;
    }

    if (requests.length > 10) {
      ServiceErrors.badRequest(res, 'Maximum 10 requests allowed per batch', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to analyze batch',
      handler: async () => {
        const results = await Promise.allSettled(
          requests.map((request: TextAnalysisRequest) =>
            this.analyzeTextUseCase.execute({
              content: request.content,
              analysisType: request.analysisType,
              context: request.context
                ? {
                    userId: req.headers['user-id'] as string,
                    domainContext: request.context,
                  }
                : undefined,
            })
          )
        );

        const responses = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            const value = result.value;
            return {
              index,
              success: value.success,
              analysis: value.analysis,
              metadata: value.metadata,
              error: value.error,
            } as unknown as TextAnalysisResponse & { index: number };
          } else {
            return {
              index,
              success: false,
              analysis: {},
              metadata: {
                processingTimeMs: 0,
                modelUsed: 'error',
                analysisDepth: 'none',
              },
              error: result.reason?.message || 'Unknown error',
            } as unknown as TextAnalysisResponse & { index: number };
          }
        });

        return {
          results: responses,
          totalRequests: requests.length,
          successfulRequests: responses.filter(r => r.success).length,
        };
      },
    });
  }
}
