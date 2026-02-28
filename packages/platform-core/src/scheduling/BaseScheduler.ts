/**
 * BaseScheduler - Abstract base class for all scheduled jobs
 * Provides shared start/stop/status/health logic for all microservices
 */

import * as cron from 'node-cron';
import { getLogger, Logger } from '../logging';
import type { SchedulerStatus, SchedulerInfo, SchedulerExecutionResult, SchedulerConfig } from './types';
import { serializeError } from '../logging/error-serializer.js';

export abstract class BaseScheduler {
  protected task: cron.ScheduledTask | null = null;
  protected logger: Logger;
  protected status: SchedulerStatus = 'stopped';

  protected lastRunAt: Date | null = null;
  protected lastRunDurationMs: number | null = null;
  protected lastRunSuccess: boolean | null = null;
  protected runCount = 0;
  protected errorCount = 0;

  protected config: SchedulerConfig;
  private startedAt: number = 0;

  constructor(config: SchedulerConfig) {
    this.config = {
      enabled: true,
      runOnStart: false,
      maxRetries: 0,
      retryDelayMs: 1000,
      timeoutMs: 300000,
      initialDelayMs: 0,
      ...config,
    };
    this.logger = getLogger('scheduler');
  }

  protected initLogger(): void {
    this.logger = getLogger(`scheduler-${this.name}`);
  }

  abstract get name(): string;

  abstract get serviceName(): string;

  protected abstract execute(): Promise<SchedulerExecutionResult>;

  get cronExpression(): string {
    return this.config.cronExpression;
  }

  start(): void {
    if (this.task || this.status === 'running') {
      this.logger.warn(`[${this.name}] Already running, skipping start`);
      return;
    }

    if (!this.config.enabled) {
      this.logger.info(`[${this.name}] Disabled, not starting`);
      return;
    }

    if (!cron.validate(this.config.cronExpression)) {
      this.logger.error(`[${this.name}] Invalid cron expression: ${this.config.cronExpression}`);
      return;
    }

    this.startedAt = Date.now();

    this.task = cron.schedule(this.config.cronExpression, () => {
      const elapsedMs = Date.now() - this.startedAt;
      if (this.config.initialDelayMs && elapsedMs < this.config.initialDelayMs) {
        this.logger.debug(`[${this.name}] Skipping execution during initial delay period`, {
          elapsedMs,
          initialDelayMs: this.config.initialDelayMs,
        });
        return;
      }
      void this.runWithErrorHandling();
    });

    void this.task.start();
    this.status = 'running';

    this.logger.debug(`[${this.name}] Scheduler started`, {
      cronExpression: this.config.cronExpression,
    });

    if (this.config.runOnStart) {
      this.triggerNow().catch(err => {
        this.logger.error(`[${this.name}] Initial run failed`, { error: err });
      });
    }
  }

  stop(): void {
    if (!this.task) {
      this.logger.debug(`[${this.name}] Already stopped`);
      return;
    }

    void this.task.stop();
    this.task = null;
    this.status = 'stopped';
    this.logger.info(`[${this.name}] Scheduler stopped`);
  }

  pause(): void {
    if (this.task) {
      void this.task.stop();
      this.status = 'paused';
      this.logger.info(`[${this.name}] Scheduler paused`);
    }
  }

  resume(): void {
    if (this.task && this.status === 'paused') {
      void this.task.start();
      this.status = 'running';
      this.logger.info(`[${this.name}] Scheduler resumed`);
    }
  }

  async triggerNow(): Promise<SchedulerExecutionResult> {
    this.logger.info(`[${this.name}] Manual trigger requested`);
    return this.runWithErrorHandling();
  }

  private static readonly SLOW_THRESHOLD_MS = 5000;
  private static readonly SUMMARY_INTERVAL_RUNS = 300;
  private totalDurationMs = 0;
  private maxDurationMs = 0;
  private durationSamples: number[] = [];

