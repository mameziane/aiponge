import { STANDARD_METRICS } from './types.js';
import type { EventBusMetricsData } from './types.js';
import type { PrometheusMetrics } from './prometheus-metrics.js';

export class EventBusMetrics {
  private metrics: PrometheusMetrics | null = null;
  private serviceName: string;
  private publishedCount: number = 0;
  private receivedCount: number = 0;
  private publishErrors: number = 0;
  private subscribeErrors: number = 0;
  private connected: boolean = false;
  private redisEnabled: boolean = false;
  private pendingEvents: number = 0;
  private reconnectAttemptsCount: number = 0;
  private dlqPublishedCount: number = 0;
  private publishLatencies: number[] = [];

  constructor(serviceName: string, sharedMetrics?: PrometheusMetrics) {
    this.serviceName = serviceName;
    this.metrics = sharedMetrics || null;
  }

  setMetricsInstance(metrics: PrometheusMetrics): void {
    this.metrics = metrics;
  }

  recordEventPublished(eventType: string): void {
    this.publishedCount++;
    this.metrics?.incrementCounter(STANDARD_METRICS.EVENT_BUS_PUBLISHED, { event_type: eventType });
  }

  recordEventReceived(eventType: string): void {
    this.receivedCount++;
    this.metrics?.incrementCounter(STANDARD_METRICS.EVENT_BUS_RECEIVED, { event_type: eventType });
  }

  recordPublishError(eventType: string): void {
    this.publishErrors++;
    this.metrics?.incrementCounter(STANDARD_METRICS.EVENT_BUS_PUBLISH_ERRORS, { event_type: eventType });
  }

  recordSubscribeError(eventType: string): void {
    this.subscribeErrors++;
    this.metrics?.incrementCounter(STANDARD_METRICS.EVENT_BUS_SUBSCRIBE_ERRORS, { event_type: eventType });
  }

  setConnectionStatus(connected: boolean, redisEnabled: boolean): void {
    this.connected = connected;
    this.redisEnabled = redisEnabled;
    this.metrics?.setGauge(STANDARD_METRICS.EVENT_BUS_CONNECTION_STATUS, connected ? 1 : 0, {
      redis_enabled: redisEnabled ? 'true' : 'false',
    });
  }

  setPendingEvents(count: number): void {
    this.pendingEvents = count;
    this.metrics?.setGauge(STANDARD_METRICS.ANALYTICS_EVENTS_QUEUED, count);
  }

  recordAnalyticsEventPublished(batchSize: number = 1): void {
    this.metrics?.incrementCounter(STANDARD_METRICS.ANALYTICS_EVENTS_PUBLISHED, {}, batchSize);
  }

  recordAnalyticsMetricPublished(): void {
    this.metrics?.incrementCounter(STANDARD_METRICS.ANALYTICS_METRICS_PUBLISHED);
  }

  recordConfigCacheInvalidation(cacheType: string): void {
    this.metrics?.incrementCounter(STANDARD_METRICS.CONFIG_CACHE_INVALIDATIONS, { cache_type: cacheType });
  }

  recordReconnectAttempt(): void {
    this.reconnectAttemptsCount++;
    this.metrics?.incrementCounter('event_bus_reconnect_attempts_total');
  }

  recordDlqPublished(): void {
    this.dlqPublishedCount++;
    this.metrics?.incrementCounter(STANDARD_METRICS.DLQ_ITEMS_TOTAL);
  }

  setDlqDepth(depth: number): void {
    this.metrics?.setGauge(STANDARD_METRICS.DLQ_DEPTH_CURRENT, depth);
  }

  recordPublishLatency(latencyMs: number): void {
    this.publishLatencies.push(latencyMs);
    if (this.publishLatencies.length > 1000) {
      this.publishLatencies.splice(0, this.publishLatencies.length - 500);
    }
    this.metrics?.recordHistogram('event_bus_publish_latency_seconds', latencyMs / 1000);
  }

  getStats(): EventBusMetricsData {
    let avgLatency: number | null = null;
    if (this.publishLatencies.length > 0) {
      avgLatency = Math.round(this.publishLatencies.reduce((a, b) => a + b, 0) / this.publishLatencies.length);
    }

    return {
      eventsPublished: this.publishedCount,
      eventsReceived: this.receivedCount,
      publishErrors: this.publishErrors,
      subscribeErrors: this.subscribeErrors,
      connected: this.connected,
      redisEnabled: this.redisEnabled,
      pendingEvents: this.pendingEvents,
      reconnectAttempts: this.reconnectAttemptsCount,
      dlqPublished: this.dlqPublishedCount,
      avgPublishLatencyMs: avgLatency,
    };
  }

  getPrometheusMetrics(): PrometheusMetrics | null {
    return this.metrics;
  }
}

const eventBusMetricsInstances = new Map<string, EventBusMetrics>();

export function getEventBusMetrics(serviceName: string): EventBusMetrics {
  if (!eventBusMetricsInstances.has(serviceName)) {
    eventBusMetricsInstances.set(serviceName, new EventBusMetrics(serviceName));
  }
  return eventBusMetricsInstances.get(serviceName)!;
}

export function registerEventBusMetrics(serviceName: string, metrics: PrometheusMetrics): EventBusMetrics {
  const eventBusMetrics = getEventBusMetrics(serviceName);
  eventBusMetrics.setMetricsInstance(metrics);
  return eventBusMetrics;
}
