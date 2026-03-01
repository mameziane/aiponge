/**
 * Provider Analytics Service
 * Extracted from ai-config-service ProviderProxy - handles AI provider usage analytics and performance tracking
 *
 * Event buffering uses Redis lists for durability across process restarts,
 * with automatic fallback to in-memory arrays when Redis is unavailable.
 */

import {
  ProviderAnalytics,
  ProviderHealthMetrics,
  ProviderPerformanceMetrics,
  ProviderComparison,
  ProviderUsageTrends,
} from '../../domains/entities/ProviderAnalytics.js';
import { IProviderRepository } from '../../domains/repositories/IAnalyticsRepository';
import { MetricsCollectorService } from '../services/MetricsCollectorService';
import { type ICache, createIntervalScheduler, type IntervalScheduler } from '@aiponge/platform-core';
import { EventEmitter } from 'events';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('ai-analytics-service-provideranalyticsservice');

const REDIS_USAGE_BUFFER_KEY = '{analytics}:usage:buffer';
const REDIS_HEALTH_BUFFER_KEY = '{analytics}:health:buffer';
const MAX_REDIS_BUFFER_SIZE = 10_000;

export interface ProviderUsageEvent {
  timestamp: Date;
  providerId: string;
  providerType: 'llm' | 'music' | 'image' | 'audio';
  operation: string;
  requestId?: string;
  userId?: string;
  requestSize?: number;
  responseSize?: number;
  responseTimeMs: number;
  queueTimeMs?: number;
  processingTimeMs?: number;
  cost: number;
  inputTokens?: number;
  outputTokens?: number;
  success: boolean;
  errorType?: string;
  errorCode?: string;
  httpStatusCode?: number;
  circuitBreakerStatus?: 'closed' | 'open' | 'half-open';
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
  metadata?: Record<string, unknown>;
}

export interface ProviderHealthEvent {
  providerId: string;
  timestamp: Date;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
  responseTimeMs?: number;
  uptime: number;
  errorRate: number;
  throughput: number;
  circuitBreakerStatus: 'closed' | 'open' | 'half-open';
  lastError?: string;
  rateLimitStatus?: {
    remaining: number;
    limit: number;
    resetTime: Date;
  };
  metadata?: Record<string, unknown>;
}

export interface ProviderSelectionEvent {
  operation: string;
  selectedProviderId: string;
  fallbackProviders: string[];
  selectionTimeMs: number;
  totalCandidates: number;
  selectionCriteria: Record<string, unknown>;
  timestamp: Date;
}

export class ProviderAnalyticsService extends EventEmitter {
  private readonly repository: IProviderRepository;
  private readonly metricsCollector: MetricsCollectorService;
  private readonly cache: ICache;

  // Provider state tracking
  private readonly providerStats: Map<
    string,
    {
      requestCount: number;
      successCount: number;
      totalLatency: number;
      totalCost: number;
      lastSeen: Date;
      circuitBreakerState: 'closed' | 'open' | 'half-open';
    }
  > = new Map();

  private static readonly MAX_PERFORMANCE_CACHE_SIZE = 500;
  private readonly performanceCache: Map<string, { data: ProviderPerformanceMetrics; expiry: Date }> = new Map();
  private readonly cacheExpiryMinutes = 5;

  // In-memory fallback buffers (used only when Redis is unavailable)
  private readonly usageBufferFallback: ProviderAnalytics[] = [];
  private readonly healthBufferFallback: ProviderHealthMetrics[] = [];
  private readonly batchSize = 500;
  private readonly flushIntervalMs = 10000; // 10 seconds

  private flushScheduler: IntervalScheduler | null = null;

  constructor(repository: IProviderRepository, metricsCollector: MetricsCollectorService, cache: ICache) {
    super();
    this.repository = repository;
    this.metricsCollector = metricsCollector;
    this.cache = cache;

    this.startBatchProcessor();
    logger.debug('🏭 Initialized provider analytics service');
  }

