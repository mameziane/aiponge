/**
 * Kafka Event Bus Client
 * Uses Apache Kafka for cross-service event distribution
 * Provides stronger ordering guarantees and persistence vs Redis Pub/Sub
 *
 * Phase 0: subscribe-before-run, partition keys, bounded buffer, DLQ
 * Phase 1: auto-reconnect with backoff, graceful shutdown with drain, consumer crash recovery, topic auto-creation
 * Phase 2: extended health details, Kafka-specific metrics, env-configurable knobs
 */

import fs from 'fs';
import path from 'path';
import { getLogger } from '../logging/logger.js';
import { getEventBusMetrics, type EventBusMetrics } from '../metrics/index.js';
import { serializeError } from '../logging/error-serializer.js';
import type {
  IStandardizedEventBusClient,
  StandardEvent,
  EventSubscriptionCallback,
  EventBusHealthDetail,
} from './event-bus-client.js';

const logger = getLogger('kafka-event-bus-client');

const TOPIC_PREFIX = 'aiponge.events.';

interface KafkaProducerLike {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(record: {
    topic: string;
    messages: Array<{ key: string; value: string; headers?: Record<string, string> }>;
  }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
}

interface KafkaConsumerLike {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(options: { topic: string; fromBeginning: boolean }): Promise<void>;
  run(options: {
    eachMessage: (payload: {
      topic: string;
      partition: number;
      message: { value: Buffer | null; offset: string };
    }) => Promise<void>;
  }): Promise<void>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
}

interface KafkaAdminLike {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTopics(): Promise<string[]>;
  createTopics(options: {
    topics: Array<{ topic: string; numPartitions: number; replicationFactor: number }>;
  }): Promise<boolean>;
}

interface KafkaInstanceLike {
  producer(): KafkaProducerLike;
  consumer(options: { groupId: string; sessionTimeout?: number; heartbeatInterval?: number }): KafkaConsumerLike;
  admin(): KafkaAdminLike;
}

interface KafkaCrashPayload {
  error?: Error;
  groupId?: string;
  restart?: boolean;
}

const envInt = (key: string, fallback: number): number => {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
};

interface KafkaConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  ssl?: boolean;
  saslMechanism?: string;
  saslUsername?: string;
  saslPassword?: string;
}

export type PartitionKeyResolver = (event: StandardEvent) => string;

const DEFAULT_PARTITION_KEY_FIELDS: Record<string, string> = {
  'analytics.': 'userId',
  'user.': 'userId',
  'music.': 'userId',
  'storage.': 'assetId',
  'config.': 'templateId',
  'system.': 'serviceName',
};

function resolvePartitionKey(event: StandardEvent): string {
  for (const [prefix, field] of Object.entries(DEFAULT_PARTITION_KEY_FIELDS)) {
    if (event.type.startsWith(prefix)) {
      const value = event.data[field];
      if (typeof value === 'string' && value) return value;
    }
  }
  return event.correlationId || event.eventId;
}

function getKafkaConfig(serviceName: string): KafkaConfig {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  return {
    brokers,
    clientId: `aiponge-${serviceName}`,
    groupId: `aiponge-${serviceName}-group`,
    ssl: process.env.KAFKA_SSL === 'true',
    saslMechanism: process.env.KAFKA_SASL_MECHANISM,
    saslUsername: process.env.KAFKA_SASL_USERNAME,
    saslPassword: process.env.KAFKA_SASL_PASSWORD,
  };
}

