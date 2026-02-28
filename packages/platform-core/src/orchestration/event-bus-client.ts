/**
 * Event Bus Client Infrastructure
 *
 * Standardized event bus client for cross-service communication
 * Uses Redis Pub/Sub for real-time event distribution across services
 */

import Redis from 'ioredis';
import { getLogger } from '../logging/logger.js';
import { getEventBusMetrics, type EventBusMetrics } from '../metrics/index.js';
import { serializeError } from '../logging/error-serializer.js';
import { createEventBusClient } from './event-bus-factory.js';
import { DomainError } from '../error-handling/errors.js';

const logger = getLogger('event-bus-client');

const EVENT_CHANNEL_PREFIX = 'aiponge:events:';

/**
 * Standard event structure for cross-service communication
 */
export interface StandardEvent {
  eventId: string;
  correlationId: string;
  type: string;
  timestamp: string;
  version: string;
  source: string;
  data: Record<string, unknown>;
  sequenceNumber?: number;
}

/**
 * Event subscription callback interface
 */
export type EventSubscriptionCallback = (event: StandardEvent) => Promise<void>;

/**
 * Extended health detail for event bus observability
 */
export interface EventBusHealthDetail {
  provider: 'redis' | 'kafka' | 'memory';
  connected: boolean;
  producerConnected: boolean;
  consumerConnected: boolean;
  consumerRunning: boolean;
  pendingEventCount: number;
  subscriptionCount: number;
  reconnectAttempts: number;
  lastReconnectAt: string | null;
  lastError: string | null;
  dlqPublishedCount: number;
  shuttingDown: boolean;
  autoCreateTopics?: boolean;
  bufferCapacityPercent?: number;
}

/**
 * Standardized Event Bus Client interface
 */
export interface IStandardizedEventBusClient {
  publish(event: StandardEvent): Promise<void>;
  publishToDeadLetter?(event: StandardEvent, error: Error): Promise<void>;
  subscribe(eventType: string, callback: EventSubscriptionCallback): Promise<void>;
  startConsuming?(): Promise<void>;
  unsubscribe(eventType: string, callback?: EventSubscriptionCallback): Promise<void>;
  disconnect(): Promise<void>;
  shutdown(): Promise<void>;
  getConnectionStatus(): boolean;
  getProviderType(): 'redis' | 'kafka' | 'memory';
  getMetrics(): EventBusMetrics | null;
  getHealthDetail?(): EventBusHealthDetail;
}

/**
 * Redis-based Event Bus Client implementation
 * Uses Redis Streams (XADD/XREADGROUP) for durable, at-least-once event delivery
 * Falls back to Redis Pub/Sub when Redis version < 5.0, and to in-memory when Redis unavailable
 */
