/**
 * Cohort Snapshot Scheduler
 * Runs at 4 AM on the 1st of each month — computes cohort retention for previous month.
 */

import { BaseScheduler, SchedulerRegistry, type SchedulerExecutionResult } from '@aiponge/platform-core';
import { ComputeCohortSnapshotUseCase } from '../../application/use-cases/lifecycle/ComputeCohortSnapshotUseCase';
import { LifecycleRepository } from '../repositories/LifecycleRepository';
import { getDatabase } from '../database/DatabaseConnectionFactory';

export class CohortSnapshotScheduler extends BaseScheduler {
  get name(): string {
    return 'cohort-snapshot-computation';
  }

  get serviceName(): string {
    return 'ai-analytics-service';
  }

  constructor() {
    super({
      cronExpression: '0 4 1 * *', // 4 AM on the 1st of each month
      enabled: true,
      maxRetries: 2,
      timeoutMs: 600000, // 10 minutes (cohort computation can be heavy)
    });
    this.initLogger();
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const previousMonth = new Date();
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    previousMonth.setDate(1);

    const db = getDatabase();
    const repository = new LifecycleRepository(db);
    const useCase = new ComputeCohortSnapshotUseCase(repository);

    const result = await useCase.execute(previousMonth);

    return {
      success: true,
      message: `Processed ${result.cohortsProcessed} cohorts for ${previousMonth.toISOString().split('T')[0]}`,
      data: { targetMonth: previousMonth.toISOString().split('T')[0], cohortsProcessed: result.cohortsProcessed },
      durationMs: 0,
    };
  }
}

export const cohortSnapshotScheduler = new CohortSnapshotScheduler();
SchedulerRegistry.register(cohortSnapshotScheduler);
