/**
 * AI Analytics Service - Service Factory (Composition Root)
 * Creates and manages all service dependencies using the registry pattern.
 */

import { TimescaleAnalyticsRepository } from './repositories/TimescaleAnalyticsRepository';
import { createRedisCache, type ICache } from '@aiponge/platform-core';
import { MetricsCollectorService } from '../application/services/MetricsCollectorService';
import { ProviderAnalyticsService } from '../application/provider-analytics/ProviderAnalyticsService';
import { SystemHealthService } from '../application/system-health/SystemHealthService';
import { FraudDetectionService } from '../application/services/FraudDetectionService';
import { AnalyticsError } from '../application/errors';
import { getLogger } from '../config/service-urls';

const logger = getLogger('ai-analytics-service:service-factory');

const NODE_ENV = process.env.NODE_ENV || 'development';
const DATABASE_URL = process.env.DATABASE_URL;

export interface AnalyticsServiceRegistry {
  repository: TimescaleAnalyticsRepository;
  cache: ICache;
  metricsCollector: MetricsCollectorService;
  providerAnalytics: ProviderAnalyticsService;
  systemHealth: SystemHealthService;
  fraudDetection: FraudDetectionService;
}

let registry: AnalyticsServiceRegistry | null = null;

export function getServiceRegistry(): AnalyticsServiceRegistry {
  if (!registry) {
    registry = createServiceRegistry();
  }
  return registry;
}

export function setServiceRegistry(custom: AnalyticsServiceRegistry): void {
  registry = custom;
  logger.info('Service registry overridden (test mode)');
}

export function resetServiceRegistry(): void {
  registry = null;
}

export function createMockRepository(): TimescaleAnalyticsRepository {
  return {
    getMetrics: async () => [],
    getAggregatedMetrics: async () => [],
    deleteUserData: async () => ({ deletedRecords: 0 }),
    exportUserData: async () => ({ activityLogs: [] }),
    getProviderUsageSummary: async () => ({
      providers: [],
      totalRequests: 0,
      totalCost: 0,
      successRate: 0,
      byProvider: {},
    }),
    recordMetric: async () => {},
    recordMetrics: async () => {},
    healthCheck: async () => ({ status: 'unhealthy' as const, details: { mock: true } }),
  } as unknown as TimescaleAnalyticsRepository;
}

export function createMockCache(): ICache {
  const store = new Map<string, { value: string; expiry: number }>();
  return {
    ping: async () => true,
    isReady: () => true,
    get: async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiry < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set: async (key: string, value: string, ttlSeconds?: number) => {
      store.set(key, { value, expiry: Date.now() + (ttlSeconds || 3600) * 1000 });
      return true;
    },
    setex: async (_key: string, _ttl: number, _value: string) => true,
    del: async (key: string) => {
      store.delete(key);
      return true;
    },
    exists: async (key: string) => store.has(key),
    mget: async (...keys: string[]) => keys.map(k => store.get(k)?.value ?? null),
    mset: async (_keyValues: Record<string, string>, _ttl?: number) => true,
    incr: async (_key: string) => 1,
    incrby: async (_key: string, amount: number) => amount,
    decr: async (_key: string) => -1,
    expire: async (_key: string, _seconds: number) => true,
    ttl: async (_key: string) => -1,
    keys: async (_pattern: string) => Array.from(store.keys()),
    flushdb: async () => {
      store.clear();
      return true;
    },
    disconnect: async () => {},
    pipeline: (() => ({})) as unknown as ICache['pipeline'],
    publish: async (_channel: string, _message: string) => 0,
    subscribe: async (_channel: string, _callback: (message: string) => void) => {},
  };
}

export function createServiceRegistry(): AnalyticsServiceRegistry {
  let repository: TimescaleAnalyticsRepository;
  let cache: ICache;

  const useMockFallback = NODE_ENV === 'test' || NODE_ENV === 'development';

  try {
    const analyticsDbUrl = process.env.AI_ANALYTICS_DATABASE_URL || process.env.ANALYTICS_DB_URL || DATABASE_URL;
    if (analyticsDbUrl) {
      const url = new URL(analyticsDbUrl);
      const isLocalOrInternal =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.railway.internal');
      const useSsl =
        !isLocalOrInternal &&
        process.env.DATABASE_SSL !== 'false' &&
        (process.env.DATABASE_SSL === 'true' ||
          ['require', 'verify-full', 'verify-ca'].includes(url.searchParams.get('sslmode') || '') ||
          NODE_ENV === 'production');
      const dbConfig = {
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.substring(1),
        user: url.username,
        password: decodeURIComponent(url.password),
        ssl: useSsl,
      };
      repository = new TimescaleAnalyticsRepository(dbConfig);
      logger.info('Using database analytics repository', { host: dbConfig.host, database: dbConfig.database });
    } else if (useMockFallback) {
      logger.info('Using in-memory analytics repository (no AI_ANALYTICS_DATABASE_URL or DATABASE_URL configured)');
      repository = createMockRepository();
    } else {
      throw AnalyticsError.validationError(
        'AI_ANALYTICS_DATABASE_URL',
        'AI_ANALYTICS_DATABASE_URL or DATABASE_URL is required for analytics service in production'
      );
    }

    try {
      cache = createRedisCache({ serviceName: 'ai-analytics-service', keyPrefix: 'aiponge:analytics:' });
    } catch (cacheError) {
      if (useMockFallback) {
        logger.warn('Redis unavailable, using in-memory cache fallback');
        cache = createMockCache();
      } else {
        throw cacheError;
      }
    }
  } catch (error) {
    if (useMockFallback) {
      logger.warn('Failed to initialize database/cache, using in-memory fallbacks');
      repository = createMockRepository();
      cache = createMockCache();
    } else {
      logger.error('CRITICAL: Failed to initialize analytics database', { error });
      throw error;
    }
  }

  const metricsCollector = new MetricsCollectorService(repository, cache);
  const providerAnalytics = new ProviderAnalyticsService(repository, metricsCollector, cache);
  const systemHealth = new SystemHealthService(repository, metricsCollector);
  const fraudDetection = new FraudDetectionService(repository);

  return { repository, cache, metricsCollector, providerAnalytics, systemHealth, fraudDetection };
}
