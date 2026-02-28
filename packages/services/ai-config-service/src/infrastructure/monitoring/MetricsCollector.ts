import { getLogger } from '../../config/service-urls';
import { publishAnalyticsMetric } from '@aiponge/platform-core';

const logger = getLogger('ai-config-service-metricscollector');

interface MetricEntry {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

interface AggregatedMetric {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  lastUpdated: Date;
}

export class MetricsCollector {
  private metrics: Map<string, MetricEntry[]> = new Map();
  private aggregates: Map<string, AggregatedMetric> = new Map();
  private readonly maxRetentionMs = 60 * 60 * 1000; // 1 hour (optimized for MVP)
  private readonly maxEntriesPerMetric = 500; // Prevent unbounded growth

  /**
   * Record a metric value
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    const entry: MetricEntry = {
      name,
      value,
      timestamp: new Date(),
      tags,
    };

    // Store individual metric
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(entry);

    // Update aggregates
    this.updateAggregate(name, value);

    // Clean old metrics
    this.cleanOldMetrics(name);

    publishAnalyticsMetric('ai-config-service', { metricName: name, metricValue: value, metricType: 'gauge', labels: tags });
  }

  /**
   * Record provider request metrics
   */
  recordProviderRequest(
    providerId: string,
    operation: string,
    success: boolean,
    latencyMs: number,
    cost?: number
  ): void {
    const baseTags = { providerId, operation };

    this.recordMetric('provider.request.count', 1, baseTags);
    this.recordMetric('provider.request.latency', latencyMs, baseTags);

    if (success) {
      this.recordMetric('provider.request.success', 1, baseTags);
    } else {
      this.recordMetric('provider.request.failure', 1, baseTags);
    }

    if (cost !== undefined) {
      this.recordMetric('provider.request.cost', cost, baseTags);
    }

    logger.info('{} {} {} {}ms{}', {
      data0: success ? '✅' : '❌',
      data1: providerId,
      data2: operation,
      data3: latencyMs,
      data4: cost ? ` $${cost}` : '',
    });
  }

  /**
   * Record provider selection metrics
   */
  recordProviderSelection(
    primaryProviderId: string,
    operation: string,
    selectionTimeMs: number,
    totalCandidates: number
  ): void {
    const tags = { primaryProviderId, operation };

    this.recordMetric('provider.selection.time', selectionTimeMs, tags);
    this.recordMetric('provider.selection.candidates', totalCandidates, tags);

    logger.info('Selected {} for {} ({}ms, {} candidates)', {
      data0: primaryProviderId,
      data1: operation,
      data2: selectionTimeMs,
      data3: totalCandidates,
    });
  }

  /**
   * Record circuit breaker events
   */
  recordCircuitBreakerEvent(providerId: string, event: 'open' | 'close' | 'half_open' | 'failure' | 'success'): void {
    const tags = { providerId, event };
    this.recordMetric('provider.circuit_breaker.event', 1, tags);

    logger.info('⚡ {} for provider {}', { data0: event.toUpperCase(), data1: providerId });
  }

  /**
   * Record error events
   */
  recordError(context: string, error: Error, tags?: Record<string, string>): void {
    const errorTags = { context, errorType: error.constructor.name, ...tags };
    this.recordMetric('provider.error', 1, errorTags);

    logger.error('{}: {}', { data0: context, data1: error.message, error: error.message });
  }

  /**
   * Get aggregated metrics for a specific metric name
   */
  getAggregatedMetric(name: string): AggregatedMetric | null {
    return this.aggregates.get(name) || null;
  }

  /**
   * Get provider performance statistics
   */
  getProviderStats(
    providerId: string,
    timeRangeMs: number = 3600000
  ): {
    requestCount: number;
    successRate: number;
    avgLatency: number;
    totalCost: number;
  } {
    const cutoffTime = new Date(Date.now() - timeRangeMs);

    const requestCount = this.sumMetricByProvider('provider.request.count', providerId, cutoffTime);
    const successCount = this.sumMetricByProvider('provider.request.success', providerId, cutoffTime);
    const totalLatency = this.sumMetricByProvider('provider.request.latency', providerId, cutoffTime);
    const totalCost = this.sumMetricByProvider('provider.request.cost', providerId, cutoffTime);

    return {
      requestCount,
      successRate: requestCount > 0 ? successCount / requestCount : 0,
      avgLatency: requestCount > 0 ? totalLatency / requestCount : 0,
      totalCost,
    };
  }

  private sumMetricByProvider(metricName: string, providerId: string, cutoffTime: Date): number {
    const entries = this.metrics.get(metricName) || [];
    let sum = 0;
    for (const metric of entries) {
      if (metric.timestamp > cutoffTime && metric.tags?.providerId === providerId) {
        sum += metric.value;
      }
    }
    return sum;
  }

  /**
   * Get all metrics (for debugging/admin purposes)
   */
  getAllMetrics(): Record<string, MetricEntry[]> {
    const result: Record<string, MetricEntry[]> = {};
    for (const [name, entries] of this.metrics.entries()) {
      result[name] = entries;
    }
    return result;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.aggregates.clear();
    logger.info('🧹 All metrics cleared');
  }

  // Private methods

  private updateAggregate(name: string, value: number): void {
    const existing = this.aggregates.get(name);

    if (existing) {
      existing.count++;
      existing.sum += value;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
      existing.avg = existing.sum / existing.count;
      existing.lastUpdated = new Date();
    } else {
      this.aggregates.set(name, {
        count: 1,
        sum: value,
        min: value,
        max: value,
        avg: value,
        lastUpdated: new Date(),
      });
    }
  }

  private cleanOldMetrics(metricName: string): void {
    const entries = this.metrics.get(metricName);
    if (!entries) return;

    const cutoffTime = new Date(Date.now() - this.maxRetentionMs);
    let filtered = entries.filter(entry => entry.timestamp > cutoffTime);

    // Also enforce max entries limit (LRU-style)
    if (filtered.length > this.maxEntriesPerMetric) {
      filtered = filtered.slice(-this.maxEntriesPerMetric);
    }

    if (filtered.length < entries.length) {
      this.metrics.set(metricName, filtered);
    }
  }
}