export class KafkaEventBusClient implements IStandardizedEventBusClient {
  private serviceName: string;
  private connected = false;
  private shuttingDown = false;
  private producer: KafkaProducerLike | null = null;
  private consumer: KafkaConsumerLike | null = null;
  private admin: KafkaAdminLike | null = null;
  private kafka: KafkaInstanceLike | null = null;
  private subscriptions = new Map<string, Set<EventSubscriptionCallback>>();
  private pendingTopics = new Set<string>();
  private pendingEvents: StandardEvent[] = [];
  private metrics: EventBusMetrics;
  private initPromise: Promise<void>;
  private consumerRunning = false;
  private partitionKeyResolver: PartitionKeyResolver;
  private hasLoggedBufferWarn = false;
  private kafkaConfigured = false;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private lastError: string | null = null;
  private lastReconnectAt: number | null = null;
  private dlqPublishedCount = 0;

  private readonly PENDING_BUFFER_MAX: number;
  private readonly PENDING_BUFFER_WARN_AT: number;
  private readonly RECONNECT_BASE_MS: number;
  private readonly RECONNECT_MAX_MS: number;
  private readonly RECONNECT_MAX_ATTEMPTS: number;
  private readonly AUTO_CREATE_TOPICS: boolean;
  private readonly TOPIC_PARTITIONS: number;
  private readonly SHUTDOWN_DRAIN_TIMEOUT_MS: number;
  private readonly overflowFilePath: string;

  constructor(serviceName: string, partitionKeyResolver?: PartitionKeyResolver) {
    this.serviceName = serviceName;
    this.metrics = getEventBusMetrics(serviceName);
    this.partitionKeyResolver = partitionKeyResolver || resolvePartitionKey;

    this.PENDING_BUFFER_MAX = envInt('KAFKA_BUFFER_MAX', 10000);
    this.PENDING_BUFFER_WARN_AT = envInt('KAFKA_BUFFER_WARN_AT', 5000);
    this.RECONNECT_BASE_MS = envInt('KAFKA_RECONNECT_BASE_MS', 1000);
    this.RECONNECT_MAX_MS = envInt('KAFKA_RECONNECT_MAX_MS', 30000);
    this.RECONNECT_MAX_ATTEMPTS = envInt('KAFKA_RECONNECT_MAX_ATTEMPTS', 50);
    this.AUTO_CREATE_TOPICS = process.env.KAFKA_AUTO_CREATE_TOPICS === 'true';
    this.TOPIC_PARTITIONS = envInt('KAFKA_TOPIC_PARTITIONS', 3);
    this.SHUTDOWN_DRAIN_TIMEOUT_MS = envInt('KAFKA_SHUTDOWN_DRAIN_TIMEOUT_MS', 5000);

    const overflowDir = process.env.KAFKA_BUFFER_OVERFLOW_DIR || '/tmp/aiponge-kafka-overflow';
    try {
      fs.mkdirSync(overflowDir, { recursive: true });
    } catch {
      /* best-effort */
    }
    this.overflowFilePath = path.join(overflowDir, `${serviceName}-overflow.jsonl`);

    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!process.env.KAFKA_BROKERS) {
      logger.info('KAFKA_BROKERS not configured - Kafka event bus disabled for {}', {
        data0: this.serviceName,
      });
      this.connected = false;
      return;
    }

