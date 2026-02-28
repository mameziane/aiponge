import { MonitoringJob } from '../entities/MonitoringJob';
import { ServiceHealth } from '../entities/ServiceHealth';
import { Alert } from '../entities/Alert';
import { MetricData } from '../value-objects/MetricData';

export interface IMonitoringRepository {
  saveMonitoringJob(job: MonitoringJob): Promise<void>;
  getMonitoringJob(jobId: string): Promise<MonitoringJob | null>;
  updateMonitoringJob(job: MonitoringJob): Promise<void>;
  getActiveMonitoringJobs(): Promise<MonitoringJob[]>;
  saveServiceHealth(health: ServiceHealth): Promise<void>;
  getRecentServiceHealth(serviceName: string, count: number): Promise<ServiceHealth[]>;
  getAllServiceHealth(): Promise<ServiceHealth[]>;
  saveAlert(alert: Alert): Promise<void>;
  getRecentAlerts(hours: number): Promise<Alert[]>;
  getRecentMetrics(hours: number): Promise<MetricData[]>;
}
