export type CircuitState = 'open' | 'closed' | 'half-open';

export interface CircuitBreakerConfig {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
}

export interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
  retryableErrors?: (error: Error) => boolean;
}

export interface BulkheadConfig {
  maxConcurrent?: number;
  maxQueue?: number;
}

export interface ResilienceConfig {
  circuitBreaker?: CircuitBreakerConfig;
  retry?: RetryConfig;
  bulkhead?: BulkheadConfig;
  fallback?: () => Promise<unknown>;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  rejects: number;
  fires: number;
  timeouts: number;
  fallbacks: number;
  latencyMean: number;
  percentiles: Record<string, number>;
}

export interface ResilienceEvent {
  type: 'open' | 'close' | 'halfOpen' | 'timeout' | 'failure' | 'success' | 'fallback' | 'reject';
  name: string;
  timestamp: number;
  error?: Error;
  stats?: CircuitBreakerStats;
}

export type ResilienceEventHandler = (event: ResilienceEvent) => void;

export interface ExternalApiCircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
  fallback?: () => Promise<unknown>;
}

import type CircuitBreaker from 'opossum';

export type CircuitBreakerOptions = CircuitBreaker.Options & {
  name?: string;
  resetTimeoutMs?: number;
  failureThreshold?: number;
  successThreshold?: number;
  maxRetries?: number;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
  monitoringPeriodMs?: number;
};
