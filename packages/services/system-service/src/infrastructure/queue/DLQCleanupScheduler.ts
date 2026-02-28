import { BaseScheduler, SchedulerExecutionResult } from '@aiponge/platform-core';
import { dlqService } from './DLQService';

const RESOLVED_RETENTION_DAYS = parseInt(process.env.DLQ_RESOLVED_RETENTION_DAYS || '7', 10);
const FAILED_RETENTION_DAYS = parseInt(process.env.DLQ_FAILED_RETENTION_DAYS || '30', 10);

export class DLQCleanupScheduler extends BaseScheduler {
  get name(): string {
    return 'dlq-cleanup';
  }

  get serviceName(): string {
    return 'system-service';
  }

  constructor() {
    super({
      cronExpression: '0 3 * * *',
      enabled: true,
      maxRetries: 0,
      timeoutMs: 30000,
    });
    this.initLogger();
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const resolvedDeleted = await dlqService.cleanupResolved(RESOLVED_RETENTION_DAYS);
    const failedDeleted = await dlqService.cleanupFailed(FAILED_RETENTION_DAYS);
    const totalDeleted = resolvedDeleted + failedDeleted;

    return {
      success: true,
      message: `DLQ cleanup completed: ${resolvedDeleted} resolved (>${RESOLVED_RETENTION_DAYS}d), ${failedDeleted} failed (>${FAILED_RETENTION_DAYS}d) entries removed`,
      data: {
        resolvedDeleted,
        failedDeleted,
        resolvedRetentionDays: RESOLVED_RETENTION_DAYS,
        failedRetentionDays: FAILED_RETENTION_DAYS,
      },
      durationMs: 0,
      noOp: totalDeleted === 0,
    };
  }
}
