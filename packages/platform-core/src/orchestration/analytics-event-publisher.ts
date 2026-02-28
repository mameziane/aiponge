/**
 * Analytics Event Publisher
 *
 * Provides a clean API for services to publish analytics events
 * Replaces HTTP calls to AnalyticsServiceClient.recordEvent/recordEvents
 * Uses fire-and-forget pattern for non-blocking telemetry
 */

import { getSharedEventBusClient, type IStandardizedEventBusClient, type StandardEvent } from './event-bus-client.js';
import { getLogger } from '../logging/logger.js';
import { serializeError } from '../logging/error-serializer.js';
import { createIntervalScheduler, type IntervalScheduler } from '../scheduling/IntervalScheduler.js';

const logger = getLogger('analytics-event-publisher');

export interface AnalyticsEventData {
  eventType: string;
  eventData: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  deviceType?: string;
  location?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsMetricData {
  metricName: string;
  metricValue: number;
  metricType: 'counter' | 'gauge' | 'histogram';
  labels?: Record<string, string>;
  timestamp?: string;
}

export interface ProviderUsageData {
  providerId: string;
  providerName: string;
  operation: string;
  success: boolean;
  durationMs?: number;
  tokensUsed?: number;
  cost?: number;
  userId?: string;
  error?: string;
}

export class AnalyticsEventPublisher {
  private serviceName: string;
  private eventBusClient: IStandardizedEventBusClient;
  private eventQueue: AnalyticsEventData[] = [];
  private batchScheduler: IntervalScheduler | null = null;
  private readonly batchSize: number;
  private readonly batchInterval: number;

  constructor(
    serviceName: string,
    options: {
      batchSize?: number;
      batchInterval?: number;
    } = {}
  ) {
    this.serviceName = serviceName;
    this.batchSize = options.batchSize || 100;
    this.batchInterval = options.batchInterval || 30000;
    this.eventBusClient = getSharedEventBusClient(serviceName);
    this.startBatchProcessing();

    logger.debug('Analytics event publisher initialized', {
      service: serviceName,
      batchSize: this.batchSize,
      batchInterval: this.batchInterval,
    });
  }

  /**
   * Record a single analytics event (queued for batch processing)
   * Fire-and-forget - returns immediately, never throws
   */
  recordEvent(event: AnalyticsEventData): void {
    try {
      const eventWithDefaults: AnalyticsEventData = {
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
        metadata: {
          ...event.metadata,
          service: this.serviceName,
        },
      };

      this.eventQueue.push(eventWithDefaults);

      if (this.eventQueue.length >= this.batchSize) {
        this.processBatch().catch(error => {
          logger.warn('Batch processing failed', { queueSize: this.eventQueue.length, error: serializeError(error) });
        });
      }
    } catch (error) {
      logger.warn('Failed to queue analytics event (non-blocking)', {
        error: serializeError(error),
        eventType: event.eventType,
      });
    }
  }

