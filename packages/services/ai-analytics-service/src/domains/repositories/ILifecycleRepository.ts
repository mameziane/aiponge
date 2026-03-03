/**
 * Repository Interface: Lifecycle Analytics
 * Defines the contract for lifecycle event persistence and analytics queries.
 */

import type {
  LifecycleEventEntity,
  SubscriptionChangeEntity,
  DailyMetricsEntity,
  CohortSnapshotEntity,
  AcquisitionAttributionEntity,
  TierPlatformCount,
  CohortUserInfo,
  AcquisitionBreakdownRow,
  RevenueSeries,
  ChurnRateRow,
  ConversionFunnelRow,
} from '../entities/Lifecycle';

export interface ILifecycleRepository {
  // ─── Write ─────────────────────────────────────────────────────────────────

  insertLifecycleEvent(event: LifecycleEventEntity): Promise<string>;
  insertLifecycleEventsBatch(events: LifecycleEventEntity[]): Promise<{ accepted: number; rejected: number }>;
  insertSubscriptionChange(change: SubscriptionChangeEntity): Promise<string>;
  upsertAcquisitionAttribution(attribution: AcquisitionAttributionEntity): Promise<string>;
  upsertDailyMetrics(metrics: DailyMetricsEntity): Promise<void>;
  upsertCohortSnapshot(snapshot: CohortSnapshotEntity): Promise<void>;

  // ─── Read — Scheduler Aggregation ──────────────────────────────────────────

  getLifecycleEventsByDateRange(from: Date, to: Date, eventType?: string): Promise<LifecycleEventEntity[]>;
  getActiveUserCountByTierAndPlatform(date: Date): Promise<TierPlatformCount[]>;
  getUserCohort(cohortMonth: Date): Promise<CohortUserInfo[]>;
  getDormantUsers(inactiveSinceDays: number, excludeAlreadyFlagged: boolean): Promise<string[]>;

  // ─── Read — Dashboard API ──────────────────────────────────────────────────

  getDailyMetrics(from: Date, to: Date, tier?: string, platform?: string): Promise<DailyMetricsEntity[]>;
  getCohortSnapshots(cohortMonth?: Date): Promise<CohortSnapshotEntity[]>;
  getSubscriptionHistory(userId: string): Promise<SubscriptionChangeEntity[]>;
  getAcquisitionBreakdown(from: Date, to: Date): Promise<AcquisitionBreakdownRow[]>;
  getRevenueByTierAndPeriod(
    from: Date,
    to: Date,
    granularity: 'daily' | 'weekly' | 'monthly'
  ): Promise<RevenueSeries[]>;
  getChurnRateByTier(from: Date, to: Date): Promise<ChurnRateRow[]>;
  getConversionFunnel(from: Date, to: Date): Promise<ConversionFunnelRow[]>;

  // ─── Read — KPI Computation ────────────────────────────────────────────────

  getTotalUserCount(): Promise<number>;
  getPaidUserCount(): Promise<number>;
  getCurrentMRR(): Promise<number>;
  getActiveUsersToday(): Promise<number>;
  getTrialConversionRate(from: Date, to: Date): Promise<number>;
}
