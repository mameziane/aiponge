/**
 * Lifecycle Repository Implementation
 * Drizzle-based persistence for lifecycle events, subscriptions, daily metrics, cohorts, and attribution.
 */

import { eq, and, between, sql, desc, isNull, gte, lte, count, sum } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createLogger } from '@aiponge/platform-core';
import type { ILifecycleRepository } from '../../domains/repositories/ILifecycleRepository';
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
} from '../../domains/entities/Lifecycle';
import {
  userLifecycleEvents,
  subscriptionHistory,
  dailyMetrics,
  cohortSnapshots,
  acquisitionAttribution,
} from '../../schema/lifecycle-schema';

const logger = createLogger('ai-analytics-service:lifecycle-repository');

export class LifecycleRepository implements ILifecycleRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  // ─── Write ─────────────────────────────────────────────────────────────────

  async insertLifecycleEvent(event: LifecycleEventEntity): Promise<string> {
    const [row] = await this.db
      .insert(userLifecycleEvents)
      .values({
        eventType: event.eventType,
        userId: event.userId,
        tier: event.tier,
        platform: event.platform,
        sessionId: event.sessionId,
        metadata: event.metadata,
        correlationId: event.correlationId,
        source: event.source,
      })
      .returning({ id: userLifecycleEvents.id });
    return row.id;
  }

  async insertLifecycleEventsBatch(events: LifecycleEventEntity[]): Promise<{ accepted: number; rejected: number }> {
    let accepted = 0;
    let rejected = 0;

    await this.db.transaction(async tx => {
      for (const event of events) {
        try {
          await tx.insert(userLifecycleEvents).values({
            eventType: event.eventType,
            userId: event.userId,
            tier: event.tier,
            platform: event.platform,
            sessionId: event.sessionId,
            metadata: event.metadata,
            correlationId: event.correlationId,
            source: event.source,
          });
          accepted++;
        } catch (err) {
          logger.warn('Failed to insert lifecycle event in batch', {
            eventType: event.eventType,
            userId: event.userId,
            error: err instanceof Error ? err.message : String(err),
          });
          rejected++;
        }
      }
    });

    return { accepted, rejected };
  }

  async insertSubscriptionChange(change: SubscriptionChangeEntity): Promise<string> {
    const [row] = await this.db
      .insert(subscriptionHistory)
      .values({
        userId: change.userId,
        fromTier: change.fromTier,
        toTier: change.toTier,
        billingCycle: change.billingCycle,
        trigger: change.trigger,
        grossAmount: change.grossAmount,
        netAmount: change.netAmount,
        store: change.store,
        platform: change.platform,
        cancellationReason: change.cancellationReason,
        trialConverted: change.trialConverted,
        correlationId: change.correlationId,
        effectiveAt: change.effectiveAt,
      })
      .returning({ id: subscriptionHistory.id });
    return row.id;
  }

  async upsertAcquisitionAttribution(attribution: AcquisitionAttributionEntity): Promise<string> {
    const [row] = await this.db
      .insert(acquisitionAttribution)
      .values({
        userId: attribution.userId,
        platform: attribution.platform,
        store: attribution.store,
        acquisitionSource: attribution.acquisitionSource,
        campaign: attribution.campaign,
        adGroup: attribution.adGroup,
        creative: attribution.creative,
        referralCode: attribution.referralCode,
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
        costPerInstall: attribution.costPerInstall,
      })
      .onConflictDoUpdate({
        target: acquisitionAttribution.userId,
        set: {
          acquisitionSource: attribution.acquisitionSource,
          campaign: attribution.campaign,
          referralCode: attribution.referralCode,
        },
      })
      .returning({ id: acquisitionAttribution.id });
    return row.id;
  }

  async upsertDailyMetrics(metrics: DailyMetricsEntity): Promise<void> {
    await this.db
      .insert(dailyMetrics)
      .values({
        date: metrics.date,
        tier: metrics.tier,
        platform: metrics.platform,
        activeUsers: metrics.activeUsers,
        newSignups: metrics.newSignups,
        conversions: metrics.conversions,
        upgrades: metrics.upgrades,
        downgrades: metrics.downgrades,
        churned: metrics.churned,
        reactivated: metrics.reactivated,
        trialStarts: metrics.trialStarts,
        trialConversions: metrics.trialConversions,
        endingUsers: metrics.endingUsers,
        grossRevenue: metrics.grossRevenue,
        netRevenue: metrics.netRevenue,
        refunds: metrics.refunds,
        avgSessionDuration: metrics.avgSessionDuration,
        contentGenerated: metrics.contentGenerated,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [dailyMetrics.date, dailyMetrics.tier, dailyMetrics.platform],
        set: {
          activeUsers: metrics.activeUsers,
          newSignups: metrics.newSignups,
          conversions: metrics.conversions,
          upgrades: metrics.upgrades,
          downgrades: metrics.downgrades,
          churned: metrics.churned,
          reactivated: metrics.reactivated,
          trialStarts: metrics.trialStarts,
          trialConversions: metrics.trialConversions,
          endingUsers: metrics.endingUsers,
          grossRevenue: metrics.grossRevenue,
          netRevenue: metrics.netRevenue,
          refunds: metrics.refunds,
          avgSessionDuration: metrics.avgSessionDuration,
          contentGenerated: metrics.contentGenerated,
          updatedAt: new Date(),
        },
      });
  }

  async upsertCohortSnapshot(snapshot: CohortSnapshotEntity): Promise<void> {
    await this.db
      .insert(cohortSnapshots)
      .values({
        cohortMonth: snapshot.cohortMonth,
        monthsSinceCohort: snapshot.monthsSinceCohort,
        tier: snapshot.tier,
        platform: snapshot.platform,
        cohortSize: snapshot.cohortSize,
        usersRemaining: snapshot.usersRemaining,
        paidUsersRemaining: snapshot.paidUsersRemaining,
        retentionRate: snapshot.retentionRate,
        revenueRetention: snapshot.revenueRetention,
        cumulativeRevenue: snapshot.cumulativeRevenue,
      })
      .onConflictDoUpdate({
        target: [
          cohortSnapshots.cohortMonth,
          cohortSnapshots.monthsSinceCohort,
          cohortSnapshots.tier,
          cohortSnapshots.platform,
        ],
        set: {
          cohortSize: snapshot.cohortSize,
          usersRemaining: snapshot.usersRemaining,
          paidUsersRemaining: snapshot.paidUsersRemaining,
          retentionRate: snapshot.retentionRate,
          revenueRetention: snapshot.revenueRetention,
          cumulativeRevenue: snapshot.cumulativeRevenue,
        },
      });
  }

  // ─── Read — Scheduler Aggregation ──────────────────────────────────────────

  async getLifecycleEventsByDateRange(from: Date, to: Date, eventType?: string): Promise<LifecycleEventEntity[]> {
    const conditions = [gte(userLifecycleEvents.createdAt, from), lte(userLifecycleEvents.createdAt, to)];
    if (eventType) {
      conditions.push(eq(userLifecycleEvents.eventType, eventType));
    }

    const rows = await this.db
      .select()
      .from(userLifecycleEvents)
      .where(and(...conditions))
      .orderBy(userLifecycleEvents.createdAt);

    return rows.map(r => ({
      id: r.id,
      eventType: r.eventType,
      userId: r.userId,
      tier: r.tier,
      platform: r.platform,
      sessionId: r.sessionId,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      correlationId: r.correlationId,
      source: r.source,
      createdAt: r.createdAt ?? undefined,
    }));
  }

  async getActiveUserCountByTierAndPlatform(date: Date): Promise<TierPlatformCount[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const rows = await this.db
      .select({
        tier: userLifecycleEvents.tier,
        platform: userLifecycleEvents.platform,
        count: sql<number>`count(distinct ${userLifecycleEvents.userId})`,
      })
      .from(userLifecycleEvents)
      .where(
        and(
          eq(userLifecycleEvents.eventType, 'user.session_started'),
          gte(userLifecycleEvents.createdAt, startOfDay),
          lte(userLifecycleEvents.createdAt, endOfDay)
        )
      )
      .groupBy(userLifecycleEvents.tier, userLifecycleEvents.platform);

    return rows.map(r => ({
      tier: r.tier ?? 'unknown',
      platform: r.platform ?? 'unknown',
      count: Number(r.count),
    }));
  }

  async getUserCohort(cohortMonth: Date): Promise<CohortUserInfo[]> {
    const startOfMonth = new Date(cohortMonth.getFullYear(), cohortMonth.getMonth(), 1);
    const endOfMonth = new Date(cohortMonth.getFullYear(), cohortMonth.getMonth() + 1, 0, 23, 59, 59, 999);

    const rows = await this.db.execute(sql`
      SELECT
        ule.user_id as "userId",
        MIN(ule.created_at) as "signupDate",
        MAX(CASE WHEN ule.event_type = 'user.session_started' THEN ule.created_at END) as "lastActiveDate",
        (SELECT sh.to_tier FROM aia_subscription_history sh
         WHERE sh.user_id = ule.user_id ORDER BY sh.effective_at DESC LIMIT 1) as "tier",
        COALESCE((SELECT SUM(sh.gross_amount::numeric) FROM aia_subscription_history sh
         WHERE sh.user_id = ule.user_id AND sh.gross_amount IS NOT NULL), 0) as "totalRevenue"
      FROM aia_user_lifecycle_events ule
      WHERE ule.event_type = 'user.signed_up'
        AND ule.created_at >= ${startOfMonth}
        AND ule.created_at <= ${endOfMonth}
      GROUP BY ule.user_id
    `);

    return (rows as unknown as Record<string, unknown>[]).map(r => ({
      userId: String(r.userId),
      signupDate: new Date(r.signupDate as string),
      lastActiveDate: r.lastActiveDate ? new Date(r.lastActiveDate as string) : null,
      tier: r.tier as string | null,
      totalRevenue: Number(r.totalRevenue ?? 0),
    }));
  }

  async getDormantUsers(inactiveSinceDays: number, excludeAlreadyFlagged: boolean): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveSinceDays);

    let query = sql`
      SELECT DISTINCT ule.user_id as "userId"
      FROM aia_user_lifecycle_events ule
      WHERE ule.event_type = 'user.signed_up'
        AND ule.user_id NOT IN (
          SELECT DISTINCT user_id FROM aia_user_lifecycle_events
          WHERE event_type = 'user.session_started' AND created_at >= ${cutoffDate}
        )
    `;

    if (excludeAlreadyFlagged) {
      query = sql`
        ${query}
        AND ule.user_id NOT IN (
          SELECT DISTINCT user_id FROM aia_user_lifecycle_events
          WHERE event_type = 'user.dormant_flagged'
            AND created_at >= ${cutoffDate}
        )
      `;
    }

    const rows = await this.db.execute(query);
    return (rows as unknown as Record<string, unknown>[]).map(r => String(r.userId));
  }

  // ─── Read — Dashboard API ──────────────────────────────────────────────────

  async getDailyMetrics(from: Date, to: Date, tier?: string, platform?: string): Promise<DailyMetricsEntity[]> {
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    const conditions = [gte(dailyMetrics.date, fromStr), lte(dailyMetrics.date, toStr)];

    if (tier) conditions.push(eq(dailyMetrics.tier, tier));
    if (platform) conditions.push(eq(dailyMetrics.platform, platform));

    const rows = await this.db
      .select()
      .from(dailyMetrics)
      .where(and(...conditions))
      .orderBy(dailyMetrics.date);

    return rows.map(this.mapDailyMetrics);
  }

  async getCohortSnapshots(cohortMonth?: Date): Promise<CohortSnapshotEntity[]> {
    const conditions = cohortMonth ? [eq(cohortSnapshots.cohortMonth, cohortMonth.toISOString().split('T')[0])] : [];

    const rows = await this.db
      .select()
      .from(cohortSnapshots)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(cohortSnapshots.cohortMonth, cohortSnapshots.monthsSinceCohort);

    return rows.map(r => ({
      id: r.id,
      cohortMonth: r.cohortMonth,
      monthsSinceCohort: r.monthsSinceCohort,
      tier: r.tier,
      platform: r.platform,
      cohortSize: r.cohortSize,
      usersRemaining: r.usersRemaining,
      paidUsersRemaining: r.paidUsersRemaining ?? 0,
      retentionRate: r.retentionRate,
      revenueRetention: r.revenueRetention ?? '0',
      cumulativeRevenue: r.cumulativeRevenue ?? '0',
      createdAt: r.createdAt ?? undefined,
    }));
  }

  async getSubscriptionHistory(userId: string): Promise<SubscriptionChangeEntity[]> {
    const rows = await this.db
      .select()
      .from(subscriptionHistory)
      .where(eq(subscriptionHistory.userId, userId))
      .orderBy(desc(subscriptionHistory.effectiveAt));

    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      fromTier: r.fromTier,
      toTier: r.toTier,
      billingCycle: r.billingCycle,
      trigger: r.trigger,
      grossAmount: r.grossAmount,
      netAmount: r.netAmount,
      store: r.store,
      platform: r.platform,
      cancellationReason: r.cancellationReason,
      trialConverted: r.trialConverted ?? false,
      correlationId: r.correlationId,
      effectiveAt: r.effectiveAt,
      createdAt: r.createdAt ?? undefined,
    }));
  }

  async getAcquisitionBreakdown(from: Date, to: Date): Promise<AcquisitionBreakdownRow[]> {
    const rows = await this.db.execute(sql`
      SELECT
        aa.acquisition_source as "source",
        aa.campaign,
        COUNT(*)::int as "users",
        COUNT(CASE WHEN aa.first_payment_tier IS NOT NULL THEN 1 END)::int as "paidUsers",
        COALESCE(SUM(
          (SELECT SUM(sh.gross_amount::numeric) FROM aia_subscription_history sh WHERE sh.user_id = aa.user_id)
        ), 0)::float as "revenue",
        AVG(CASE WHEN aa.first_payment_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (aa.first_payment_at - aa.created_at)) / 86400.0
        END)::float as "avgTimeToConvertDays"
      FROM aia_acquisition_attribution aa
      WHERE aa.created_at >= ${from} AND aa.created_at <= ${to}
      GROUP BY aa.acquisition_source, aa.campaign
      ORDER BY "users" DESC
    `);

    return rows as unknown as AcquisitionBreakdownRow[];
  }

  async getRevenueByTierAndPeriod(
    from: Date,
    to: Date,
    granularity: 'daily' | 'weekly' | 'monthly'
  ): Promise<RevenueSeries[]> {
    const truncFn = granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'week' : 'month';
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const rows = await this.db.execute(sql`
      SELECT
        date_trunc(${truncFn}, dm.date::timestamp)::date::text as "period",
        dm.tier,
        SUM(dm.gross_revenue::numeric)::float as "grossRevenue",
        SUM(dm.net_revenue::numeric)::float as "netRevenue",
        SUM(dm.active_users)::int as "userCount"
      FROM aia_daily_metrics dm
      WHERE dm.date >= ${fromStr} AND dm.date <= ${toStr}
        AND dm.platform = 'all'
      GROUP BY "period", dm.tier
      ORDER BY "period"
    `);

    return rows as unknown as RevenueSeries[];
  }

  async getChurnRateByTier(from: Date, to: Date): Promise<ChurnRateRow[]> {
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const rows = await this.db.execute(sql`
      SELECT
        dm.date::text as "period",
        dm.tier,
        dm.ending_users as "startingUsers",
        dm.churned,
        CASE WHEN dm.ending_users > 0
          THEN (dm.churned::numeric / dm.ending_users::numeric)::float
          ELSE 0 END as "churnRate"
      FROM aia_daily_metrics dm
      WHERE dm.date >= ${fromStr} AND dm.date <= ${toStr}
        AND dm.platform = 'all' AND dm.tier != 'all'
      ORDER BY dm.date, dm.tier
    `);

    return rows as unknown as ChurnRateRow[];
  }

  async getConversionFunnel(from: Date, to: Date): Promise<ConversionFunnelRow[]> {
    const rows = await this.db.execute(sql`
      WITH funnel AS (
        SELECT
          'signed_up' as step,
          COUNT(DISTINCT CASE WHEN event_type = 'user.signed_up' THEN user_id END)::int as users
        FROM aia_user_lifecycle_events WHERE created_at >= ${from} AND created_at <= ${to}
        UNION ALL
        SELECT
          'onboarding_completed' as step,
          COUNT(DISTINCT CASE WHEN event_type = 'user.onboarding_completed' THEN user_id END)::int as users
        FROM aia_user_lifecycle_events WHERE created_at >= ${from} AND created_at <= ${to}
        UNION ALL
        SELECT
          'feature_used' as step,
          COUNT(DISTINCT CASE WHEN event_type = 'user.feature_used' THEN user_id END)::int as users
        FROM aia_user_lifecycle_events WHERE created_at >= ${from} AND created_at <= ${to}
        UNION ALL
        SELECT
          'tier_changed' as step,
          COUNT(DISTINCT CASE WHEN event_type = 'user.tier_changed' THEN user_id END)::int as users
        FROM aia_user_lifecycle_events WHERE created_at >= ${from} AND created_at <= ${to}
      )
      SELECT
        step,
        users,
        CASE WHEN FIRST_VALUE(users) OVER (ORDER BY
          CASE step
            WHEN 'signed_up' THEN 1
            WHEN 'onboarding_completed' THEN 2
            WHEN 'feature_used' THEN 3
            WHEN 'tier_changed' THEN 4
          END) > 0
          THEN (users::numeric / FIRST_VALUE(users) OVER (ORDER BY
            CASE step
              WHEN 'signed_up' THEN 1
              WHEN 'onboarding_completed' THEN 2
              WHEN 'feature_used' THEN 3
              WHEN 'tier_changed' THEN 4
            END))::float
          ELSE 0 END as "conversionRate",
        CASE WHEN LAG(users) OVER (ORDER BY
          CASE step
            WHEN 'signed_up' THEN 1
            WHEN 'onboarding_completed' THEN 2
            WHEN 'feature_used' THEN 3
            WHEN 'tier_changed' THEN 4
          END) > 0
          THEN (1.0 - users::numeric / LAG(users) OVER (ORDER BY
            CASE step
              WHEN 'signed_up' THEN 1
              WHEN 'onboarding_completed' THEN 2
              WHEN 'feature_used' THEN 3
              WHEN 'tier_changed' THEN 4
            END))::float
          ELSE 0 END as "dropoffRate"
      FROM funnel
      ORDER BY
        CASE step
          WHEN 'signed_up' THEN 1
          WHEN 'onboarding_completed' THEN 2
          WHEN 'feature_used' THEN 3
          WHEN 'tier_changed' THEN 4
        END
    `);

    return rows as unknown as ConversionFunnelRow[];
  }

  // ─── Read — KPI Computation ────────────────────────────────────────────────

  async getTotalUserCount(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(distinct ${userLifecycleEvents.userId})` })
      .from(userLifecycleEvents)
      .where(eq(userLifecycleEvents.eventType, 'user.signed_up'));
    return Number(row?.count ?? 0);
  }

  async getPaidUserCount(): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT COUNT(DISTINCT sh.user_id)::int as count
      FROM aia_subscription_history sh
      WHERE sh.to_tier IN ('personal', 'practice', 'studio')
        AND sh.id = (
          SELECT sh2.id FROM aia_subscription_history sh2
          WHERE sh2.user_id = sh.user_id
          ORDER BY sh2.effective_at DESC LIMIT 1
        )
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return Number(row?.count ?? 0);
  }

  async getCurrentMRR(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.db.execute(sql`
      SELECT COALESCE(SUM(
        CASE WHEN sh.billing_cycle = 'yearly'
          THEN sh.gross_amount::numeric / 12
          ELSE sh.gross_amount::numeric
        END
      ), 0)::float as mrr
      FROM aia_subscription_history sh
      WHERE sh.to_tier IN ('personal', 'practice', 'studio')
        AND sh.trigger NOT IN ('cancellation', 'payment_failure')
        AND sh.id = (
          SELECT sh2.id FROM aia_subscription_history sh2
          WHERE sh2.user_id = sh.user_id
          ORDER BY sh2.effective_at DESC LIMIT 1
        )
        AND sh.gross_amount IS NOT NULL
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return Number(row?.mrr ?? 0);
  }

  async getActiveUsersToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [row] = await this.db
      .select({ count: sql<number>`count(distinct ${userLifecycleEvents.userId})` })
      .from(userLifecycleEvents)
      .where(and(eq(userLifecycleEvents.eventType, 'user.session_started'), gte(userLifecycleEvents.createdAt, today)));
    return Number(row?.count ?? 0);
  }

  async getTrialConversionRate(from: Date, to: Date): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT
        COUNT(CASE WHEN event_type = 'user.trial_converted' THEN 1 END)::float /
        NULLIF(COUNT(CASE WHEN event_type = 'user.trial_started' THEN 1 END), 0)::float
        as rate
      FROM aia_user_lifecycle_events
      WHERE created_at >= ${from} AND created_at <= ${to}
        AND event_type IN ('user.trial_started', 'user.trial_converted')
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return Number(row?.rate ?? 0);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private mapDailyMetrics(r: typeof dailyMetrics.$inferSelect): DailyMetricsEntity {
    return {
      id: r.id,
      date: r.date,
      tier: r.tier,
      platform: r.platform,
      activeUsers: r.activeUsers ?? 0,
      newSignups: r.newSignups ?? 0,
      conversions: r.conversions ?? 0,
      upgrades: r.upgrades ?? 0,
      downgrades: r.downgrades ?? 0,
      churned: r.churned ?? 0,
      reactivated: r.reactivated ?? 0,
      trialStarts: r.trialStarts ?? 0,
      trialConversions: r.trialConversions ?? 0,
      endingUsers: r.endingUsers ?? 0,
      grossRevenue: r.grossRevenue ?? '0',
      netRevenue: r.netRevenue ?? '0',
      refunds: r.refunds ?? '0',
      avgSessionDuration: r.avgSessionDuration ?? '0',
      contentGenerated: r.contentGenerated ?? 0,
      createdAt: r.createdAt ?? undefined,
      updatedAt: r.updatedAt ?? undefined,
    };
  }
}
