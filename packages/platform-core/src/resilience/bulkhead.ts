import { DomainError } from '../error-handling/errors.js';
import type { BulkheadConfig } from './types.js';
import { parsePositiveInt } from './env-utils.js';

export const DEFAULT_BULKHEAD_CONFIG: Required<BulkheadConfig> = {
  maxConcurrent: parsePositiveInt('BULKHEAD_MAX_CONCURRENT', 10, 1),
  maxQueue: parsePositiveInt('BULKHEAD_MAX_QUEUE', 100, 1),
};

export class Bulkhead {
  private running = 0;
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  constructor(private config: Required<BulkheadConfig>) {}

  async acquire(): Promise<void> {
    if (this.running < this.config.maxConcurrent) {
      this.running++;
      return;
    }

    if (this.queue.length >= this.config.maxQueue) {
      throw new DomainError('Bulkhead queue full - request rejected', 503);
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next.resolve();
    }
  }

  getStats() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.config.maxConcurrent,
      maxQueue: this.config.maxQueue,
    };
  }
}
