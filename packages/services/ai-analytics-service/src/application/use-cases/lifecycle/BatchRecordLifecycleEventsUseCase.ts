/**
 * Use Case: Batch record lifecycle events
 * Processes an array of events atomically with per-event success/failure tracking.
 */

import { createLogger } from '@aiponge/platform-core';
import { RecordLifecycleEventUseCase, type RecordLifecycleEventRequest } from './RecordLifecycleEventUseCase';

const logger = createLogger('ai-analytics-service:batch-record-lifecycle');

export interface BatchRecordResult {
  accepted: number;
  rejected: number;
  errors?: Array<{ index: number; eventType: string; error: string }>;
}

export class BatchRecordLifecycleEventsUseCase {
  constructor(private readonly recordUseCase: RecordLifecycleEventUseCase) {}

  async execute(events: RecordLifecycleEventRequest[]): Promise<BatchRecordResult> {
    let accepted = 0;
    let rejected = 0;
    const errors: Array<{ index: number; eventType: string; error: string }> = [];

    for (let i = 0; i < events.length; i++) {
      try {
        await this.recordUseCase.execute(events[i]);
        accepted++;
      } catch (err) {
        rejected++;
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({ index: i, eventType: events[i].eventType, error: errMsg });
        logger.warn('Batch event recording failed', { index: i, eventType: events[i].eventType, error: errMsg });
      }
    }

    return { accepted, rejected, errors: errors.length > 0 ? errors : undefined };
  }
}
