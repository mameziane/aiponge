/**
 * MusicAnalyticsController - HTTP controller for music analytics operations
 * Handles RESTful endpoints for analytics, metrics, and insights
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import type { IAnalyticsServiceClient } from '../../domains/music-catalog/ports/IAnalyticsServiceClient';
import { getLogger } from '../../config/service-urls';
import { serializeError, createControllerHelpers, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors, sendSuccess } = getResponseHelpers();

// Request validation schemas

const logger = getLogger('music-service-musicanalyticscontroller');

const { handleRequest } = createControllerHelpers('music-service', (res, error, msg, req) =>
  ServiceErrors.fromException(res, error, msg, req)
);

const analyticsQuerySchema = z.object({
  userId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  period: z.enum(['hour', 'day', 'week', 'month', 'year']).optional(),
  limit: z.number().min(1).max(1000).optional(),
});

const trackEventSchema = z.object({
  eventType: z.enum(['play', 'download', 'like', 'share', 'skip', 'favorite']),
  musicResultId: z.string().min(1),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  deviceType: z.enum(['mobile', 'desktop', 'tablet']).optional(),
  location: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export class MusicAnalyticsController {
  constructor(private readonly analyticsClient: IAnalyticsServiceClient) {}

  /**
   * Get music analytics overview
   * GET /api/music/analytics/overview
   */
  async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const queryParams = analyticsQuerySchema.parse(req.query);

      logger.info('Getting analytics overview');

      // Get system analytics from analytics service
      const systemAnalytics = await this.analyticsClient.getSystemAnalytics();

      // Get music-specific metrics
      const dateRange =
        queryParams.startDate && queryParams.endDate
          ? {
              startDate: new Date(queryParams.startDate),
              endDate: new Date(queryParams.endDate),
            }
          : undefined;

      const musicMetricsResponse = await this.analyticsClient.getMusicAnalytics({
        userId: queryParams.userId,
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate,
      });

      if (!musicMetricsResponse.success || !musicMetricsResponse.analytics) {
        ServiceErrors.internal(res, musicMetricsResponse.error || 'Failed to get music analytics', undefined, req);
        return;
      }

      const musicMetrics = musicMetricsResponse.analytics;

      sendSuccess(res, {
        overview: {
          totalGenerations: musicMetrics.totalGenerations,
          successfulGenerations: musicMetrics.successfulGenerations,
          successRate:
            musicMetrics.totalGenerations > 0
              ? (musicMetrics.successfulGenerations / musicMetrics.totalGenerations) * 100
              : 0,
          totalDuration: musicMetrics.totalDuration,
          averageQuality: musicMetrics.averageQuality,
          totalCost: musicMetrics.totalCost,
        },
        usage: {
          mostUsedStyles: musicMetrics.mostUsedStyles,
          mostUsedGenres: musicMetrics.mostUsedGenres,
          mostUsedMoods: musicMetrics.mostUsedMoods,
          qualityDistribution: musicMetrics.qualityDistribution,
          musicTypeDistribution: musicMetrics.musicTypeDistribution,
        },
        performance: {
          averageProcessingTime: musicMetrics.averageProcessingTime,
          providerUsage: musicMetrics.providerUsage,
          systemLoad: systemAnalytics.analytics?.systemMetrics?.systemLoad ?? 0,
          averageLatency: systemAnalytics.analytics?.performanceMetrics?.averageLatency ?? 0,
        },
        activity: musicMetrics.userActivity,
        dateRange:
          queryParams.startDate && queryParams.endDate
            ? {
                startDate: queryParams.startDate,
                endDate: queryParams.endDate,
              }
            : null,
      });
    } catch (error) {
      logger.error('Get overview error:', { error: serializeError(error) });

      if (error instanceof z.ZodError) {
        ServiceErrors.badRequest(res, 'Invalid query parameters', req, {
          fields: error.errors,
        });
      } else {
        logger.error('Get overview error', { error: serializeError(error) });
        ServiceErrors.fromException(res, error, 'Internal server error', req);
        return;
      }
    }
  }

  /**
   * Track music event
   * POST /api/music/analytics/track
   */
  async trackEvent(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = trackEventSchema.parse(req.body);

      logger.info('Tracking event: {} for music {}', {
        data0: validatedData.eventType,
        data1: validatedData.musicResultId,
      });

      await this.analyticsClient.recordEvent({
        eventType: validatedData.eventType,
        eventData: {
          musicResultId: validatedData.musicResultId,
        },
        userId: validatedData.userId,
        sessionId: validatedData.sessionId,
        deviceType: validatedData.deviceType,
        location: validatedData.location,
        metadata: validatedData.metadata,
      });

      sendSuccess(res, {
        eventType: validatedData.eventType,
        musicResultId: validatedData.musicResultId,
        trackedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Track event error:', { error: serializeError(error) });

      if (error instanceof z.ZodError) {
        ServiceErrors.badRequest(res, 'Invalid event data', req, {
          fields: error.errors,
        });
      } else {
        logger.error('Track event error', { error: serializeError(error) });
        ServiceErrors.fromException(res, error, 'Internal server error', req);
        return;
      }
    }
  }

  /**
   * Get system statistics (admin only)
   * GET /api/music/stats
   */
  async getSystemStats(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get system stats',
      handler: async () => {
        logger.info('Getting system stats');

        const systemAnalytics = await this.analyticsClient.getSystemAnalytics();

        return {
          systemMetrics: systemAnalytics.analytics?.systemMetrics ?? {},
          performanceMetrics: systemAnalytics.analytics?.performanceMetrics ?? {},
          timestamp: new Date().toISOString(),
        };
      },
    });
  }

  /**
   * Get popular music items
   * GET /api/music/analytics/popular
   */
  async getPopularMusic(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get popular music',
      handler: async () => {
        const querySchema = z.object({
          timeframe: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
          limit: z.number().min(1).max(100).optional(),
          musicType: z.string().optional(),
          style: z.string().optional(),
        });

        const { timeframe, limit, musicType, style } = querySchema.parse(req.query);

        logger.info('Getting popular music items');

        const validTimeframe = (timeframe === 'yearly' ? 'monthly' : timeframe) as
          | 'daily'
          | 'weekly'
          | 'monthly'
          | undefined;

        const popularMusicResponse = await this.analyticsClient.getPopularMusic({
          timeframe: validTimeframe || 'weekly',
          limit: limit || 20,
          musicType,
          style,
        });

        const popularMusic = popularMusicResponse.popularMusic || [];

        return {
          timeframe: timeframe || 'weekly',
          popularMusic: popularMusic.map(item => ({
            musicResultId: item.musicResultId,
            title: item.title,
            displayName: item.displayName,
            style: item.style,
            genre: item.genre,
            mood: item.mood,
            playCount: item.playCount,
            downloadCount: item.downloadCount,
            likeCount: item.likeCount,
            shareCount: item.shareCount,
            qualityScore: item.qualityScore,
            popularityScore: item.popularityScore,
            createdAt: item.createdAt,
          })),
          total: popularMusic.length,
          filters: { musicType, style },
        };
      },
    });
  }

  /**
   * Get music trends
   * GET /api/music/analytics/trends
   */
  async getTrends(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get music trends',
      handler: async () => {
        const querySchema = z.object({
          timeframe: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
        });

        const { timeframe } = querySchema.parse(req.query);

        logger.info('Getting music trends');

        const trendsResponse = await this.analyticsClient.getMusicTrends(timeframe || 'monthly');
        const trends = trendsResponse.trends;

        return {
          timeframe: trends?.timeframe || timeframe || 'monthly',
          trendingStyles: trends?.trendingStyles || [],
          trendingGenres: trends?.trendingGenres || [],
          trendingMoods: trends?.trendingMoods || [],
          emergingPatterns: trends?.emergingPatterns || [],
          generatedAt: new Date().toISOString(),
        };
      },
    });
  }

  /**
   * Get user analytics
   * GET /api/music/analytics/users/:userId
   */
  async getUserAnalytics(req: Request, res: Response): Promise<void> {
    const { userId } = req.params as { userId: string };

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID is required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get user analytics',
      handler: async () => {
        const queryParams = analyticsQuerySchema.parse(req.query);

        logger.info('Getting analytics for user: {}', { data0: userId });

        const startDate = queryParams.startDate ? new Date(queryParams.startDate) : undefined;
        const endDate = queryParams.endDate ? new Date(queryParams.endDate) : undefined;

        const userMetricsResponse = await this.analyticsClient.getMusicAnalytics({
          userId,
          startDate,
          endDate,
        });

        return {
          userId,
          metrics: userMetricsResponse.analytics || {},
          dateRange:
            queryParams.startDate && queryParams.endDate
              ? {
                  startDate: queryParams.startDate,
                  endDate: queryParams.endDate,
                }
              : null,
          generatedAt: new Date().toISOString(),
        };
      },
    });
  }

  /**
   * Get analytics health status
   * GET /api/music/analytics/health
   */
  async getAnalyticsHealth(req: Request, res: Response): Promise<void> {
    try {
      const isHealthy = await this.analyticsClient.isHealthy();

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        service: 'music-analytics',
        components: {
          analyticsService: isHealthy ? 'healthy' : 'unhealthy',
          eventTracking: 'operational',
          metricsCollection: 'operational',
          reportGeneration: 'operational',
        },
        capabilities: [
          'event-tracking',
          'metrics-aggregation',
          'trend-analysis',
          'user-analytics',
          'popular-content',
          'real-time-insights',
        ],
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Analytics health check error:', { error: serializeError(error) });
      res.status(503).json({
        status: 'unhealthy',
        service: 'music-analytics',
        error: error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
