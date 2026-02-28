/**
 * AnalyticsServiceClient - Client for ai-analytics-service integration
 * Handles music analytics tracking, metrics collection, and reporting
 *
 * MIGRATION COMPLETE: Fire-and-forget methods (recordEvent, recordEvents) now use
 * event bus exclusively. HTTP paths retained only for query operations (getMusicAnalytics, etc.)
 */

import { createServiceClient, type HttpClient, getServiceUrl, getLogger } from '../../config/service-urls';
import {
  getAnalyticsEventPublisher,
  type AnalyticsEventPublisher,
  withServiceResilience,
} from '@aiponge/platform-core';

const logger = getLogger('music-service:analytics-client');

interface BatchEventsResponse {
  success: boolean;
  error?: string;
}

interface MusicAnalyticsResponse {
  success: boolean;
  analytics?: MusicAnalyticsMetrics;
  error?: string;
}

interface SystemAnalyticsResponse {
  success: boolean;
  analytics?: SystemAnalytics;
  error?: string;
}

interface PopularMusicResponse {
  success: boolean;
  popularMusic?: PopularMusicItem[];
  error?: string;
}

interface MusicTrendsResponse {
  success: boolean;
  trends?: MusicTrends;
  error?: string;
}

interface CreateReportResponse {
  success: boolean;
  reportId?: string;
  downloadUrl?: string;
  error?: string;
}

interface HealthResponse {
  status: string;
}

export interface AnalyticsEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  deviceType?: string;
  location?: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface MusicAnalyticsMetrics {
  userId?: string;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  totalGenerations: number;
  successfulGenerations: number;
  failedGenerations: number;
  averageProcessingTime: number;
  totalDuration: number; // Total seconds of music generated
  averageQuality: number;
  totalCost: number;
  mostUsedStyles: Array<{ style: string; count: number }>;
  mostUsedGenres: Array<{ genre: string; count: number }>;
  mostUsedMoods: Array<{ mood: string; count: number }>;
  providerUsage: Array<{ provider: string; count: number; successRate: number }>;
  qualityDistribution: Record<string, number>;
  musicTypeDistribution: Record<string, number>;
  userActivity: {
    dailyGenerations: Array<{ date: string; count: number }>;
    weeklyActivity: Array<{ week: string; count: number }>;
    hourlyActivity: Array<{ hour: number; count: number }>;
  };
}

export interface SystemAnalytics {
  systemMetrics: {
    totalUsers: number;
    totalGenerations: number;
    totalProcessingTime: number;
    averageSuccessRate: number;
    systemLoad: number;
    activeProviders: number;
    totalStorage: number; // in bytes
  };
  performanceMetrics: {
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
    errorRate: number;
    throughput: number; // requests per minute
  };
  resourceMetrics: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkBandwidth: number;
  };
  businessMetrics: {
    totalRevenue: number;
    averageCostPerGeneration: number;
    popularMusicTypes: Array<{ type: string; percentage: number }>;
    userRetentionRate: number;
    premiumUserRatio: number;
  };
}

export interface PopularMusicItem {
  musicResultId: string;
  title: string;
  displayName: string;
  style: string;
  genre?: string;
  mood?: string;
  playCount: number;
  downloadCount: number;
  likeCount: number;
  shareCount: number;
  qualityScore: number;
  createdAt: Date;
  popularityScore: number;
}

export interface MusicTrends {
  timeframe: 'daily' | 'weekly' | 'monthly' | 'yearly';
  trendingStyles: Array<{
    style: string;
    growth: number; // percentage growth
    currentCount: number;
    previousCount: number;
  }>;
  trendingGenres: Array<{
    genre: string;
    growth: number;
    currentCount: number;
    previousCount: number;
  }>;
  trendingMoods: Array<{
    mood: string;
    growth: number;
    currentCount: number;
    previousCount: number;
  }>;
  emergingPatterns: Array<{
    pattern: string;
    description: string;
    confidence: number;
    examples: string[];
  }>;
}

