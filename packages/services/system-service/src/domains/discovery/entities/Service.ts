/**
 * Service Discovery Domain Layer - Service Entity
 * Core business entity representing a discovered service
 */

import crypto from 'crypto';
import { HEALTH_STATUS, type HealthStatusValue } from '@aiponge/shared-contracts';

export type ServiceHealthStatus =
  | typeof HEALTH_STATUS.HEALTHY
  | typeof HEALTH_STATUS.UNHEALTHY
  | typeof HEALTH_STATUS.UNKNOWN
  | typeof HEALTH_STATUS.DOWN;

export interface ServiceCapabilities {
  endpoints: string[];
  healthCheckUrl: string;
  version: string;
  protocols: string[];
  dependencies: string[];
}

export interface ServiceMetrics {
  uptime: number;
  responseTime: number;
  errorRate: number;
  requestCount: number;
  lastHealthCheck: Date;
}

export class Service {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly host: string,
    public readonly port: number,
    public readonly status: ServiceHealthStatus,
    public readonly capabilities: ServiceCapabilities,
    public readonly metrics: ServiceMetrics,
    public readonly registeredAt: Date,
    public readonly lastSeen: Date,
    public readonly tags: string[] = [],
    public readonly metadata: Record<string, unknown> = {}
  ) {}

  static create(
    name: string,
    host: string,
    port: number,
    capabilities: ServiceCapabilities,
    tags: string[] = [],
    metadata: Record<string, unknown> = {}
  ): Service {
    const id = crypto.randomUUID(); // Generate proper UUID
    const now = new Date();

    return new Service(
      id,
      name,
      host,
      port,
      HEALTH_STATUS.UNKNOWN,
      capabilities,
      {
        uptime: 0,
        responseTime: 0,
        errorRate: 0,
        requestCount: 0,
        lastHealthCheck: now,
      },
      now,
      now,
      tags,
      metadata
    );
  }

  updateStatus(status: ServiceHealthStatus): Service {
    return new Service(
      this.id,
      this.name,
      this.host,
      this.port,
      status,
      this.capabilities,
      {
        ...this.metrics,
        lastHealthCheck: new Date(),
      },
      this.registeredAt,
      new Date(),
      this.tags,
      this.metadata
    );
  }

  updateMetrics(metrics: Partial<ServiceMetrics>): Service {
    return new Service(
      this.id,
      this.name,
      this.host,
      this.port,
      this.status,
      this.capabilities,
      {
        ...this.metrics,
        ...metrics,
        lastHealthCheck: new Date(),
      },
      this.registeredAt,
      new Date(),
      this.tags,
      this.metadata
    );
  }

  isHealthy(): boolean {
    return this.status === HEALTH_STATUS.HEALTHY;
  }

  getFullUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  getHealthCheckUrl(): string {
    return `${this.getFullUrl()}${this.capabilities.healthCheckUrl}`;
  }

  hasTag(tag: string): boolean {
    return this.tags.includes(tag);
  }

  addTag(tag: string): Service {
    if (this.hasTag(tag)) return this;

    return new Service(
      this.id,
      this.name,
      this.host,
      this.port,
      this.status,
      this.capabilities,
      this.metrics,
      this.registeredAt,
      this.lastSeen,
      [...this.tags, tag],
      this.metadata
    );
  }

  removeTag(tag: string): Service {
    return new Service(
      this.id,
      this.name,
      this.host,
      this.port,
      this.status,
      this.capabilities,
      this.metrics,
      this.registeredAt,
      this.lastSeen,
      this.tags.filter(t => t !== tag),
      this.metadata
    );
  }
}
