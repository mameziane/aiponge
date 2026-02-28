/**
 * Redis-Backed Circuit Breaker
 * Shared circuit breaker state across all instances for horizontal scaling
 */

import Redis from 'ioredis';
import { createLogger } from '../logging/logger.js';
import { DomainError } from '../error-handling/errors.js';

const logger = createLogger('redis-circuit-breaker');

export interface RedisCircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  monitoringWindow: number;
}

export type RedisCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitData {
  state: RedisCircuitState;
  failures: number;
  successes: number;
  lastFailure: number;
  lastStateChange: number;
}

const DEFAULT_CONFIG: RedisCircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  monitoringWindow: 60000,
};

export class RedisCircuitBreaker {
  private readonly KEY_PREFIX = 'circuit-breaker';

  constructor(
    private readonly redis: Redis,
    private readonly serviceName: string,
    private readonly config: RedisCircuitBreakerConfig = DEFAULT_CONFIG
  ) {}

  async isAllowed(): Promise<boolean> {
    const data = await this.getData();

    if (data.state === 'CLOSED') {
      return true;
    }

    if (data.state === 'OPEN') {
      const now = Date.now();
      if (now - data.lastStateChange >= this.config.timeout) {
        await this.setState('HALF_OPEN');
        return true;
      }
      return false;
    }

    return true;
  }

  async recordSuccess(): Promise<void> {
    const data = await this.getData();

    if (data.state === 'HALF_OPEN') {
      const newSuccesses = data.successes + 1;

      if (newSuccesses >= this.config.successThreshold) {
        await this.setState('CLOSED');
        await this.resetCounters();
        logger.info('Circuit closed after successful recovery', {
          service: this.serviceName,
        });
      } else {
        await this.redis.hincrby(this.getKey(), 'successes', 1);
      }
    } else if (data.state === 'CLOSED') {
      await this.redis.hset(this.getKey(), 'failures', '0');
    }
  }

  async recordFailure(): Promise<void> {
    const data = await this.getData();
    const now = Date.now();

    await this.redis.hset(this.getKey(), {
      failures: (data.failures + 1).toString(),
      lastFailure: now.toString(),
    });

    if (data.state === 'HALF_OPEN') {
      await this.setState('OPEN');
      logger.warn('Circuit re-opened after failure in half-open state', {
        service: this.serviceName,
      });
    } else if (data.state === 'CLOSED') {
      if (data.failures + 1 >= this.config.failureThreshold) {
        if (now - data.lastFailure <= this.config.monitoringWindow) {
          await this.setState('OPEN');
          logger.warn('Circuit opened due to failure threshold', {
            service: this.serviceName,
            failures: data.failures + 1,
          });
        } else {
          await this.resetCounters();
        }
      }
    }
  }

  async getState(): Promise<RedisCircuitState> {
    const data = await this.getData();
    return data.state;
  }

  async getStatus(): Promise<{
    service: string;
    state: RedisCircuitState;
    failures: number;
    successes: number;
    lastFailure: Date | null;
    lastStateChange: Date;
  }> {
    const data = await this.getData();

    return {
      service: this.serviceName,
      state: data.state,
      failures: data.failures,
      successes: data.successes,
      lastFailure: data.lastFailure ? new Date(data.lastFailure) : null,
      lastStateChange: new Date(data.lastStateChange),
    };
  }

  async forceState(state: RedisCircuitState): Promise<void> {
    await this.setState(state);
    if (state === 'CLOSED') {
      await this.resetCounters();
    }
    logger.info('Circuit state forced', { service: this.serviceName, state });
  }

  private async getData(): Promise<CircuitData> {
    const data = await this.redis.hgetall(this.getKey());

    if (!data || Object.keys(data).length === 0) {
      const initial: CircuitData = {
        state: 'CLOSED',
        failures: 0,
        successes: 0,
        lastFailure: 0,
        lastStateChange: Date.now(),
      };
      await this.redis.hset(this.getKey(), this.serializeData(initial));
      return initial;
    }

    return {
      state: (data.state || 'CLOSED') as RedisCircuitState,
      failures: parseInt(data.failures || '0', 10),
      successes: parseInt(data.successes || '0', 10),
      lastFailure: parseInt(data.lastFailure || '0', 10),
      lastStateChange: parseInt(data.lastStateChange || '0', 10),
    };
  }

  private async setState(state: RedisCircuitState): Promise<void> {
    await this.redis.hset(this.getKey(), {
      state,
      lastStateChange: Date.now().toString(),
      successes: '0',
    });

    await this.redis.publish(
      `${this.KEY_PREFIX}:events`,
      JSON.stringify({
        service: this.serviceName,
        state,
        timestamp: Date.now(),
      })
    );
  }

  private async resetCounters(): Promise<void> {
    await this.redis.hset(this.getKey(), {
      failures: '0',
      successes: '0',
    });
  }

  private getKey(): string {
    return `${this.KEY_PREFIX}:${this.serviceName}`;
  }

  private serializeData(data: CircuitData): Record<string, string> {
    return {
      state: data.state,
      failures: data.failures.toString(),
      successes: data.successes.toString(),
      lastFailure: data.lastFailure.toString(),
      lastStateChange: data.lastStateChange.toString(),
    };
  }
}

export class RedisCircuitBreakerManager {
  private breakers = new Map<string, RedisCircuitBreaker>();
  private redis: Redis | null = null;
  private initialized = false;

  async initialize(redisUrl?: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    const url = redisUrl || process.env.REDIS_URL;
    if (!url) {
      logger.warn('REDIS_URL not configured - circuit breakers will use per-instance state');
      return;
    }

    try {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
      // Prevent unhandled 'error' event from crashing the process when Redis is unavailable
      this.redis.on('error', (err: Error) => {
        logger.warn('Redis circuit breaker connection error', { error: err.message });
      });

      this.initialized = true;
      logger.debug('RedisCircuitBreakerManager initialized');
    } catch (error) {
      logger.error('Failed to initialize Redis circuit breaker manager', { error });
      throw error;
    }
  }

  getBreaker(serviceName: string, config?: Partial<RedisCircuitBreakerConfig>): RedisCircuitBreaker {
    if (!this.redis) {
      throw new DomainError('RedisCircuitBreakerManager not initialized - call initialize() first', 500);
    }

    if (!this.breakers.has(serviceName)) {
      const fullConfig: RedisCircuitBreakerConfig = {
        ...DEFAULT_CONFIG,
        ...config,
      };
      this.breakers.set(serviceName, new RedisCircuitBreaker(this.redis, serviceName, fullConfig));
    }
    return this.breakers.get(serviceName)!;
  }

  async getAllStatus(): Promise<
    Array<{
      service: string;
      state: RedisCircuitState;
      failures: number;
      successes: number;
    }>
  > {
    const statuses = await Promise.all(Array.from(this.breakers.values()).map(b => b.getStatus()));
    return statuses;
  }

  async shutdown(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    this.breakers.clear();
    this.initialized = false;
    logger.info('RedisCircuitBreakerManager shutdown complete');
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

let managerInstance: RedisCircuitBreakerManager | null = null;

export function getRedisCircuitBreakerManager(): RedisCircuitBreakerManager {
  if (!managerInstance) {
    managerInstance = new RedisCircuitBreakerManager();
  }
  return managerInstance;
}
