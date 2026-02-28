import { MonitoringError } from '../../../application/errors';

export type HealthCheckStatus = 'healthy' | 'degraded' | 'unhealthy';
export type HealthCheckType = 'http' | 'tcp' | 'llm_api' | 's3';

export interface HealthCheck {
  id: string;
  serviceName: string;
  checkType: HealthCheckType;
  endpoint: string;
  intervalSeconds: number;
  timeoutMs: number;
  isEnabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface HealthCheckResult {
  serviceName: string;
  checkType: HealthCheckType;
  status: HealthCheckStatus;
  responseTimeMs: number;
  timestamp: Date;
  endpoint: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface HealthCheckConfig {
  timeoutMs?: number;
  retryAttempts?: number;
  expectedStatusCode?: number;
  degradedThresholdMs?: number;
  customHeaders?: Record<string, string>;
}

export class HealthCheckEntity {
  constructor(private healthCheck: HealthCheck) {}

  get id(): string {
    return this.healthCheck.id;
  }

  get serviceName(): string {
    return this.healthCheck.serviceName;
  }

  get checkType(): HealthCheckType {
    return this.healthCheck.checkType;
  }

  get endpoint(): string {
    return this.healthCheck.endpoint;
  }

  get intervalSeconds(): number {
    return this.healthCheck.intervalSeconds;
  }

  get timeoutMs(): number {
    return this.healthCheck.timeoutMs;
  }

  get isEnabled(): boolean {
    return this.healthCheck.isEnabled;
  }

  get metadata(): Record<string, unknown> | undefined {
    return this.healthCheck.metadata;
  }

  get createdAt(): Date {
    return this.healthCheck.createdAt;
  }

  get updatedAt(): Date {
    return this.healthCheck.updatedAt;
  }

  isOverdue(lastExecutionTime?: Date): boolean {
    if (!lastExecutionTime) {
      return true;
    }

    const now = new Date();
    const expectedNextExecution = new Date(lastExecutionTime.getTime() + this.intervalSeconds * 1000);

    return now >= expectedNextExecution;
  }

  shouldRetry(attemptCount: number, maxRetries: number = 3): boolean {
    return this.isEnabled && attemptCount < maxRetries;
  }

  disable(): HealthCheck {
    return {
      ...this.healthCheck,
      isEnabled: false,
      updatedAt: new Date(),
    };
  }

  enable(): HealthCheck {
    return {
      ...this.healthCheck,
      isEnabled: true,
      updatedAt: new Date(),
    };
  }

  updateInterval(intervalSeconds: number): HealthCheck {
    if (intervalSeconds < 10) {
      throw MonitoringError.validationError('intervalSeconds', 'Health check interval must be at least 10 seconds');
    }

    return {
      ...this.healthCheck,
      intervalSeconds,
      updatedAt: new Date(),
    };
  }

  updateTimeout(timeoutMs: number): HealthCheck {
    if (timeoutMs < 100) {
      throw MonitoringError.validationError('timeoutMs', 'Health check timeout must be at least 100ms');
    }

    return {
      ...this.healthCheck,
      timeoutMs,
      updatedAt: new Date(),
    };
  }
}
