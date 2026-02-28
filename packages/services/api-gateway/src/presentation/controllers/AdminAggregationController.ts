/**
 * Admin Aggregation Controller
 * Lightweight coordinator for admin-specific aggregated endpoints
 * Health/monitoring and provider management split into dedicated controllers
 */

import { Request, Response } from 'express';
import { BaseAggregationController } from './BaseAggregationController';
import { createHttpClient, type HttpClient, ServiceLocator, isFeatureEnabled } from '@aiponge/platform-core';
import { ServiceErrors } from '../utils/response-helpers';
import { FEATURE_FLAGS } from '@aiponge/shared-contracts/common';
import { GatewayConfig } from '../../config/GatewayConfig';
import { UserServiceClient } from '../../clients/UserServiceClient';
import { GatewayError } from '../../errors';

interface ProductMetrics {
  activation?: {
    onboardingCompletionRate: number | null;
    completedOnboarding: number;
    totalUsers: number;
    avgTimeToFirstSongSeconds: number | null;
    firstSongCompletionRate: number | null;
  };
  engagement?: {
    songsPerActiveUserPerMonth: number | null;
    songReturnRate: number | null;
    entriesPerUserPerMonth: number | null;
  };
  monetization?: {
    freeToPremiumConversionRate: number | null;
    creditPackPurchaseRate: number | null;
    premiumChurn30Day: number | null;
    premiumChurn90Day: number | null;
  };
  featureUsage?: {
    multipleBooksRate: number | null;
    chaptersUsageRate: number | null;
    trackAlarmUsageRate: number | null;
    downloadsPerUser: number | null;
  };
  summary?: {
    totalUsers: number;
    activeUsersLast30Days: number;
    premiumUsers: number;
    totalSongsGenerated: number;
  };
  generatedAt?: string;
}

export class AdminAggregationController extends BaseAggregationController {
  private readonly httpClient: HttpClient;
  private metricsCache: { data: ProductMetrics | null; timestamp: number } = { data: null, timestamp: 0 };
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super('api-gateway-admin-controller');
    this.httpClient = createHttpClient({ ...GatewayConfig.http.defaults, serviceName: 'api-gateway' });

