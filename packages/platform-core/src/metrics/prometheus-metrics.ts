import client from 'prom-client';
import { Request, Response, NextFunction, Router } from 'express';
import type { MetricsConfig, HistogramStats } from './types.js';

export class PrometheusMetrics {
  private serviceName: string;
  private registry: client.Registry;
  private counters = new Map<string, client.Counter>();
  private histograms = new Map<string, client.Histogram>();
  private gauges = new Map<string, client.Gauge>();
  private histogramRawValues = new Map<string, number[]>();
  private knownLabelNames = new Map<string, string[]>();

  constructor(config: MetricsConfig) {
    this.serviceName = config.serviceName;
    this.registry = new client.Registry();
    this.registry.setDefaultLabels({ service: this.serviceName });

    if (process.env.NODE_ENV === 'production') {
      client.collectDefaultMetrics({ register: this.registry });
    }
  }

  private getPrefix(): string {
    return `aiponge_${this.serviceName.replace(/-/g, '_')}`;
  }

  private resolveLabelNames(name: string, labels?: Record<string, string>): string[] {
    const fullName = `${this.getPrefix()}_${name}`;
    const existing = this.knownLabelNames.get(fullName);
    if (existing) return existing;

    const labelNames = labels ? Object.keys(labels).sort() : [];
    this.knownLabelNames.set(fullName, labelNames);
    return labelNames;
  }

