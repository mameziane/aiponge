/**
 * Track Behavior Use Case
 * Handles individual and batch behavior event tracking
 */

import { errorMessage } from '@aiponge/platform-core';
import { IAnalyticsRepository, IMetricsRepository } from '@domains/repositories/IAnalyticsRepository';
import { getLogger } from '@config/service-urls';
import { AnalyticsError } from '../../errors';
import { randomUUID } from 'crypto';
import { TrackUserBehaviorRequest, TrackUserBehaviorResult } from './types';

const logger = getLogger('ai-analytics-service-track-behavior');

export class TrackBehaviorUseCase {
  constructor(
    private readonly repository: IAnalyticsRepository,
    private readonly metricsRepository: IMetricsRepository
  ) {
    logger.info('Initialized behavior tracking use case');
  }

  async trackBehavior(request: TrackUserBehaviorRequest): Promise<TrackUserBehaviorResult> {
    try {
      const startTime = Date.now();
      const eventId = `event_${Date.now()}_${randomUUID()}`;
      const timestamp = request.timestamp || new Date();

      this.validateBehaviorRequest(request);

      const userInsights = request.userId ? await this.getUserInsights(request.userId, timestamp) : undefined;

      await this.recordBehaviorMetrics(request, eventId, timestamp);

      if (request.userId) {
        await this.updateUserSession(request, timestamp);
      }

      const processingTime = Date.now() - startTime;

      await this.recordTrackingMetric('behavior_tracked', 1, request.eventType, processingTime);

      logger.info('Tracked {} event for user {}', {
        data0: request.eventType,
        data1: request.userId || 'anonymous',
      });

      return {
        success: true,
        eventId,
        userId: request.userId,
        sessionId: request.sessionId,
        timestamp,
        processingTimeMs: processingTime,
        insights: userInsights,
      };
    } catch (error) {
      return this.handleTrackingError(error instanceof Error ? error : new Error(errorMessage(error)), request);
    }
  }

