/**
 * App Aggregation Controller
 * Handles app-specific multi-service aggregation and data transformation
 */

import { Request, Response } from 'express';
import { BaseAggregationController, type ServiceCallResult } from './BaseAggregationController';
import { createHttpClient, type HttpClient } from '@aiponge/platform-core';
import { GatewayConfig } from '../../config/GatewayConfig';
import { UserServiceClient } from '../../clients/UserServiceClient';
import { MusicServiceClient } from '../../clients/MusicServiceClient';
import { extractErrorMessage } from '../../utils/typeGuards';

export class AppAggregationController extends BaseAggregationController {
  private httpClient: HttpClient;

  constructor() {
    super('api-gateway-app-controller');
    this.httpClient = createHttpClient({ ...GatewayConfig.http.defaults, serviceName: 'api-gateway' });
  }

  /**
   * Aggregate member dashboard data from multiple services
   * Combines profile, recent entries, insights, and activity
   */
  async getDashboardData(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const userId = this.getUserId(req);

      // Create typed service clients with correlation ID propagation
      const userServiceClient = new UserServiceClient(this.httpClient, req);

      // Fetch user profile, entries, and insights in parallel using fanOut
      const [profileResult, entriesResult, insightsResult] = await this.fanOut<ServiceCallResult>([
        async (): Promise<ServiceCallResult> => {
          try {
            const response = await userServiceClient.getProfile(userId);
            return response.success
              ? { success: true, data: response.data }
              : { success: false, error: extractErrorMessage(response.error, 'Failed to fetch profile') };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to fetch profile',
            };
          }
        },
        async (): Promise<ServiceCallResult> => {
          try {
            const response = await userServiceClient.getEntries(userId, 5);
            return response.success
              ? { success: true, data: response.data }
              : { success: false, data: [], error: extractErrorMessage(response.error, 'Failed to fetch entries') };
          } catch (error) {
            return {
              success: false,
              data: [],
              error: error instanceof Error ? error.message : 'Failed to fetch entries',
            };
          }
        },
        async (): Promise<ServiceCallResult> => {
          try {
            const response = await userServiceClient.getInsights(userId, 5);
            return response.success
              ? { success: true, data: response.data }
              : { success: false, data: [], error: extractErrorMessage(response.error, 'Failed to fetch insights') };
          } catch (error) {
            return {
              success: false,
              data: [],
              error: error instanceof Error ? error.message : 'Failed to fetch insights',
            };
          }
        },
      ]);

      // Log any failed service calls
      this.logFailedCalls([profileResult, entriesResult, insightsResult], ['UserProfile', 'Entries', 'Insights'], {
        userId,
      });

      // Extract data with fallbacks using extractData helper
      const profile = this.extractData(profileResult, null);
      const entries = this.extractData(entriesResult, []);
      const insights = this.extractData(insightsResult, []);

      // Aggregate data from multiple services - no transformations
      const dashboardData = {
        profile,
        entries,
        insights,
      };

      this.sendSuccessResponse(res, dashboardData);
    })(req, res);
  }

  /**
   * Get member activity feed
   * Aggregates entries, insights, and music activity
   */
  async getActivityFeed(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const userId = this.getUserId(req);
      const limit = parseInt(req.query.limit as string) || 20;

      // Create typed service clients with correlation ID propagation
      const userServiceClient = new UserServiceClient(this.httpClient, req);
      const musicClient = new MusicServiceClient(this.httpClient, req);

      // Fetch recent activity from multiple services using fanOut
      const [entriesResult, insightsResult, musicResult] = await this.fanOut<ServiceCallResult>([
        async (): Promise<ServiceCallResult> => {
          try {
            const response = await userServiceClient.getEntries(userId, limit);
            return response.success
              ? { success: true, data: response.data }
              : { success: false, data: [], error: extractErrorMessage(response.error, 'Failed to fetch entries') };
          } catch (error) {
            return {
              success: false,
              data: [],
              error: error instanceof Error ? error.message : 'Failed to fetch entries',
            };
          }
        },
        async (): Promise<ServiceCallResult> => {
          try {
            const response = await userServiceClient.getInsights(userId, limit);
            return response.success
              ? { success: true, data: response.data }
              : { success: false, data: [], error: extractErrorMessage(response.error, 'Failed to fetch insights') };
          } catch (error) {
            return {
              success: false,
              data: [],
              error: error instanceof Error ? error.message : 'Failed to fetch insights',
            };
          }
        },
        async (): Promise<ServiceCallResult> => {
          try {
            const response = await musicClient.getRecentMusic(userId, limit);
            return response.success
              ? { success: true, data: response.data }
              : { success: false, data: [], error: extractErrorMessage(response.error, 'Music service unavailable') };
          } catch (error) {
            return {
              success: false,
              data: [],
              error: error instanceof Error ? error.message : 'Music service unavailable',
            };
          }
        },
      ]);

      // Log any failed service calls
      this.logFailedCalls([entriesResult, insightsResult, musicResult], ['Entries', 'Insights', 'Music'], {
        userId,
        limit,
      });

      // Extract data with fallbacks using extractData helper
      const entries = this.extractData(entriesResult, []);
      const insights = this.extractData(insightsResult, []);
      const music = this.extractData(musicResult, []);

      const activityFeed = {
        entries: Array.isArray(entries) ? entries : [],
        insights: Array.isArray(insights) ? insights : [],
        music: Array.isArray(music) ? music : [],
      };

      this.sendSuccessResponse(res, { ...activityFeed, limit });
    })(req, res);
  }

  /**
   * Get member insights overview
   * Aggregates insights with analytics
   */
  async getInsightsOverview(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const userId = this.getUserId(req);

      // Create typed service client with correlation ID propagation
      const userServiceClient = new UserServiceClient(this.httpClient, req);

      // Fetch insights and analytics in parallel using fanOut
      const [insightsResult, analyticsResult] = await this.fanOut<ServiceCallResult>([
        async (): Promise<ServiceCallResult> => {
          try {
            const response = await userServiceClient.getInsights(userId);
            return response.success
              ? { success: true, data: response.data }
              : { success: false, data: [], error: extractErrorMessage(response.error, 'Failed to fetch insights') };
          } catch (error) {
            return {
              success: false,
              data: [],
              error: error instanceof Error ? error.message : 'Failed to fetch insights',
            };
          }
        },
        async (): Promise<ServiceCallResult> => {
          try {
            const response = await userServiceClient.getAnalytics(userId);
            return response.success
              ? { success: true, data: response.data }
              : { success: false, data: {}, error: extractErrorMessage(response.error, 'Failed to fetch analytics') };
          } catch (error) {
            return {
              success: false,
              data: {},
              error: error instanceof Error ? error.message : 'Failed to fetch analytics',
            };
          }
        },
      ]);

      // Log any failed service calls
      this.logFailedCalls([insightsResult, analyticsResult], ['Insights', 'Analytics'], { userId });

      // Extract data with fallbacks using extractData helper
      const insights = this.extractData(insightsResult, []);
      const analytics = this.extractData(analyticsResult, {});

      // Aggregate data from multiple services - no transformations
      const overview = {
        insights,
        analytics,
      };

      this.sendSuccessResponse(res, overview);
    })(req, res);
  }
}

// Export singleton instance
export const appController = new AppAggregationController();
