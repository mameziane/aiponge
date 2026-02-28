import { createLogger } from '../logging/logger.js';
import type { PrometheusMetrics, HistogramStats } from './index.js';

const logger = createLogger('slo');

export interface SloThresholds {
  httpP99LatencyMs: number;
  httpErrorRatePercent: number;
  healthCheckSuccessRate: number;
}

const DEFAULT_SLO_THRESHOLDS: SloThresholds = {
  httpP99LatencyMs: parseInt(process.env.SLO_HTTP_P99_LATENCY_MS || '3000', 10),
  httpErrorRatePercent: parseFloat(process.env.SLO_HTTP_ERROR_RATE_PERCENT || '1'),
  healthCheckSuccessRate: parseFloat(process.env.SLO_HEALTH_CHECK_SUCCESS_RATE || '99.9'),
};

export interface SloViolation {
  metric: string;
  threshold: number;
  actual: number;
  severity: 'warning' | 'critical';
}

export interface SloCheckResult {
  healthy: boolean;
  violations: SloViolation[];
  checkedAt: string;
}

export function checkSloViolations(
  metrics: PrometheusMetrics,
  thresholds: SloThresholds = DEFAULT_SLO_THRESHOLDS
): SloCheckResult {
  const violations: SloViolation[] = [];

  const latencyStats: HistogramStats | null = metrics.getHistogramStats('http_request_duration_seconds');
  if (latencyStats && latencyStats.count > 10) {
    const p99Ms = latencyStats.p99 * 1000;
    if (p99Ms > thresholds.httpP99LatencyMs) {
      violations.push({
        metric: 'http_p99_latency_ms',
        threshold: thresholds.httpP99LatencyMs,
        actual: Math.round(p99Ms),
        severity: p99Ms > thresholds.httpP99LatencyMs * 2 ? 'critical' : 'warning',
      });
    }
  }

  const requestCounters = metrics.getCountersByPrefix('http_requests_total');
  const errorCounters = metrics.getCountersByPrefix('http_errors_total');
  let totalRequests = 0;
  let totalErrors = 0;
  requestCounters.forEach(v => {
    totalRequests += v;
  });
  errorCounters.forEach(v => {
    totalErrors += v;
  });

  if (totalRequests > 10) {
    const errorRate = (totalErrors / totalRequests) * 100;
    if (errorRate > thresholds.httpErrorRatePercent) {
      violations.push({
        metric: 'http_error_rate_percent',
        threshold: thresholds.httpErrorRatePercent,
        actual: Math.round(errorRate * 100) / 100,
        severity: errorRate > thresholds.httpErrorRatePercent * 3 ? 'critical' : 'warning',
      });
    }

    const successRate = ((totalRequests - totalErrors) / totalRequests) * 100;
    if (successRate < thresholds.healthCheckSuccessRate) {
      violations.push({
        metric: 'health_check_success_rate',
        threshold: thresholds.healthCheckSuccessRate,
        actual: Math.round(successRate * 100) / 100,
        severity: successRate < thresholds.healthCheckSuccessRate - 5 ? 'critical' : 'warning',
      });
    }
  }

  const result: SloCheckResult = {
    healthy: violations.filter(v => v.severity === 'critical').length === 0,
    violations,
    checkedAt: new Date().toISOString(),
  };

  if (violations.length > 0) {
    logger.warn('SLO violations detected', {
      violationCount: violations.length,
      critical: violations.filter(v => v.severity === 'critical').length,
      violations,
    });
  }

  return result;
}

export function getSloThresholds(): SloThresholds {
  return { ...DEFAULT_SLO_THRESHOLDS };
}