    this.logger.debug('AdminAggregationController initialized (lightweight coordinator)');
  }

  /**
   * GET /api/admin/user-profile/:userId
   * Get comprehensive user profile data
   */
  async getUserProfileData(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      const userId = req.params.userId;
      if (!userId || typeof userId !== 'string') {
        ServiceErrors.badRequest(res, 'User ID is required', req);
        return;
      }

      try {
        const userServiceClient = new UserServiceClient(this.httpClient, req);

        const [profileResp, summaryResp, themesResp, metricsResp] = await Promise.all([
          userServiceClient.getProfile(userId),
          userServiceClient.getProfileSummary(userId),
          userServiceClient.getProfileThemes(userId),
          userServiceClient.getProfileMetrics(userId),
        ]);

        const profileData = {
          profile: profileResp.success ? profileResp.data : null,
          summary: summaryResp,
          themes: themesResp,
          metrics: metricsResp,
        };

        this.sendSuccessResponse(res, profileData);
      } catch (error) {
        this.logger.warn('Could not fetch user profile data', { error });
        ServiceErrors.serviceUnavailable(res, 'Failed to fetch user profile data', req);
      }
    })(req, res);
  }

  /**
   * GET /api/admin/user-credits-stats
   * Get platform-wide user credit statistics
   */
  async getUserCreditsStats(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        const serviceUrl = ServiceLocator.getServiceUrl('user-service');
        const response = await this.httpClient.get<Record<string, unknown>>(`${serviceUrl}/api/admin/credits/stats`);

        if (response.success && response.data) {
          this.sendSuccessResponse(res, response.data as Record<string, unknown>);
        } else {
          ServiceErrors.serviceUnavailable(res, 'Failed to fetch user credit statistics', req);
        }
      } catch (error) {
        this.logger.warn('Could not fetch user credit statistics', { error });
        ServiceErrors.serviceUnavailable(res, 'Failed to fetch user credit statistics', req);
      }
    })(req, res);
  }

  /**
   * GET /api/admin/product-metrics
   * Aggregated product metrics from user-service and music-service
   * WS3: When ADMIN_USE_PRECOMPUTED flag is enabled, reads from sys_platform_metrics instead
   */
  async getProductMetrics(req: Request, res: Response): Promise<void> {
    await this.asyncHandler(async (req: Request, res: Response) => {
      try {
        if (isFeatureEnabled(FEATURE_FLAGS.ADMIN_USE_PRECOMPUTED)) {
          const precomputed = await this.fetchPrecomputedMetrics();
          if (precomputed) {
            this.logger.debug('Returning pre-computed product metrics');
            this.sendSuccessResponse(res, precomputed);
            return;
          }
          this.logger.warn('Pre-computed metrics not available, falling back to live aggregation');
        }

        // Check cache
        const now = Date.now();
        if (this.metricsCache.data && now - this.metricsCache.timestamp < this.CACHE_TTL_MS) {
          this.logger.debug('Returning cached product metrics');
          this.sendSuccessResponse(res, this.metricsCache.data);
          return;
        }

        // Fetch from both services in parallel
        const [userMetricsResponse, musicMetricsResponse] = await Promise.allSettled([
          this.fetchUserServiceMetrics(),
          this.fetchMusicServiceMetrics(),
        ]);

        const userMetrics = userMetricsResponse.status === 'fulfilled' ? userMetricsResponse.value : null;
        const musicMetrics = musicMetricsResponse.status === 'fulfilled' ? musicMetricsResponse.value : null;

        if (userMetricsResponse.status === 'rejected') {
          this.logger.warn('Failed to fetch user-service metrics', { error: userMetricsResponse.reason });
        } else {
          this.logger.debug('User service metrics fetched', {
            hasActivation: !!userMetrics?.activation,
            hasEngagement: !!userMetrics?.engagement,
            hasMonetization: !!userMetrics?.monetization,
          });
        }
        if (musicMetricsResponse.status === 'rejected') {
          this.logger.warn('Failed to fetch music-service metrics', { error: musicMetricsResponse.reason });
        } else {
          this.logger.debug('Music service metrics fetched', {
            hasActivation: !!musicMetrics?.activation,
            hasEngagement: !!musicMetrics?.engagement,
            hasSummary: !!musicMetrics?.summary,
          });
        }

        // Merge metrics from both services
        const mergedMetrics: ProductMetrics = {
          activation: {
            onboardingCompletionRate: userMetrics?.activation?.onboardingCompletionRate ?? null,
            completedOnboarding: userMetrics?.activation?.completedOnboarding ?? 0,
            totalUsers: userMetrics?.activation?.totalUsers ?? 0,
            avgTimeToFirstSongSeconds: musicMetrics?.activation?.avgTimeToFirstSongSeconds ?? null,
            firstSongCompletionRate: musicMetrics?.activation?.firstSongCompletionRate ?? null,
          },
          engagement: {
            songsPerActiveUserPerMonth: musicMetrics?.engagement?.songsPerActiveUserPerMonth ?? null,
            songReturnRate: musicMetrics?.engagement?.songReturnRate ?? null,
            entriesPerUserPerMonth: userMetrics?.engagement?.entriesPerUserPerMonth ?? null,
          },
          monetization: {
            freeToPremiumConversionRate: userMetrics?.monetization?.freeToPremiumConversionRate ?? null,
            creditPackPurchaseRate: userMetrics?.monetization?.creditPackPurchaseRate ?? null,
            premiumChurn30Day: userMetrics?.monetization?.premiumChurn30Day ?? null,
            premiumChurn90Day: userMetrics?.monetization?.premiumChurn90Day ?? null,
          },
          featureUsage: {
            multipleBooksRate: userMetrics?.featureUsage?.multipleBooksRate ?? null,
            chaptersUsageRate: userMetrics?.featureUsage?.chaptersUsageRate ?? null,
            trackAlarmUsageRate: musicMetrics?.featureUsage?.trackAlarmUsageRate ?? null,
            downloadsPerUser: musicMetrics?.featureUsage?.downloadsPerUser ?? null,
          },
          summary: {
            totalUsers: userMetrics?.summary?.totalUsers ?? 0,
            activeUsersLast30Days: userMetrics?.summary?.activeUsersLast30Days ?? 0,
            premiumUsers: userMetrics?.summary?.premiumUsers ?? 0,
            totalSongsGenerated: musicMetrics?.summary?.totalSongsGenerated ?? 0,
          },
          generatedAt: new Date().toISOString(),
        };

        // Update cache
        this.metricsCache = { data: mergedMetrics, timestamp: now };

        this.sendSuccessResponse(res, mergedMetrics);
      } catch (error) {
        this.logger.error('Failed to get product metrics', { error });
        ServiceErrors.serviceUnavailable(res, 'Failed to fetch product metrics', req);
      }
    })(req, res);
  }

  private async fetchPrecomputedMetrics(): Promise<ProductMetrics | null> {
    try {
      const serviceUrl = ServiceLocator.getServiceUrl('system-service');
      const response = await this.httpClient.get<Record<string, unknown>>(
        `${serviceUrl}/api/monitoring/precomputed-metrics/product-metrics`
      );

      if (response.success && response.data) {
        const data = response.data as Record<string, unknown>;
        const nestedData = data.data as Record<string, unknown> | undefined;
        const payload = (nestedData?.payload || data.payload) as ProductMetrics | undefined;
        if (payload) {
          return { ...payload, generatedAt: (nestedData?.computedAt || data.computedAt) as string };
        }
      }
      return null;
    } catch (error) {
      this.logger.warn('Failed to fetch pre-computed metrics from system-service', { error });
      return null;
    }
  }

  private async fetchUserServiceMetrics(): Promise<ProductMetrics> {
    const serviceUrl = ServiceLocator.getServiceUrl('user-service');
    const response = await this.httpClient.get<Record<string, unknown>>(`${serviceUrl}/api/admin/product-metrics`);

    this.logger.debug('fetchUserServiceMetrics raw response', {
      success: response.success,
      hasData: !!response.data,
    });

    if (response.success && response.data) {
      const data = response.data as Record<string, unknown>;
      if (data.success === true && data.data) {
        return data.data as ProductMetrics;
      }
      return response.data as ProductMetrics;
    }
    throw GatewayError.serviceUnavailable('user-service', 'User service metrics unavailable');
  }

  private async fetchMusicServiceMetrics(): Promise<ProductMetrics> {
    const serviceUrl = ServiceLocator.getServiceUrl('music-service');
    const response = await this.httpClient.get<Record<string, unknown>>(`${serviceUrl}/admin/product-metrics`);

    this.logger.debug('fetchMusicServiceMetrics raw response', {
      success: response.success,
      hasData: !!response.data,
    });

    if (response.success && response.data) {
      const data = response.data as Record<string, unknown>;
      if (data.success === true && data.data) {
        return data.data as ProductMetrics;
      }
      return response.data as ProductMetrics;
    }
    throw GatewayError.serviceUnavailable('music-service', 'Music service metrics unavailable');
  }
}

export const adminController = new AdminAggregationController();
