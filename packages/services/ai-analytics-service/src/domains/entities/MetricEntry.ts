/**
 * Domain Entity: MetricEntry
 * Represents a single metric measurement with value, timestamp, and metadata
 */

export interface MetricEntry {
  readonly name: string;
  readonly value: number;
  readonly timestamp: Date;
  readonly tags?: Record<string, string>;
  readonly serviceName: string;
  readonly source: string;
  readonly metricType: 'counter' | 'gauge' | 'histogram' | 'summary';
  readonly unit?: string;
}

export interface AggregatedMetric {
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly lastUpdated: Date;
  readonly p50?: number;
  readonly p95?: number;
  readonly p99?: number;
}

export interface MetricFilter {
  readonly serviceName?: string;
  readonly metricName?: string;
  readonly startTime?: Date;
  readonly endTime?: Date;
  readonly tags?: Record<string, string>;
  readonly metricType?: string;
  readonly source?: string;
  readonly limit?: number;
  readonly ids?: string[];
  readonly severity?: string;
  readonly status?: string;
  readonly providerId?: string;
}
