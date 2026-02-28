import { BaseScheduler, SchedulerExecutionResult, QueueManager } from '@aiponge/platform-core';
import { processBookReminderJob } from '../jobs/bookReminderProcessor';
import type { BookReminderJobData } from '../jobs/bookReminderProcessor';

export const BOOK_REMINDER_QUEUE = 'book-reminder';

export class BookReminderScheduler extends BaseScheduler {
  get name(): string {
    return 'book-reminder';
  }

  get serviceName(): string {
    return 'system-service';
  }

  constructor() {
    super({
      cronExpression: '* * * * *',
      enabled: true,
      maxRetries: 0,
      timeoutMs: 55000,
      initialDelayMs: 60_000,
    });
    this.initLogger();
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const now = new Date();
    const correlationId = `book-reminder-${now.getTime()}`;

    const jobData: BookReminderJobData = {
      triggeredAt: now.toISOString(),
      correlationId,
    };

    if (QueueManager.isInitialized()) {
      const jobId = await QueueManager.enqueue<BookReminderJobData>(
        BOOK_REMINDER_QUEUE,
        'process-book-reminders',
        jobData,
        { jobId: correlationId }
      );

      if (jobId) {
        return {
          success: true,
          message: `Enqueued book reminder job ${jobId}`,
          data: { jobId, correlationId, mode: 'distributed' },
          durationMs: 0,
        };
      }

      this.logger.warn('Failed to enqueue job in distributed mode');
    }

    this.logger.debug('Queue unavailable - running book reminder directly with timeout guard');

    const DIRECT_TIMEOUT_MS = 25000;
    const directResult = await Promise.race<'done' | 'timeout'>([
      processBookReminderJob({ data: jobData, id: correlationId } as unknown as Parameters<
        typeof processBookReminderJob
      >[0])
        .then(() => 'done' as const)
        .catch(err => {
          this.logger.error('Direct book reminder execution failed', { error: err?.message });
          return 'done' as const;
        }),
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), DIRECT_TIMEOUT_MS)),
    ]);

    if (directResult === 'timeout') {
      this.logger.warn('Book reminder direct execution timed out', { timeoutMs: DIRECT_TIMEOUT_MS, correlationId });
    }

    return {
      success: true,
      message:
        directResult === 'timeout'
          ? 'Book reminder direct execution timed out - consider enabling Redis for reliable scheduling'
          : 'Book reminder processed via direct execution',
      data: { correlationId, mode: 'direct', timedOut: directResult === 'timeout' },
      durationMs: 0,
    };
  }
}
