import CircuitBreaker from 'opossum';
import { getRedisCircuitBreakerManager as _getRedisCircuitBreakerManager } from './RedisCircuitBreaker';
import { getLogger } from '../logging/logger.js';
import { Bulkhead, DEFAULT_BULKHEAD_CONFIG } from './bulkhead.js';
import { parsePositiveInt } from './env-utils.js';
import type {
  CircuitBreakerConfig,
  RetryConfig,
  ResilienceConfig,
  CircuitBreakerStats,
  CircuitState,
  ResilienceEvent,
  ResilienceEventHandler,
  ExternalApiCircuitBreakerOptions,
} from './types.js';

const logger = getLogger('resilience');

export const DEFAULT_CIRCUIT_CONFIG: Required<CircuitBreakerConfig> = {
  timeout: parsePositiveInt('CIRCUIT_BREAKER_TIMEOUT_MS', 30000, 100),
  errorThresholdPercentage: parsePositiveInt('CIRCUIT_BREAKER_ERROR_THRESHOLD', 50, 1),
  resetTimeout: parsePositiveInt('CIRCUIT_BREAKER_RESET_TIMEOUT_MS', 30000, 100),
  volumeThreshold: parsePositiveInt('CIRCUIT_BREAKER_VOLUME_THRESHOLD', 5, 1),
  rollingCountTimeout: parsePositiveInt('CIRCUIT_BREAKER_ROLLING_COUNT_TIMEOUT_MS', 10000, 100),
  rollingCountBuckets: parsePositiveInt('CIRCUIT_BREAKER_ROLLING_COUNT_BUCKETS', 3, 1),
};

export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: parsePositiveInt('RETRY_MAX_RETRIES', 3, 0),
  retryDelay: parsePositiveInt('RETRY_DELAY_MS', 1000, 100),
  exponentialBackoff: process.env.RETRY_EXPONENTIAL_BACKOFF !== 'false',
  retryableErrors: (error: unknown) => {
    if (error && typeof error === 'object') {
      const errRecord = error as Record<string, unknown>;
      const code = errRecord.code;
      if (typeof code === 'string') {
        const retryableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNRESET'];
        if (retryableCodes.includes(code)) return true;
      }
      const message = errRecord.message;
      if (typeof message === 'string' && message.includes('socket hang up')) return true;
      const response = errRecord.response as Record<string, unknown> | undefined;
      const status = (errRecord.statusCode as number) ?? (errRecord.status as number) ?? (response?.status as number);
      if (typeof status === 'number') {
        return status >= 500 || status === 429;
      }
    }
    return false;
  },
};

export class ResilienceManager {
  private breakers = new Map<string, CircuitBreaker>();
  private bulkheads = new Map<string, Bulkhead>();
  private configs = new Map<string, ResilienceConfig>();
  private eventHandlers: ResilienceEventHandler[] = [];
  private presets = new Map<string, ResilienceConfig>();

  constructor() {
    this.registerPreset('external-api', {
      circuitBreaker: { timeout: 30000, errorThresholdPercentage: 50, resetTimeout: 30000 },
      retry: { maxRetries: 2, retryDelay: 1000, exponentialBackoff: true },
      bulkhead: { maxConcurrent: 15, maxQueue: 50 },
    });

    this.registerPreset('internal-service', {
      circuitBreaker: { timeout: 10000, errorThresholdPercentage: 60, resetTimeout: 15000 },
      retry: { maxRetries: 1, retryDelay: 500, exponentialBackoff: false },
      bulkhead: { maxConcurrent: 25, maxQueue: 100 },
    });

    this.registerPreset('database', {
      circuitBreaker: { timeout: 5000, errorThresholdPercentage: 70, resetTimeout: 10000 },
      retry: { maxRetries: 2, retryDelay: 100, exponentialBackoff: true },
      bulkhead: { maxConcurrent: 20, maxQueue: 50 },
    });

    this.registerPreset('ai-provider', {
      circuitBreaker: { timeout: 360000, errorThresholdPercentage: 40, resetTimeout: 60000, volumeThreshold: 10 },
      retry: { maxRetries: 2, retryDelay: 3000, exponentialBackoff: true },
      bulkhead: { maxConcurrent: 15, maxQueue: 100 },
    });

    this.onEvent(event => {
      const meta = {
        circuitBreaker: event.name,
        ...(event.stats ? { state: event.stats.state, failures: event.stats.failures } : {}),
      };
      switch (event.type) {
        case 'open':
          logger.warn('Circuit breaker OPENED', { ...meta, error: event.error?.message });
          break;
        case 'reject':
          logger.warn('Circuit breaker rejected request', meta);
          break;
        case 'timeout':
          logger.warn('Circuit breaker timeout', meta);
          break;
        case 'halfOpen':
          logger.info('Circuit breaker HALF-OPEN, testing recovery', meta);
          break;
        case 'close':
          logger.info('Circuit breaker CLOSED, recovered', meta);
          break;
        case 'fallback':
          logger.info('Circuit breaker fallback invoked', meta);
          break;
        case 'success':
          logger.debug('Circuit breaker call succeeded', meta);
          break;
        case 'failure':
          logger.debug('Circuit breaker call failed', { ...meta, error: event.error?.message });
          break;
      }
    });
  }

