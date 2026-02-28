import { BaseScheduler, SchedulerExecutionResult, SchedulerRegistry } from '@aiponge/platform-core';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { BookGenerationRepository } from '../repositories/BookGenerationRepository';

const STALE_THRESHOLD_MINUTES = 10;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_MINUTES * 60 * 1000;

export class StaleBookGenerationCleanupScheduler extends BaseScheduler {
  get name(): string {
    return 'stale-book-generation-cleanup';
  }

  get serviceName(): string {
    return 'user-service';
  }

  constructor() {
    super({
      cronExpression: '*/5 * * * *',
      enabled: true,
      maxRetries: 1,
      timeoutMs: 30000,
    });
    this.initLogger();
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const db = getDatabase();
    const bookGenRepo = new BookGenerationRepository(db);
    const failedCount = await bookGenRepo.failStaleRequests(STALE_THRESHOLD_MS);

    return {
      success: true,
      message:
        failedCount > 0
          ? `Cleaned up ${failedCount} stale book generation request(s) older than ${STALE_THRESHOLD_MINUTES} minutes`
          : 'No stale book generation requests found',
      data: { failedCount, thresholdMinutes: STALE_THRESHOLD_MINUTES },
      durationMs: 0,
      noOp: failedCount === 0,
    };
  }
}

export const staleBookGenerationCleanupScheduler = new StaleBookGenerationCleanupScheduler();
SchedulerRegistry.register(staleBookGenerationCleanupScheduler);
