/**
 * Daily Metrics Scheduler
 * Runs at 2 AM daily — aggregates yesterday's lifecycle events into aia_daily_metrics.
 */

import { BaseScheduler, SchedulerRegistry, type SchedulerExecutionResult } from '@aiponge/platform-core';
import { ComputeDailyMetricsUseCase } from '../../application/use-cases/lifecycle/ComputeDailyMetricsUseCase';
import { LifecycleRepository } from '../repositories/LifecycleRepository';
import { getDatabase } from '../database/DatabaseConnectionFactory';

export class DailyMetricsScheduler extends BaseScheduler {
  get name(): string {
    return 'daily-metrics-aggregation';
  }

  get serviceName(): string {
    return 'ai-analytics-service';
  }

  constructor() {
    super({
      cronExpression: '0 2 * * *', // 2 AM daily
      enabled: true,
      maxRetries: 2,
      timeoutMs: 300000, // 5 minutes
    });
    this.initLogger();
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const db = getDatabase();
    const repository = new LifecycleRepository(db);
    const useCase = new ComputeDailyMetricsUseCase(repository);

    const result = await useCase.execute(yesterday);

    return {
      success: true,
      message: `Computed ${result.rowsComputed} daily metric rows for ${yesterday.toISOString().split('T')[0]}`,
      data: { date: yesterday.toISOString().split('T')[0], rowsComputed: result.rowsComputed },
      durationMs: 0,
    };
  }
}

export const dailyMetricsScheduler = new DailyMetricsScheduler();
SchedulerRegistry.register(dailyMetricsScheduler);