  registerPreset(name: string, config: ResilienceConfig): void {
    this.presets.set(name, config);
  }

  getPreset(name: string): ResilienceConfig | undefined {
    return this.presets.get(name);
  }

  configure(name: string, config: ResilienceConfig): void {
    this.configs.set(name, config);
    if (this.breakers.has(name)) {
      this.breakers.delete(name);
    }
  }

  onEvent(handler: ResilienceEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  private emit(event: ResilienceEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (handlerError) {
        logger.warn('Resilience event handler threw', {
          eventType: event.type,
          name: event.name,
          error: handlerError instanceof Error ? handlerError.message : String(handlerError),
        });
      }
    }
  }

  private getOrCreateBreaker(name: string): CircuitBreaker {
    if (this.breakers.has(name)) {
      return this.breakers.get(name)!;
    }

    const config = this.configs.get(name)?.circuitBreaker ?? {};
    const opts = { ...DEFAULT_CIRCUIT_CONFIG, ...config };

    const breaker = new CircuitBreaker(async (fn: () => Promise<unknown>) => fn(), {
      timeout: opts.timeout,
      errorThresholdPercentage: opts.errorThresholdPercentage,
      resetTimeout: opts.resetTimeout,
      volumeThreshold: opts.volumeThreshold,
      rollingCountTimeout: opts.rollingCountTimeout,
      rollingCountBuckets: opts.rollingCountBuckets,
      name,
    });

    const fallback = this.configs.get(name)?.fallback;
    if (fallback) {
      breaker.fallback(fallback);
    }

    this.setupEvents(breaker, name);
    this.breakers.set(name, breaker);

    return breaker;
  }

  private getOrCreateBulkhead(name: string): Bulkhead | undefined {
    const config = this.configs.get(name)?.bulkhead;
    if (!config) return undefined;

    if (!this.bulkheads.has(name)) {
      this.bulkheads.set(name, new Bulkhead({ ...DEFAULT_BULKHEAD_CONFIG, ...config }));
    }

    return this.bulkheads.get(name);
  }

  private setupEvents(breaker: CircuitBreaker, name: string): void {
    breaker.on('open', () => {
      this.emit({ type: 'open', name, timestamp: Date.now(), stats: this.getStats(name)! });
    });

    breaker.on('close', () => {
      this.emit({ type: 'close', name, timestamp: Date.now() });
    });

    breaker.on('halfOpen', () => {
      this.emit({ type: 'halfOpen', name, timestamp: Date.now() });
    });

    breaker.on('timeout', () => {
      this.emit({ type: 'timeout', name, timestamp: Date.now() });
    });

    breaker.on('failure', error => {
      this.emit({ type: 'failure', name, timestamp: Date.now(), error: error instanceof Error ? error : undefined });
    });

    breaker.on('success', () => {
      this.emit({ type: 'success', name, timestamp: Date.now() });
    });

    breaker.on('fallback', () => {
      this.emit({ type: 'fallback', name, timestamp: Date.now() });
    });

    breaker.on('reject', () => {
      this.emit({ type: 'reject', name, timestamp: Date.now() });
    });
  }

  private async executeWithRetry<T>(fn: () => Promise<T>, retryConfig: Required<RetryConfig>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt >= retryConfig.maxRetries) break;
        if (!retryConfig.retryableErrors(lastError)) break;

        const errRecord = lastError as unknown as Record<string, unknown>;
        const response = errRecord.response as Record<string, unknown> | undefined;
        const status = (errRecord.statusCode as number) ?? (errRecord.status as number) ?? (response?.status as number);
        const headers = response?.headers as Record<string, string> | undefined;
        const retryAfterHeader = headers?.['retry-after'];

