import type { ProviderAnalytics } from '../../domains/entities/ProviderAnalytics.js';
import type { InternalMetricEntry } from './insight-report-types';

export function processMetricsData(
  metrics: InternalMetricEntry[]
): Record<string, Record<string, InternalMetricEntry[]>> {
  return metrics.reduce((acc: Record<string, Record<string, InternalMetricEntry[]>>, metric) => {
    if (!acc[metric.serviceName]) {
      acc[metric.serviceName] = {};
    }
    if (!acc[metric.serviceName][metric.name]) {
      acc[metric.serviceName][metric.name] = [];
    }
    acc[metric.serviceName][metric.name].push(metric);
    return acc;
  }, {});
}

export function generateTimeLabels(startTime: Date, endTime: Date, interval: 'minute' | 'hour' | 'day'): string[] {
  const labels = [];
  const intervalMs = interval === 'minute' ? 60000 : interval === 'hour' ? 3600000 : 86400000;

  for (let time = startTime.getTime(); time <= endTime.getTime(); time += intervalMs) {
    labels.push(new Date(time).toISOString());
  }

  return labels;
}

export function aggregateResponseTimeByHour(providers: ProviderAnalytics[], startTime: Date, endTime: Date): number[] {
  const data = [];
  const hourMs = 60 * 60 * 1000;

  for (let time = startTime.getTime(); time <= endTime.getTime(); time += hourMs) {
    const hourStart = time;
    const hourEnd = time + hourMs;

    const hourProviders = providers.filter(p => p.timestamp.getTime() >= hourStart && p.timestamp.getTime() < hourEnd);

    const avgResponseTime =
      hourProviders.length > 0
        ? hourProviders.reduce((sum, p) => sum + (p.responseTimeMs ?? 0), 0) / hourProviders.length
        : 0;

    data.push(avgResponseTime);
  }

  return data;
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;

  const sorted = values.sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;

  return sorted[Math.max(0, index)];
}

export function calculateTrend(data: Array<{ timestamp: Date; value: number }>): {
  slope: number;
  direction: 'up' | 'down' | 'stable';
} {
  if (data.length < 2) return { slope: 0, direction: 'stable' };

  const n = data.length;
  const sumX = data.reduce((sum, d, i) => sum + i, 0);
  const sumY = data.reduce((sum, d) => sum + d.value, 0);
  const sumXY = data.reduce((sum, d, i) => sum + i * d.value, 0);
  const sumXX = data.reduce((sum, d, i) => sum + i * i, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const direction = slope > 0.1 ? 'up' : slope < -0.1 ? 'down' : 'stable';

  return { slope, direction };
}

export function determineOverallTrend(metrics: Array<{ changeType: string }>): 'improving' | 'declining' | 'stable' {
  const improvements = metrics.filter(m => m.changeType === 'improvement').length;
  const degradations = metrics.filter(m => m.changeType === 'degradation').length;

  if (improvements > degradations) return 'improving';
  if (degradations > improvements) return 'declining';
  return 'stable';
}

export function generateReportTitle(reportType: string, startTime: Date): string {
  const typeTitle = reportType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const dateStr = startTime.toLocaleDateString();
  return `${typeTitle} - ${dateStr}`;
}

export function generateDashboardTitle(dashboardType: string): string {
  return dashboardType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + ' Dashboard';
}