  /**
   * Record multiple events immediately via event bus
   * Fire-and-forget - returns immediately, never throws
   */
  recordEvents(events: AnalyticsEventData[]): void {
    if (events.length === 0) return;

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const standardEvent: StandardEvent = {
      eventId: `ana_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      correlationId: batchId,
      type: 'analytics.events.batch',
      timestamp: new Date().toISOString(),
      version: '1.0',
      source: this.serviceName,
      data: {
        events: events.map(e => ({
          ...e,
          timestamp: e.timestamp || new Date().toISOString(),
          metadata: { ...e.metadata, service: this.serviceName },
        })),
        batchId,
        sourceService: this.serviceName,
      },
    };

    this.eventBusClient.publish(standardEvent).catch(error => {
      logger.warn('Failed to publish analytics batch event (non-blocking)', {
        error: serializeError(error),
        eventCount: events.length,
      });
    });
  }

  publishDirect(eventType: string, data: Record<string, unknown>): void {
    const standardEvent: StandardEvent = {
      eventId: `ana_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      correlationId: (data['correlationId'] as string) || `direct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      timestamp: new Date().toISOString(),
      version: '1.0',
      source: this.serviceName,
      data,
    };

    this.eventBusClient.publish(standardEvent).catch(error => {
      logger.warn('Failed to publish direct analytics event (non-blocking)', {
        error: serializeError(error),
        eventType,
      });
    });
  }

  /**
   * Record a metric (counter, gauge, or histogram)
   * Fire-and-forget - returns immediately, never throws
   */
  recordMetric(metric: AnalyticsMetricData): void {
    const standardEvent: StandardEvent = {
      eventId: `ana_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      correlationId: `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'analytics.metric.recorded',
      timestamp: new Date().toISOString(),
      version: '1.0',
      source: this.serviceName,
      data: {
        ...metric,
        timestamp: metric.timestamp || new Date().toISOString(),
      },
    };

    this.eventBusClient.publish(standardEvent).catch(error => {
      logger.warn('Failed to publish analytics metric (non-blocking)', {
        error: serializeError(error),
        metricName: metric.metricName,
      });
    });
  }

  /**
   * Record provider usage (AI provider calls, etc.)
   * Fire-and-forget - returns immediately, never throws
   */
  recordProviderUsage(usage: ProviderUsageData): void {
    const standardEvent: StandardEvent = {
      eventId: `ana_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      correlationId: `prov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'analytics.provider.usage',
      timestamp: new Date().toISOString(),
      version: '1.0',
      source: this.serviceName,
      data: usage as unknown as Record<string, unknown>,
    };

    this.eventBusClient.publish(standardEvent).catch(error => {
      logger.warn('Failed to publish provider usage (non-blocking)', {
        error: serializeError(error),
        providerId: usage.providerId,
      });
    });
  }

  /**
   * Force process queued events immediately
   */
  async flushEvents(): Promise<void> {
    if (this.eventQueue.length > 0) {
      await this.processBatch();
    }
  }

  /**
   * Graceful shutdown - flush all queued events
   */
  async shutdown(): Promise<void> {
    logger.info('Analytics event publisher shutting down', {
      queuedEvents: this.eventQueue.length,
    });

    if (this.batchScheduler) {
      this.batchScheduler.stop();
      this.batchScheduler = null;
    }

    await this.flushEvents();
    logger.info('Analytics event publisher shutdown complete');
  }

  private startBatchProcessing(): void {
    this.batchScheduler = createIntervalScheduler({
      name: `analytics-batch-${this.serviceName}`,
      serviceName: this.serviceName,
      intervalMs: this.batchInterval,
      handler: async () => {
        if (this.eventQueue.length > 0) {
          await this.processBatch();
        }
      },
      register: false,
    });
    this.batchScheduler.start();
  }

  private async processBatch(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const eventsToProcess = this.eventQueue.splice(0, this.batchSize);
    this.recordEvents(eventsToProcess);
  }
}

const publisherInstances = new Map<string, AnalyticsEventPublisher>();

/**
 * Get or create an AnalyticsEventPublisher for a service
 * Singleton per service name for efficiency
 */
export function getAnalyticsEventPublisher(
  serviceName: string,
  options?: { batchSize?: number; batchInterval?: number }
): AnalyticsEventPublisher {
  if (!publisherInstances.has(serviceName)) {
    publisherInstances.set(serviceName, new AnalyticsEventPublisher(serviceName, options));
  }
  return publisherInstances.get(serviceName)!;
}

/**
 * Convenience function to record an analytics event
 * Creates/reuses publisher for the service automatically
 */
export function publishAnalyticsEvent(serviceName: string, event: AnalyticsEventData): void {
  getAnalyticsEventPublisher(serviceName).recordEvent(event);
}

/**
 * Convenience function to record a metric
 */
export function publishAnalyticsMetric(serviceName: string, metric: AnalyticsMetricData): void {
  getAnalyticsEventPublisher(serviceName).recordMetric(metric);
}

/**
 * Convenience function to record provider usage
 */
export function publishProviderUsage(serviceName: string, usage: ProviderUsageData): void {
  getAnalyticsEventPublisher(serviceName).recordProviderUsage(usage);
}