  private normalizeLabelValues(
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

  private getOrCreateCounter(name: string, labelNames: string[]): client.Counter {
    const fullName = `${this.getPrefix()}_${name}`;
    let counter = this.counters.get(fullName);
    if (!counter) {
      counter = new client.Counter({
        name: fullName,
        help: `${name} counter`,
        labelNames,
        registers: [this.registry],
      });
      this.counters.set(fullName, counter);
    }
    return counter;
  }

  private getOrCreateHistogram(name: string, labelNames: string[]): client.Histogram {
    const fullName = `${this.getPrefix()}_${name}`;
    let histogram = this.histograms.get(fullName);
    if (!histogram) {
      histogram = new client.Histogram({
        name: fullName,
        help: `${name} histogram`,
        labelNames,
        buckets: client.exponentialBuckets(0.005, 2, 12),
        registers: [this.registry],
      });
      this.histograms.set(fullName, histogram);
    }
    return histogram;
  }

  private getOrCreateGauge(name: string, labelNames: string[]): client.Gauge {
    const fullName = `${this.getPrefix()}_${name}`;
    let gauge = this.gauges.get(fullName);
    if (!gauge) {
      gauge = new client.Gauge({
        name: fullName,
        help: `${name} gauge`,
        labelNames,
        registers: [this.registry],
      });
      this.gauges.set(fullName, gauge);
    }
    return gauge;
  }

  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    try {
      const labelNames = this.resolveLabelNames(name, labels);
      const counter = this.getOrCreateCounter(name, labelNames);
      const normalized = this.normalizeLabelValues(labelNames, labels);
      if (normalized) {
        counter.inc(normalized, value);
      } else {
        counter.inc(value);
      }
    } catch {
      // metrics collection should never throw
    }
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    if (!isFinite(value)) return;
    try {
      const labelNames = this.resolveLabelNames(name, labels);
      const histogram = this.getOrCreateHistogram(name, labelNames);
      const normalized = this.normalizeLabelValues(labelNames, labels);
      if (normalized) {
        histogram.observe(normalized, value);
      } else {
        histogram.observe(value);
      }
      const fullName = `${this.getPrefix()}_${name}`;
      const raw = this.histogramRawValues.get(fullName) ?? [];
      raw.push(value);
      if (raw.length > 10000) raw.splice(0, raw.length - 5000);
      this.histogramRawValues.set(fullName, raw);
    } catch {
      // metrics collection should never throw
    }
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!isFinite(value)) return;
    try {
      const labelNames = this.resolveLabelNames(name, labels);
      const gauge = this.getOrCreateGauge(name, labelNames);
      const normalized = this.normalizeLabelValues(labelNames, labels);
      if (normalized) {
        gauge.set(normalized, value);
      } else {
        gauge.set(value);
      }
    } catch {
      // metrics collection should never throw
    }
  }

  incrementGauge(name: string, value: number = 1, labels?: Record<string, string>): void {
    try {
      const labelNames = this.resolveLabelNames(name, labels);
      const gauge = this.getOrCreateGauge(name, labelNames);
      const normalized = this.normalizeLabelValues(labelNames, labels);
      if (normalized) {
        gauge.inc(normalized, value);
      } else {
        gauge.inc(value);
      }
    } catch {
      // metrics collection should never throw
    }
  }

  decrementGauge(name: string, value: number = 1, labels?: Record<string, string>): void {
    try {
      const labelNames = this.resolveLabelNames(name, labels);
      const gauge = this.getOrCreateGauge(name, labelNames);
      const normalized = this.normalizeLabelValues(labelNames, labels);
      if (normalized) {
        gauge.dec(normalized, value);
      } else {
        gauge.dec(value);
      }
    } catch {
      // metrics collection should never throw
    }
  }

  getCounterValue(name: string, _labels?: Record<string, string>): number {
    const fullName = `${this.getPrefix()}_${name}`;
    const counter = this.counters.get(fullName);
    if (!counter) return 0;
    try {
      const metric = (counter as unknown as { hashMap?: Record<string, { value?: number }> }).hashMap;
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
  }

  getCountersByPrefix(name: string): Map<string, number> {
    const result = new Map<string, number>();
    const prefix = `${this.getPrefix()}_${name}`;
    for (const [key, counter] of this.counters) {
      if (key.startsWith(prefix)) {
        try {
          const metric = (counter as unknown as { hashMap?: Record<string, { value?: number }> }).hashMap;
          if (metric) {
            for (const hashKey of Object.keys(metric)) {
              result.set(`${key}${hashKey ? `{${hashKey}}` : ''}`, metric[hashKey]?.value ?? 0);
            }
          }
        } catch {
          // skip
        }
      }
    }
    return result;
  }

  getHistogramStats(name: string, _labels?: Record<string, string>): HistogramStats | null {
    const fullName = `${this.getPrefix()}_${name}`;
    const values = this.histogramRawValues.get(fullName);
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
      p50: getPercentile(50),
      p95: getPercentile(95),
      p99: getPercentile(99),
    };
  }

  async exportPrometheusFormat(): Promise<string> {
    return this.registry.metrics();
  }

  createMetricsMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const startTime = process.hrtime.bigint();
      this.incrementGauge('http_active_connections');

      const originalEnd = res.end;
      let finished = false;

      res.end = ((...args: Parameters<typeof originalEnd>): ReturnType<typeof originalEnd> => {
        if (!finished) {
          finished = true;
          const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
          const route = req.route?.path || req.path;

          this.incrementCounter('http_requests_total', {
            method: req.method,
            route,
            status: res.statusCode.toString(),
          });

          this.recordHistogram('http_request_duration_seconds', duration, {
            method: req.method,
            route,
          });

          if (res.statusCode >= 400) {
            this.incrementCounter('http_errors_total', {
              method: req.method,
              route,
              status: res.statusCode.toString(),
            });
          }

          this.decrementGauge('http_active_connections');
        }

        return originalEnd.apply(res, args);
      }) as typeof originalEnd;

      next();
    };
  }

  createMetricsEndpoint() {
    return async (_req: Request, res: Response): Promise<void> => {
      res.set('Content-Type', client.register.contentType);
      res.send(await this.exportPrometheusFormat());
    };
  }

  createMetricsRouter(): Router {
    const router = Router();
    router.get('/', this.createMetricsEndpoint());
    return router;
  }

  getRegistry(): client.Registry {
    return this.registry;
  }

  destroy(): void {
    this.registry.clear();
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
    this.histogramRawValues.clear();
    this.knownLabelNames.clear();
  }
}

export function createMetrics(serviceName: string): PrometheusMetrics {
  return new PrometheusMetrics({ serviceName });
}