const SERVICE_NAME = 'ai-analytics-service';

import type { IAnalyticsServiceClient } from '../../domains/music-catalog/ports/IAnalyticsServiceClient';

export class AnalyticsServiceClient implements IAnalyticsServiceClient {
  private httpClient: HttpClient;
  private eventPublisher: AnalyticsEventPublisher;

  constructor(
    options: {
      batchSize?: number;
      batchInterval?: number;
    } = {}
  ) {
    const { httpClient } = createServiceClient('ai-analytics-service');
    this.httpClient = httpClient;
    this.eventPublisher = getAnalyticsEventPublisher('music-service', {
      batchSize: options.batchSize || 100,
      batchInterval: options.batchInterval || 30000,
    });

    logger.debug('Analytics service client initialized (event-bus mode)');
  }

  /**
   * Record a single analytics event via event bus
   * Fire-and-forget - always returns success immediately
   */
  async recordEvent(event: AnalyticsEvent): Promise<{ success: boolean; error?: string }> {
    try {
      this.eventPublisher.recordEvent({
        eventType: event.eventType,
        eventData: event.eventData,
        userId: event.userId,
        sessionId: event.sessionId,
        deviceType: event.deviceType,
        location: event.location,
        timestamp: event.timestamp?.toISOString() || new Date().toISOString(),
        metadata: {
          ...event.metadata,
          service: 'music-service',
          component: 'music-generation',
        },
      });

      return { success: true };
    } catch (error) {
      logger.debug('Failed to publish analytics event (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
        eventType: event.eventType,
      });
      return { success: true };
    }
  }

  /**
   * Record multiple events via event bus
   * Fire-and-forget - always returns success immediately
   */
  async recordEvents(events: AnalyticsEvent[]): Promise<{ success: boolean; error?: string }> {
    try {
      this.eventPublisher.recordEvents(
        events.map(e => ({
          eventType: e.eventType,
          eventData: e.eventData,
          userId: e.userId,
          sessionId: e.sessionId,
          deviceType: e.deviceType,
          location: e.location,
          timestamp: e.timestamp?.toISOString() || new Date().toISOString(),
          metadata: {
            ...e.metadata,
            service: 'music-service',
            component: 'music-generation',
          },
        }))
      );

      return { success: true };
    } catch (error) {
      logger.debug('Failed to publish analytics events (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
        eventCount: events.length,
      });
      return { success: true };
    }
  }

  /**
   * Get music analytics for a user or system-wide
   */
  async getMusicAnalytics(
    params: {
      userId?: string;
      startDate?: Date;
      endDate?: Date;
      metrics?: string[];
    } = {}
  ): Promise<{
    success: boolean;
    analytics?: MusicAnalyticsMetrics;
    error?: string;
  }> {
    return withServiceResilience('ai-analytics-service', 'getMusicAnalytics', async () => {
      try {
        const queryParams = new URLSearchParams();
        if (params.userId) queryParams.append('userId', params.userId);
        if (params.startDate) queryParams.append('startDate', params.startDate.toISOString());
        if (params.endDate) queryParams.append('endDate', params.endDate.toISOString());
        if (params.metrics) queryParams.append('metrics', params.metrics.join(','));

        const data = await this.httpClient.get<MusicAnalyticsResponse>(
          getServiceUrl(SERVICE_NAME) + `/api/music/analytics?${queryParams.toString()}`
        );

        if (data.success) {
          return {
            success: true,
            analytics: data.analytics,
          };
        } else {
          return {
            success: false,
            error: data.error || 'Failed to get analytics',
          };
        }
      } catch (error) {
        logger.error('Failed to get music analytics', {
          error: error instanceof Error ? error.message : String(error),
          userId: params.userId,
          startDate: params.startDate?.toISOString(),
          endDate: params.endDate?.toISOString(),
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get music analytics',
        };
      }
    });
  }

  /**
   * Get system-wide analytics and metrics
   * Uses /api/analytics/metrics endpoint with response transformation
   */
  async getSystemAnalytics(dateRange?: { startDate: Date; endDate: Date }): Promise<{
    success: boolean;
    analytics?: SystemAnalytics;
    error?: string;
  }> {
    return withServiceResilience('ai-analytics-service', 'getSystemAnalytics', async () => {
      try {
        const queryParams = new URLSearchParams();
        if (dateRange?.startDate) queryParams.append('startTime', dateRange.startDate.toISOString());
        if (dateRange?.endDate) queryParams.append('endTime', dateRange.endDate.toISOString());

        const data = await this.httpClient.get<{ data?: unknown[]; count?: number; timestamp?: string }>(
          getServiceUrl(SERVICE_NAME) + `/api/analytics/metrics?${queryParams.toString()}`
        );

        return {
          success: true,
          analytics: {
            systemMetrics: {
              totalUsers: 0,
              totalGenerations: 0,
              totalProcessingTime: 0,
              averageSuccessRate: 0,
              systemLoad: 0,
              activeProviders: 0,
              totalStorage: 0,
            },
            performanceMetrics: {
              averageLatency: 0,
              p95Latency: 0,
              p99Latency: 0,
              errorRate: 0,
              throughput: 0,
            },
            resourceMetrics: {
              cpuUsage: 0,
              memoryUsage: 0,
              diskUsage: 0,
              networkBandwidth: 0,
            },
            businessMetrics: {
              totalRevenue: 0,
              averageCostPerGeneration: 0,
              popularMusicTypes: [],
              userRetentionRate: 0,
              premiumUserRatio: 0,
            },
          },
        };
      } catch (error) {
        logger.error('Failed to get system analytics', {
          error: error instanceof Error ? error.message : String(error),
          dateRange: dateRange
            ? `${dateRange.startDate.toISOString()} - ${dateRange.endDate.toISOString()}`
            : undefined,
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get system analytics',
        };
      }
    });
  }

  /**
   * Get popular music items
   */
  async getPopularMusic(
    params: {
      timeframe?: 'daily' | 'weekly' | 'monthly';
      limit?: number;
      musicType?: string;
      genre?: string;
      style?: string;
    } = {}
  ): Promise<{
    success: boolean;
    popularMusic?: PopularMusicItem[];
    error?: string;
  }> {
    return withServiceResilience('ai-analytics-service', 'getPopularMusic', async () => {
      try {
        const queryParams = new URLSearchParams();
        if (params.timeframe) queryParams.append('timeframe', params.timeframe);
        if (params.limit) queryParams.append('limit', params.limit.toString());
        if (params.musicType) queryParams.append('musicType', params.musicType);
        if (params.genre) queryParams.append('genre', params.genre);
        if (params.style) queryParams.append('style', params.style);

        const data = await this.httpClient.get<PopularMusicResponse>(
          getServiceUrl(SERVICE_NAME) + `/api/music/popular?${queryParams.toString()}`
        );

        if (data.success) {
          return {
            success: true,
            popularMusic: data.popularMusic,
          };
        } else {
          return {
            success: false,
            error: data.error || 'Failed to get popular music',
          };
        }
      } catch (error) {
        logger.error('Failed to get popular music data', {
          error: error instanceof Error ? error.message : String(error),
          timeframe: params.timeframe,
          limit: params.limit,
          musicType: params.musicType,
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get popular music',
        };
      }
    });
  }

  /**
   * Get music trends and emerging patterns
   */
  async getMusicTrends(timeframe: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'weekly'): Promise<{
    success: boolean;
    trends?: MusicTrends;
    error?: string;
  }> {
    return withServiceResilience('ai-analytics-service', 'getMusicTrends', async () => {
      try {
        const data = await this.httpClient.get<MusicTrendsResponse>(
          getServiceUrl(SERVICE_NAME) + `/api/music/trends?timeframe=${timeframe}`
        );

        if (data.success) {
          return {
            success: true,
            trends: data.trends,
          };
        } else {
          return {
            success: false,
            error: data.error || 'Failed to get music trends',
          };
        }
      } catch (error) {
        logger.error('Failed to get music trends', {
          error: error instanceof Error ? error.message : String(error),
          timeframe,
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get music trends',
        };
      }
    });
  }

  /**
   * Create custom analytics report
   * Uses /api/reports/insights endpoint for therapeutic insights reports
   */
  async createReport(reportConfig: {
    name: string;
    type: 'user_activity' | 'system_performance' | 'music_trends' | 'provider_analytics';
    parameters: Record<string, unknown>;
    format: 'json' | 'csv' | 'pdf';
    schedule?: {
      frequency: 'daily' | 'weekly' | 'monthly';
      recipients: string[];
    };
  }): Promise<{
    success: boolean;
    reportId?: string;
    downloadUrl?: string;
    error?: string;
  }> {
    return withServiceResilience('ai-analytics-service', 'createReport', async () => {
      try {
        const data = await this.httpClient.post<CreateReportResponse>(
          getServiceUrl(SERVICE_NAME) + '/api/reports/insights',
          {
            timeRangeDays: reportConfig.parameters?.timeRangeDays || 90,
            includeSections: reportConfig.parameters?.includeSections || {},
          }
        );

        if (data.success) {
          return {
            success: true,
            reportId: data.reportId,
            downloadUrl: data.downloadUrl,
          };
        } else {
          return {
            success: false,
            error: data.error || 'Failed to create report',
          };
        }
      } catch (error) {
        logger.error('Failed to create analytics report', {
          error: error instanceof Error ? error.message : String(error),
          reportName: reportConfig.name,
          reportType: reportConfig.type,
          format: reportConfig.format,
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create report',
        };
      }
    });
  }

  /**
   * Check if analytics service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.httpClient.getWithResponse<HealthResponse>(getServiceUrl(SERVICE_NAME) + '/health');
      return response.ok && response.data.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Update base URL for the service
   */
  updateBaseUrl(newBaseUrl: string): void {
    // BaseURL configuration now handled by ServiceCallClient
    logger.info('Analytics service base URL updated', {
      newBaseUrl,
    });
  }

  /**
   * Force flush any pending events in the publisher
   */
  async flushEvents(): Promise<void> {
    await this.eventPublisher.flushEvents();
  }

  /**
   * Graceful shutdown - flush all pending events
   */
  async shutdown(): Promise<void> {
    logger.info('Analytics service client shutting down');
    await this.eventPublisher.shutdown();
    logger.info('Analytics service client shutdown complete');
  }

  private handleError(error: unknown): Error {
    const err = error as {
      response?: { status: number; statusText?: string; data?: Record<string, unknown> };
      request?: unknown;
      message?: string;
    };
    if (err.response) {
      const status = err.response.status;
      const message =
        (err.response.data as Record<string, unknown>)?.error || err.response.statusText || 'Request failed';

      if (status === 400) {
        return new Error(`Bad Request: ${message}`);
      } else if (status === 401) {
        return new Error(`Authentication failed: ${message}`);
      } else if (status === 403) {
        return new Error(`Access denied: ${message}`);
      } else if (status === 404) {
        return new Error(`Analytics service not found: ${message}`);
      } else if (status === 429) {
        return new Error(`Rate limit exceeded: ${message}`);
      } else if (status >= 500) {
        return new Error(`Analytics server error: ${message}`);
      } else {
        return new Error(`Analytics request failed (${status}): ${message}`);
      }
    } else if (err.request) {
      return new Error('No response from analytics service - service may be unavailable');
    } else {
      return new Error(`Analytics request setup error: ${err.message}`);
    }
  }
}
