/**
 * Domain Entities: Lifecycle Analytics
 * Interfaces for user lifecycle tracking, subscription economics, cohort retention, and revenue.
 */

// ─── Table Entity Interfaces ───────────────────────────────────────────────────

export interface LifecycleEventEntity {
  readonly id?: string;
  readonly eventType: string;
  readonly userId: string;
  readonly tier?: string | null;
  readonly platform?: string | null;
  readonly sessionId?: string | null;
  readonly metadata: Record<string, unknown>;
  readonly correlationId: string;
  readonly source: string;
  readonly createdAt?: Date;
}

export interface SubscriptionChangeEntity {
  readonly id?: string;
  readonly userId: string;
  readonly fromTier?: string | null;
  readonly toTier: string;
  readonly billingCycle: string;
  readonly trigger: string;
  readonly grossAmount?: string | null;
  readonly netAmount?: string | null;
  readonly store?: string | null;
  readonly platform?: string | null;
  readonly cancellationReason?: string | null;
  readonly trialConverted?: boolean;
  readonly correlationId: string;
  readonly effectiveAt: Date;
  readonly createdAt?: Date;
}

export interface DailyMetricsEntity {
  readonly id?: string;
  readonly date: string;
  readonly tier: string;
  readonly platform: string;
  readonly activeUsers: number;
  readonly newSignups: number;
  readonly conversions: number;
  readonly upgrades: number;
  readonly downgrades: number;
  readonly churned: number;
  readonly reactivated: number;
  readonly trialStarts: number;
  readonly trialConversions: number;
  readonly endingUsers: number;
  readonly grossRevenue: string;
  readonly netRevenue: string;
  readonly refunds: string;
  readonly avgSessionDuration: string;
  readonly contentGenerated: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface CohortSnapshotEntity {
  readonly id?: string;
  readonly cohortMonth: string;
  readonly monthsSinceCohort: number;
  readonly tier: string;
  readonly platform: string;
  readonly cohortSize: number;
  readonly usersRemaining: number;
  readonly paidUsersRemaining: number;
  readonly retentionRate: string;
  readonly revenueRetention: string;
  readonly cumulativeRevenue: string;
  readonly createdAt?: Date;
}

export interface AcquisitionAttributionEntity {
  readonly id?: string;
  readonly userId: string;
  readonly platform: string;
  readonly store: string;
  readonly acquisitionSource: string;
  readonly campaign?: string | null;
  readonly adGroup?: string | null;
  readonly creative?: string | null;
  readonly referralCode?: string | null;
  readonly utmSource?: string | null;
  readonly utmMedium?: string | null;
  readonly utmCampaign?: string | null;
  readonly costPerInstall?: string | null;
  readonly firstPaymentAt?: Date | null;
  readonly firstPaymentTier?: string | null;
  readonly createdAt?: Date;
}

// ─── Query Result Types ────────────────────────────────────────────────────────

export interface TierPlatformCount {
  readonly tier: string;
  readonly platform: string;
  readonly count: number;
}

export interface CohortUserInfo {
  readonly userId: string;
  readonly signupDate: Date;
  readonly lastActiveDate: Date | null;
  readonly tier: string | null;
  readonly totalRevenue: number;
}

export interface AcquisitionBreakdownRow {
  readonly source: string;
  readonly campaign?: string | null;
  readonly users: number;
  readonly paidUsers: number;
  readonly revenue: number;
  readonly avgTimeToConvertDays: number | null;
}

export interface RevenueSeries {
  readonly period: string;
  readonly tier: string;
  readonly grossRevenue: number;
  readonly netRevenue: number;
  readonly userCount: number;
}

export interface ChurnRateRow {
  readonly period: string;
  readonly tier: string;
  readonly startingUsers: number;
  readonly churned: number;
  readonly churnRate: number;
}

export interface ConversionFunnelRow {
  readonly step: string;
  readonly users: number;
  readonly conversionRate: number;
  readonly dropoffRate: number;
}

export interface DashboardOverview {
  readonly totalUsers: number;
  readonly paidUsers: number;
  readonly mrr: number;
  readonly arr: number;
  readonly conversionRate: number;
  readonly churnRate: number;
  readonly arpu: number;
  readonly ltv: number;
  readonly trialConversionRate: number;
  readonly activeUsersToday: number;
}
