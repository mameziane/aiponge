/**
 * Dormancy Detection Scheduler
 * Runs at 3 AM daily — flags users with no session in the last 14 days.
 */

import {
  BaseScheduler,
  SchedulerRegistry,
  createEventBusClient,
  type SchedulerExecutionResult,
} from '@aiponge/platform-core';
import {
  USER_LIFECYCLE_CHANNEL,
  createUserLifecycleEvent,
  USER_LIFECYCLE_EVENT_TYPES,
} from '@aiponge/shared-contracts';
import { LifecycleRepository } from '../repositories/LifecycleRepository';
import { getDatabase } from '../database/DatabaseConnectionFactory';

const INACTIVITY_DAYS = 14;

export class DormancyDetectionScheduler extends BaseScheduler {
  get name(): string {
    return 'dormancy-detection';
  }

  get serviceName(): string {
    return 'ai-analytics-service';
  }

  constructor() {
    super({
      cronExpression: '0 3 * * *', // 3 AM daily
      enabled: true,
      maxRetries: 1,
      timeoutMs: 300000, // 5 minutes
    });
    this.initLogger();
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const db = getDatabase();
    const repository = new LifecycleRepository(db);

    const dormantUserIds = await repository.getDormantUsers(INACTIVITY_DAYS, true);

    if (dormantUserIds.length === 0) {
      return {
        success: true,
        message: 'No new dormant users detected',
        data: { flagged: 0 },
        durationMs: 0,
        noOp: true,
      };
    }

    // Record dormant events directly (don't emit to event bus to avoid circular dependency)
    const { RecordLifecycleEventUseCase } =
      await import('../../application/use-cases/lifecycle/RecordLifecycleEventUseCase');
    const recordUseCase = new RecordLifecycleEventUseCase(repository);

    let flagged = 0;
    for (const userId of dormantUserIds) {
      try {
        await recordUseCase.execute({
          eventType: USER_LIFECYCLE_EVENT_TYPES.DORMANT_FLAGGED,
          userId,
          metadata: { daysSinceLastSession: INACTIVITY_DAYS },
          correlationId: `dormancy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          source: 'ai-analytics-service',
        });
        flagged++;
      } catch {
        // Non-blocking: continue flagging others
      }
    }

    return {
      success: true,
      message: `Flagged ${flagged} dormant users (${dormantUserIds.length} detected)`,
      data: { detected: dormantUserIds.length, flagged },
      durationMs: 0,
    };
  }
}

export const dormancyDetectionScheduler = new DormancyDetectionScheduler();
SchedulerRegistry.register(dormancyDetectionScheduler);
