/**
 * Reflection Controller - HTTP request handlers for reflection generation operations
 * Coordinates between HTTP layer and GenerateReflectionUseCase
 */

import { Request, Response, NextFunction } from 'express';
import { GenerateReflectionUseCase } from '../../application/use-cases/GenerateReflectionUseCase';
// Define local interfaces for reflection generation
interface ReflectionGenerationRequest {
  entryContent: string;
  userId?: string;
  reflectionType?: 'follow-up-questions' | 'deeper-challenges' | 'insights';
  originalQuestion: string;
  userResponse: string;
  depth: 'basic' | 'comprehensive' | 'advanced';
  context: Record<string, unknown>;
}

interface ReflectionGenerationResponse {
  success: boolean;
  reflection?: string;
  guidingQuestions?: string[];
  error?: string;
  metadata?: Record<string, unknown>;
}
import { getLogger } from '../../config/service-urls';
import { serializeError, createControllerHelpers, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors, sendSuccess } = getResponseHelpers();

const logger = getLogger('ai-content-service-reflectioncontroller');

const { handleRequest } = createControllerHelpers('ai-content-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class ReflectionController {
  constructor(private readonly generateReflectionUseCase: GenerateReflectionUseCase) {}

  /**
   * Generate reflection questions and insights
   * POST /api/ai/reflection/generate
   */
  async generateReflection(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const requestData: ReflectionGenerationRequest = req.body;

      // Validate required fields
      if (
        !requestData.originalQuestion ||
        !requestData.userResponse ||
        !requestData.reflectionType ||
        !requestData.depth
      ) {
        ServiceErrors.badRequest(res, 'originalQuestion, userResponse, reflectionType, and depth are required', req);
        return;
      }

      // Validate reflection type
      if (!['follow-up-questions', 'deeper-challenges', 'insights'].includes(requestData.reflectionType)) {
        ServiceErrors.badRequest(
          res,
          'Invalid reflectionType. Must be: follow-up-questions, deeper-challenges, or insights',
          req
        );
        return;
      }

      // Validate depth
      if (!['basic', 'comprehensive', 'advanced'].includes(requestData.depth)) {
        ServiceErrors.badRequest(res, 'Invalid depth. Must be: basic, comprehensive, or advanced', req);
        return;
      }

      // Validate context
      if (!requestData.context) {
        ServiceErrors.badRequest(res, 'Context object is required', req);
        return;
      }

      // Execute use case
      const result = await this.generateReflectionUseCase.execute({
        originalQuestion: requestData.originalQuestion,
        userResponse: requestData.userResponse,
        reflectionType: requestData.reflectionType,
        depth: requestData.depth,
        context: requestData.context,
      });

      if (result.success) {
        sendSuccess(res, {
          reflections: result.reflections,
          metadata: result.metadata,
        });
      } else {
        ServiceErrors.internal(res, result.error || 'Reflection generation failed', undefined, req);
      }
    } catch (error) {
      logger.error('Error in generateReflection:', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to generate reflection', req);
      return;
    }
  }

  /**
   * Health check endpoint specifically for reflection generation functionality
   * GET /api/ai/reflection/health
   */
  async healthCheck(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      // Test with a simple reflection generation
      const testResult = await this.generateReflectionUseCase.execute({
        originalQuestion: 'How are you feeling today?',
        userResponse: 'I am feeling good and optimistic about my progress.',
        reflectionType: 'follow-up-questions',
        depth: 'basic',
        context: {},
      });

      if (testResult.success) {
        res.status(200).json({
          status: 'healthy',
          service: 'reflection-generation',
          timestamp: new Date().toISOString(),
          testReflection: {
            success: true,
            processingTime: testResult.metadata.processingTimeMs,
            confidenceLevel: testResult.metadata.confidenceLevel,
            questionsGenerated: testResult.reflections.questions?.length || 0,
          },
        });
      } else {
        res.status(503).json({
          status: 'degraded',
          service: 'reflection-generation',
          timestamp: new Date().toISOString(),
          testReflection: {
            success: false,
            error: testResult.error,
          },
        });
      }
    } catch (error) {
      logger.error('Health check failed:', { error: serializeError(error) });

      res.status(503).json({
        status: 'unhealthy',
        service: 'reflection-generation',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get available reflection types and depths
   * GET /api/ai/reflection/types
   */
  async getReflectionTypes(req: Request, res: Response, _next: NextFunction): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get reflection types',
      handler: async () => ({
        reflectionTypes: [
          {
            type: 'follow-up-questions',
            description: 'Generate follow-up questions for deeper exploration',
            outputFields: ['questions'],
          },
          {
            type: 'deeper-challenges',
            description: 'Generate gentle challenges to push deeper thinking',
            outputFields: ['challenges'],
          },
          {
            type: 'insights',
            description: 'Generate insights and provide a reflection framework',
            outputFields: ['insights', 'framework'],
          },
        ],
        depths: [
          {
            level: 'basic',
            description: 'Basic reflection with 2-3 items',
            itemCount: '2-3',
          },
          {
            level: 'comprehensive',
            description: 'Moderate reflection with 3-4 items',
            itemCount: '3-4',
          },
          {
            level: 'advanced',
            description: 'Deep reflection with 4-6 items',
            itemCount: '4-6',
          },
        ],
      }),
    });
  }

  /**
   * Generate reflection for multiple user responses
   * POST /api/ai/reflection/generate/batch
   */
  async generateBatchReflections(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const { requests } = req.body;

    if (!Array.isArray(requests) || requests.length === 0) {
      ServiceErrors.badRequest(res, 'Requests array is required and cannot be empty', req);
      return;
    }

    if (requests.length > 5) {
      ServiceErrors.badRequest(res, 'Maximum 5 requests allowed per batch for reflection generation', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to generate batch reflections',
      handler: async () => {
        const results = await Promise.allSettled(
          requests.map((request: ReflectionGenerationRequest) =>
            this.generateReflectionUseCase.execute({
              originalQuestion: request.originalQuestion,
              userResponse: request.userResponse,
              reflectionType: request.reflectionType || 'follow-up-questions',
              depth: request.depth,
              context: request.context,
            })
          )
        );

        const responses = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            const value = result.value;
            return {
              index,
              success: value.success,
              reflections: value.reflections,
              metadata: value.metadata,
              error: value.error,
            } as ReflectionGenerationResponse & { index: number };
          } else {
            return {
              index,
              success: false,
              reflections: {},
              metadata: {
                processingTimeMs: 0,
                confidenceLevel: 0,
                recommendedNextSteps: ['Request failed - please try again'],
              },
              error: result.reason?.message || 'Unknown error',
            } as ReflectionGenerationResponse & { index: number };
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

  /**
   * Get reflection suggestions based on context
   * POST /api/ai/reflection/suggest
   */
  async suggestReflectionType(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const { originalQuestion, userResponse } = req.body;

    if (!originalQuestion || !userResponse) {
      ServiceErrors.badRequest(res, 'originalQuestion and userResponse are required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to suggest reflection type',
      handler: async () => {
        let suggestedType: 'follow-up-questions' | 'deeper-challenges' | 'insights' = 'follow-up-questions';
        let suggestedDepth: 'basic' | 'comprehensive' | 'advanced' = 'basic';

        const responseLength = userResponse.length;
        const questionWords = originalQuestion.toLowerCase().split(' ');
        const responseWords = userResponse.toLowerCase().split(' ');

        if (responseLength > 500) suggestedDepth = 'comprehensive';
        if (responseLength > 1000) suggestedDepth = 'advanced';

        if (questionWords.some((word: string) => ['why', 'how', 'what', 'explain'].includes(word))) {
          if (responseWords.some((word: string) => ['think', 'believe', 'feel', 'assume'].includes(word))) {
            suggestedType = 'deeper-challenges';
          }
        }

        if (responseWords.some((word: string) => ['pattern', 'realize', 'understand', 'insight'].includes(word))) {
          suggestedType = 'insights';
        }

        return {
          suggestions: {
            recommendedType: suggestedType,
            recommendedDepth: suggestedDepth,
            reasoning: this.getRecommendationReasoning(suggestedType, suggestedDepth, responseLength),
            alternatives: this.getAlternativeSuggestions(suggestedType, suggestedDepth),
          },
          analysis: {
            responseLength,
            estimatedComplexity: suggestedDepth,
          },
        };
      },
    });
  }

  // ===== PRIVATE HELPER METHODS =====

  private getRecommendationReasoning(type: string, depth: string, responseLength: number): string {
    const reasons = [];

    if (responseLength > 500) {
      reasons.push('detailed response suggests readiness for deeper reflection');
    }

    if (type === 'deeper-challenges') {
      reasons.push('response contains assumptions worth questioning');
    } else if (type === 'insights') {
      reasons.push('response shows reflective thinking suitable for insights');
    } else {
      reasons.push('follow-up questions will help explore the topic further');
    }

    return reasons.join('; ');
  }

  private getAlternativeSuggestions(primaryType: string, primaryDepth: string) {
    const types = ['follow-up-questions', 'deeper-challenges', 'insights'];
    const depths = ['basic', 'comprehensive', 'advanced'];

    return {
      types: types.filter(t => t !== primaryType),
      depths: depths.filter(d => d !== primaryDepth),
    };
  }
}
