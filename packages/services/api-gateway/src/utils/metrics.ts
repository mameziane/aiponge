import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { getAnalyticsEventPublisher } from '@aiponge/platform-core';

const registry = new client.Registry();
registry.setDefaultLabels({ service: 'api-gateway' });

if (process.env.NODE_ENV === 'production') {
  client.collectDefaultMetrics({ register: registry });
}

export const MetricType = {
  COUNTER: 'counter',
  HISTOGRAM: 'histogram',
  GAUGE: 'gauge',
  SUMMARY: 'summary',
} as const;

export type MetricTypeValue = (typeof MetricType)[keyof typeof MetricType];

export interface MetricData {
  name: string;
  value: number;
  type: MetricTypeValue;
  labels?: Record<string, string>;
  timestamp: number;
}

export interface HistogramStats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  median: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface MetricsConfig {
  maxMetricsPerName: number;
  cleanupIntervalMs: number;
  histogramBuckets?: number[];
  enableDetailedStats?: boolean;
}

export type MetricName = (typeof METRICS)[keyof typeof METRICS];

const counters = new Map<string, client.Counter>();
const histograms = new Map<string, client.Histogram>();
const gauges = new Map<string, client.Gauge>();
const histogramRawValues = new Map<string, number[]>();
const knownLabelNames = new Map<string, string[]>();

function resolveLabelNames(name: string, labels?: Record<string, string>): string[] {
  const existing = knownLabelNames.get(name);
  if (existing) return existing;
  const labelNames = labels ? Object.keys(labels).sort() : [];
  knownLabelNames.set(name, labelNames);
  return labelNames;
}

function normalizeLabelValues(
  labelNames: string[],
  labels?: Record<string, string>
): Record<string, string> | undefined {
  if (!labels || labelNames.length === 0) return undefined;
  const normalized: Record<string, string> = {};
  for (const key of labelNames) {
    normalized[key] = labels[key] ?? '';
  }
  return normalized;
}

function getOrCreateCounter(name: string, labelNames: string[]): client.Counter {
  let counter = counters.get(name);
  if (!counter) {
    counter = new client.Counter({
      name,
      help: `${name} counter`,
      labelNames,
      registers: [registry],
    });
    counters.set(name, counter);
  }
  return counter;
}

function getOrCreateHistogram(name: string, labelNames: string[]): client.Histogram {
  let histogram = histograms.get(name);
  if (!histogram) {
    histogram = new client.Histogram({
      name,
      help: `${name} histogram`,
      labelNames,
      buckets: client.exponentialBuckets(0.005, 2, 12),
      registers: [registry],
    });
    histograms.set(name, histogram);
  }
  return histogram;
}

function getOrCreateGauge(name: string, labelNames: string[]): client.Gauge {
  let gauge = gauges.get(name);
  if (!gauge) {
    gauge = new client.Gauge({
      name,
      help: `${name} gauge`,
      labelNames,
      registers: [registry],
    });
    gauges.set(name, gauge);
  }
  return gauge;
}