        let delayMs: number;
        if (status === 429 && retryAfterHeader) {
          const retryAfterSeconds = parseFloat(retryAfterHeader);
          delayMs = isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : retryConfig.retryDelay;
          logger.warn('Rate limited (429), honouring Retry-After header', {
            retryAfterHeader,
            delayMs,
            attempt,
          });
        } else {
          const baseDelay = retryConfig.exponentialBackoff
            ? retryConfig.retryDelay * Math.pow(2, attempt)
            : retryConfig.retryDelay;
          delayMs = baseDelay * (0.5 + Math.random());
        }

        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const breaker = this.getOrCreateBreaker(name);
    const bulkhead = this.getOrCreateBulkhead(name);
    const retryConfig = this.configs.get(name)?.retry;
    const fullRetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

    const wrappedFn = async () => {
      if (bulkhead) {
        await bulkhead.acquire();
        try {
          return await this.executeWithRetry(fn, fullRetryConfig);
        } finally {
          bulkhead.release();
        }
      }
      return this.executeWithRetry(fn, fullRetryConfig);
    };

    return breaker.fire(wrappedFn) as Promise<T>;
  }

  getStats(name: string): CircuitBreakerStats | null {
    const breaker = this.breakers.get(name);
    if (!breaker) return null;

    const stats = breaker.stats;
    const state: CircuitState = breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed';

    return {
      name,
      state,
      failures: stats.failures,
      successes: stats.successes,
      rejects: stats.rejects,
      fires: stats.fires,
      timeouts: stats.timeouts,
      fallbacks: stats.fallbacks,
      latencyMean: stats.latencyMean,
      percentiles: stats.percentiles,
    };
  }

  getAllStats(): CircuitBreakerStats[] {
    return Array.from(this.breakers.keys())
      .map(name => this.getStats(name))
      .filter((s): s is CircuitBreakerStats => s !== null);
  }

  getBulkheadStats(name: string) {
    return this.bulkheads.get(name)?.getStats() ?? null;
  }

  getAllBulkheadStats() {
    return Array.from(this.bulkheads.entries()).map(([name, bulkhead]) => ({
      name,
      ...bulkhead.getStats(),
    }));
  }

  isOpen(name: string): boolean {
    return this.breakers.get(name)?.opened ?? false;
  }

  reset(name: string): void {
    this.breakers.get(name)?.close();
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.close();
    }
  }

  shutdown(name: string): void {
    this.breakers.get(name)?.shutdown();
    this.breakers.delete(name);
    this.bulkheads.delete(name);
    this.configs.delete(name);
  }

  shutdownAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.shutdown();
    }
    this.breakers.clear();
    this.bulkheads.clear();
  }
}

export const resilience = new ResilienceManager();

export async function withResilience<T>(name: string, fn: () => Promise<T>, config?: ResilienceConfig): Promise<T> {
  if (config) {
    resilience.configure(name, config);
  }
  return resilience.execute(name, fn);
}

export function configureResilience(name: string, config: ResilienceConfig): void {
  resilience.configure(name, config);
}

export function usePreset(name: string, presetName: string): void {
  const preset = resilience.getPreset(presetName);
  if (preset) {
    resilience.configure(name, preset);
  }
}

export async function withCircuitBreaker<T>(
  apiName: string,
  fn: () => Promise<T>,
  options?: ExternalApiCircuitBreakerOptions
): Promise<T> {
  if (options) {
    const config: ResilienceConfig = {
      circuitBreaker: {
        timeout: options.timeout,
        errorThresholdPercentage: options.errorThresholdPercentage,
        resetTimeout: options.resetTimeout,
        volumeThreshold: options.volumeThreshold,
      },
      fallback: options.fallback,
    };
    return withResilience(apiName, fn, config);
  }
  return withResilience(apiName, fn);
}

export const externalApiCircuitBreaker = {
  execute: <T>(apiName: string, fn: () => Promise<T>, options?: ExternalApiCircuitBreakerOptions) =>
    withCircuitBreaker(apiName, fn, options),
  isOpen: (apiName: string) => resilience.isOpen(apiName),
  getStats: (apiName: string): CircuitBreakerStats | null => resilience.getStats(apiName),
  getAllStats: (): CircuitBreakerStats[] => resilience.getAllStats(),
  reset: (apiName: string) => resilience.reset(apiName),
  resetAll: () => resilience.resetAll(),
};

export async function initializeRedisCircuitBreakers(): Promise<void> {
  if (!process.env.REDIS_URL) {
    logger.debug('REDIS_URL not configured - skipping Redis circuit breaker initialization');
    return;
  }

  try {
    await _getRedisCircuitBreakerManager().initialize();
    logger.debug('Redis circuit breakers initialized successfully');
  } catch (error) {
    logger.warn('Failed to initialize Redis circuit breakers', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
