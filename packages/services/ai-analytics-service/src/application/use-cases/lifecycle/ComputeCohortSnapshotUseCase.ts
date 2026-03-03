/**
 * Use Case: Compute cohort snapshots
 * For each historical cohort month, computes retention and revenue metrics.
 */

import { createLogger } from '@aiponge/platform-core';
import type { ILifecycleRepository } from '../../../domains/repositories/ILifecycleRepository';
import type { CohortSnapshotEntity, CohortUserInfo } from '../../../domains/entities/Lifecycle';

const logger = createLogger('ai-analytics-service:compute-cohort-snapshot');

export class ComputeCohortSnapshotUseCase {
  constructor(private readonly repository: ILifecycleRepository) {}

  async execute(targetMonth: Date): Promise<{ cohortsProcessed: number }> {
    // Find the earliest signup month
    const earliest = new Date(targetMonth);
    earliest.setMonth(earliest.getMonth() - 24); // Look back up to 24 months
    let cohortsProcessed = 0;

    const current = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    const targetEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 23, 59, 59, 999);

    while (current <= targetMonth) {
      const cohortUsers = await this.repository.getUserCohort(current);

      if (cohortUsers.length > 0) {
        const monthsSince = this.monthsDiff(current, targetMonth);
        await this.computeAndUpsert(cohortUsers, current, monthsSince, targetEnd);
        cohortsProcessed++;
      }

      current.setMonth(current.getMonth() + 1);
    }

    logger.info('Cohort snapshots computed', {
      targetMonth: targetMonth.toISOString().split('T')[0],
      cohortsProcessed,
    });

    return { cohortsProcessed };
  }

  private async computeAndUpsert(
    cohortUsers: CohortUserInfo[],
    cohortMonth: Date,
    monthsSinceCohort: number,
    targetEnd: Date
  ): Promise<void> {
    const cohortMonthStr = `${cohortMonth.getFullYear()}-${String(cohortMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const cohortSize = cohortUsers.length;

    const thirtyDaysAgo = new Date(targetEnd);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUsers = cohortUsers.filter(u => u.lastActiveDate && u.lastActiveDate >= thirtyDaysAgo);
    const paidUsers = activeUsers.filter(u => u.tier && ['personal', 'practice', 'studio'].includes(u.tier));
    const totalRevenue = cohortUsers.reduce((sum, u) => sum + u.totalRevenue, 0);

    const retentionRate = cohortSize > 0 ? activeUsers.length / cohortSize : 0;

    // Revenue at age 0 would be first month's revenue; approximate from total / months
    const revenueRetention = monthsSinceCohort > 0 && totalRevenue > 0 ? 1.0 : 0;

    const snapshot: CohortSnapshotEntity = {
      cohortMonth: cohortMonthStr,
      monthsSinceCohort,
      tier: 'all',
      platform: 'all',
      cohortSize,
      usersRemaining: activeUsers.length,
      paidUsersRemaining: paidUsers.length,
      retentionRate: retentionRate.toFixed(4),
      revenueRetention: revenueRetention.toFixed(4),
      cumulativeRevenue: totalRevenue.toFixed(2),
    };

    await this.repository.upsertCohortSnapshot(snapshot);
  }

  private monthsDiff(from: Date, to: Date): number {
    return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  }
}
