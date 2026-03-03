/**
 * Use Case: Compute daily metrics
 * Aggregates lifecycle events for a given date into aia_daily_metrics rows by tier and platform.
 */

import { createLogger } from '@aiponge/platform-core';
import type { ILifecycleRepository } from '../../../domains/repositories/ILifecycleRepository';
import type { DailyMetricsEntity, LifecycleEventEntity } from '../../../domains/entities/Lifecycle';
import { USER_LIFECYCLE_EVENT_TYPES } from '@aiponge/shared-contracts';

const logger = createLogger('ai-analytics-service:compute-daily-metrics');

export class ComputeDailyMetricsUseCase {
  constructor(private readonly repository: ILifecycleRepository) {}

  async execute(date: Date): Promise<{ rowsComputed: number }> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const dateStr = date.toISOString().split('T')[0];

    const events = await this.repository.getLifecycleEventsByDateRange(startOfDay, endOfDay);
    const activeUserCounts = await this.repository.getActiveUserCountByTierAndPlatform(date);

    // Group events by tier+platform
    const buckets = new Map<string, LifecycleEventEntity[]>();
    for (const event of events) {
      const tier = event.tier ?? 'unknown';
      const platform = event.platform ?? 'unknown';
      const key = `${tier}:${platform}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(event);

      // Also add to 'all' aggregations
      const allTierKey = `all:${platform}`;
      if (!buckets.has(allTierKey)) buckets.set(allTierKey, []);
      buckets.get(allTierKey)!.push(event);

      const allPlatformKey = `${tier}:all`;
      if (!buckets.has(allPlatformKey)) buckets.set(allPlatformKey, []);
      buckets.get(allPlatformKey)!.push(event);

      const allAllKey = 'all:all';
      if (!buckets.has(allAllKey)) buckets.set(allAllKey, []);
      buckets.get(allAllKey)!.push(event);
    }

    let rowsComputed = 0;

    for (const [key, bucketEvents] of buckets) {
      const [tier, platform] = key.split(':');
      const metrics = this.aggregateBucket(bucketEvents, dateStr, tier, platform, activeUserCounts);
      await this.repository.upsertDailyMetrics(metrics);
      rowsComputed++;
    }

    logger.info('Daily metrics computed', { date: dateStr, rowsComputed, totalEvents: events.length });
    return { rowsComputed };
  }

  private aggregateBucket(
    events: LifecycleEventEntity[],
    dateStr: string,
    tier: string,
    platform: string,
    activeUserCounts: Array<{ tier: string; platform: string; count: number }>
  ): DailyMetricsEntity {
    const countByType = (type: string) => events.filter(e => e.eventType === type).length;

    const sessionEndEvents = events.filter(e => e.eventType === USER_LIFECYCLE_EVENT_TYPES.SESSION_ENDED);
    const totalDuration = sessionEndEvents.reduce(
      (sum, e) => sum + (Number((e.metadata as Record<string, unknown>).durationSeconds) || 0),
      0
    );
    const avgDuration = sessionEndEvents.length > 0 ? totalDuration / sessionEndEvents.length : 0;

    const paymentEvents = events.filter(e => e.eventType === USER_LIFECYCLE_EVENT_TYPES.PAYMENT_SUCCEEDED);
    const grossRevenue = paymentEvents.reduce(
      (sum, e) => sum + (Number((e.metadata as Record<string, unknown>).grossAmount) || 0),
      0
    );

    const refundEvents = events.filter(e => e.eventType === USER_LIFECYCLE_EVENT_TYPES.REFUND_PROCESSED);
    const refunds = refundEvents.reduce(
      (sum, e) => sum + (Number((e.metadata as Record<string, unknown>).amount) || 0),
      0
    );

    // Net = gross * 0.85 (App Store Small Business Program)
    const netRevenue = grossRevenue * 0.85;

    const matchingActive = activeUserCounts.find(
      a => (tier === 'all' || a.tier === tier) && (platform === 'all' || a.platform === platform)
    );

    return {
      date: dateStr,
      tier,
      platform,
      activeUsers: matchingActive?.count ?? 0,
      newSignups: countByType(USER_LIFECYCLE_EVENT_TYPES.SIGNED_UP),
      conversions: countByType(USER_LIFECYCLE_EVENT_TYPES.TIER_CHANGED),
      upgrades: events.filter(
        e =>
          e.eventType === USER_LIFECYCLE_EVENT_TYPES.TIER_CHANGED &&
          (e.metadata as Record<string, unknown>).trigger === 'upgrade'
      ).length,
      downgrades: events.filter(
        e =>
          e.eventType === USER_LIFECYCLE_EVENT_TYPES.TIER_CHANGED &&
          (e.metadata as Record<string, unknown>).trigger === 'downgrade'
      ).length,
      churned: countByType(USER_LIFECYCLE_EVENT_TYPES.CHURNED),
      reactivated: countByType(USER_LIFECYCLE_EVENT_TYPES.REACTIVATED),
      trialStarts: countByType(USER_LIFECYCLE_EVENT_TYPES.TRIAL_STARTED),
      trialConversions: countByType(USER_LIFECYCLE_EVENT_TYPES.TRIAL_CONVERTED),
      endingUsers: 0, // Computed separately or from running total
      grossRevenue: grossRevenue.toFixed(2),
      netRevenue: netRevenue.toFixed(2),
      refunds: refunds.toFixed(2),
      avgSessionDuration: avgDuration.toFixed(2),
      contentGenerated: countByType(USER_LIFECYCLE_EVENT_TYPES.CONTENT_GENERATED),
    };
  }
}
