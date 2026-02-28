/**
 * System Health Analytics Service
 * Monitors system health, resource utilization, and service availability across the AI ecosystem
 */

import { MetricsCollectorService } from '../services/MetricsCollectorService';
import { IAnalyticsRepository } from '../../domains/repositories/IAnalyticsRepository';
import { EventEmitter } from 'events';
import { getLogger } from '../../config/service-urls';
import { AnalyticsError } from '../errors';
import { createIntervalScheduler } from '@aiponge/platform-core';
import type { IntervalScheduler } from '@aiponge/platform-core';
import { ALERT_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('ai-analytics-service-systemhealthservice');

export interface SystemHealthMetrics {
  timestamp: Date;
  serviceName: string;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
  uptime: number; // percentage 0-1
  responseTimeMs: number;
  errorRate: number; // percentage 0-1
  resourceUtilization: {
    cpu: number; // percentage 0-100
    memory: number; // percentage 0-100
    disk: number; // percentage 0-100
    networkIn: number; // bytes/sec
    networkOut: number; // bytes/sec
  };
  serviceMetrics: {
    activeConnections: number;
    requestsPerSecond: number;
    queueLength: number;
    processingLatency: number;
  };
  databaseMetrics?: {
    connectionPoolSize: number;
    activeConnections: number;
    queryLatency: number;
    deadlocks: number;
  };
  metadata?: Record<string, unknown>;
}

export interface ServiceHealthCheck {
  serviceName: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
  lastChecked: Date;
  responseTimeMs?: number;
  dependencies: Array<{
    name: string;
    status: 'healthy' | 'unhealthy';
    responseTimeMs?: number;
    error?: string;
  }>;
  details: {
    uptime: number;
    version: string;
    build: string;
    environment: string;
    startTime: Date;
  };
  metrics: {
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

export interface SystemHealthSummary {
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  totalServices: number;
  healthyServices: number;
  degradedServices: number;
  unhealthyServices: number;
  criticalAlerts: number;
  lastUpdated: Date;
  systemMetrics: {
    averageResponseTime: number;
    totalErrorRate: number;
    systemUptime: number;
    resourceUtilization: {
      avgCpu: number;
      avgMemory: number;
      avgDisk: number;
    };
  };
  serviceBreakdown: Array<{
    serviceName: string;
    status: string;
    uptime: number;
    responseTime: number;
    errorRate: number;
  }>;
}

export interface HealthAlert {
  id: string;
  serviceName: string;
  alertType: 'service_down' | 'high_latency' | 'error_rate' | 'resource_usage' | 'dependency_failure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  triggeredAt: Date;
  currentValue?: number;
  threshold?: number;
  status: 'active' | 'acknowledged' | 'resolved';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export class SystemHealthService extends EventEmitter {
  private readonly repository: IAnalyticsRepository;
  private readonly metricsCollector: MetricsCollectorService;

  // Health tracking
  private readonly serviceHealthCache: Map<string, ServiceHealthCheck> = new Map();
  private readonly activeAlerts: Map<string, HealthAlert> = new Map();

  // Configuration
  private readonly healthCheckIntervalMs = 30000; // 30 seconds
  private readonly alertThresholds = {
    responseTime: 5000, // 5 seconds
    errorRate: 0.05, // 5%
    cpuUsage: 80, // 80%
    memoryUsage: 85, // 85%
    diskUsage: 90, // 90%
  };

  private healthCheckScheduler: IntervalScheduler | null = null;
  private readonly monitoredServices: Set<string> = new Set();

  constructor(repository: IAnalyticsRepository, metricsCollector: MetricsCollectorService) {
    super();
    this.repository = repository;
    this.metricsCollector = metricsCollector;

    this.startHealthMonitoring();
    logger.debug('💚 Initialized system health monitoring');
  }

  /**
   * Record system health metrics
   */
  async recordSystemHealthMetrics(metrics: SystemHealthMetrics): Promise<void> {
    // Store in database
    await this.metricsCollector.recordMetric({
      name: 'system.health.status',
      value: this.healthStatusToValue(metrics.healthStatus),
      timestamp: new Date(),
      serviceName: metrics.serviceName,
      source: 'health-monitor',
      metricType: 'gauge',
      tags: {
        status: metrics.healthStatus,
      },
      unit: 'status',
    });

    await this.metricsCollector.recordMetric({
      name: 'system.uptime',
      value: metrics.uptime,
      timestamp: new Date(),
      serviceName: metrics.serviceName,
      source: 'health-monitor',
      metricType: 'gauge',
      unit: 'percentage',
    });

    await this.metricsCollector.recordMetric({
      name: 'system.response_time',
      value: metrics.responseTimeMs,
      timestamp: new Date(),
      serviceName: metrics.serviceName,
      source: 'health-monitor',
      metricType: 'histogram',
      unit: 'milliseconds',
    });

    await this.metricsCollector.recordMetric({
      name: 'system.error_rate',
      value: metrics.errorRate,
      timestamp: new Date(),
      serviceName: metrics.serviceName,
      source: 'health-monitor',
      metricType: 'gauge',
      unit: 'percentage',
    });

    // Resource utilization metrics
    await this.metricsCollector.recordMetric({
      name: 'system.cpu_usage',
      value: metrics.resourceUtilization.cpu,
      timestamp: new Date(),
      serviceName: metrics.serviceName,
      source: 'health-monitor',
      metricType: 'gauge',
      unit: 'percentage',
    });

    await this.metricsCollector.recordMetric({
      name: 'system.memory_usage',
      value: metrics.resourceUtilization.memory,
      timestamp: new Date(),
      serviceName: metrics.serviceName,
      source: 'health-monitor',
      metricType: 'gauge',
      unit: 'percentage',
    });

    // Service-specific metrics
    await this.metricsCollector.recordMetric({
      name: 'system.active_connections',
      value: metrics.serviceMetrics.activeConnections,
      timestamp: new Date(),
      serviceName: metrics.serviceName,
      source: 'health-monitor',
      metricType: 'gauge',
      unit: 'connections',
    });

    await this.metricsCollector.recordMetric({
      name: 'system.requests_per_second',
      value: metrics.serviceMetrics.requestsPerSecond,
      timestamp: new Date(),
      serviceName: metrics.serviceName,
      source: 'health-monitor',
      metricType: 'gauge',
      unit: 'rps',
    });

    // Check for health alerts
    await this.checkHealthThresholds(metrics);

    this.emit('health_metrics_recorded', metrics);
  }

  /**
   * Register service for health monitoring
   */
  registerService(serviceName: string): void {
    this.monitoredServices.add(serviceName);
    logger.info('💚 Registered service for monitoring: {}', { data0: serviceName });
  }

  /**
   * Update service health status
   */
  async updateServiceHealth(healthCheck: ServiceHealthCheck): Promise<void> {
    // Update cache
    this.serviceHealthCache.set(healthCheck.serviceName, healthCheck);

    // Record health metrics
    await this.metricsCollector.recordMetric({
      name: 'service.health.check',
      value: this.healthStatusToValue(healthCheck.status),
      timestamp: new Date(),
      serviceName: healthCheck.serviceName,
      source: 'health-check',
      metricType: 'gauge',
      tags: {
        status: healthCheck.status,
        version: healthCheck.details.version,
      },
      unit: 'status',
    });

    if (healthCheck.responseTimeMs) {
      await this.metricsCollector.recordMetric({
        name: 'service.health.response_time',
        value: healthCheck.responseTimeMs,
        timestamp: new Date(),
        serviceName: healthCheck.serviceName,
        source: 'health-check',
        metricType: 'histogram',
        unit: 'milliseconds',
      });
    }

    // Check dependency health
    for (const dependency of healthCheck.dependencies) {
      await this.metricsCollector.recordMetric({
        name: 'service.dependency.health',
        value: this.healthStatusToValue(dependency.status === 'healthy' ? 'healthy' : 'unhealthy'),
        timestamp: new Date(),
        serviceName: healthCheck.serviceName,
        source: 'dependency-check',
        metricType: 'gauge',
        tags: {
          dependency: dependency.name,
          status: dependency.status,
        },
        unit: 'status',
      });
    }

    // Check for service-level alerts
    await this.checkServiceHealth(healthCheck);

    this.emit('service_health_updated', healthCheck);
  }

  /**
   * Get system health summary
   */
  async getSystemHealthSummary(): Promise<SystemHealthSummary> {
    const healthChecks = Array.from(this.serviceHealthCache.values());
    const now = new Date();

    let healthyServices = 0;
    let degradedServices = 0;
    let unhealthyServices = 0;

    let totalResponseTime = 0;
    let totalErrorRate = 0;
    let totalUptime = 0;
    let totalCpu = 0;
    let totalMemory = 0;
    let validResponseTimeCount = 0;

    const serviceBreakdown: SystemHealthSummary['serviceBreakdown'] = [];

    for (const healthCheck of healthChecks) {
      switch (healthCheck.status) {
        case 'healthy':
          healthyServices++;
          break;
        case 'degraded':
          degradedServices++;
          break;
        case 'unhealthy':
        case 'unavailable':
          unhealthyServices++;
          break;
      }

      if (healthCheck.responseTimeMs) {
        totalResponseTime += healthCheck.responseTimeMs;
        validResponseTimeCount++;
      }

      totalErrorRate += healthCheck.metrics.errorCount / Math.max(healthCheck.metrics.requestCount, 1) || 0;
      totalUptime += healthCheck.details.uptime;
      totalCpu += healthCheck.metrics.cpuUsage || 0;
      totalMemory += healthCheck.metrics.memoryUsage || 0;

      serviceBreakdown.push({
        serviceName: healthCheck.serviceName,
        status: healthCheck.status,
        uptime: healthCheck.details.uptime,
        responseTime: healthCheck.responseTimeMs || 0,
        errorRate: healthCheck.metrics.errorCount / Math.max(healthCheck.metrics.requestCount, 1) || 0,
      });
    }

    const totalServices = healthChecks.length;
    const avgResponseTime = validResponseTimeCount > 0 ? totalResponseTime / validResponseTimeCount : 0;
    const avgErrorRate = totalServices > 0 ? totalErrorRate / totalServices : 0;
    const avgUptime = totalServices > 0 ? totalUptime / totalServices : 0;
    const avgCpu = totalServices > 0 ? totalCpu / totalServices : 0;
    const avgMemory = totalServices > 0 ? totalMemory / totalServices : 0;

    // Determine overall system status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyServices > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedServices > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const criticalAlerts = Array.from(this.activeAlerts.values()).filter(
      alert => alert.severity === 'critical' && alert.status === ALERT_STATUS.ACTIVE
    ).length;

    return {
      overallStatus,
      totalServices,
      healthyServices,
      degradedServices,
      unhealthyServices,
      criticalAlerts,
      lastUpdated: now,
      systemMetrics: {
        averageResponseTime: avgResponseTime,
        totalErrorRate: avgErrorRate,
        systemUptime: avgUptime,
        resourceUtilization: {
          avgCpu,
          avgMemory,
          avgDisk: 0, // Would be calculated from disk metrics
        },
      },
      serviceBreakdown,
    };
  }

  /**
   * Get service health status
   */
  getServiceHealth(serviceName: string): ServiceHealthCheck | null {
    return this.serviceHealthCache.get(serviceName) || null;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): HealthAlert[] {
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.status === ALERT_STATUS.ACTIVE)
      .sort((a, b) => {
        // Sort by severity (critical first), then by timestamp
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return b.triggeredAt.getTime() - a.triggeredAt.getTime();
      });
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw AnalyticsError.validationError('alertId', `Alert not found: ${alertId}`);
    }

    alert.status = 'acknowledged';
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    this.emit('alert_acknowledged', alert);
    logger.info('🔕 Alert acknowledged: {} by {}', { data0: alertId, data1: acknowledgedBy });
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw AnalyticsError.validationError('alertId', `Alert not found: ${alertId}`);
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();

    this.emit('alert_resolved', alert);
    logger.info('Alert resolved: {}', { data0: alertId });
  }

  /**
   * Health check for the system health service itself
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, unknown>;
  }> {
    const monitoredServicesCount = this.monitoredServices.size;
    const cachedHealthChecks = this.serviceHealthCache.size;
    const activeAlerts = Array.from(this.activeAlerts.values()).filter(a => a.status === ALERT_STATUS.ACTIVE).length;
    const criticalAlerts = Array.from(this.activeAlerts.values()).filter(
      a => a.severity === 'critical' && a.status === ALERT_STATUS.ACTIVE
    ).length;

    const status = criticalAlerts > 0 ? 'unhealthy' : activeAlerts > 5 ? 'degraded' : 'healthy';

    return {
      status,
      details: {
        monitoredServices: monitoredServicesCount,
        cachedHealthChecks,
        activeAlerts,
        criticalAlerts,
        healthCheckInterval: this.healthCheckIntervalMs,
        isMonitoringActive: this.healthCheckScheduler !== null,
      },
    };
  }

  /**
   * Shutdown health monitoring
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckScheduler) {
      this.healthCheckScheduler.stop();
      this.healthCheckScheduler = null;
    }

    logger.info('💚 Shutdown completed');
  }

  // Private methods

  private startHealthMonitoring(): void {
    this.healthCheckScheduler = createIntervalScheduler({
      name: 'system-health-monitoring',
      serviceName: 'ai-analytics-service',
      intervalMs: this.healthCheckIntervalMs,
      handler: () => this.performHealthChecks(),
    });
    this.healthCheckScheduler.start();
  }

  private async performHealthChecks(): Promise<void> {
    // This would perform health checks on all registered services
    // For now, it's a placeholder that would integrate with actual service health endpoints

    for (const serviceName of this.monitoredServices) {
      try {
        const healthCheck = await this.performServiceHealthCheck(serviceName);
        await this.updateServiceHealth(healthCheck);
      } catch (error) {
        logger.error('Health check failed for ${serviceName}:', {
          error: error instanceof Error ? error.message : String(error),
        });

        // Create unhealthy status for failed health check
        const unhealthyCheck: ServiceHealthCheck = {
          serviceName,
          status: 'unhealthy',
          lastChecked: new Date(),
          dependencies: [],
          details: {
            uptime: 0,
            version: 'unknown',
            build: 'unknown',
            environment: 'unknown',
            startTime: new Date(),
          },
          metrics: {
            requestCount: 0,
            errorCount: 1,
            averageResponseTime: 0,
            memoryUsage: 0,
            cpuUsage: 0,
          },
        };

        await this.updateServiceHealth(unhealthyCheck);
      }
    }
  }

  private async performServiceHealthCheck(serviceName: string): Promise<ServiceHealthCheck> {
    // NOTE: Real health check implementation requires HTTP calls to service health endpoints
    // This is not yet implemented - returns 'unknown' status to indicate data is unavailable
    // To implement: Make HTTP request to ${serviceUrl}/health/ready for each service

    logger.debug('Health check not implemented - returning unknown status', {
      serviceName,
      method: 'performServiceHealthCheck',
    });

    return {
      serviceName,
      status: 'unavailable',
      lastChecked: new Date(),
      responseTimeMs: undefined,
      dependencies: [],
      details: {
        uptime: 0,
        version: 'not-checked',
        build: 'not-checked',
        environment: process.env.NODE_ENV || 'development',
        startTime: new Date(),
      },
      metrics: {
        requestCount: 0,
        errorCount: 0,
        averageResponseTime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
      },
    };
  }

  private async checkHealthThresholds(metrics: SystemHealthMetrics): Promise<void> {
    // Check response time threshold
    if (metrics.responseTimeMs > this.alertThresholds.responseTime) {
      await this.createAlert({
        serviceName: metrics.serviceName,
        alertType: 'high_latency',
        severity: 'high',
        message: `High response time: ${metrics.responseTimeMs}ms (threshold: ${this.alertThresholds.responseTime}ms)`,
        currentValue: metrics.responseTimeMs,
        threshold: this.alertThresholds.responseTime,
      });
    }

    // Check error rate threshold
    if (metrics.errorRate > this.alertThresholds.errorRate) {
      await this.createAlert({
        serviceName: metrics.serviceName,
        alertType: 'error_rate',
        severity: 'high',
        message: `High error rate: ${(metrics.errorRate * 100).toFixed(2)}% (threshold: ${(this.alertThresholds.errorRate * 100).toFixed(2)}%)`,
        currentValue: metrics.errorRate,
        threshold: this.alertThresholds.errorRate,
      });
    }

    // Check resource usage thresholds
    if (metrics.resourceUtilization.cpu > this.alertThresholds.cpuUsage) {
      await this.createAlert({
        serviceName: metrics.serviceName,
        alertType: 'resource_usage',
        severity: 'medium',
        message: `High CPU usage: ${metrics.resourceUtilization.cpu}% (threshold: ${this.alertThresholds.cpuUsage}%)`,
        currentValue: metrics.resourceUtilization.cpu,
        threshold: this.alertThresholds.cpuUsage,
      });
    }

    if (metrics.resourceUtilization.memory > this.alertThresholds.memoryUsage) {
      await this.createAlert({
        serviceName: metrics.serviceName,
        alertType: 'resource_usage',
        severity: 'medium',
        message: `High memory usage: ${metrics.resourceUtilization.memory}% (threshold: ${this.alertThresholds.memoryUsage}%)`,
        currentValue: metrics.resourceUtilization.memory,
        threshold: this.alertThresholds.memoryUsage,
      });
    }
  }

  private async checkServiceHealth(healthCheck: ServiceHealthCheck): Promise<void> {
    if (healthCheck.status === 'unhealthy' || healthCheck.status === 'unavailable') {
      await this.createAlert({
        serviceName: healthCheck.serviceName,
        alertType: 'service_down',
        severity: 'critical',
        message: `Service is ${healthCheck.status}`,
      });
    }

    // Check dependency health
    for (const dependency of healthCheck.dependencies) {
      if (dependency.status === 'unhealthy') {
        await this.createAlert({
          serviceName: healthCheck.serviceName,
          alertType: 'dependency_failure',
          severity: 'high',
          message: `Dependency '${dependency.name}' is unhealthy`,
          metadata: { dependency: dependency.name, error: dependency.error },
        });
      }
    }
  }

  private async createAlert(alertData: {
    serviceName: string;
    alertType: HealthAlert['alertType'];
    severity: HealthAlert['severity'];
    message: string;
    currentValue?: number;
    threshold?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const alertId = `${alertData.serviceName}-${alertData.alertType}-${Date.now()}`;

    // Check if similar alert already exists (prevent spam)
    const existingAlert = Array.from(this.activeAlerts.values()).find(
      alert =>
        alert.serviceName === alertData.serviceName &&
        alert.alertType === alertData.alertType &&
        alert.status === ALERT_STATUS.ACTIVE
    );

    if (existingAlert) {
      return; // Don't create duplicate alerts
    }

    const alert: HealthAlert = {
      id: alertId,
      serviceName: alertData.serviceName,
      alertType: alertData.alertType,
      severity: alertData.severity,
      message: alertData.message,
      triggeredAt: new Date(),
      currentValue: alertData.currentValue,
      threshold: alertData.threshold,
      status: 'active',
      metadata: alertData.metadata,
    };

    this.activeAlerts.set(alertId, alert);

    this.emit('alert_triggered', alert);
    logger.info('🚨 Alert triggered: {} - {}', { data0: alertData.severity, data1: alertData.message });
  }

  private healthStatusToValue(status: string): number {
    switch (status) {
      case 'healthy':
        return 1;
      case 'degraded':
        return 0.5;
      case 'unhealthy':
        return 0.25;
      case 'unavailable':
        return 0;
      default:
        return 0;
    }
  }
}
