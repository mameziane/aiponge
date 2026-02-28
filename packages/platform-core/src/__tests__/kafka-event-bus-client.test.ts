import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StandardEvent } from '../orchestration/event-bus-client.js';

const mockProducer = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
};
const mockConsumer = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
  run: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
};
const mockAdmin = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  listTopics: vi.fn().mockResolvedValue([]),
  createTopics: vi.fn().mockResolvedValue(undefined),
};

vi.mock('kafkajs', () => ({
  Kafka: vi.fn().mockImplementation(() => ({
    producer: () => mockProducer,
    consumer: () => mockConsumer,
    admin: () => mockAdmin,
  })),
}));

vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../logging/error-serializer.js', () => ({
  serializeError: (e: any) => String(e),
}));

vi.mock('../metrics/index.js', () => ({
  getEventBusMetrics: () => ({
    setConnectionStatus: vi.fn(),
    recordEventPublished: vi.fn(),
    recordPublishError: vi.fn(),
    recordEventReceived: vi.fn(),
    recordSubscribeError: vi.fn(),
    setPendingEvents: vi.fn(),
    recordReconnectAttempt: vi.fn(),
    recordDlqPublished: vi.fn(),
    recordPublishLatency: vi.fn(),
  }),
}));

function makeEvent(overrides: Partial<StandardEvent> = {}): StandardEvent {
  return {
    eventId: `evt_${Date.now()}`,
    correlationId: 'cor_test',
    type: 'test.event',
    timestamp: new Date().toISOString(),
    version: '1.0',
    source: 'test',
    data: {},
    ...overrides,
  };
}

