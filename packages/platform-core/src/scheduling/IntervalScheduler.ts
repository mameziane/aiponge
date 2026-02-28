import { BaseScheduler } from './BaseScheduler';
import { SchedulerRegistry } from './SchedulerRegistry';
import type { SchedulerExecutionResult, SchedulerConfig } from './types';

export interface IntervalSchedulerOptions {
  name: string;
  serviceName: string;
  intervalMs: number;
  handler: () => void | Promise<void>;
  enabled?: boolean;
  runOnStart?: boolean;
  register?: boolean;
}

function msToCron(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `*/${seconds} * * * * *`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `*/${minutes} * * * *`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `0 */${hours} * * *`;
  }
  return '0 0 * * *';
}

export class IntervalScheduler extends BaseScheduler {
  private readonly _name: string;
  private readonly _serviceName: string;
  private readonly handler: () => void | Promise<void>;

  constructor(options: IntervalSchedulerOptions) {
    const cronExpression = msToCron(options.intervalMs);
    const config: SchedulerConfig = {
      cronExpression,
      enabled: options.enabled ?? true,
      runOnStart: options.runOnStart ?? false,
      maxRetries: 0,
      timeoutMs: Math.max(options.intervalMs * 0.9, 30000),
    };

    super(config);

    this._name = options.name;
    this._serviceName = options.serviceName;
    this.handler = options.handler;
    this.initLogger();

    if (options.register !== false) {
      SchedulerRegistry.register(this);
    }
  }

  get name(): string {
    return this._name;
  }

  get serviceName(): string {
    return this._serviceName;
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const startTime = Date.now();
    await this.handler();
    return {
      success: true,
      message: `${this._name} completed`,
      durationMs: Date.now() - startTime,
    };
  }
}

export function createIntervalScheduler(options: IntervalSchedulerOptions): IntervalScheduler {
  return new IntervalScheduler(options);
}
