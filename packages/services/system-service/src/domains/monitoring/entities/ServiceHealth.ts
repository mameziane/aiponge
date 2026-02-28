/**
 * Service Health Entity
 */

import { HEALTH_STATUS } from '@aiponge/shared-contracts';
import crypto from 'crypto';

export type MonitoringHealthStatus =
  | typeof HEALTH_STATUS.HEALTHY
  | typeof HEALTH_STATUS.UNHEALTHY
  | typeof HEALTH_STATUS.WARNING
  | typeof HEALTH_STATUS.UNKNOWN;

export interface ServiceHealthProps {
  id: string;
  serviceName: string;
  status: MonitoringHealthStatus;
  responseTime: number;
  errorRate: number;
  uptime: number;
  lastCheck: Date;
  version?: string;
  metadata?: Record<string, unknown>;
  checks: HealthCheckResult[];
  createdAt: Date;
  updatedAt: Date;
}

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  value?: unknown;
  unit?: string;
  message?: string;
  timestamp: Date;
}

export class ServiceHealth {
  constructor(private props: ServiceHealthProps) {}

  static create(props: Omit<ServiceHealthProps, 'id' | 'createdAt' | 'updatedAt'>): ServiceHealth {
    return new ServiceHealth({
      ...props,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  get id(): string {
    return this.props.id;
  }
  get serviceName(): string {
    return this.props.serviceName;
  }
  get status(): MonitoringHealthStatus {
    return this.props.status;
  }
  get responseTime(): number {
    return this.props.responseTime;
  }
  get errorRate(): number {
    return this.props.errorRate;
  }
  get uptime(): number {
    return this.props.uptime;
  }
  get lastCheck(): Date {
    return this.props.lastCheck;
  }
  get version(): string | undefined {
    return this.props.version;
  }
  get metadata(): Record<string, unknown> | undefined {
    return this.props.metadata;
  }
  get checks(): HealthCheckResult[] {
    return this.props.checks;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  updateStatus(status: MonitoringHealthStatus): void {
    this.props.status = status;
    this.props.lastCheck = new Date();
    this.props.updatedAt = new Date();
  }

  updateResponseTime(responseTime: number): void {
    this.props.responseTime = responseTime;
    this.props.updatedAt = new Date();
  }

  updateErrorRate(errorRate: number): void {
    this.props.errorRate = errorRate;
    this.props.updatedAt = new Date();
  }

  addCheck(check: HealthCheckResult): void {
    this.props.checks.push(check);
    this.props.updatedAt = new Date();
  }

  updateUptime(uptime: number): void {
    this.props.uptime = uptime;
    this.props.updatedAt = new Date();
  }

  isHealthy(): boolean {
    return this.props.status === HEALTH_STATUS.HEALTHY;
  }

  hasWarnings(): boolean {
    return this.props.checks.some(check => check.status === 'warn');
  }

  hasFailures(): boolean {
    return this.props.checks.some(check => check.status === 'fail');
  }

  toJSON(): ServiceHealthProps {
    return { ...this.props };
  }
}