export class RedisEventBusClient implements IStandardizedEventBusClient {
  private serviceName: string;
  private connected: boolean = false;
  private redisEnabled: boolean = false;
  private initPromise: Promise<void>;
  private redisClient: Redis | null = null;
  private pubsubSubClients = new Map<string, Redis>();
  private subscriptions = new Map<string, Set<EventSubscriptionCallback>>();
  private subscribedStreams = new Set<string>();
  private pendingEvents: StandardEvent[] = [];
  private metrics: EventBusMetrics;
  private sequenceCounter = 0;
  private useStreams = false;
  private consumerGroupName: string;
  private consumerName: string;
  private pollingActive = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly STREAM_MAXLEN = parseInt(process.env.EVENT_BUS_STREAM_MAXLEN || '10000', 10);
  private readonly POLL_INTERVAL_MS = parseInt(process.env.EVENT_BUS_POLL_INTERVAL_MS || '100', 10);

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.consumerGroupName = `aiponge-${serviceName}`;
    this.consumerName = `${serviceName}-${process.pid}`;
    this.metrics = getEventBusMetrics(serviceName);
    this.initPromise = this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      // No Redis URL — fall back to in-memory mode for all environments.
      // In production this means cross-service events won't be delivered between
      // processes, but individual services remain fully operational.
      // To enable cross-service events, set REDIS_URL in the deployment env.
      const level = process.env.NODE_ENV === 'production' ? 'warn' : 'info';
      logger[level]('REDIS_URL not configured - event bus operating in memory-only mode for {}', {
        data0: this.serviceName,
      });
      this.connected = true;
      this.metrics.setConnectionStatus(true, false);
      this.flushPending();
      return;
    }

    try {
      this.redisClient = new Redis(redisUrl, {
        // Queue commands during reconnection rather than failing immediately.
        // Default maxRetriesPerRequest:3 causes xreadgroup polls to throw
        // "AbortError: Command connection not ready" during the reconnection
        // window, generating 100ms-interval error log storms. null = queue forever.
        maxRetriesPerRequest: null,
        // Re-enqueue offline commands when Redis reconnects (already default,
        // made explicit so intent is clear).
        enableOfflineQueue: true,
        // Reconnect with bounded exponential backoff: 100ms → 200ms → … → 3s max.
        // Without an explicit strategy, ioredis uses its own default which is fine,
        // but explicit is easier to tune and audit.
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
      });

      this.redisClient.on('error', err => {
        logger.error('Redis client error for {}', { data0: this.serviceName, error: err.message });
        // Mark Redis as unavailable so publishInternal falls through to local delivery.
        // ioredis will reconnect automatically; the 'ready' handler below re-enables it.
        this.redisEnabled = false;
        this.metrics.setConnectionStatus(true, false);
      });

      // Fires on every successful (re)connection, including after a transient drop.
      this.redisClient.on('ready', () => {
        if (!this.redisEnabled) {
          logger.info('Redis event bus reconnected for service {}', { data0: this.serviceName });
        }
        this.redisEnabled = true;
        this.connected = true;
        this.metrics.setConnectionStatus(true, true);
      });

      await new Promise<void>((resolve, reject) => {
        if (this.redisClient!.status === 'ready') return resolve();
        this.redisClient!.once('ready', resolve);
        this.redisClient!.once('error', reject);
      });

      const info = await this.redisClient.info('server');
      const versionMatch = info.match(/redis_version:(\d+)/);
      const majorVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;
      this.useStreams = majorVersion >= 5;

      this.redisEnabled = true;
      this.connected = true;
      this.metrics.setConnectionStatus(true, true);
      logger.info('Redis event bus connected for service {}', {
        data0: this.serviceName,
        mode: this.useStreams ? 'streams' : 'pubsub',
        redisVersion: majorVersion,
      });

      this.flushPending();
    } catch (error) {
      // Redis connection failed — fall back to in-memory mode in all environments.
      // Cross-service events won't propagate, but services remain operational.
      logger.warn('Redis connection failed for {} - falling back to memory-only mode', {
        data0: this.serviceName,
        error: serializeError(error),
      });
      this.redisClient = null;
      this.redisEnabled = false;
      this.connected = true;
      this.metrics.setConnectionStatus(true, false);
      this.flushPending();
    }
  }

  private flushPending(): void {
    for (const event of this.pendingEvents) {
      this.publishInternal(event).catch(error => {
        logger.warn('Failed to flush pending event', {
          eventId: event.eventId,
          eventType: event.type,
          error: serializeError(error),
        });
      });
    }
    this.pendingEvents = [];
  }

  async publish(event: StandardEvent): Promise<void> {
    if (event.sequenceNumber === undefined) {
      event.sequenceNumber = ++this.sequenceCounter;
    }

    await this.initPromise;

    if (!this.connected) {
      this.pendingEvents.push(event);
      return;
    }
    await this.publishInternal(event);
  }

  private async publishInternal(event: StandardEvent): Promise<void> {
    try {
      const streamKey = `${EVENT_CHANNEL_PREFIX}${event.type}`;
      const message = JSON.stringify(event);

      if (this.redisEnabled && this.redisClient && this.redisClient.status === 'ready') {
        if (this.useStreams) {
          await this.redisClient.xadd(
            streamKey,
            'MAXLEN',
            '~',
            String(this.STREAM_MAXLEN),
            '*',
            'data',
            message,
            'source',
            this.serviceName
          );
        } else {
          await this.redisClient.publish(streamKey, message);
        }
        this.metrics.recordEventPublished(event.type);
        logger.debug('Published event {} to Redis {}', {
          data0: event.eventId,
          data1: streamKey,
          source: this.serviceName,
          mode: this.useStreams ? 'stream' : 'channel',
        });
      } else {
        const callbacks = this.subscriptions.get(event.type);
        if (callbacks) {
          await Promise.allSettled(Array.from(callbacks).map(cb => cb(event)));
        }
        this.metrics.recordEventPublished(event.type);
        logger.debug('Published event {} locally (Redis unavailable)', {
          data0: event.eventId,
          source: this.serviceName,
        });
      }
    } catch (error) {
      this.metrics.recordPublishError(event.type);
      logger.error('Failed to publish event from {}', {
        data0: this.serviceName,
        eventType: event.type,
        error: serializeError(error),
      });
    }
  }

  private async ensureConsumerGroup(streamKey: string): Promise<void> {
    if (!this.redisClient) return;
    try {
      await this.redisClient.xgroup('CREATE', streamKey, this.consumerGroupName, '0', 'MKSTREAM');
      logger.debug('Created consumer group {} for stream {}', {
        data0: this.consumerGroupName,
        data1: streamKey,
      });
    } catch (err: unknown) {
      if (!(err instanceof Error && err.message?.includes('BUSYGROUP'))) {
        logger.error('Failed to create consumer group', {
          stream: streamKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async processStreamEntries(results: Array<[string, Array<[string, string[]]>]> | null): Promise<void> {
    if (!results) return;
    for (const [streamKey, entries] of results) {
      const eventType = (streamKey as string).replace(EVENT_CHANNEL_PREFIX, '');
      for (const [entryId, fields] of entries) {
        try {
          const dataIdx = (fields as string[]).indexOf('data');
          if (dataIdx === -1) continue;
          const message = (fields as string[])[dataIdx + 1];
          const event: StandardEvent = JSON.parse(message);
          this.metrics.recordEventReceived(eventType);
          const callbacks = this.subscriptions.get(eventType);
          if (callbacks) {
            await Promise.allSettled(Array.from(callbacks).map(cb => cb(event)));
          }
          await this.redisClient!.xack(streamKey as string, this.consumerGroupName, entryId as string);
        } catch (parseError) {
          this.metrics.recordSubscribeError(eventType);
          logger.error('Failed to process stream entry', {
            stream: streamKey,
            entryId,
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
        }
      }
    }
  }

  private async reclaimPendingEntries(): Promise<void> {
    if (!this.redisClient || this.redisClient.status !== 'ready') return;

    const streams = Array.from(this.subscribedStreams);
    if (streams.length === 0) return;

    try {
      const pendingArgs: string[] = [
        'GROUP',
        this.consumerGroupName,
        this.consumerName,
        'COUNT',
        '50',
        'STREAMS',
        ...streams,
        ...streams.map(() => '0'),
      ];
      const results = await (
        this.redisClient as Redis & {
          xreadgroup(...args: string[]): Promise<Array<[string, Array<[string, string[]]>]> | null>;
        }
      ).xreadgroup(...pendingArgs);
      if (results) {
        let totalReclaimed = 0;
        for (const [, entries] of results) {
          totalReclaimed += entries.length;
        }
        if (totalReclaimed > 0) {
          logger.info('Reclaiming {} pending stream entries for {}', {
            data0: String(totalReclaimed),
            data1: this.serviceName,
          });
          await this.processStreamEntries(results);
        }
      }
    } catch (error: unknown) {
      logger.warn('Failed to reclaim pending entries for {}', {
        data0: this.serviceName,
        error: serializeError(error),
      });
    }
  }

  private async startStreamPolling(): Promise<void> {
    if (this.pollingActive) return;
    this.pollingActive = true;

    await this.reclaimPendingEntries();

    const poll = async () => {
      if (!this.pollingActive || !this.redisClient || this.redisClient.status !== 'ready') return;

      try {
        const streams = Array.from(this.subscribedStreams);
        if (streams.length === 0) return;

        const args: string[] = [
          'GROUP',
          this.consumerGroupName,
          this.consumerName,
          'COUNT',
          '10',
          'BLOCK',
          '1000',
          'STREAMS',
          ...streams,
          ...streams.map(() => '>'),
        ];
        const results = await (
          this.redisClient as Redis & {
            xreadgroup(...args: string[]): Promise<Array<[string, Array<[string, string[]]>]> | null>;
          }
        ).xreadgroup(...args);
        await this.processStreamEntries(results);
      } catch (error: unknown) {
        if (error instanceof Error && error.message?.includes('NOGROUP')) {
          for (const stream of this.subscribedStreams) {
            await this.ensureConsumerGroup(stream);
          }
        } else {
          logger.error('Stream poll error for {}', {
            data0: this.serviceName,
            error: serializeError(error),
          });
        }
      }

      if (this.pollingActive) {
        this.pollTimer = setTimeout(poll, this.POLL_INTERVAL_MS);
      }
    };

    poll();
  }

  async subscribe(eventType: string, callback: EventSubscriptionCallback): Promise<void> {
    try {
      await this.initPromise;

      if (!this.subscriptions.has(eventType)) {
        this.subscriptions.set(eventType, new Set());
      }
      this.subscriptions.get(eventType)!.add(callback);

      const streamKey = `${EVENT_CHANNEL_PREFIX}${eventType}`;

      if (this.redisEnabled && this.redisClient && this.redisClient.status === 'ready') {
        if (this.useStreams) {
          if (!this.subscribedStreams.has(streamKey)) {
            await this.ensureConsumerGroup(streamKey);
            this.subscribedStreams.add(streamKey);
            await this.startStreamPolling();
          }
        } else {
          if (!this.subscribedStreams.has(streamKey)) {
            const subClient = this.redisClient.duplicate();
            this.pubsubSubClients.set(streamKey, subClient);
            await new Promise<void>((resolve, reject) => {
              if (subClient.status === 'ready') return resolve();
              subClient.once('ready', resolve);
              subClient.once('error', reject);
            });
            subClient.on('message', async (ch: string, message: string) => {
              const chEventType = ch.replace(EVENT_CHANNEL_PREFIX, '');
              try {
                const event: StandardEvent = JSON.parse(message);
                this.metrics.recordEventReceived(chEventType);
                const cbs = this.subscriptions.get(chEventType);
                if (cbs) {
                  await Promise.allSettled(Array.from(cbs).map(cb => cb(event)));
                }
              } catch (parseError) {
                this.metrics.recordSubscribeError(chEventType);
                logger.error('Failed to parse event message on channel {}', {
                  data0: ch,
                  error: parseError instanceof Error ? parseError.message : String(parseError),
                });
              }
            });
            await subClient.subscribe(streamKey);
            this.subscribedStreams.add(streamKey);
          }
        }
        logger.debug('Service {} subscribed to {} ({})', {
          data0: this.serviceName,
          data1: streamKey,
          data2: this.useStreams ? 'streams' : 'pubsub',
        });
      } else {
        logger.debug('Service {} subscribed to event type {} (local mode)', {
          data0: this.serviceName,
          data1: eventType,
        });
      }
    } catch (error) {
      logger.error('Failed to subscribe to {} in {}', {
        data0: eventType,
        data1: this.serviceName,
        error: serializeError(error),
      });
      throw error;
    }
  }

  async unsubscribe(eventType: string, callback?: EventSubscriptionCallback): Promise<void> {
    try {
      const callbacks = this.subscriptions.get(eventType);
      if (callbacks) {
        if (callback) {
          callbacks.delete(callback);
        } else {
          callbacks.clear();
        }

        if (callbacks.size === 0) {
          this.subscriptions.delete(eventType);
          const streamKey = `${EVENT_CHANNEL_PREFIX}${eventType}`;
          this.subscribedStreams.delete(streamKey);

          const subClient = this.pubsubSubClients.get(streamKey);
          if (subClient) {
            try {
              await subClient.unsubscribe(streamKey);
              await subClient.quit();
            } catch (e) {
              logger.warn('Error closing pubsub sub client for {}', { data0: streamKey });
            }
            this.pubsubSubClients.delete(streamKey);
          }
        }
      }

      logger.info('Service {} unsubscribed from event type {}', {
        data0: this.serviceName,
        data1: eventType,
      });
    } catch (error) {
      logger.error('Failed to unsubscribe from {} in {}', {
        data0: eventType,
        data1: this.serviceName,
        error: serializeError(error),
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    try {
      this.pollingActive = false;
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }

      this.subscribedStreams.clear();
      this.subscriptions.clear();

      for (const [key, subClient] of this.pubsubSubClients) {
        try {
          if (subClient.status === 'ready') {
            await subClient.unsubscribe();
            await subClient.quit();
          }
        } catch (e) {
          logger.warn('Error closing pubsub sub client during shutdown', { stream: key });
        }
      }
      this.pubsubSubClients.clear();

      if (this.redisClient && this.redisClient.status === 'ready') {
        await this.redisClient.quit();
      }

      this.redisClient = null;
      this.connected = false;
      this.redisEnabled = false;
      this.metrics.setConnectionStatus(false, false);

      logger.info('Service {} disconnected from event bus', { data0: this.serviceName });
    } catch (error) {
      logger.error('Failed to disconnect {} from event bus', {
        data0: this.serviceName,
        error: serializeError(error),
      });
      throw error;
    }
  }

  getConnectionStatus(): boolean {
    return this.connected;
  }

  getProviderType(): 'redis' | 'kafka' | 'memory' {
    if (!this.connected) return 'memory';
    return this.redisEnabled ? 'redis' : 'memory';
  }

  getMetrics(): EventBusMetrics {
    return this.metrics;
  }
}

let sharedEventBusClient: IStandardizedEventBusClient | null = null;

/**
 * Get or create shared event bus client for same-process services
 * Uses the event bus factory to respect EVENT_BUS_PROVIDER configuration
 */
export function getSharedEventBusClient(serviceName: string): IStandardizedEventBusClient {
  if (!sharedEventBusClient) {
    sharedEventBusClient = createEventBusClient(serviceName);
  }
  return sharedEventBusClient;
}

/**
 * Get standardized service name
 * Ensures consistent service naming across the platform
 */
export function getServiceName(baseName: string): string {
  const normalized = baseName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return normalized;
}

/**
 * Create a standard event structure
 */
export function createEvent(
  type: string,
  source: string,
  data: Record<string, unknown>,
  options?: { eventId?: string; correlationId?: string } | string
): StandardEvent {
  const eventId = typeof options === 'string' ? options : options?.eventId;
  const correlationId =
    (typeof options === 'string' ? undefined : options?.correlationId) ||
    `cor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return {
    eventId: eventId || generateEventId(),
    correlationId,
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    data,
  };
}

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
