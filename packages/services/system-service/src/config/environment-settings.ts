import { getLogger } from './service-urls';

const logger = getLogger('system-service-environment-settings');

export interface EnvironmentSettings {
  // Heartbeat and Health Check Intervals
  heartbeatInterval: number;
  healthCheckInterval: number;
  staleServiceThreshold: number;
  staleServiceCleanupInterval: number;

  // Lease-based Service Management
  leaseSettings: {
    defaultLeaseTTL: number; // Default lease time-to-live in milliseconds
    gracePeriod: number; // Grace period for new registrations in milliseconds
    leaseRenewalBuffer: number; // Buffer time added when renewing lease
    cleanupGracePeriod: number; // Additional grace period before cleanup
  };

  // Batch Configuration
  batchSettings: {
    batchSize: number;
    batchWindow: number;
    maxRetries: number;
    maxBatchDelay: number;
  };

  // Dependency and Startup Timeouts
  dependencyValidationTimeout: number;
  startupTimeouts: {
    general: number;
    healthCheck: number;
    waveDelay: number;
  };

  // Monitoring Intervals
  monitoringInterval: number;

  // Retry Configuration
  retryConfig: {
    hardDependencyRetries: number;
    softDependencyRetries: number;
    maxBackoffDelay: number;
  };
}

/**
 * Get environment-specific settings optimized for development vs production
 */
export function getEnvironmentSettings(): EnvironmentSettings {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // Production: More frequent monitoring, faster responses, higher reliability
    return {
      heartbeatInterval: 15000, // 15s - frequent health monitoring
      healthCheckInterval: 20000, // 20s - proactive health checks
      staleServiceThreshold: 45000, // 45s - quick stale detection
      staleServiceCleanupInterval: 20000, // 20s - frequent cleanup

      leaseSettings: {
        defaultLeaseTTL: 300000, // 5 minutes - production lease duration
        gracePeriod: 90000, // 90s - shorter grace period for faster recovery
        leaseRenewalBuffer: 30000, // 30s - buffer for lease renewal
        cleanupGracePeriod: 60000, // 60s - additional grace before cleanup
      },

      batchSettings: {
        batchSize: 8, // Larger batches for efficiency
        batchWindow: 1000, // 1s - faster batching
        maxRetries: 5, // More retries for reliability
        maxBatchDelay: 2000, // 2s - quick response
      },

      dependencyValidationTimeout: 20000, // 20s - faster startup
      startupTimeouts: {
        general: 12000, // 12s - quick startup
        healthCheck: 10000, // 10s - faster health checks
        waveDelay: 1500, // 1.5s - faster wave progression
      },

      monitoringInterval: 20000, // 20s - frequent monitoring

      retryConfig: {
        hardDependencyRetries: 8, // More retries for critical deps
        softDependencyRetries: 3, // Some retries for soft deps
        maxBackoffDelay: 5000, // 5s max backoff
      },
    };
  } else {
    // Development: Relaxed timings, less aggressive, easier debugging
    return {
      heartbeatInterval: 30000, // 30s - relaxed for development
      healthCheckInterval: 45000, // 45s - less frequent checks
      staleServiceThreshold: 90000, // 90s - generous stale threshold
      staleServiceCleanupInterval: 45000, // 45s - less frequent cleanup

      leaseSettings: {
        defaultLeaseTTL: 600000, // 10 minutes - longer lease for development
        gracePeriod: 180000, // 3 minutes - generous grace period for debugging
        leaseRenewalBuffer: 60000, // 60s - generous buffer for lease renewal
        cleanupGracePeriod: 120000, // 2 minutes - additional grace before cleanup
      },

      batchSettings: {
        batchSize: 3, // Smaller batches for easier debugging
        batchWindow: 2500, // 2.5s - longer window for accumulation
        maxRetries: 3, // Fewer retries to fail fast in dev
        maxBatchDelay: 4000, // 4s - relaxed timing
      },

      dependencyValidationTimeout: 45000, // 45s - generous timeout for debugging
      startupTimeouts: {
        general: 20000, // 20s - generous startup time
        healthCheck: 15000, // 15s - relaxed health checks
        waveDelay: 3000, // 3s - slower for easier observation
      },

      monitoringInterval: 60000, // 60s - less frequent in development

      retryConfig: {
        hardDependencyRetries: 5, // Moderate retries
        softDependencyRetries: 1, // Minimal retries to fail fast
        maxBackoffDelay: 8000, // 8s max backoff for easier debugging
      },
    };
  }
}

/**
 * Log the current environment settings for transparency
 */
export function logEnvironmentSettings(): void {
  const settings = getEnvironmentSettings();
  const env = process.env.NODE_ENV || 'development';

  logger.warn('🔧 Settings loaded for: {}', { data0: env });
  logger.warn('🔧 Heartbeat interval: {}ms', { data0: settings.heartbeatInterval });
  logger.warn('🔧 Health check interval: {}ms', { data0: settings.healthCheckInterval });
  logger.warn('🔧 Batch size: {}, window: {}ms', {
    data0: settings.batchSettings.batchSize,
    data1: settings.batchSettings.batchWindow,
  });
  logger.warn('🔧 Dependency timeout: {}ms', { data0: settings.dependencyValidationTimeout });
}
