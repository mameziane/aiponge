/**
 * Analytics Controller
 * Handles analytics and tracking operations
 */

import { Request, Response } from 'express';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess, sendCreated } from '../utils/response-helpers';
import { createControllerHelpers, serializeError } from '@aiponge/platform-core';
import {
  GenerateUserAnalyticsUseCase,
  GetContentAnalyticsUseCase,
  TrackContentViewUseCase,
} from '@application/use-cases/analytics';
import {
  GeneratePersonalityProfileUseCase,
  GenerateProfileHighlightsUseCase,
  GenerateUserPersonaUseCase,
  GetLatestPersonaUseCase,
} from '@application/use-cases/profile';
import { CalculateUserWellnessScoreUseCase } from '@application/use-cases/insights';

const logger = getLogger('analytics-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class AnalyticsController {
  constructor(
    private readonly generateUserAnalyticsUseCase: GenerateUserAnalyticsUseCase,
    private readonly generatePersonalityProfileUseCase: GeneratePersonalityProfileUseCase,
    private readonly generateProfileHighlightsUseCase: GenerateProfileHighlightsUseCase,
    private readonly generateUserPersonaUseCase: GenerateUserPersonaUseCase,
    private readonly getLatestPersonaUseCase: GetLatestPersonaUseCase,
    private readonly calculateUserWellnessScoreUseCase: CalculateUserWellnessScoreUseCase,
    private readonly getContentAnalyticsUseCase: GetContentAnalyticsUseCase,
    private readonly trackContentViewUseCase: TrackContentViewUseCase
  ) {}

  async generateUserAnalytics(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to generate user analytics',
      successStatus: 201,
      handler: async () => {
        const { userId } = req.params;
        return this.generateUserAnalyticsUseCase.execute({ userId, ...req.body });
      },
    });
  }

  async getPersonalityProfile(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get personality profile',
      handler: async () => {
        const { userId } = req.params;
        return this.generatePersonalityProfileUseCase.execute({
          userId: String(userId),
          analysisDepth: 'detailed',
        });
      },
    });
  }

  async getProfileHighlights(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get profile highlights',
      handler: async () => {
        const { userId } = req.params;
        return this.generateProfileHighlightsUseCase.execute({ userId: String(userId) });
      },
    });
  }

  async getUserPersona(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get user persona',
      handler: async () => {
        const { userId } = req.params;
        return this.generateUserPersonaUseCase.execute({ userId: String(userId) });
      },
    });
  }

  async getLatestPersona(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get latest persona',
      handler: async () => {
        const { userId } = req.params;
        return this.getLatestPersonaUseCase.execute({ userId: String(userId) });
      },
    });
  }

  async refreshPersona(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      logger.info('Refreshing persona for user: {}', { data0: userId });

      const result = await this.generateUserPersonaUseCase.execute({
        userId: String(userId),
        personalizationDepth: 'detailed',
      });

      sendSuccess(res, {
        persona: result.persona,
        generatedAt: result.generatedAt.toISOString(),
      });
    } catch (error) {
      logger.error('Refresh persona error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to refresh persona', req);
      return;
    }
  }

  async getUserWellness(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const result = await this.calculateUserWellnessScoreUseCase.execute({
        userId: String(userId),
        includeTrends: true,
        includeInsights: true,
        includeRecommendations: true,
        compareWithPrevious: true,
        generateAlerts: true,
      });

      // Transform response to match frontend expected format
      const response = {
        userId: result.userId,
        overallScore: result.overallWellnessScore,
        grade: result.wellnessGrade,
        metrics: result.metrics,
        trends: result.trends.map(t => ({
          period: t.date.toISOString(),
          overallScore: t.overallScore,
          dimensionScores: t.dimensionScores,
          significantChanges: t.significantEvents.map(e => e.description),
        })),
        insights: result.insights.map(i => ({
          type: i.type,
          message: i.description,
          priority: i.urgency,
          dimension: i.relatedDimensions[0],
        })),
        summary: {
          strengths: result.summary.strengths,
          areasForGrowth: result.summary.concerns,
          overallNarrative: result.summary.keyFindings.join(' '),
        },
        comparison: result.comparison
          ? {
              previousPeriod: {
                overallScore: result.comparison.previousScore,
                change: result.comparison.change,
              },
              baseline: {
                overallScore: result.comparison.previousScore,
                percentile: 50, // Default percentile
              },
            }
          : undefined,
        alerts: result.alerts.map(a => ({
          type: a.dimension,
          severity: a.level === 'critical' ? 'warning' : a.level,
          message: a.message,
        })),
        confidence: {
          overall: result.confidence.overall,
          dataPoints: result.confidence.dataPoints,
          lastUpdated: result.calculatedAt.toISOString(),
        },
        calculatedAt: result.calculatedAt.toISOString(),
      };

      sendSuccess(res, response);
    } catch (error) {
      logger.error('Get user wellness error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get user wellness score', req);
      return;
    }
  }

  async getContentAnalytics(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get content analytics',
      handler: async () => this.getContentAnalyticsUseCase.execute(req.query),
    });
  }

  async trackContentView(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to track content view',
      successStatus: 201,
      handler: async () => this.trackContentViewUseCase.execute(req.body),
    });
  }
}
