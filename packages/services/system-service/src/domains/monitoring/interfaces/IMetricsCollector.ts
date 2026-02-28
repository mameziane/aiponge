import { MetricData } from '../value-objects/MetricData';

export interface IMetricsCollector {
  collectMetrics(serviceName: string): Promise<MetricData[]>;
}
