/**
 * Orchestration Session Timeout Scheduler
 * Runs every 5 minutes. Marks sessions stuck in non-terminal states
 * for > 30 minutes as 'failed' with a timeout reason.
 */

import { BaseScheduler, SchedulerExecutionResult, SchedulerRegistry } from '@aiponge/platform-core';
import { eq, and, isNull, lt, notInArray } from 'drizzle-orm';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { orchestrationSessions } from '../../schema/orchestration-session-schema';

const SESSION_TIMEOUT_MINUTES = 30;
// Only truly terminal states — confirmed sessions can still be stuck in the pipeline
const TERMINAL_STATES = ['cancelled', 'failed'];

export class OrchestrationSessionTimeoutScheduler extends BaseScheduler {
  get name(): string {
    return 'orchestration-session-timeout';
  }

  get serviceName(): string {
    return 'ai-content-service';
  }

  constructor() {
    super({
      cronExpression: '*/5 * * * *',
      enabled: true,
      maxRetries: 1,
      timeoutMs: 30000,
      initialDelayMs: 60000, // Wait 1 min after service start
    });
    this.initLogger();
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const db = getDatabase();
    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MINUTES * 60 * 1000);

    const timedOut = await db
      .update(orchestrationSessions)
      .set({
        status: 'failed',
        updatedAt: new Date(),
        metadata: { timeoutReason: `Session timed out after ${SESSION_TIMEOUT_MINUTES} minutes of inactivity` },
      })
      .where(
        and(
          isNull(orchestrationSessions.deletedAt),
          notInArray(orchestrationSessions.status, TERMINAL_STATES),
          lt(orchestrationSessions.updatedAt, cutoff)
        )
      )
      .returning({ id: orchestrationSessions.id });

    const count = timedOut.length;

    if (count > 0) {
      this.logger.info(`Timed out ${count} stale orchestration session(s)`, {
        count,
        thresholdMinutes: SESSION_TIMEOUT_MINUTES,
        sessionIds: timedOut.map(s => s.id),
      });
    }

    return {
      success: true,
      message:
        count > 0
          ? `Timed out ${count} orchestration session(s) older than ${SESSION_TIMEOUT_MINUTES} minutes`
          : 'No stale orchestration sessions found',
      data: { timedOutCount: count, thresholdMinutes: SESSION_TIMEOUT_MINUTES },
      durationMs: 0,
      noOp: count === 0,
    };
  }
}

export const orchestrationSessionTimeoutScheduler = new OrchestrationSessionTimeoutScheduler();
SchedulerRegistry.register(orchestrationSessionTimeoutScheduler);
