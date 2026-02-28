/**
 * Event Subscriber Base Module
 * Provides idempotent event consumption with retry and dead-letter handling
 */

import { createEventBusClient } from './event-bus-factory.js';
import { type StandardEvent, type IStandardizedEventBusClient } from './event-bus-client';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('event-subscriber');

export interface EventHandler<T = unknown> {
  (event: StandardEvent, data: T): Promise<void>;
}

export interface SubscriptionConfig {
  eventType: string;
  handler: EventHandler;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface ProcessedEvent {
  timestamp: number;
  success: boolean;
}

const LRU_MAX_SIZE = 10000;
const PROCESSED_TTL_MS = 24 * 60 * 60 * 1000;

export class EventSubscriber {
  private serviceName: string;
  private client: IStandardizedEventBusClient | null = null;
  private subscriptions: SubscriptionConfig[] = [];
  private processedEvents = new Map<string, ProcessedEvent>();
  private started = false;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  register(config: SubscriptionConfig): this {
    this.subscriptions.push({
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    });
    return this;
  }

  async start(): Promise<void> {
    if (this.started) return;

    this.client = createEventBusClient(this.serviceName);

    for (const sub of this.subscriptions) {
      await this.client.subscribe(sub.eventType, async event => {
        await this.handleEvent(event, sub);
      });
      logger.debug('Subscribed to {} for service {}', { data0: sub.eventType, data1: this.serviceName });
    }

    if (this.client.startConsuming) {
      await this.client.startConsuming();
    }

    this.started = true;
    logger.debug('Event subscriber started for {} with {} subscriptions', {
      data0: this.serviceName,
      data1: String(this.subscriptions.length),
    });
  }

  private async handleEvent(event: StandardEvent, config: SubscriptionConfig): Promise<void> {
    if (this.isProcessed(event.eventId)) {
      logger.debug('Skipping duplicate event {}', { data0: event.eventId });
      return;
    }

    let lastError: Error | null = null;
    const maxRetries = config.maxRetries ?? 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await config.handler(event, event.data);
        this.markProcessed(event.eventId, true);
        logger.debug('Processed event {} on attempt {}', { data0: event.eventId, data1: String(attempt + 1) });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn('Event {} handler failed (attempt {}/{}): {}', {
          data0: event.eventId,
          data1: String(attempt + 1),
          data2: String(maxRetries + 1),
          data3: lastError.message,
        });

        if (attempt < maxRetries) {
          await this.delay(config.retryDelayMs ?? 1000);
        }
      }
    }

    this.markProcessed(event.eventId, false);
    logger.error('Event {} failed after {} attempts - moving to dead letter', {
      data0: event.eventId,
      data1: String(maxRetries + 1),
      error: lastError?.message,
    });
    this.handleDeadLetter(event, lastError);
  }

  private isProcessed(eventId: string): boolean {
    const processed = this.processedEvents.get(eventId);
    if (!processed) return false;
    if (Date.now() - processed.timestamp > PROCESSED_TTL_MS) {
      this.processedEvents.delete(eventId);
      return false;
    }
    return true;
  }

  private markProcessed(eventId: string, success: boolean): void {
    if (this.processedEvents.size >= LRU_MAX_SIZE) {
      const oldestKey = this.processedEvents.keys().next().value;
      if (oldestKey) this.processedEvents.delete(oldestKey);
    }
    this.processedEvents.set(eventId, { timestamp: Date.now(), success });
  }

  private handleDeadLetter(event: StandardEvent, error: Error | null): void {
    logger.error('Dead letter event: {} type={} error={}', {
      data0: event.eventId,
      data1: event.type,
      data2: error?.message || 'unknown',
      eventData: JSON.stringify(event.data),
    });

    if (this.client?.publishToDeadLetter && error) {
      this.client.publishToDeadLetter(event, error).catch(dlqErr => {
        logger.error('Failed to publish dead letter event {}', {
          data0: event.eventId,
          error: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
        });
      });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
    }
    this.started = false;
    logger.info('Event subscriber shut down for {}', { data0: this.serviceName });
  }
}

export function createEventSubscriber(serviceName: string): EventSubscriber {
  return new EventSubscriber(serviceName);
}