const metricsApi = {
  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    try {
      const labelNames = resolveLabelNames(name, labels);
      const counter = getOrCreateCounter(name, labelNames);
      const normalized = normalizeLabelValues(labelNames, labels);
      if (normalized) {
        counter.inc(normalized, value);
      } else {
        counter.inc(value);
      }
    } catch {
      /* metrics should never throw */
    }
  },

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    if (!isFinite(value)) return;
    try {
      const labelNames = resolveLabelNames(name, labels);
      const histogram = getOrCreateHistogram(name, labelNames);
      const normalized = normalizeLabelValues(labelNames, labels);
      if (normalized) {
        histogram.observe(normalized, value);
      } else {
        histogram.observe(value);
      }
      const raw = histogramRawValues.get(name) ?? [];
      raw.push(value);
      if (raw.length > 10000) raw.splice(0, raw.length - 5000);
      histogramRawValues.set(name, raw);
    } catch {
      /* metrics should never throw */
    }
  },

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!isFinite(value)) return;
    try {
      const labelNames = resolveLabelNames(name, labels);
      const gauge = getOrCreateGauge(name, labelNames);
      const normalized = normalizeLabelValues(labelNames, labels);
      if (normalized) {
        gauge.set(normalized, value);
      } else {
        gauge.set(value);
      }
    } catch {
      /* metrics should never throw */
    }
  },

  incrementGauge(name: string, value: number = 1, labels?: Record<string, string>): void {
    try {
      const labelNames = resolveLabelNames(name, labels);
      const gauge = getOrCreateGauge(name, labelNames);
      const normalized = normalizeLabelValues(labelNames, labels);
      if (normalized) {
        gauge.inc(normalized, value);
      } else {
        gauge.inc(value);
      }
    } catch {
      /* metrics should never throw */
    }
  },

  decrementGauge(name: string, value: number = 1, labels?: Record<string, string>): void {
    try {
      const labelNames = resolveLabelNames(name, labels);
      const gauge = getOrCreateGauge(name, labelNames);
      const normalized = normalizeLabelValues(labelNames, labels);
      if (normalized) {
        gauge.dec(normalized, value);
      } else {
        gauge.dec(value);
      }
    } catch {
      /* metrics should never throw */
    }
  },

  getCounter(name: string, _labels?: Record<string, string>): number {
    const counter = counters.get(name);
    if (!counter) return 0;
    try {
      const metric = (counter as unknown as Record<string, Record<string, { value: number }>>).hashMap;
      if (metric) {
        let total = 0;
        for (const key of Object.keys(metric)) {
          total += metric[key]?.value ?? 0;
        }
        return total;
      }
      return 0;
    } catch {
      return 0;
    }
  },

  getGauge(name: string, _labels?: Record<string, string>): number | null {
    const gauge = gauges.get(name);
    if (!gauge) return null;
    try {
      const metric = (gauge as unknown as Record<string, Record<string, { value: number }>>).hashMap;
      if (metric) {
        const keys = Object.keys(metric);
        if (keys.length > 0) return metric[keys[0]]?.value ?? null;
      }
      return null;
    } catch {
      return null;
    }
  },

  getHistogramStats(name: string, _labels?: Record<string, string>): HistogramStats | null {
    const values = histogramRawValues.get(name);
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / count;

    const getPercentile = (p: number): number => {
      const index = Math.ceil((count * p) / 100) - 1;
      return sorted[Math.max(0, Math.min(index, count - 1))];
    };

    return {
      count,
      sum,
      avg,
      min: sorted[0],
      max: sorted[count - 1],
      median: getPercentile(50),
      p50: getPercentile(50),
      p75: getPercentile(75),
      p90: getPercentile(90),
      p95: getPercentile(95),
      p99: getPercentile(99),
    };
  },

  async exportPrometheusFormat(): Promise<string> {
    return registry.metrics();
  },

  reset(): void {
    registry.clear();
    counters.clear();
    histograms.clear();
    gauges.clear();
    histogramRawValues.clear();
    knownLabelNames.clear();
  },

  cleanup(): void {
    // prom-client handles memory management internally
  },

  destroy(): void {
    this.reset();
  },

  getMetrics(_name?: string, _labels?: Record<string, string>): MetricData[] {
    return [];
  },
};

export const metrics = metricsApi;

export const METRICS = {
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION: 'http_request_duration_seconds',
  HTTP_REQUEST_SIZE: 'http_request_size_bytes',
  HTTP_RESPONSE_SIZE: 'http_response_size_bytes',
  ACTIVE_CONNECTIONS: 'active_connections',
  SERVICE_CALLS_TOTAL: 'service_calls_total',
  SERVICE_CALL_DURATION: 'service_call_duration_seconds',
  SERVICE_ERRORS_TOTAL: 'service_errors_total',
  CIRCUIT_BREAKER_STATE: 'circuit_breaker_state',
  CACHE_HITS_TOTAL: 'cache_hits_total',
  CACHE_MISSES_TOTAL: 'cache_misses_total',
  CACHE_EVICTIONS_TOTAL: 'cache_evictions_total',
  RATE_LIMIT_HITS: 'rate_limit_hits_total',
  RATE_LIMIT_REMAINING: 'rate_limit_remaining',
  MEMORY_USAGE: 'memory_usage_bytes',
  CPU_USAGE: 'cpu_usage_percent',
} as const;

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime.bigint();
  metrics.incrementGauge(METRICS.ACTIVE_CONNECTIONS, 1);

  const originalEnd = res.end;
  let headersSent = false;

  res.end = function (chunk?: unknown, ...args: unknown[]): Response {
    if (!headersSent) {
      headersSent = true;
      const duration = Number(process.hrtime.bigint() - startTime) / 1e9;

      const labels = {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode.toString(),
        status_class: `${Math.floor(res.statusCode / 100)}xx`,
      };

      metrics.incrementCounter(METRICS.HTTP_REQUESTS_TOTAL, labels);
      metrics.recordHistogram(METRICS.HTTP_REQUEST_DURATION, duration, {
        method: req.method,
        route: req.route?.path || req.path,
      });

      if (res.statusCode >= 400) {
        metrics.incrementCounter(METRICS.SERVICE_ERRORS_TOTAL, {
          method: req.method,
          route: req.route?.path || req.path,
          status_code: res.statusCode.toString(),
        });
      }

      metrics.decrementGauge(METRICS.ACTIVE_CONNECTIONS, 1);

      try {
        const correlationId = (req.headers['x-correlation-id'] as string) || `gw_${Date.now()}`;
        const durationMs = Math.round(duration * 1000);
        const publisher = getAnalyticsEventPublisher('api-gateway');

        publisher.publishDirect('analytics.span.recorded', {
          correlationId,
          spanId: `span_${correlationId}`,
          parentSpanId: null,
          service: 'api-gateway',
          operation: `${req.method} ${req.route?.path || req.path}`,
          startTime: new Date(Date.now() - durationMs).toISOString(),
          endTime: new Date().toISOString(),
          durationMs,
          status: res.statusCode >= 400 ? 'error' : 'completed',
          httpMethod: req.method,
          httpPath: req.path,
          httpStatusCode: res.statusCode,
        });

        publisher.publishDirect('analytics.trace.completed', {
          correlationId,
          entryService: 'api-gateway',
          entryOperation: `${req.method} ${req.route?.path || req.path}`,
          httpMethod: req.method,
          httpPath: req.path,
          httpStatusCode: res.statusCode,
          totalDurationMs: durationMs,
          status: res.statusCode >= 400 ? 'error' : 'completed',
          spanCount: 1,
        });
      } catch {
      }
    }

    return originalEnd.apply(res, [chunk, ...args] as Parameters<typeof originalEnd>);
  };

  next();
};

