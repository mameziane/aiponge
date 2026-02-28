/**
 * Monitoring Job Entity
 */

import crypto from 'crypto';
import { MONITORING_JOB_STATUS, type MonitoringJobStatusValue } from '@aiponge/shared-contracts';

export interface MonitoringJobProps {
  id: string;
  serviceName: string;
  jobType: 'health_check' | 'performance' | 'availability' | 'custom';
  status: MonitoringJobStatusValue;
  schedule: string; // cron expression
  config: Record<string, unknown>;
  lastRun?: Date;
  nextRun?: Date;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
}

export class MonitoringJob {
  constructor(private props: MonitoringJobProps) {}

  static create(props: Omit<MonitoringJobProps, 'id' | 'retryCount' | 'createdAt' | 'updatedAt'>): MonitoringJob {
    return new MonitoringJob({
      ...props,
      id: crypto.randomUUID(),
      retryCount: 0,
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
  get jobType(): 'health_check' | 'performance' | 'availability' | 'custom' {
    return this.props.jobType;
  }
  get status(): MonitoringJobStatusValue {
    return this.props.status;
  }
  get schedule(): string {
    return this.props.schedule;
  }
  get config(): Record<string, unknown> {
    return this.props.config;
  }
  get lastRun(): Date | undefined {
    return this.props.lastRun;
  }
  get nextRun(): Date | undefined {
    return this.props.nextRun;
  }
  get retryCount(): number {
    return this.props.retryCount;
  }
  get maxRetries(): number {
    return this.props.maxRetries;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  start(): void {
    this.props.status = MONITORING_JOB_STATUS.ACTIVE;
    this.props.updatedAt = new Date();
  }

  pause(): void {
    this.props.status = MONITORING_JOB_STATUS.PAUSED;
    this.props.updatedAt = new Date();
  }

  complete(): void {
    this.props.status = MONITORING_JOB_STATUS.COMPLETED;
    this.props.updatedAt = new Date();
  }

  fail(): void {
    this.props.status = MONITORING_JOB_STATUS.FAILED;
    this.props.retryCount += 1;
    this.props.updatedAt = new Date();
  }

  updateLastRun(timestamp: Date): void {
    this.props.lastRun = timestamp;
    this.props.updatedAt = new Date();
  }

  updateNextRun(timestamp: Date): void {
    this.props.nextRun = timestamp;
    this.props.updatedAt = new Date();
  }

  canRetry(): boolean {
    return this.props.retryCount < this.props.maxRetries;
  }

  toJSON(): MonitoringJobProps {
    return { ...this.props };
  }
}
