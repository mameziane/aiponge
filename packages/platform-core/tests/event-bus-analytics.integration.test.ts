/**
 * Integration Tests for Event Bus Analytics Delivery
 * Tests analytics event publishing via Redis Pub/Sub and memory fallback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('redis', () => {
  const mockPublish = vi.fn().mockResolvedValue(1);
  const mockSubscribe = vi.fn().mockResolvedValue(undefined);
  const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockQuit = vi.fn().mockResolvedValue(undefined);
  const mockOn = vi.fn().mockReturnThis();

  const createMockClient = () => ({
    publish: mockPublish,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    connect: mockConnect,
    quit: mockQuit,
    on: mockOn,
    isOpen: true,
  });

  return {
    createClient: vi.fn(() => createMockClient()),
    __mockPublish: mockPublish,
    __mockSubscribe: mockSubscribe,
    __mockConnect: mockConnect,
  };
});

import {
  RedisEventBusClient,
  getSharedEventBusClient,
  type StandardEvent,
} from '../src/orchestration/event-bus-client';
import {
  AnalyticsEventPublisher,
  getAnalyticsEventPublisher,
  publishAnalyticsEvent,
  publishAnalyticsMetric,
  publishProviderUsage,
} from '../src/orchestration/analytics-event-publisher';

const redis = require('redis');

describe('Event Bus Analytics Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.REDIS_URL;
  });

  describe('AnalyticsEventPublisher', () => {
    it('should create publisher with correct service name', () => {
      const publisher = new AnalyticsEventPublisher('test-service');
      expect(publisher).toBeInstanceOf(AnalyticsEventPublisher);
    });

    it('should record single event without throwing', () => {
      const publisher = new AnalyticsEventPublisher('test-service');

      expect(() => {
        publisher.recordEvent({
          eventType: 'music.generation.started',
          eventData: { trackId: 'track-123', genre: 'ambient' },
          userId: 'user-456',
        });
      }).not.toThrow();
    });

    it('should record multiple events without throwing', () => {
      const publisher = new AnalyticsEventPublisher('test-service');

      expect(() => {
        publisher.recordEvents([
          { eventType: 'music.played', eventData: { trackId: '1' } },
          { eventType: 'music.paused', eventData: { trackId: '1' } },
          { eventType: 'music.completed', eventData: { trackId: '1' } },
        ]);
      }).not.toThrow();
    });

    it('should record metrics without throwing', () => {
      const publisher = new AnalyticsEventPublisher('test-service');

      expect(() => {
        publisher.recordMetric({
          metricName: 'api.latency',
          metricValue: 150,
          metricType: 'histogram',
          labels: { endpoint: '/api/music', method: 'POST' },
        });
      }).not.toThrow();
    });

    it('should record provider usage without throwing', () => {
      const publisher = new AnalyticsEventPublisher('test-service');

      expect(() => {
        publisher.recordProviderUsage({
          providerId: 'openai-gpt4',
          providerName: 'OpenAI',
          operation: 'text_generation',
          success: true,
          durationMs: 500,
          tokensUsed: 1000,
          cost: 0.03,
        });
      }).not.toThrow();
    });

    it('should include timestamp and service metadata in events', () => {
      const publisher = new AnalyticsEventPublisher('music-service');
      const capturedEvents: StandardEvent[] = [];

      const mockClient = getSharedEventBusClient('music-service');
      const originalPublish = mockClient.publish.bind(mockClient);
      mockClient.publish = vi.fn((event: StandardEvent) => {
        capturedEvents.push(event);
        return Promise.resolve();
      });

      publisher.recordEvents([{ eventType: 'test.event', eventData: { value: 1 } }]);

      expect(mockClient.publish).toHaveBeenCalled();
      const publishedEvent = capturedEvents[0];
      expect(publishedEvent.type).toBe('analytics.events.batch');
      expect(publishedEvent.source).toBe('music-service');
      expect(publishedEvent.timestamp).toBeDefined();
    });
  });

  describe('Convenience Functions', () => {
    it('publishAnalyticsEvent should not throw', () => {
      expect(() => {
        publishAnalyticsEvent('api-gateway', {
          eventType: 'request.received',
          eventData: { path: '/api/health', method: 'GET' },
        });
      }).not.toThrow();
    });

    it('publishAnalyticsMetric should not throw', () => {
      expect(() => {
        publishAnalyticsMetric('api-gateway', {
          metricName: 'requests.total',
          metricValue: 1,
          metricType: 'counter',
        });
      }).not.toThrow();
    });

    it('publishProviderUsage should not throw', () => {
      expect(() => {
        publishProviderUsage('ai-content-service', {
          providerId: 'anthropic-claude',
          providerName: 'Anthropic',
          operation: 'chat_completion',
          success: true,
          durationMs: 1200,
        });
      }).not.toThrow();
    });
  });

  describe('getAnalyticsEventPublisher Singleton', () => {
    it('should return same instance for same service name', () => {
      const publisher1 = getAnalyticsEventPublisher('singleton-test');
      const publisher2 = getAnalyticsEventPublisher('singleton-test');

      expect(publisher1).toBe(publisher2);
    });

    it('should return different instances for different service names', () => {
      const publisher1 = getAnalyticsEventPublisher('service-a');
      const publisher2 = getAnalyticsEventPublisher('service-b');

      expect(publisher1).not.toBe(publisher2);
    });
  });

  describe('Event Bus Memory Fallback', () => {
    it('should operate in memory mode when REDIS_URL not set', async () => {
      delete process.env.REDIS_URL;

      const client = new RedisEventBusClient('memory-test');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(client.getConnectionStatus()).toBe(true);
    });

    it('should deliver events via memory when Redis unavailable', async () => {
      delete process.env.REDIS_URL;

      const receivedEvents: StandardEvent[] = [];
      const client = new RedisEventBusClient('memory-subscriber');
      await new Promise(resolve => setTimeout(resolve, 50));

      await client.subscribe('test.event', async event => {
        receivedEvents.push(event);
      });

      await client.publish({
        eventId: 'evt-123',
        type: 'test.event',
        timestamp: new Date().toISOString(),
        version: '1.0',
        source: 'test',
        data: { message: 'hello' },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].eventId).toBe('evt-123');
    });
  });

  describe('Event Bus Redis Mode', () => {
    beforeEach(() => {
      process.env.REDIS_URL = 'redis://localhost:6379';
    });

    afterEach(() => {
      delete process.env.REDIS_URL;
    });

    it('should connect to Redis when REDIS_URL is set', async () => {
      const client = new RedisEventBusClient('redis-test');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(redis.createClient).toHaveBeenCalled();
      expect(redis.__mockConnect).toHaveBeenCalled();
    });

    it('should publish to Redis channel with correct prefix', async () => {
      const client = new RedisEventBusClient('redis-publisher');
      await new Promise(resolve => setTimeout(resolve, 50));

      await client.publish({
        eventId: 'evt-456',
        type: 'analytics.event.recorded',
        timestamp: new Date().toISOString(),
        version: '1.0',
        source: 'redis-publisher',
        data: { test: true },
      });

      expect(redis.__mockPublish).toHaveBeenCalledWith('aiponge:events:analytics.event.recorded', expect.any(String));
    });
  });

  describe('Fire-and-Forget Resilience', () => {
    it('should not throw when event bus publish fails', () => {
      const publisher = new AnalyticsEventPublisher('resilience-test');

      const mockClient = getSharedEventBusClient('resilience-test');
      mockClient.publish = vi.fn().mockRejectedValue(new Error('Redis connection lost'));

      expect(() => {
        publisher.recordEvent({
          eventType: 'critical.event',
          eventData: { important: true },
        });
      }).not.toThrow();
    });

    it('should continue processing after publish failure', async () => {
      const publisher = new AnalyticsEventPublisher('recovery-test');

      const mockClient = getSharedEventBusClient('recovery-test');
      let callCount = 0;
      mockClient.publish = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First call fails'));
        }
        return Promise.resolve();
      });

      publisher.recordEvent({ eventType: 'event.1', eventData: {} });
      publisher.recordEvent({ eventType: 'event.2', eventData: {} });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockClient.publish).toHaveBeenCalledTimes(2);
    });
  });

  describe('Analytics Event Types', () => {
    const eventTypes = [
      { type: 'analytics.events.batch', method: 'recordEvents' },
      { type: 'analytics.metric.recorded', method: 'recordMetric' },
      { type: 'analytics.provider.usage', method: 'recordProviderUsage' },
    ];

    eventTypes.forEach(({ type, method }) => {
      it(`should publish ${type} event type for ${method}`, async () => {
        const publisher = new AnalyticsEventPublisher('event-type-test');
        const capturedEvents: StandardEvent[] = [];

        const mockClient = getSharedEventBusClient('event-type-test');
        mockClient.publish = vi.fn((event: StandardEvent) => {
          capturedEvents.push(event);
          return Promise.resolve();
        });

        if (method === 'recordEvents') {
          publisher.recordEvents([{ eventType: 'test', eventData: {} }]);
        } else if (method === 'recordMetric') {
          publisher.recordMetric({ metricName: 'test', metricValue: 1, metricType: 'counter' });
        } else if (method === 'recordProviderUsage') {
          publisher.recordProviderUsage({
            providerId: 'test',
            providerName: 'Test',
            operation: 'test',
            success: true,
          });
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        const published = capturedEvents.find(e => e.type === type);
        expect(published).toBeDefined();
      });
    });
  });
});

describe('Config Event Integration Tests', () => {
  it('should subscribe to config invalidation events', async () => {
    delete process.env.REDIS_URL;

    const receivedEvents: StandardEvent[] = [];
    const client = new RedisEventBusClient('config-subscriber');
    await new Promise(resolve => setTimeout(resolve, 50));

    await client.subscribe('config.template.invalidated', async event => {
      receivedEvents.push(event);
    });

    await client.publish({
      eventId: 'cfg-001',
      type: 'config.template.invalidated',
      timestamp: new Date().toISOString(),
      version: '1.0',
      source: 'ai-config-service',
      data: { templateId: 'lyrics-generator-v2', action: 'updated' },
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].data.templateId).toBe('lyrics-generator-v2');
  });

  it('should subscribe to provider config changes', async () => {
    delete process.env.REDIS_URL;

    const receivedEvents: StandardEvent[] = [];
    const client = new RedisEventBusClient('provider-subscriber');
    await new Promise(resolve => setTimeout(resolve, 50));

    await client.subscribe('config.provider.invalidated', async event => {
      receivedEvents.push(event);
    });

    await client.publish({
      eventId: 'cfg-002',
      type: 'config.provider.invalidated',
      timestamp: new Date().toISOString(),
      version: '1.0',
      source: 'ai-config-service',
      data: { providerId: 'openai-gpt4', action: 'disabled' },
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].data.providerId).toBe('openai-gpt4');
  });
});