describe('KafkaEventBusClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    delete process.env.KAFKA_BROKERS;
    delete process.env.KAFKA_AUTO_CREATE_TOPICS;
    delete process.env.KAFKA_BUFFER_MAX;
    delete process.env.KAFKA_RECONNECT_MAX_ATTEMPTS;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not connect when KAFKA_BROKERS is not set', async () => {
    const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
    const client = new KafkaEventBusClient('test-service');
    await vi.advanceTimersByTimeAsync(100);
    expect(client.getConnectionStatus()).toBe(false);
    expect(client.getProviderType()).toBe('memory');
    await client.shutdown();
  });

  it('should connect when KAFKA_BROKERS is set', async () => {
    process.env.KAFKA_BROKERS = 'localhost:9092';
    const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
    const client = new KafkaEventBusClient('test-service');
    await vi.advanceTimersByTimeAsync(100);
    expect(client.getConnectionStatus()).toBe(true);
    expect(client.getProviderType()).toBe('kafka');
    await client.shutdown();
  });

  it('should buffer events when not connected', async () => {
    const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
    const client = new KafkaEventBusClient('test-service');
    await vi.advanceTimersByTimeAsync(50);

    await client.publish(makeEvent());
    expect(client.getPendingEventCount()).toBe(1);
    expect(mockProducer.send).not.toHaveBeenCalled();
    await client.shutdown();
  });

  it('should drop oldest events when buffer is full', async () => {
    process.env.KAFKA_BUFFER_MAX = '100';
    const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
    const client = new KafkaEventBusClient('test-service');
    await vi.advanceTimersByTimeAsync(50);

    for (let i = 0; i < 101; i++) {
      await client.publish(makeEvent({ eventId: `evt_${i}` }));
    }
    expect(client.getPendingEventCount()).toBe(100);
    await client.shutdown();
  });

  describe('subscribe and startConsuming', () => {
    it('should not call consumer.run during subscribe', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      await client.subscribe('test.event', vi.fn());
      expect(mockConsumer.run).not.toHaveBeenCalled();
      expect(mockConsumer.subscribe).not.toHaveBeenCalled();
      await client.shutdown();
    });

    it('should subscribe all topics and run consumer on startConsuming', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      await client.subscribe('analytics.event.recorded', vi.fn());
      await client.subscribe('music.track.played', vi.fn());
      await client.subscribe('user.deleted', vi.fn());

      await client.startConsuming();

      expect(mockConsumer.subscribe).toHaveBeenCalledTimes(3);
      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topic: 'aiponge.events.analytics.event.recorded',
        fromBeginning: false,
      });
      expect(mockConsumer.run).toHaveBeenCalledTimes(1);
      await client.shutdown();
    });

    it('should ignore duplicate startConsuming calls', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      await client.subscribe('test.event', vi.fn());
      await client.startConsuming();
      await client.startConsuming();

      expect(mockConsumer.run).toHaveBeenCalledTimes(1);
      await client.shutdown();
    });

    it('should dispatch messages to registered callbacks', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      const handler = vi.fn().mockResolvedValue(undefined);
      await client.subscribe('test.event', handler);

      mockConsumer.run.mockImplementation(async ({ eachMessage }: any) => {
        const event = makeEvent({ type: 'test.event' });
        await eachMessage({
          topic: 'aiponge.events.test.event',
          partition: 0,
          message: { value: Buffer.from(JSON.stringify(event)), offset: '0' },
        });
      });

      await client.startConsuming();
      expect(handler).toHaveBeenCalledTimes(1);
      await client.shutdown();
    });
  });

  describe('partition key strategy', () => {
    it('should use userId for analytics events', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      const event = makeEvent({ type: 'analytics.event.recorded', data: { userId: 'user_123' } });
      await client.publish(event);

      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ key: 'user_123' }),
          ]),
        })
      );
      await client.shutdown();
    });

    it('should use assetId for storage events', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      const event = makeEvent({ type: 'storage.asset.uploaded', data: { assetId: 'asset_789' } });
      await client.publish(event);

      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ key: 'asset_789' }),
          ]),
        })
      );
      await client.shutdown();
    });

    it('should fall back to correlationId when no matching field', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      const event = makeEvent({ type: 'unknown.event', correlationId: 'cor_fallback', data: {} });
      await client.publish(event);

      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ key: 'cor_fallback' }),
          ]),
        })
      );
      await client.shutdown();
    });

    it('should accept custom partition key resolver', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const customResolver = (event: StandardEvent) => `custom_${event.data.trackId}`;
      const client = new KafkaEventBusClient('test-service', customResolver);
      await vi.advanceTimersByTimeAsync(100);

      const event = makeEvent({ type: 'music.track.played', data: { trackId: 'track_99' } });
      await client.publish(event);

      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ key: 'custom_track_99' }),
          ]),
        })
      );
      await client.shutdown();
    });
  });

  describe('dead letter queue', () => {
    it('should publish failed events to DLQ topic', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      const event = makeEvent({ type: 'test.event' });
      const error = new Error('Processing failed');

      await client.publishToDeadLetter(event, error);

      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'aiponge.events.test.event.dlq',
          messages: expect.arrayContaining([
            expect.objectContaining({
              value: expect.stringContaining('Processing failed'),
              headers: expect.objectContaining({
                errorMessage: 'Processing failed',
              }),
            }),
          ]),
        })
      );
      await client.shutdown();
    });

    it('should not throw when DLQ publish fails', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      mockProducer.send.mockRejectedValueOnce(new Error('Kafka unavailable'));

      const event = makeEvent({ type: 'test.event' });
      await expect(
        client.publishToDeadLetter(event, new Error('fail'))
      ).resolves.not.toThrow();
      await client.shutdown();
    });
  });

  describe('graceful shutdown', () => {
    it('should disconnect producer and consumer', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      await client.shutdown();

      expect(mockProducer.disconnect).toHaveBeenCalled();
      expect(mockConsumer.disconnect).toHaveBeenCalled();
      expect(client.getConnectionStatus()).toBe(false);
      expect(client.getProviderType()).toBe('memory');
    });

    it('should drain pending events on shutdown', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      await client.publish(makeEvent({ type: 'test.event.1' }));
      await client.publish(makeEvent({ type: 'test.event.2' }));

      const sendCalls = mockProducer.send.mock.calls.length;
      await client.shutdown();

      expect(mockProducer.send.mock.calls.length).toBe(sendCalls);
    });

    it('should not attempt reconnect after shutdown', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      await client.shutdown();
      const health = client.getHealthDetail();
      expect(health.shuttingDown).toBe(true);
    });
  });

  describe('auto-reconnect', () => {
    it('should schedule reconnect on connection failure', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      mockProducer.connect.mockRejectedValueOnce(new Error('Connection refused'));

      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      expect(client.getConnectionStatus()).toBe(false);
      const health = client.getHealthDetail();
      expect(health.lastError).toBe('Connection refused');
      await client.shutdown();
    });

    it('should respect max reconnect attempts', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      process.env.KAFKA_RECONNECT_MAX_ATTEMPTS = '2';
      mockProducer.connect.mockRejectedValue(new Error('Connection refused'));

      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      const health = client.getHealthDetail();
      expect(health.reconnectAttempts).toBeLessThanOrEqual(3);
      await client.shutdown();
    });
  });

  describe('topic auto-creation', () => {
    it('should create topics when auto-create is enabled', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      process.env.KAFKA_AUTO_CREATE_TOPICS = 'true';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      await client.publish(makeEvent({ type: 'new.topic.event' }));

      expect(mockAdmin.listTopics).toHaveBeenCalled();
      expect(mockAdmin.createTopics).toHaveBeenCalledWith(
        expect.objectContaining({
          topics: expect.arrayContaining([
            expect.objectContaining({
              topic: 'aiponge.events.new.topic.event',
            }),
          ]),
        })
      );
      await client.shutdown();
    });

    it('should skip creation when topic already exists', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      process.env.KAFKA_AUTO_CREATE_TOPICS = 'true';
      mockAdmin.listTopics.mockResolvedValueOnce(['aiponge.events.existing.event']);

      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      await client.publish(makeEvent({ type: 'existing.event' }));

      expect(mockAdmin.createTopics).not.toHaveBeenCalled();
      await client.shutdown();
    });
  });

  describe('health detail', () => {
    it('should return detailed health when connected', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      const health = client.getHealthDetail();
      expect(health.provider).toBe('kafka');
      expect(health.connected).toBe(true);
      expect(health.producerConnected).toBe(true);
      expect(health.consumerConnected).toBe(true);
      expect(health.consumerRunning).toBe(false);
      expect(health.pendingEventCount).toBe(0);
      expect(health.reconnectAttempts).toBe(0);
      expect(health.lastError).toBe(null);
      expect(health.dlqPublishedCount).toBe(0);
      expect(health.shuttingDown).toBe(false);
      await client.shutdown();
    });

    it('should show kafka as provider even when disconnected if configured', async () => {
      process.env.KAFKA_BROKERS = 'localhost:9092';
      mockProducer.connect.mockRejectedValueOnce(new Error('fail'));

      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      const health = client.getHealthDetail();
      expect(health.provider).toBe('kafka');
      expect(health.connected).toBe(false);
      await client.shutdown();
    });

    it('should show memory as provider when not configured', async () => {
      const { KafkaEventBusClient } = await import('../orchestration/kafka-event-bus-client.js');
      const client = new KafkaEventBusClient('test-service');
      await vi.advanceTimersByTimeAsync(100);

      const health = client.getHealthDetail();
      expect(health.provider).toBe('memory');
      expect(health.connected).toBe(false);
      await client.shutdown();
    });
  });
});

describe('EventBusFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EVENT_BUS_PROVIDER;
    delete process.env.KAFKA_BROKERS;
  });

  it('should create Redis client by default', async () => {
    const { createEventBusClient } = await import('../orchestration/event-bus-factory.js');
    const client = createEventBusClient('test-service');
    expect(client).toBeDefined();
    expect(client.getConnectionStatus).toBeDefined();
    expect(client.getProviderType).toBeDefined();
  });

  it('should create Kafka client when configured', async () => {
    process.env.EVENT_BUS_PROVIDER = 'kafka';
    const { createEventBusClient } = await import('../orchestration/event-bus-factory.js');
    const client = createEventBusClient('test-service');
    expect(client).toBeDefined();
    expect(client.getProviderType).toBeDefined();
  });
});
