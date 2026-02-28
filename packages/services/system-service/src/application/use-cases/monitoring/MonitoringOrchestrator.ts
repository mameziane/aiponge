/**
 * System Monitoring Service Application Layer
 * Orchestrates monitoring operations and use cases
 */

import { IMonitoringRepository } from '../../../domains/monitoring/interfaces/IMonitoringRepository';
import { IAlertingService } from '../../../domains/monitoring/interfaces/IAlertingService';
import { IMetricsCollector } from '../../../domains/monitoring/interfaces/IMetricsCollector';
import { MonitoringJob } from '../../../domains/monitoring/entities/MonitoringJob';
import { ServiceHealth } from '../../../domains/monitoring/entities/ServiceHealth';
import { Alert } from '../../../domains/monitoring/entities/Alert';
import { MetricData } from '../../../domains/monitoring/value-objects/MetricData';
import { AlertRule } from '../../../domains/monitoring/value-objects/AlertRule';
import { getLogger } from '../../../config/service-urls';
import { MonitoringError } from '../../errors';
import { HEALTH_STATUS, INFRASTRUCTURE, ALERT_STATUS, MONITORING_JOB_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('monitoring-orchestrator');

export class MonitoringOrchestrator {
  constructor(
    private repository: IMonitoringRepository,
    private alertingService: IAlertingService,
    private metricsCollector: IMetricsCollector
  ) {}

  async createMonitoringJob(
    serviceName: string,
    endpoint: string,
    interval: number,
    alertRules: AlertRule[]
  ): Promise<MonitoringJob> {
    const job = MonitoringJob.create({
      serviceName,
      jobType: 'health_check',
      status: MONITORING_JOB_STATUS.ACTIVE,
      schedule: `*/${Math.floor(interval / 1000)} * * * *`, // Convert ms to cron minutes
      config: { endpoint, alertRules },
      maxRetries: INFRASTRUCTURE.MAX_RETRIES,
    });
    await this.repository.saveMonitoringJob(job);
    return job;
  }

  async startMonitoring(jobId: string): Promise<void> {
    const job = await this.repository.getMonitoringJob(jobId);
    if (!job) {
      throw MonitoringError.alertNotFound(jobId);
    }

    job.start();
    await this.repository.updateMonitoringJob(job);
  }

  async stopMonitoring(jobId: string): Promise<void> {
    const job = await this.repository.getMonitoringJob(jobId);
    if (!job) {
      throw MonitoringError.alertNotFound(jobId);
    }

    job.pause();
    await this.repository.updateMonitoringJob(job);
  }

  async collectMetrics(serviceName: string): Promise<MetricData[]> {
    return await this.metricsCollector.collectMetrics(serviceName);
  }

  async checkServiceHealth(serviceName: string, endpoint: string): Promise<ServiceHealth> {
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      const health = ServiceHealth.create({
        serviceName,
        status: response.ok ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.UNHEALTHY,
        responseTime,
        errorRate: 0,
        uptime: 100,
        lastCheck: new Date(),
        checks: [
          {
            name: 'http_status',
            status: response.ok ? 'pass' : 'fail',
            value: response.status,
            timestamp: new Date(),
          },
        ],
      });

      await this.repository.saveServiceHealth(health);
      return health;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const health = ServiceHealth.create({
        serviceName,
        status: HEALTH_STATUS.UNHEALTHY,
        responseTime: 0,
        errorRate: 100,
        uptime: 0,
        lastCheck: new Date(),
        checks: [
          {
            name: 'http_status',
            status: 'fail',
            message: errorMessage,
            timestamp: new Date(),
          },
        ],
      });

      await this.repository.saveServiceHealth(health);
      return health;
    }
  }

  async processAlerts(): Promise<void> {
    const activeJobs = await this.repository.getActiveMonitoringJobs();

    for (const job of activeJobs) {
      const recentHealth = await this.repository.getRecentServiceHealth(job.serviceName, 5);

      const alertRules = Array.isArray(job.config.alertRules) ? job.config.alertRules : [];
      for (const rule of alertRules) {
        const shouldAlert = this.evaluateAlertRule(rule, recentHealth);

        if (shouldAlert) {
          // Create alert data for repository
          const alertCreateData = {
            serviceName: job.serviceName,
            healthCheckId: undefined,
            alertType: 'custom' as const,
            type: 'health_check' as const,
            severity: rule.severity,
            title: `Alert: ${rule.condition}`,
            message: `Service ${job.serviceName} triggered alert: ${rule.condition}`,
            metadata: { rule: rule.condition },
          };

          // Note: Repository/alerting service interfaces may need adjustment
          // await this.repository.saveAlert(alertCreateData);
          // await this.alertingService.sendAlert(alertCreateData);
          logger.warn('Alert triggered', {
            module: 'monitoring_orchestrator',
            operation: 'processHealthCheck',
            alertType: alertCreateData.type,
            serviceName: alertCreateData.serviceName,
            message: alertCreateData.message,
            phase: 'alert_triggered',
          });
        }
      }
    }
  }

  private evaluateAlertRule(rule: AlertRule, healthData: ServiceHealth[]): boolean {
    if (healthData.length === 0) return false;

    switch (rule.condition) {
      case 'service_down':
        return healthData.some(h => h.status === HEALTH_STATUS.UNHEALTHY);

      case 'high_response_time':
        const avgResponseTime = healthData.reduce((sum, h) => sum + h.responseTime, 0) / healthData.length;
        return avgResponseTime > (rule.threshold || 5000);

      case 'error_rate':
        const errorCount = healthData.filter(h => h.status === HEALTH_STATUS.UNHEALTHY).length;
        const errorRate = errorCount / healthData.length;
        return errorRate > (rule.threshold || 0.1);

      default:
        return false;
    }
  }

  async getDashboardData(): Promise<unknown> {
    const [services, alerts, recentMetrics] = await Promise.all([
      this.repository.getAllServiceHealth(),
      this.repository.getRecentAlerts(24), // Last 24 hours
      this.repository.getRecentMetrics(1), // Last hour
    ]);

    return {
      services: services.reduce((acc: ServiceHealth[], service) => {
        const existing = acc.find(s => s.serviceName === service.serviceName);
        if (!existing || service.lastCheck > existing.lastCheck) {
          const index = acc.findIndex(s => s.serviceName === service.serviceName);
          if (index >= 0) {
            acc[index] = service;
          } else {
            acc.push(service);
          }
        }
        return acc;
      }, []),
      alerts,
      metrics: recentMetrics,
      summary: {
        totalServices: new Set(services.map(s => s.serviceName)).size,
        healthyServices: services.filter(s => s.status === HEALTH_STATUS.HEALTHY).length,
        activeAlerts: alerts.filter(a => a.status === ALERT_STATUS.ACTIVE).length,
      },
    };
  }
}
