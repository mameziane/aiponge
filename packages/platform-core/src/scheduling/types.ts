/**
 * Centralized Scheduler Types
 * Shared types for all scheduled jobs across microservices
 */

export type SchedulerStatus = 'stopped' | 'running' | 'paused';

export interface SchedulerInfo {
  name: string;
  cronExpression: string;
  status: SchedulerStatus;
  lastRunAt: Date | null;
  lastRunDurationMs: number | null;
  lastRunSuccess: boolean | null;
  nextRunAt: Date | null;
  runCount: number;
  errorCount: number;
  serviceName: string;
}

export interface SchedulerExecutionResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
  durationMs: number;
  noOp?: boolean;
}

export interface SchedulerHealthReport {
  healthy: boolean;
  schedulers: SchedulerInfo[];
  totalSchedulers: number;
  runningCount: number;
  errorRate: number;
}

export interface SchedulerConfig {
  cronExpression: string;
  enabled?: boolean;
  runOnStart?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  initialDelayMs?: number;
}
