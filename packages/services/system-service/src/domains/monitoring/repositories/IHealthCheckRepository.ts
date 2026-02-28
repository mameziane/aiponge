import { HealthCheck, HealthCheckResult } from '../entities/HealthCheck';

export interface IHealthCheckRepository {
  // Health Check CRUD operations
  create(healthCheck: Omit<HealthCheck, 'id' | 'createdAt' | 'updatedAt'>): Promise<HealthCheck>;
  findById(id: string): Promise<HealthCheck | null>;
  findByServiceName(serviceName: string): Promise<HealthCheck[]>;
  findAllEnabled(): Promise<HealthCheck[]>;
  update(id: string, updates: Partial<HealthCheck>): Promise<HealthCheck>;
  delete(id: string): Promise<void>;

  // Health Check Results
  saveResult(result: Omit<HealthCheckResult, 'id'>): Promise<HealthCheckResult>;
  getRecentResults(healthCheckId: string, limit?: number): Promise<HealthCheckResult[]>;
  getResultsInTimeRange(healthCheckId: string, startTime: Date, endTime: Date): Promise<HealthCheckResult[]>;

  // Performance metrics
  getResponseTimePercentiles(
    healthCheckId: string,
    timeRangeMinutes: number
  ): Promise<{
    p50: number;
    p95: number;
    p99: number;
  }>;

  // Health status aggregation
  getServiceHealthSummary(serviceName: string): Promise<{
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  }>;

  // Last execution tracking
  getLastExecutionTime(healthCheckId: string): Promise<Date | null>;
  updateLastExecutionTime(healthCheckId: string, timestamp: Date): Promise<void>;
}
