/**
 * Use Case: Get dashboard overview KPIs
 * Computes MRR, ARR, total users, paid users, conversion rate, churn, LTV.
 */

import { createLogger } from '@aiponge/platform-core';
import type { ILifecycleRepository } from '../../../domains/repositories/ILifecycleRepository';
import type { DashboardOverview } from '../../../domains/entities/Lifecycle';

const logger = createLogger('ai-analytics-service:get-dashboard-overview');

export class GetDashboardOverviewUseCase {
  constructor(private readonly repository: ILifecycleRepository) {}

  async execute(): Promise<DashboardOverview> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const now = new Date();

    const [totalUsers, paidUsers, mrr, activeUsersToday, trialConversionRate] = await Promise.all([
      this.repository.getTotalUserCount(),
      this.repository.getPaidUserCount(),
      this.repository.getCurrentMRR(),
      this.repository.getActiveUsersToday(),
      this.repository.getTrialConversionRate(thirtyDaysAgo, now),
    ]);

    const arr = mrr * 12;
    const conversionRate = totalUsers > 0 ? paidUsers / totalUsers : 0;
    const arpu = paidUsers > 0 ? mrr / paidUsers : 0;

    // Approximate churn: look at churned users in last 30 days / paid users at start
    const churnData = await this.repository.getChurnRateByTier(thirtyDaysAgo, now);
    const totalChurned = churnData.reduce((sum, r) => sum + r.churned, 0);
    const churnRate = paidUsers > 0 ? totalChurned / (paidUsers + totalChurned) : 0;

    // LTV = ARPU / monthly churn rate
    const monthlyChurnRate = churnRate > 0 ? churnRate : 0.05; // Default 5% if no data
    const ltv = arpu / monthlyChurnRate;

    return {
      totalUsers,
      paidUsers,
      mrr,
      arr,
      conversionRate,
      churnRate,
      arpu,
      ltv,
      trialConversionRate,
      activeUsersToday,
    };
  }
}