    this.kafkaConfigured = true;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.shuttingDown) return;

    const config = getKafkaConfig(this.serviceName);

    try {
      const { Kafka } = await import('kafkajs');

      const kafkaConfig: Record<string, unknown> & { clientId: string; brokers: string[] } = {
        clientId: config.clientId,
        brokers: config.brokers,
        retry: { initialRetryTime: 300, retries: 5 },
      };

      if (config.ssl) {
        kafkaConfig.ssl = true;
      }

      if (config.saslMechanism && config.saslUsername && config.saslPassword) {
        kafkaConfig.sasl = {
          mechanism: config.saslMechanism,
          username: config.saslUsername,
          password: config.saslPassword,
        };
      }

      this.kafka = new Kafka(kafkaConfig) as unknown as KafkaInstanceLike;
      this.producer = this.kafka.producer();
      this.consumer = this.kafka.consumer({
        groupId: config.groupId,
        sessionTimeout: envInt('KAFKA_SESSION_TIMEOUT_MS', 30000),
        heartbeatInterval: envInt('KAFKA_HEARTBEAT_INTERVAL_MS', 3000),
      });

      if (this.AUTO_CREATE_TOPICS) {
        this.admin = this.kafka.admin();
        await this.admin.connect();
      }

      this.registerLifecycleHandlers();

      await this.producer.connect();
      await this.consumer.connect();

      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastError = null;
      this.metrics.setConnectionStatus(true, true);
      logger.info('Kafka event bus connected for service {}', { data0: this.serviceName });

      await this.flushPendingEvents();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.warn('Kafka connection failed for {} - events will be buffered in memory', {
        data0: this.serviceName,
        error: serializeError(error),
      });
      this.connected = false;
      this.metrics.setConnectionStatus(false, false);
      this.scheduleReconnect();
    }
  }

  private registerLifecycleHandlers(): void {
    if (!this.consumer || !this.producer) return;

    const handleDisconnect = (type: string) => () => {
      if (this.shuttingDown) return;
      logger.warn('Kafka {} disconnected for {}', { data0: type, data1: this.serviceName });
      this.connected = false;
      this.metrics.setConnectionStatus(false, false);
      this.scheduleReconnect();
    };

    const handleCrash = (...args: unknown[]) => {
      const payload = args[0] as KafkaCrashPayload;
      if (this.shuttingDown) return;
      const error = payload?.error;
      this.lastError = error?.message || 'consumer crash';
      logger.error('Kafka consumer crashed for {} - scheduling recovery', {
        data0: this.serviceName,
        error: serializeError(error),
        groupId: payload?.groupId,
        restart: payload?.restart,
      });

      this.connected = false;
      this.consumerRunning = false;
      this.metrics.setConnectionStatus(false, false);
      this.metrics.recordSubscribeError('consumer.crash');
      this.scheduleReconnect();
    };

    try {
      if (this.consumer.on) {
        this.consumer.on('consumer.disconnect', handleDisconnect('consumer'));
        this.consumer.on('consumer.crash', handleCrash);
      }
      if (this.producer.on) {
        this.producer.on('producer.disconnect', handleDisconnect('producer'));
      }
    } catch {
      logger.debug('Lifecycle event handlers not supported by this kafkajs version');
    }
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnectTimer) return;

    if (this.reconnectAttempts >= this.RECONNECT_MAX_ATTEMPTS) {
      logger.error('Kafka reconnect exhausted {} attempts for {} - staying degraded', {
        data0: String(this.RECONNECT_MAX_ATTEMPTS),
        data1: this.serviceName,
      });
      return;
    }

    const delay = Math.min(this.RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts), this.RECONNECT_MAX_MS);

    this.reconnectAttempts++;
    logger.info('Scheduling Kafka reconnect in {}ms (attempt {}/{})', {
      data0: String(delay),
      data1: String(this.reconnectAttempts),
      data2: String(this.RECONNECT_MAX_ATTEMPTS),
    });

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.lastReconnectAt = Date.now();
      this.metrics.recordReconnectAttempt?.();

      try {
        await this.cleanupConnections();
        await this.connect();

        if (this.connected && this.subscriptions.size > 0 && !this.consumerRunning) {
          for (const eventType of this.subscriptions.keys()) {
            this.pendingTopics.add(`${TOPIC_PREFIX}${eventType}`);
          }
          await this.startConsuming();
        }
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        logger.error('Kafka reconnect attempt failed for {}', {
          data0: this.serviceName,
          error: serializeError(error),
        });
        this.scheduleReconnect();
      }
    }, delay);
  }

  private async cleanupConnections(): Promise<void> {
    try {
      if (this.admin) {
        await this.admin.disconnect().catch(() => {});
        this.admin = null;
      }
      if (this.producer) {
        await this.producer.disconnect().catch(() => {});
        this.producer = null;
      }
      if (this.consumer) {
        await this.consumer.disconnect().catch(() => {});
        this.consumer = null;
      }
    } catch {
      // best-effort cleanup
    }
    this.consumerRunning = false;
  }

  private async flushPendingEvents(): Promise<void> {
    if (this.pendingEvents.length === 0 && !this.hasOverflowFile()) return;

    const toFlush = [...this.pendingEvents];
    this.pendingEvents = [];
    this.hasLoggedBufferWarn = false;

    logger.info('Flushing {} buffered events for {}', {
      data0: String(toFlush.length),
      data1: this.serviceName,
    });

    for (const event of toFlush) {
      await this.publishInternal(event);
    }

    await this.flushOverflowFile();
  }

  private hasOverflowFile(): boolean {
    try {
      return fs.existsSync(this.overflowFilePath);
    } catch {
      return false;
    }
  }

  private async flushOverflowFile(): Promise<void> {
    if (!this.hasOverflowFile()) return;
    try {
      const content = fs.readFileSync(this.overflowFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      logger.info('Replaying {} overflow events from disk for {}', {
        data0: String(lines.length),
        data1: this.serviceName,
      });
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as StandardEvent;
          await this.publishInternal(event);
        } catch {
          logger.warn('Skipping malformed overflow event line');
        }
      }
      fs.unlinkSync(this.overflowFilePath);
      logger.info('Overflow file replayed and cleaned up', { file: this.overflowFilePath });
    } catch (error) {
      logger.error('Failed to flush overflow file', { error: serializeError(error) });
    }
  }

  async publish(event: StandardEvent): Promise<void> {
    if (!this.connected) {
      this.bufferEvent(event);
      return;
    }
    await this.publishInternal(event);
  }

  private bufferEvent(event: StandardEvent): void {
    if (this.pendingEvents.length >= this.PENDING_BUFFER_MAX) {
      const overflow = this.pendingEvents.shift();
      if (overflow) {
        try {
          fs.appendFileSync(this.overflowFilePath, JSON.stringify(overflow) + '\n');
          logger.warn('Kafka pending buffer full, persisted overflow event to disk', {
            overflowEventType: overflow.type,
            overflowEventId: overflow.eventId,
            overflowFile: this.overflowFilePath,
          });
        } catch {
          logger.warn('Kafka pending buffer full, disk write failed, dropping oldest event', {
            droppedEventType: overflow.type,
            droppedEventId: overflow.eventId,
            bufferSize: this.pendingEvents.length,
          });
        }
      }
    }

    this.pendingEvents.push(event);
    this.metrics.setPendingEvents(this.pendingEvents.length);

    if (this.pendingEvents.length >= this.PENDING_BUFFER_WARN_AT && !this.hasLoggedBufferWarn) {
      this.hasLoggedBufferWarn = true;
      logger.warn('Kafka pending events buffer at {}% capacity', {
        data0: String(Math.round((this.pendingEvents.length / this.PENDING_BUFFER_MAX) * 100)),
        bufferSize: this.pendingEvents.length,
        maxSize: this.PENDING_BUFFER_MAX,
        serviceName: this.serviceName,
      });
    }
  }

  async publishToDeadLetter(event: StandardEvent, error: Error): Promise<void> {
    if (!this.connected || !this.producer) {
      logger.error('Cannot publish to DLQ - Kafka not connected', {
        eventId: event.eventId,
        eventType: event.type,
      });
      return;
    }

    try {
      const dlqTopic = `${TOPIC_PREFIX}${event.type}.dlq`;

      if (this.AUTO_CREATE_TOPICS) {
        await this.ensureTopicExists(dlqTopic);
      }

      await this.producer.send({
        topic: dlqTopic,
        messages: [
          {
            key: this.partitionKeyResolver(event),
            value: JSON.stringify({
              originalEvent: event,
              error: { message: error.message, stack: error.stack },
              failedAt: new Date().toISOString(),
              service: this.serviceName,
            }),
            headers: {
              source: this.serviceName,
              eventType: event.type,
              errorMessage: error.message,
            },
          },
        ],
      });
      this.dlqPublishedCount++;
      this.metrics.recordDlqPublished?.();
      this.metrics.setDlqDepth(this.dlqPublishedCount);
      logger.warn('Published event {} to DLQ topic {}', {
        data0: event.eventId,
        data1: dlqTopic,
      });
    } catch (dlqError) {
      logger.error('Failed to publish event to DLQ', {
        eventId: event.eventId,
        eventType: event.type,
        error: serializeError(dlqError),
      });
    }
  }

  private async publishInternal(event: StandardEvent): Promise<void> {
    try {
      const topic = `${TOPIC_PREFIX}${event.type}`;

      if (this.AUTO_CREATE_TOPICS) {
        await this.ensureTopicExists(topic);
      }

      const key = this.partitionKeyResolver(event);
      const startMs = Date.now();
      await this.producer!.send({
        topic,
        messages: [
          {
            key,
            value: JSON.stringify(event),
            headers: {
              source: this.serviceName,
              eventType: event.type,
              version: event.version,
            },
          },
        ],
      });
      const latencyMs = Date.now() - startMs;
      this.metrics.recordEventPublished(event.type);
      this.metrics.recordPublishLatency?.(latencyMs);
      logger.debug('Published event {} to Kafka topic {} (key={}) in {}ms', {
        data0: event.eventId,
        data1: topic,
        data2: key,
        data3: String(latencyMs),
        source: this.serviceName,
      });
    } catch (error) {
      this.metrics.recordPublishError(event.type);
      logger.error('Failed to publish event to Kafka from {}', {
        data0: this.serviceName,
        eventType: event.type,
        error: serializeError(error),
      });
    }
  }

  private knownTopics = new Set<string>();

  private async ensureTopicExists(topic: string): Promise<void> {
    if (this.knownTopics.has(topic) || !this.admin) return;

    try {
      const existingTopics = await this.admin.listTopics();
      if (existingTopics.includes(topic)) {
        this.knownTopics.add(topic);
        return;
      }

      await this.admin.createTopics({
        topics: [
          {
            topic,
            numPartitions: this.TOPIC_PARTITIONS,
            replicationFactor: 1,
          },
        ],
      });
      this.knownTopics.add(topic);
      logger.info('Auto-created Kafka topic {} with {} partitions', {
        data0: topic,
        data1: String(this.TOPIC_PARTITIONS),
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        ((error as Error & { type?: string }).type === 'TOPIC_ALREADY_EXISTS' ||
          error.message?.includes('already exists'))
      ) {
        this.knownTopics.add(topic);
        return;
      }
      logger.warn('Failed to auto-create topic {}', {
        data0: topic,
        error: serializeError(error),
      });
    }
  }

  async subscribe(eventType: string, callback: EventSubscriptionCallback): Promise<void> {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType)!.add(callback);

    const topic = `${TOPIC_PREFIX}${eventType}`;
    this.pendingTopics.add(topic);

    logger.debug('Registered subscription for Kafka topic {} in {}', {
      data0: eventType,
      data1: this.serviceName,
    });
  }

  async startConsuming(): Promise<void> {
    if (this.consumerRunning) {
      logger.warn('Consumer already running for {} - ignoring startConsuming call', {
        data0: this.serviceName,
      });
      return;
    }

    await this.initPromise;

    if (!this.connected || !this.consumer) {
      logger.warn('Kafka not connected - subscriptions registered but consuming deferred for {}', {
        data0: this.serviceName,
      });
      return;
    }

    if (this.pendingTopics.size === 0) {
      logger.debug('No topics to subscribe to for {}', { data0: this.serviceName });
      return;
    }

    for (const topic of this.pendingTopics) {
      if (this.AUTO_CREATE_TOPICS) {
        await this.ensureTopicExists(topic);
      }
      await this.consumer.subscribe({ topic, fromBeginning: false });
      logger.debug('Kafka consumer subscribed to topic {}', { data0: topic });
    }
    this.pendingTopics.clear();

    this.consumerRunning = true;
    await this.consumer.run({
      eachMessage: async ({
        topic: msgTopic,
        partition,
        message,
      }: {
        topic: string;
        partition: number;
        message: { value: Buffer | null; offset: string };
      }) => {
        try {
          const event: StandardEvent = JSON.parse(message.value!.toString());
          const callbacks = this.subscriptions.get(event.type);
          if (callbacks) {
            await Promise.allSettled(Array.from(callbacks).map(cb => cb(event)));
          }
          this.metrics.recordEventReceived(event.type);
        } catch (error) {
          logger.error('Failed to process Kafka message', {
            topic: msgTopic,
            partition,
            offset: message?.offset,
            error: serializeError(error),
          });
        }
      },
    });

    logger.info('Kafka consumer running for {} with {} topic subscriptions', {
      data0: this.serviceName,
      data1: String(this.subscriptions.size),
    });
  }

  async unsubscribe(eventType: string, callback?: EventSubscriptionCallback): Promise<void> {
    const callbacks = this.subscriptions.get(eventType);
    if (!callbacks) return;

    if (callback) {
      callbacks.delete(callback);
    } else {
      callbacks.clear();
    }

    if (callbacks.size === 0) {
      this.subscriptions.delete(eventType);
    }
  }

  async disconnect(): Promise<void> {
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    logger.info('Kafka event bus shutting down for {} ({} pending events)', {
      data0: this.serviceName,
      data1: String(this.pendingEvents.length),
    });

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connected && this.producer && this.pendingEvents.length > 0) {
      try {
        const drainStart = Date.now();
        const toFlush = [...this.pendingEvents];
        this.pendingEvents = [];

        for (const event of toFlush) {
          if (Date.now() - drainStart > this.SHUTDOWN_DRAIN_TIMEOUT_MS) {
            logger.warn('Shutdown drain timeout reached - {} events lost', {
              data0: String(toFlush.length - toFlush.indexOf(event)),
            });
            break;
          }
          await this.publishInternal(event);
        }
      } catch (error) {
        logger.warn('Error during shutdown drain', { error: serializeError(error) });
      }
    }

    await this.cleanupConnections();

    this.connected = false;
    this.consumerRunning = false;
    this.metrics.setConnectionStatus(false, false);
    logger.info('Kafka event bus disconnected for {}', { data0: this.serviceName });
  }

  getConnectionStatus(): boolean {
    return this.connected;
  }

  getProviderType(): 'redis' | 'kafka' | 'memory' {
    return this.connected ? 'kafka' : 'memory';
  }

  getMetrics(): EventBusMetrics | null {
    return this.metrics;
  }

  getPendingEventCount(): number {
    return this.pendingEvents.length;
  }

  getHealthDetail(): EventBusHealthDetail {
    return {
      provider: this.connected ? 'kafka' : this.kafkaConfigured ? 'kafka' : 'memory',
      connected: this.connected,
      producerConnected: this.connected && this.producer !== null,
      consumerConnected: this.connected && this.consumer !== null,
      consumerRunning: this.consumerRunning,
      pendingEventCount: this.pendingEvents.length,
      subscriptionCount: this.subscriptions.size,
      reconnectAttempts: this.reconnectAttempts,
      lastReconnectAt: this.lastReconnectAt ? new Date(this.lastReconnectAt).toISOString() : null,
      lastError: this.lastError,
      dlqPublishedCount: this.dlqPublishedCount,
      shuttingDown: this.shuttingDown,
      autoCreateTopics: this.AUTO_CREATE_TOPICS,
      bufferCapacityPercent: Math.round((this.pendingEvents.length / this.PENDING_BUFFER_MAX) * 100),
    };
  }
}