  private handleSuccessfulExecution(result: SchedulerExecutionResult, startTime: number): SchedulerExecutionResult {
    this.lastRunDurationMs = Date.now() - startTime;
    this.lastRunSuccess = true;
    this.totalDurationMs += this.lastRunDurationMs;
    if (this.lastRunDurationMs > this.maxDurationMs) {
      this.maxDurationMs = this.lastRunDurationMs;
    }
    this.durationSamples.push(this.lastRunDurationMs);
    if (this.durationSamples.length > BaseScheduler.SUMMARY_INTERVAL_RUNS) {
      this.durationSamples.shift();
    }

    if (this.lastRunDurationMs > BaseScheduler.SLOW_THRESHOLD_MS) {
      this.logger.warn(`[${this.name}] Slow execution`, {
        durationMs: this.lastRunDurationMs,
        runCount: this.runCount,
        threshold: BaseScheduler.SLOW_THRESHOLD_MS,
      });
    } else if (this.runCount % BaseScheduler.SUMMARY_INTERVAL_RUNS === 0) {
      const sorted = [...this.durationSamples].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      this.logger.info(`[${this.name}] ok`, {
        runs: this.runCount,
        errors: this.errorCount,
        avgMs: Math.round(this.totalDurationMs / this.runCount),
        p95Ms: sorted[p95Index] ?? 0,
        maxMs: this.maxDurationMs,
      });
    } else {
      this.logger.debug(`[${this.name}] Execution completed`, {
        durationMs: this.lastRunDurationMs,
        runCount: this.runCount,
      });
    }
    return { ...result, durationMs: this.lastRunDurationMs };
  }

  private handleFailedExecution(
    result: SchedulerExecutionResult,
    attempt: number,
    maxAttempts: number,
    startTime: number
  ): void {
    this.lastRunDurationMs = Date.now() - startTime;
    this.lastRunSuccess = false;
    this.logger.warn(`[${this.name}] Execution failed`, {
      message: result.message,
      attempt,
      maxAttempts,
    });
  }

  private handleExecutionError(
    error: unknown,
    attempt: number,
    maxAttempts: number,
    startTime: number
  ): SchedulerExecutionResult | null {
    this.lastRunDurationMs = Date.now() - startTime;
    this.lastRunSuccess = false;
    this.errorCount++;

    this.logger.error(`[${this.name}] Execution error`, {
      error: serializeError(error),
      attempt,
      maxAttempts,
      durationMs: this.lastRunDurationMs,
    });

    if (attempt >= maxAttempts) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: errorMessage,
        durationMs: this.lastRunDurationMs,
      };
    }

    return null;
  }

  private async runWithErrorHandling(): Promise<SchedulerExecutionResult> {
    const startTime = Date.now();
    this.lastRunAt = new Date();
    this.runCount++;

    let attempt = 0;
    const maxAttempts = (this.config.maxRetries || 0) + 1;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const result = await this.executeWithTimeout();
        this.lastRunDurationMs = Date.now() - startTime;
        this.lastRunSuccess = result.success;

        if (result.success) {
          return this.handleSuccessfulExecution(result, startTime);
        } else {
          this.handleFailedExecution(result, attempt, maxAttempts, startTime);
          if (attempt < maxAttempts) {
            await this.sleep(this.config.retryDelayMs || 1000);
          }
        }
      } catch (error) {
        const errorResult = this.handleExecutionError(error, attempt, maxAttempts, startTime);
        if (errorResult) return errorResult;
        await this.sleep(this.config.retryDelayMs || 1000);
      }
    }

    return {
      success: false,
      message: 'Max retries exceeded',
      durationMs: Date.now() - startTime,
    };
  }

  private async executeWithTimeout(): Promise<SchedulerExecutionResult> {
    const timeoutMs = this.config.timeoutMs || 300000;
    const startTime = Date.now();

    return Promise.race([
      this.execute(),
      new Promise<SchedulerExecutionResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]).then(result => ({
      ...result,
      durationMs: Date.now() - startTime,
    }));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus(): SchedulerStatus {
    return this.status;
  }

  getInfo(): SchedulerInfo {
    return {
      name: this.name,
      cronExpression: this.config.cronExpression,
      status: this.status,
      lastRunAt: this.lastRunAt,
      lastRunDurationMs: this.lastRunDurationMs,
      lastRunSuccess: this.lastRunSuccess,
      nextRunAt: this.getNextRunTime(),
      runCount: this.runCount,
      errorCount: this.errorCount,
      serviceName: this.serviceName,
    };
  }

  isHealthy(): boolean {
    if (this.status !== 'running') return true;
    if (this.runCount === 0) return true;
    const errorRate = this.errorCount / this.runCount;
    return errorRate < 0.5;
  }

  private getNextRunTime(): Date | null {
    if (!this.task || this.status !== 'running') return null;
    try {
      const interval = cron.schedule(this.config.cronExpression, () => {});
      void interval.stop();
      return new Date();
    } catch {
      return null;
    }
  }
}
