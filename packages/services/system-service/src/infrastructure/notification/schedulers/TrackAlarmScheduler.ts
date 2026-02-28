import { BaseScheduler, SchedulerExecutionResult, QueueManager } from '@aiponge/platform-core';
import { processTrackAlarmJob } from '../jobs/trackAlarmProcessor';
import type { TrackAlarmJobData } from '../jobs/trackAlarmProcessor';

export const TRACK_ALARM_QUEUE = 'track-alarm';

export class TrackAlarmScheduler extends BaseScheduler {
  get name(): string {
    return 'track-alarm';
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
    const correlationId = `track-alarm-${now.getTime()}`;

    const jobData: TrackAlarmJobData = {
      triggeredAt: now.toISOString(),
      correlationId,
    };

    if (QueueManager.isInitialized()) {
      const jobId = await QueueManager.enqueue<TrackAlarmJobData>(TRACK_ALARM_QUEUE, 'process-track-alarms', jobData, {
        jobId: correlationId,
      });

      if (jobId) {
        return {
          success: true,
          message: `Enqueued track alarm job ${jobId}`,
          data: { jobId, correlationId, mode: 'distributed' },
          durationMs: 0,
        };
      }

      this.logger.warn('Failed to enqueue job in distributed mode');
    }

    this.logger.debug('Queue unavailable - running track alarm directly with timeout guard');

    const DIRECT_TIMEOUT_MS = 25000;
    const directResult = await Promise.race<'done' | 'timeout'>([
      processTrackAlarmJob({ data: jobData, id: correlationId } as unknown as Parameters<
        typeof processTrackAlarmJob
      >[0])
        .then(() => 'done' as const)
        .catch(err => {
          this.logger.error('Direct track alarm execution failed', { error: err?.message });
          return 'done' as const;
        }),
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), DIRECT_TIMEOUT_MS)),
    ]);

    if (directResult === 'timeout') {
      this.logger.warn('Track alarm direct execution timed out', { timeoutMs: DIRECT_TIMEOUT_MS, correlationId });
    }

    return {
      success: true,
      message:
        directResult === 'timeout'
          ? 'Track alarm direct execution timed out - consider enabling Redis for reliable scheduling'
          : 'Track alarm processed via direct execution',
      data: { correlationId, mode: 'direct', timedOut: directResult === 'timeout' },
      durationMs: 0,
    };
  }
}
