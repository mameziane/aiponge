/**
 * Pattern Controller
 * Handles HTTP requests for pattern recognition and analysis
 */

import { Response } from 'express';
import { AuthenticatedRequest, createControllerHelpers } from '@aiponge/platform-core';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess } from '../utils/response-helpers';
import { InsightsError } from '../../application/errors';
import { PatternRecognitionService } from '@domains/profile';
import { PatternRepository } from '@infrastructure/repositories';
import { createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { ServiceFactory } from '@infrastructure/composition/ServiceFactory';

const logger = getLogger('pattern-controller');

const { handleRequest } = createControllerHelpers('user-service', (res, error, message, req) =>
  ServiceErrors.fromException(res, error, message, req)
);

export class PatternController {
  private patternRepository: PatternRepository;
  private patternRecognitionService: PatternRecognitionService;

  constructor() {
    this.patternRepository = createDrizzleRepository(PatternRepository);
    this.patternRecognitionService = new PatternRecognitionService(this.patternRepository);
  }

  async analyzePatterns(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.params.userId || req.user?.id;

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to analyze patterns',
      handler: async () => {
        logger.info('Analyzing patterns for user', { userId });
        const patterns = await this.patternRecognitionService.analyzeUserPatterns(userId as string);

        return {
          userId,
          patterns,
          analyzedAt: new Date().toISOString(),
          patternCount: patterns.length,
        };
      },
    });
  }

  async getUserPatterns(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.params.userId || req.user?.id;
    const activeOnly = req.query.activeOnly !== 'false';

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get user patterns',
      handler: async () => {
        const patterns = await this.patternRepository.getUserPatterns(userId as string, activeOnly);

        return {
          userId,
          patterns,
          count: patterns.length,
        };
      },
    });
  }

  async getPatternsByType(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.params.userId || req.user?.id;
    const patternType = req.params.patternType as string;

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    if (!patternType) {
      ServiceErrors.badRequest(res, 'Pattern type is required', req);
      return;
    }

    const validTypes = ['emotional', 'temporal', 'thematic', 'behavioral'];
    if (!validTypes.includes(patternType)) {
      ServiceErrors.badRequest(res, `Invalid pattern type. Must be one of: ${validTypes.join(', ')}`, req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get patterns by type',
      handler: async () => {
        const patterns = await this.patternRepository.getPatternsByType(userId as string, patternType);

        return {
          userId,
          patternType,
          patterns,
          count: patterns.length,
        };
      },
    });
  }

  async getThemeFrequencies(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.params.userId || req.user?.id;

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get theme frequencies',
      handler: async () => {
        const themes = await this.patternRepository.getThemeFrequencies(userId as string);

        return {
          userId,
          themes,
          count: themes.length,
          topThemes: themes.slice(0, 10).map(t => ({
            theme: t.theme,
            count: t.count,
            firstSeen: t.firstSeen,
            lastSeen: t.lastSeen,
          })),
        };
      },
    });
  }

  async getPatternInsights(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.params.userId || req.user?.id;

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get pattern insights',
      handler: async () => {
        const [patterns, themes] = await Promise.all([
          this.patternRepository.getUserPatterns(userId as string, true),
          this.patternRepository.getThemeFrequencies(userId as string),
        ]);

        const emotionalPatterns = patterns.filter(p => p.patternType === 'emotional');
        const temporalPatterns = patterns.filter(p => p.patternType === 'temporal');
        const thematicPatterns = patterns.filter(p => p.patternType === 'thematic');

        const insights = {
          summary: {
            totalPatterns: patterns.length,
            emotionalPatternCount: emotionalPatterns.length,
            temporalPatternCount: temporalPatterns.length,
            thematicPatternCount: thematicPatterns.length,
            totalThemesTracked: themes.length,
          },
          emotional: {
            dominantMoods: emotionalPatterns.slice(0, 3).map(p => ({
              mood: p.patternName.replace('Recurring ', '').replace(' mood', ''),
              strength: p.strength,
              trend: p.trend,
              description: p.description,
            })),
          },
          temporal: {
            peakTimes: temporalPatterns.map(p => ({
              time: p.patternName.replace(' reflection pattern', ''),
              frequency: p.frequency,
              description: p.description,
            })),
          },
          thematic: {
            focusAreas: thematicPatterns.slice(0, 5).map(p => ({
              theme: p.patternName.replace(' focus', ''),
              strength: p.strength,
              relatedThemes: p.relatedThemes,
              description: p.description,
            })),
          },
          themes: {
            topThemes: themes.slice(0, 15).map(t => ({
              theme: t.theme,
              frequency: t.count,
            })),
          },
        };

        return {
          userId,
          insights,
          generatedAt: new Date().toISOString(),
        };
      },
    });
  }

  async reactToPattern(req: AuthenticatedRequest, res: Response): Promise<void> {
    const patternId = req.params.patternId as string;
    const userId = req.params.userId || req.user?.id;

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to react to pattern',
      successStatus: 201,
      handler: async () => {
        const { reaction, explanation } = req.body;
        const useCase = ServiceFactory.createExplorePatternUseCase();
        return useCase.execute({ patternId, userId: userId as string, reaction, explanation });
      },
    });
  }

  async getPatternEvidence(req: AuthenticatedRequest, res: Response): Promise<void> {
    const patternId = req.params.patternId as string;
    const userId = req.params.userId || req.user?.id;

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get pattern evidence',
      handler: async () => {
        const repository = ServiceFactory.createIntelligenceRepository();
        const pattern = await repository.getPatternById(patternId, userId as string);
        if (!pattern) {
          throw InsightsError.insightNotFound(patternId);
        }
        const reactions = await repository.findPatternReactionsByPatternId(patternId, userId as string);
        const evidenceEntries =
          pattern.evidenceEntryIds && pattern.evidenceEntryIds.length > 0
            ? await repository.findEntriesByIds(pattern.evidenceEntryIds, userId as string)
            : [];
        return {
          pattern,
          reactions,
          evidenceEntries,
          explorationPrompt: pattern.explorationPrompt,
        };
      },
    });
  }

  async runBatchAnalysis(req: AuthenticatedRequest, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to run batch analysis',
      handler: async () => {
        logger.info('Starting batch pattern analysis');
        const result = await this.patternRecognitionService.runBatchAnalysis();

        return {
          usersAnalyzed: result.usersAnalyzed,
          patternsFound: result.patternsFound,
          completedAt: new Date().toISOString(),
        };
      },
    });
  }
}