export const trackServiceCall = (
  service: string,
  endpoint: string,
  duration: number,
  success: boolean,
  statusCode?: number
): void => {
  const labels = {
    service,
    endpoint,
    success: success.toString(),
    ...(statusCode && { status_code: statusCode.toString() }),
  };

  metrics.incrementCounter(METRICS.SERVICE_CALLS_TOTAL, labels);
  metrics.recordHistogram(METRICS.SERVICE_CALL_DURATION, duration / 1000, {
    service,
    endpoint,
  });

  if (!success) {
    metrics.incrementCounter(METRICS.SERVICE_ERRORS_TOTAL, {
      service,
      endpoint,
      ...(statusCode && { status_code: statusCode.toString() }),
    });
  }
};

export const trackCacheHit = (cacheKey: string, cacheType: string = 'default'): void => {
  metrics.incrementCounter(METRICS.CACHE_HITS_TOTAL, { cache_key: cacheKey, cache_type: cacheType });
};

export const trackCacheMiss = (cacheKey: string, cacheType: string = 'default'): void => {
  metrics.incrementCounter(METRICS.CACHE_MISSES_TOTAL, { cache_key: cacheKey, cache_type: cacheType });
};

export const trackCacheEviction = (cacheKey: string, reason: string = 'ttl'): void => {
  metrics.incrementCounter(METRICS.CACHE_EVICTIONS_TOTAL, { cache_key: cacheKey, reason });
};

export const trackCircuitBreakerState = (
  service: string,
  state: 'open' | 'closed' | 'half-open',
  previousState?: 'open' | 'closed' | 'half-open'
): void => {
  const stateValue = state === 'open' ? 2 : state === 'half-open' ? 1 : 0;
  metrics.setGauge(METRICS.CIRCUIT_BREAKER_STATE, stateValue, { service, state });

  if (previousState && previousState !== state) {
    metrics.incrementCounter('circuit_breaker_transitions_total', { service, from: previousState, to: state });
  }
};

export const trackRateLimitHit = (identifier: string, endpoint: string, remaining?: number, limit?: number): void => {
  metrics.incrementCounter(METRICS.RATE_LIMIT_HITS, { identifier, endpoint });
  if (remaining !== undefined) {
    metrics.setGauge(METRICS.RATE_LIMIT_REMAINING, remaining, { identifier, endpoint });
  }
  if (limit !== undefined) {
    metrics.setGauge('rate_limit_total', limit, { identifier, endpoint });
  }
};

export const collectSystemMetrics = (): void => {
  if (process.memoryUsage) {
    const memUsage = process.memoryUsage();
    metrics.setGauge(METRICS.MEMORY_USAGE, memUsage.heapUsed, { type: 'heap_used' });
    metrics.setGauge(METRICS.MEMORY_USAGE, memUsage.heapTotal, { type: 'heap_total' });
    metrics.setGauge(METRICS.MEMORY_USAGE, memUsage.rss, { type: 'rss' });
    metrics.setGauge(METRICS.MEMORY_USAGE, memUsage.external, { type: 'external' });
  }
};

export const prometheusHandler = async (_req: Request, res: Response): Promise<void> => {
  res.set('Content-Type', client.register.contentType);
  res.send(await metrics.exportPrometheusFormat());
};

export const startSystemMetricsCollection = (_intervalMs: number = 30000): void => {
  // prom-client's collectDefaultMetrics handles this in production
};

export const stopSystemMetricsCollection = (): void => {
  // no-op
};

export const shutdown = (): void => {
  metrics.destroy();
};

export default metrics;
