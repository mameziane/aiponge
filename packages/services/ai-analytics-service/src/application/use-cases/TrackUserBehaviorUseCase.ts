/**
 * Track User Behavior Use Case - Facade
 *
 * Facade that delegates tracking operations to specialized sub-use-cases
 * following the Single Responsibility Principle.
 *
 * Delegates to:
 * - TrackBehaviorUseCase: Event tracking
 * - BehaviorAnalyticsUseCase: Analytics and metrics
 * - CohortAnalysisUseCase: Cohort analysis
 */

import { IAnalyticsRepository, IMetricsRepository } from '../../domains/repositories/IAnalyticsRepository';
import { getLogger } from '../../config/service-urls';

import { TrackBehaviorUseCase } from './behavior/TrackBehaviorUseCase';
import { BehaviorAnalyticsUseCase } from './behavior/BehaviorAnalyticsUseCase';
import { CohortAnalysisUseCase } from './behavior/CohortAnalysisUseCase';

import type {
  TrackUserBehaviorRequest,
  TrackUserBehaviorResult,
  GetUserBehaviorAnalyticsRequest,
  GetUserBehaviorAnalyticsResult,
  CohortAnalysisRequest,
  CohortAnalysisResult,
} from './behavior/types';

export type {
  TrackUserBehaviorRequest,
  TrackUserBehaviorResult,
  GetUserBehaviorAnalyticsRequest,
  GetUserBehaviorAnalyticsResult,
  CohortAnalysisRequest,
  CohortAnalysisResult,
} from './behavior/types';

export type {
  BehaviorSummary,
  UserMetrics,
  SessionAnalysis,
  FunnelAnalysis,
  RetentionAnalysis,
  EngagementAnalysis,
  ConversionAnalysis,
  SegmentAnalysis,
  BehaviorInsight,
  PredictiveUserAnalytics,
} from './behavior/types';

const logger = getLogger('ai-analytics-service-trackuserbehaviorusecase');

export class TrackUserBehaviorUseCase {
  private readonly trackBehaviorUseCase: TrackBehaviorUseCase;
  private readonly behaviorAnalytics: BehaviorAnalyticsUseCase;
  private readonly cohortAnalysis: CohortAnalysisUseCase;

  constructor(
    private readonly repository: IAnalyticsRepository,
    private readonly metricsRepository: IMetricsRepository
  ) {
    logger.info('Initialized user behavior tracking facade');

    this.trackBehaviorUseCase = new TrackBehaviorUseCase(repository, metricsRepository);
    this.behaviorAnalytics = new BehaviorAnalyticsUseCase(metricsRepository);
    this.cohortAnalysis = new CohortAnalysisUseCase(metricsRepository);
  }

  async trackBehavior(request: TrackUserBehaviorRequest): Promise<TrackUserBehaviorResult> {
    return this.trackBehaviorUseCase.trackBehavior(request);
  }

  async trackBehaviorBatch(requests: TrackUserBehaviorRequest[]): Promise<{
    success: boolean;
    results: TrackUserBehaviorResult[];
    processed: number;
    failed: number;
    processingTimeMs: number;
  }> {
    return this.trackBehaviorUseCase.trackBehaviorBatch(requests);
  }

  async getBehaviorAnalytics(request: GetUserBehaviorAnalyticsRequest): Promise<GetUserBehaviorAnalyticsResult> {
    return this.behaviorAnalytics.getBehaviorAnalytics(request);
  }

  async performCohortAnalysis(request: CohortAnalysisRequest): Promise<CohortAnalysisResult> {
    return this.cohortAnalysis.performCohortAnalysis(request);
  }
}