  async trackBehaviorBatch(requests: TrackUserBehaviorRequest[]): Promise<{
    success: boolean;
    results: TrackUserBehaviorResult[];
    processed: number;
    failed: number;
    processingTimeMs: number;
  }> {
    const startTime = Date.now();
    const results: TrackUserBehaviorResult[] = [];
    let processed = 0;
    let failed = 0;

    try {
      logger.info('Processing batch of {} behavior events', { data0: requests.length });

      for (const request of requests) {
        try {
          const result = await this.trackBehavior(request);
          results.push(result);
          if (result.success) processed++;
          else failed++;
        } catch (error) {
          failed++;
          results.push({
            success: false,
            eventId: '',
            timestamp: new Date(),
            processingTimeMs: 0,
            error: {
              code: 'BATCH_TRACKING_ERROR',
              message: errorMessage(error),
            },
          });
        }
      }

      const processingTime = Date.now() - startTime;
      await this.recordTrackingMetric('batch_processed', requests.length, 'batch', processingTime);

      return {
        success: failed === 0,
        results,
        processed,
        failed,
        processingTimeMs: processingTime,
      };
    } catch (error) {
      logger.error('Batch tracking failed:', { error: error instanceof Error ? error.message : String(error) });
      throw AnalyticsError.internalError(
        `Batch tracking failed: ${errorMessage(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private validateBehaviorRequest(request: TrackUserBehaviorRequest): void {
    if (!request.eventType) {
      throw AnalyticsError.validationError('eventType', 'Event type is required');
    }
    if (!request.action) {
      throw AnalyticsError.validationError('action', 'Action is required');
    }
  }

  private async getUserInsights(
    userId: string,
    currentTimestamp: Date
  ): Promise<{ isNewUser: boolean; sessionDuration?: number; previousActions: number; engagementScore: number }> {
    try {
      const recentMetrics = await this.metricsRepository.getMetrics({
        serviceName: 'user-behavior',
        startTime: new Date(currentTimestamp.getTime() - 24 * 60 * 60 * 1000),
        endTime: currentTimestamp,
        tags: { userId },
      });

      const isNewUser = recentMetrics.length === 0;
      const previousActions = recentMetrics.length;
      const engagementScore = Math.min(100, previousActions * 5);

      return {
        isNewUser,
        previousActions,
        engagementScore,
      };
    } catch (error) {
      logger.warn('Failed to get user insights (non-blocking):', { data: error });
      return {
        isNewUser: true,
        previousActions: 0,
        engagementScore: 0,
      };
    }
  }

  private async recordBehaviorMetrics(
    request: TrackUserBehaviorRequest,
    eventId: string,
    timestamp: Date
  ): Promise<void> {
    const baseTags: Record<string, string> = {
      eventType: request.eventType,
      action: request.action,
      eventId,
    };

    if (request.userId) baseTags.userId = request.userId;
    if (request.sessionId) baseTags.sessionId = request.sessionId;
    if (request.feature) baseTags.feature = request.feature;
    if (request.userType) baseTags.userType = request.userType;
    if (request.success !== undefined) baseTags.success = String(request.success);
    if (request.deviceInfo?.type) baseTags.deviceType = request.deviceInfo.type;
    if (request.location?.country) baseTags.country = request.location.country;

    await this.metricsRepository.recordMetric({
      name: `user_behavior.${request.eventType}`,
      value: 1,
      timestamp,
      tags: baseTags,
      serviceName: 'user-behavior',
      source: 'behavior-tracker',
      metricType: 'counter',
      unit: 'events',
    });

    if (request.duration) {
      await this.metricsRepository.recordMetric({
        name: `user_behavior.duration`,
        value: request.duration,
        timestamp,
        tags: baseTags,
        serviceName: 'user-behavior',
        source: 'behavior-tracker',
        metricType: 'gauge',
        unit: 'milliseconds',
      });
    }

    if (request.customMetrics) {
      for (const [metricName, value] of Object.entries(request.customMetrics)) {
        await this.metricsRepository.recordMetric({
          name: `user_behavior.custom.${metricName}`,
          value,
          timestamp,
          tags: { ...baseTags, ...request.customDimensions },
          serviceName: 'user-behavior',
          source: 'behavior-tracker',
          metricType: 'gauge',
          unit: 'custom',
        });
      }
    }
  }

  private async updateUserSession(request: TrackUserBehaviorRequest, timestamp: Date): Promise<void> {
    if (!request.sessionId) return;

    try {
      await this.metricsRepository.recordMetric({
        name: 'user_behavior.session_activity',
        value: 1,
        timestamp,
        tags: {
          userId: request.userId!,
          sessionId: request.sessionId,
          eventType: request.eventType,
        },
        serviceName: 'user-behavior',
        source: 'session-tracker',
        metricType: 'counter',
        unit: 'events',
      });
    } catch (error) {
      logger.warn('Failed to update session (non-blocking):', { data: error });
    }
  }

  private async recordTrackingMetric(
    metricName: string,
    value: number,
    eventType: string,
    processingTime: number
  ): Promise<void> {
    try {
      await this.metricsRepository.recordMetric({
        name: `behavior_tracking.${metricName}`,
        value,
        timestamp: new Date(),
        tags: {
          eventType,
          processingTime: processingTime.toString(),
        },
        serviceName: 'ai-analytics-service',
        source: 'behavior-tracker',
        metricType: 'counter',
        unit: 'events',
      });
    } catch (error) {
      logger.warn('Failed to record tracking metric (non-blocking):', { data: error });
    }
  }

  private handleTrackingError(error: Error, request: TrackUserBehaviorRequest): TrackUserBehaviorResult {
    logger.error('Behavior tracking failed:', {
      error: error.message,
      eventType: request.eventType,
      userId: request.userId,
    });

    return {
      success: false,
      eventId: '',
      timestamp: new Date(),
      processingTimeMs: 0,
      error: {
        code: 'TRACKING_ERROR',
        message: error.message,
      },
    };
  }
}