  /**
   * Check if Redis is available for buffer operations.
   */
  private isRedisAvailable(): boolean {
    try {
      return this.cache.isReady();
    } catch (error) {
      logger.warn('Failed to check Redis availability', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Push an event to a Redis list with overflow protection.
   * Falls back to in-memory array on failure.
   */
  private async pushToRedisBuffer<T>(key: string, event: T, fallbackBuffer: T[]): Promise<void> {
    if (!this.isRedisAvailable()) {
      fallbackBuffer.push(event as T);
      return;
    }

    try {
      const pipeline = this.cache.pipeline();
      pipeline.rpush(key, JSON.stringify(event));
      pipeline.llen(key);
      const results = await pipeline.exec();

      const listLength = results?.[1]?.[1] as number | undefined;
      if (listLength && listLength > MAX_REDIS_BUFFER_SIZE) {
        const overflow = listLength - MAX_REDIS_BUFFER_SIZE;
        logger.warn(`Buffer ${key} exceeds max size (${listLength}), dropping ${overflow} oldest events`);
        await (this.cache as unknown as { eval: (...args: unknown[]) => Promise<unknown> }).eval(
          'return redis.call("ltrim", KEYS[1], ARGV[1], -1)',
          1,
          key,
          overflow
        );
      }
    } catch (error) {
      logger.warn(`Failed to push to Redis buffer ${key}, using in-memory fallback`, {
        error: error instanceof Error ? error.message : String(error),
      });
      fallbackBuffer.push(event as T);
    }
  }

  /**
   * Get the current length of a Redis buffer, or fallback buffer length.
   */
  private async getBufferLength(key: string, fallbackBuffer: unknown[]): Promise<number> {
    if (!this.isRedisAvailable()) {
      return fallbackBuffer.length;
    }

    try {
      const pipeline = this.cache.pipeline();
      pipeline.llen(key);
      const results = await pipeline.exec();
      const redisLen = (results?.[0]?.[1] as number) || 0;
      return redisLen + fallbackBuffer.length;
    } catch (error) {
      logger.warn('Failed to get Redis buffer length, using fallback', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return fallbackBuffer.length;
    }
  }

  /**
   * Record provider usage event (extracted from ProviderProxy)
   */
  async recordProviderUsage(event: ProviderUsageEvent): Promise<void> {
    const analytics: ProviderAnalytics = {
      timestamp: event.timestamp,
      providerId: event.providerId,
      providerType: event.providerType,
      operation: event.operation,
      requestId: event.requestId,
      userId: event.userId,
      requestSize: event.requestSize,
      responseSize: event.responseSize,
      responseTimeMs: event.responseTimeMs,
      queueTimeMs: event.queueTimeMs,
      processingTimeMs: event.processingTimeMs,
      cost: event.cost,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      success: event.success,
      errorType: event.errorType,
      errorCode: event.errorCode,
      httpStatusCode: event.httpStatusCode,
      circuitBreakerStatus: event.circuitBreakerStatus,
      rateLimitRemaining: event.rateLimitRemaining,
      rateLimitReset: event.rateLimitReset,
      metadata: event.metadata,
    };

    // Add to Redis buffer (falls back to in-memory)
    await this.pushToRedisBuffer(REDIS_USAGE_BUFFER_KEY, analytics, this.usageBufferFallback);

    // Update real-time stats
    this.updateProviderStats(event);

    // Record metrics
    await this.metricsCollector.recordMetric({
      name: 'provider.request',
      value: 1,
      timestamp: new Date(),
      tags: {
        providerId: event.providerId,
        operation: event.operation,
        success: event.success.toString(),
        cost: event.cost.toString(),
      },
      serviceName: 'ai-content-service',
      source: 'provider-proxy',
      metricType: 'counter',
    });

    // Emit real-time event
    this.emit('provider_usage_recorded', analytics);

    // Auto-flush if buffer is full
    const bufferLen = await this.getBufferLength(REDIS_USAGE_BUFFER_KEY, this.usageBufferFallback);
    if (bufferLen >= this.batchSize) {
      await this.flushUsageBuffer();
    }
  }

  /**
   * Record provider health status
   */
  async recordProviderHealth(event: ProviderHealthEvent): Promise<void> {
    const health: ProviderHealthMetrics = {
      providerId: event.providerId,
      timestamp: event.timestamp,
      healthStatus: event.healthStatus,
      responseTimeMs: event.responseTimeMs,
      uptime: event.uptime,
      errorRate: event.errorRate,
      throughput: event.throughput,
      circuitBreakerStatus: event.circuitBreakerStatus,
      lastError: event.lastError,
      rateLimitStatus: event.rateLimitStatus,
      metadata: event.metadata,
    };

    // Add to Redis buffer (falls back to in-memory)
    await this.pushToRedisBuffer(REDIS_HEALTH_BUFFER_KEY, health, this.healthBufferFallback);

    // Record circuit breaker state metrics
    await this.metricsCollector.recordMetric({
      name: 'circuit_breaker.state',
      value: 1,
      timestamp: new Date(),
      tags: { providerId: event.providerId, status: event.circuitBreakerStatus },
      serviceName: 'ai-config-service',
      source: 'provider-health',
      metricType: 'counter',
    });

    // Record health status metrics
    await this.metricsCollector.recordMetric({
      name: 'provider.health.status',
      value: this.healthStatusToValue(event.healthStatus),
      timestamp: new Date(),
      tags: {
        providerId: event.providerId,
        status: event.healthStatus,
      },
      serviceName: 'ai-config-service',
      source: 'health-monitor',
      metricType: 'gauge',
    });

    this.emit('provider_health_recorded', health);

    // Auto-flush if buffer is full
    const healthBufLen = await this.getBufferLength(REDIS_HEALTH_BUFFER_KEY, this.healthBufferFallback);
    if (healthBufLen >= this.batchSize) {
      await this.flushHealthBuffer();
    }
  }

  /**
   * Record provider selection metrics
   */
  async recordProviderSelection(event: ProviderSelectionEvent): Promise<void> {
    await this.metricsCollector.recordMetric({
      name: 'provider.selection.count',
      value: 1,
      timestamp: new Date(),
      tags: {
        operation: event.operation,
        selectedProvider: event.selectedProviderId,
        totalCandidates: event.totalCandidates.toString(),
      },
      serviceName: 'ai-config-service',
      source: 'provider-selector',
      metricType: 'counter',
    });

    await this.metricsCollector.recordMetric({
      name: 'provider.selection.time',
      value: event.selectionTimeMs,
      timestamp: new Date(),
      tags: {
        operation: event.operation,
        selectedProvider: event.selectedProviderId,
      },
      serviceName: 'ai-config-service',
      source: 'provider-selector',
      metricType: 'histogram',
    });

    this.emit('provider_selection_recorded', event);
  }

  /**
   * Get provider performance metrics (with caching)
   */
  async getProviderPerformanceMetrics(
    providerId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ProviderPerformanceMetrics> {
    const cacheKey = `${providerId}:${startTime.getTime()}:${endTime.getTime()}`;

    const cached = this.performanceCache.get(cacheKey);
    if (cached && cached.expiry > new Date()) {
      this.performanceCache.delete(cacheKey);
      this.performanceCache.set(cacheKey, cached);
      return cached.data;
    }

    const metrics = await this.repository.getProviderPerformanceMetrics(providerId, startTime, endTime);

    while (this.performanceCache.size >= ProviderAnalyticsService.MAX_PERFORMANCE_CACHE_SIZE) {
      const lruKey = this.performanceCache.keys().next().value;
      if (lruKey === undefined) break;
      this.performanceCache.delete(lruKey);
      logger.info('LRU eviction in performance cache (max {})', {
        data0: String(ProviderAnalyticsService.MAX_PERFORMANCE_CACHE_SIZE),
      });
    }

    this.performanceCache.set(cacheKey, {
      data: metrics,
      expiry: new Date(Date.now() + this.cacheExpiryMinutes * 60 * 1000),
    });

    return metrics;
  }

  /**
   * Get provider comparison for operation
   */
  async getProviderComparison(operation: string, startTime: Date, endTime: Date): Promise<ProviderComparison> {
    return this.repository.getProviderComparison(operation, startTime, endTime);
  }

  /**
   * Get provider usage trends
   */
  async getProviderUsageTrends(
    providerId: string,
    timePeriod: 'hour' | 'day' | 'week' | 'month',
    startTime: Date,
    endTime: Date
  ): Promise<ProviderUsageTrends> {
    return this.repository.getProviderUsageTrends(providerId, timePeriod, startTime, endTime);
  }

  /**
   * Get provider cost analytics
   */
  async getProviderCostAnalytics(
    startTime: Date,
    endTime: Date,
    groupBy: 'provider' | 'operation' | 'user'
  ): Promise<
    Array<{
      group: string;
      totalCost: number;
      requestCount: number;
      averageCost: number;
    }>
  > {
    return this.repository.getProviderCostAnalytics(startTime, endTime, groupBy);
  }

  /**
   * Get top providers by usage
   */
  async getTopProvidersByUsage(
    startTime: Date,
    endTime: Date,
    limit = 10
  ): Promise<
    Array<{
      providerId: string;
      requestCount: number;
      totalCost: number;
      averageLatency: number;
      successRate: number;
    }>
  > {
    return this.repository.getTopProvidersByUsage(startTime, endTime, limit);
  }

  /**
   * Get top providers by error rate
   */
  async getTopProvidersByError(
    startTime: Date,
    endTime: Date,
    limit = 10
  ): Promise<
    Array<{
      providerId: string;
      errorCount: number;
      errorRate: number;
      topErrors: Array<{ errorType: string; count: number }>;
    }>
  > {
    return this.repository.getTopProvidersByError(startTime, endTime, limit);
  }

  /**
   * Get real-time provider stats (from memory)
   */
  getProviderStats(providerId: string): {
    requestCount: number;
    successRate: number;
    avgLatency: number;
    totalCost: number;
    circuitBreakerState: string;
    lastSeen: Date;
  } {
    const stats = this.providerStats.get(providerId);

    if (!stats) {
      return {
        requestCount: 0,
        successRate: 0,
        avgLatency: 0,
        totalCost: 0,
        circuitBreakerState: 'closed',
        lastSeen: new Date(0),
      };
    }

    return {
      requestCount: stats.requestCount,
      successRate: stats.requestCount > 0 ? stats.successCount / stats.requestCount : 0,
      avgLatency: stats.requestCount > 0 ? stats.totalLatency / stats.requestCount : 0,
      totalCost: stats.totalCost,
      circuitBreakerState: stats.circuitBreakerState,
      lastSeen: stats.lastSeen,
    };
  }

  /**
   * Get all active providers' real-time stats
   */
  getAllProviderStats(): Record<string, ReturnType<typeof this.getProviderStats>> {
    const allStats: Record<string, ReturnType<typeof this.getProviderStats>> = {};

    for (const [providerId] of this.providerStats) {
      allStats[providerId] = this.getProviderStats(providerId);
    }

    return allStats;
  }

  /**
   * Get provider health summary
   */
  async getProviderHealthSummary(): Promise<{
    totalProviders: number;
    healthyProviders: number;
    degradedProviders: number;
    unhealthyProviders: number;
    circuitBreakersOpen: number;
  }> {
    const healthData = await this.repository.getProviderHealth();
    const stats = {
      totalProviders: healthData.length,
      healthyProviders: 0,
      degradedProviders: 0,
      unhealthyProviders: 0,
      circuitBreakersOpen: 0,
    };

    for (const health of healthData) {
      switch (health.healthStatus) {
        case 'healthy':
          stats.healthyProviders++;
          break;
        case 'degraded':
          stats.degradedProviders++;
          break;
        case 'unhealthy':
        case 'unavailable':
          stats.unhealthyProviders++;
          break;
      }

      if (health.circuitBreakerStatus === 'open') {
        stats.circuitBreakersOpen++;
      }
    }

    return stats;
  }

  /**
   * Health check for provider analytics
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    bufferedEvents: number;
    trackedProviders: number;
    details: Record<string, unknown>;
  }> {
    const usageLen = await this.getBufferLength(REDIS_USAGE_BUFFER_KEY, this.usageBufferFallback);
    const healthLen = await this.getBufferLength(REDIS_HEALTH_BUFFER_KEY, this.healthBufferFallback);
    const bufferedEvents = usageLen + healthLen;
    const trackedProviders = this.providerStats.size;

    // Check if we can write to the repository
    let repositoryHealthy = true;
    try {
      await this.repository.getProviderUsage({ limit: 1 });
    } catch (error) {
      repositoryHealthy = false;
    }

    const status = !repositoryHealthy ? 'unhealthy' : bufferedEvents > this.batchSize * 2 ? 'degraded' : 'healthy';

    return {
      status,
      bufferedEvents,
      trackedProviders,
      details: {
        usageBufferSize: usageLen,
        healthBufferSize: healthLen,
        usageFallbackSize: this.usageBufferFallback.length,
        healthFallbackSize: this.healthBufferFallback.length,
        redisAvailable: this.isRedisAvailable(),
        performanceCacheSize: this.performanceCache.size,
        repositoryHealthy,
        batchSize: this.batchSize,
        flushIntervalMs: this.flushIntervalMs,
      },
    };
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    if (this.flushScheduler) {
      this.flushScheduler.stop();
      this.flushScheduler = null;
    }

    // Flush remaining data
    await this.flushUsageBuffer();
    await this.flushHealthBuffer();

    logger.info('🏭 Shutdown completed');
  }

  // Private methods

  private updateProviderStats(event: ProviderUsageEvent): void {
    const stats = this.providerStats.get(event.providerId) || {
      requestCount: 0,
      successCount: 0,
      totalLatency: 0,
      totalCost: 0,
      lastSeen: new Date(0),
      circuitBreakerState: 'closed' as const,
    };

    stats.requestCount++;
    if (event.success) {
      stats.successCount++;
    }
    stats.totalLatency += event.responseTimeMs;
    stats.totalCost += event.cost;
    stats.lastSeen = event.timestamp;
    if (event.circuitBreakerStatus) {
      stats.circuitBreakerState = event.circuitBreakerStatus;
    }

    this.providerStats.set(event.providerId, stats);
  }

  /**
   * Drain events from a Redis list and return them as parsed objects.
   * Uses LRANGE + LTRIM for atomic read-and-remove.
   * Falls back to draining the in-memory fallback array.
   */
  private async drainRedisBuffer<T>(key: string, fallbackBuffer: T[], count: number): Promise<T[]> {
    const events: T[] = [];

    // 1. Drain fallback buffer first (these accumulated while Redis was down)
    if (fallbackBuffer.length > 0) {
      const fallbackItems = fallbackBuffer.splice(0, count);
      events.push(...fallbackItems);
      if (events.length >= count) {
        return events;
      }
    }

    // 2. Drain from Redis
    if (!this.isRedisAvailable()) {
      return events;
    }

    const remaining = count - events.length;
    try {
      const pipeline = this.cache.pipeline();
      pipeline.lrange(key, 0, remaining - 1);
      pipeline.ltrim(key, remaining, -1);
      const results = await pipeline.exec();

      const rawItems = (results?.[0]?.[1] as string[]) || [];
      for (const raw of rawItems) {
        try {
          events.push(JSON.parse(raw) as T);
        } catch (parseErr) {
          logger.warn('Failed to parse buffered event, skipping', {
            error: parseErr instanceof Error ? parseErr.message : String(parseErr),
          });
        }
      }
    } catch (error) {
      logger.warn(`Failed to drain Redis buffer ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return events;
  }

  private async flushUsageBuffer(): Promise<void> {
    const totalLen = await this.getBufferLength(REDIS_USAGE_BUFFER_KEY, this.usageBufferFallback);
    if (totalLen === 0) return;

    const usageToFlush = await this.drainRedisBuffer<ProviderAnalytics>(
      REDIS_USAGE_BUFFER_KEY,
      this.usageBufferFallback,
      this.batchSize
    );

    if (usageToFlush.length === 0) return;

    try {
      await this.repository.recordProviderUsagesBatch(usageToFlush);
      this.emit('usage_batch_flushed', { count: usageToFlush.length });
      logger.info('Flushed {} usage events to database', { data0: usageToFlush.length });
    } catch (error) {
      logger.error('Failed to flush usage buffer:', { error: error instanceof Error ? error.message : String(error) });
      // On failure, re-add to fallback buffer (limited to prevent unbounded growth)
      if (this.usageBufferFallback.length < this.batchSize) {
        this.usageBufferFallback.unshift(...usageToFlush.slice(-100));
      }
      this.emit('flush_error', { error, count: usageToFlush.length, type: 'usage' });
    }
  }

  private async flushHealthBuffer(): Promise<void> {
    const totalLen = await this.getBufferLength(REDIS_HEALTH_BUFFER_KEY, this.healthBufferFallback);
    if (totalLen === 0) return;

    const healthToFlush = await this.drainRedisBuffer<ProviderHealthMetrics>(
      REDIS_HEALTH_BUFFER_KEY,
      this.healthBufferFallback,
      this.batchSize
    );

    if (healthToFlush.length === 0) return;

    try {
      for (const health of healthToFlush) {
        await this.repository.recordProviderHealth(health);
      }
      this.emit('health_batch_flushed', { count: healthToFlush.length });
      logger.info('Flushed {} health events to database', { data0: healthToFlush.length });
    } catch (error) {
      logger.error('Failed to flush health buffer:', { error: error instanceof Error ? error.message : String(error) });
      // On failure, re-add to fallback buffer (limited to prevent unbounded growth)
      if (this.healthBufferFallback.length < this.batchSize) {
        this.healthBufferFallback.unshift(...healthToFlush.slice(-100));
      }
      this.emit('flush_error', { error, count: healthToFlush.length, type: 'health' });
    }
  }

  private startBatchProcessor(): void {
    this.flushScheduler = createIntervalScheduler({
      name: 'provider-analytics-flush',
      serviceName: 'ai-analytics-service',
      intervalMs: this.flushIntervalMs,
      handler: async () => {
        await this.flushUsageBuffer();
        await this.flushHealthBuffer();
        this.cleanupCache();
      },
    });
    this.flushScheduler.start();
  }

  private cleanupCache(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [key, cached] of this.performanceCache) {
      if (cached.expiry <= now) {
        this.performanceCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('🧹 Cleaned up {} expired cache entries', { data0: cleanedCount });
    }
  }

  private healthStatusToValue(status: string): number {
    switch (status) {
      case 'healthy':
        return 1;
      case 'degraded':
        return 0.5;
      case 'unhealthy':
        return 0.25;
      case 'unavailable':
        return 0;
      default:
        return 0;
    }
  }
}
