/**
 * MetricsCollectorService - AI Analytics Service
 * High-performance metrics collection and processing with batching and caching
 */

import { IMetricsRepository } from '../../domains/repositories/IAnalyticsRepository';
import { type ICache } from '@aiponge/platform-core';
import { MetricEntry } from '../../domains/entities/MetricEntry';
import { getLogger } from '../../config/service-urls';
import { createIntervalScheduler } from '@aiponge/platform-core';
import type { IntervalScheduler } from '@aiponge/platform-core';

const logger = getLogger('ai-analytics-service-metricscollectorservice');

export class MetricsCollectorService {
  private metricsBatch: MetricEntry[] = [];
  private batchSize = 100;
  private flushInterval = 5000; // 5 seconds
  private batchScheduler: IntervalScheduler | null = null;

  constructor(
    private readonly repository: IMetricsRepository,
    private readonly cache: ICache
  ) {
    this.initializeBatchProcessing();
    logger.debug('Initialized with batch processing');
  }

  private initializeBatchProcessing(): void {
    this.batchScheduler = createIntervalScheduler({
      name: 'metrics-batch-flush',
      serviceName: 'ai-analytics-service',
      intervalMs: this.flushInterval,
      handler: () => this.flushBatch(),
    });
    this.batchScheduler.start();
  }

  /**
   * Record a single metric entry
   */
  async recordMetric(entry: MetricEntry): Promise<void> {
    try {
      this.metricsBatch.push(entry);

      if (this.metricsBatch.length >= this.batchSize) {
        await this.flushBatch();
      }
    } catch (error) {
      logger.error('Failed to record metric:', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Record multiple metric entries
   */
  async recordMetrics(entries: MetricEntry[]): Promise<void> {
    try {
      this.metricsBatch.push(...entries);

      if (this.metricsBatch.length >= this.batchSize) {
        await this.flushBatch();
      }
    } catch (error) {
      logger.error('Failed to record metrics:', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Flush current batch to database
   */
  private async flushBatch(): Promise<void> {
    if (this.metricsBatch.length === 0) return;

    const batch = [...this.metricsBatch];
    this.metricsBatch = [];

    try {
      await this.repository.recordMetrics(batch);
      logger.info('Flushed {} metrics to database', { data0: batch.length });
    } catch (error) {
      logger.error('Failed to flush metrics batch:', { error: error instanceof Error ? error.message : String(error) });
      // Add metrics back to batch for retry on next flush (with size limit to prevent unbounded growth)
      const maxBatchSize = 1000;
      const availableSpace = maxBatchSize - this.metricsBatch.length;
      if (availableSpace > 0) {
        // Only re-queue as many entries as we have space for
        const entriesToRequeue = batch.slice(0, availableSpace);
        this.metricsBatch.unshift(...entriesToRequeue);
        if (batch.length > availableSpace) {
          logger.warn('Dropped {} metrics due to queue size limit', { data0: batch.length - availableSpace });
        }
      } else {
        logger.warn('Dropped {} metrics - queue at max capacity', { data0: batch.length });
      }
    }
  }

  /**
   * Get metric time series data
   */
  async getMetricTimeSeries(
    metricName: string,
    serviceName: string,
    startTime: Date,
    endTime: Date,
    intervalMinutes: number,
    tags?: Record<string, string>
  ): Promise<Array<{ timestamp: Date; value: number }>> {
    try {
      return await this.repository.getMetricTimeSeries(metricName, startTime, endTime, intervalMinutes, tags);
    } catch (error) {
      logger.error('Failed to get metric time series:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get provider-specific metrics
   */
  async getProviderMetrics(
    providerId: string,
    timeRangeMs: number
  ): Promise<{
    providerId: string;
    timeRange: { startTime: Date; endTime: Date };
    metrics: MetricEntry[];
    summary: { totalRequests: number; averageLatency: number; errorRate: number };
  }> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - timeRangeMs);

      const cacheKey = `provider_metrics:${providerId}:${timeRangeMs}`;
      const cached = await this.cache.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const metrics = await this.repository.getMetrics({
        serviceName: 'provider',
        startTime,
        endTime,
        tags: { providerId },
      });

      const result = {
        providerId,
        timeRange: { startTime, endTime },
        metrics,
        summary: {
          totalRequests: metrics.filter(m => m.name === 'requests_total').length,
          averageLatency: this.calculateAverageLatency(metrics),
          errorRate: this.calculateErrorRate(metrics),
        },
      };

      // Cache for 1 minute
      await this.cache.setex(cacheKey, 60, JSON.stringify(result));

      return result;
    } catch (error) {
      logger.error('Failed to get provider metrics:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Export Prometheus metrics format
   */
  async exportPrometheusMetrics(serviceName?: string): Promise<string> {
    try {
      return await this.repository.exportPrometheusMetrics(serviceName);
    } catch (error) {
      logger.error('Failed to export Prometheus metrics:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate average latency from metrics
   */
  private calculateAverageLatency(metrics: MetricEntry[]): number {
    const latencyMetrics = metrics.filter(m => m.name.includes('latency') || m.name.includes('duration'));
    if (latencyMetrics.length === 0) return 0;

    const totalLatency = latencyMetrics.reduce((sum, metric) => sum + metric.value, 0);
    return totalLatency / latencyMetrics.length;
  }

  /**
   * Calculate error rate from metrics
   */
  private calculateErrorRate(metrics: MetricEntry[]): number {
    const errorMetrics = metrics.filter(m => m.name.includes('error') || m.name.includes('failure'));
    const totalMetrics = metrics.filter(m => m.name.includes('requests') || m.name.includes('total'));

    if (totalMetrics.length === 0) return 0;

    const totalErrors = errorMetrics.reduce((sum, metric) => sum + metric.value, 0);
    const totalRequests = totalMetrics.reduce((sum, metric) => sum + metric.value, 0);

    return totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    try {
      if (this.batchScheduler) {
        this.batchScheduler.stop();
        this.batchScheduler = null;
      }

      // Flush any remaining metrics
      await this.flushBatch();

      logger.info('Shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
