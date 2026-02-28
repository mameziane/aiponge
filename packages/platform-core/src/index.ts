/**
 * Platform Core - Shared Utilities for aiponge Microservices
 *
 * Provides consistent platform patterns while maintaining microservices independence:
 * - Bootstrap orchestration for Express servers
 * - Standardized health checks and monitoring
 * - Structured logging with correlation tracking
 * - HTTP client utilities with timeouts/retries
 * - Error handling patterns
 * - Configuration management utilities
 */

// Core exports - main platform functionality
export * from './auth/index.js';
export * from './bootstrap/index.js';
export * from './config/index.js';
export * from './discovery/index.js';
export * from './error-handling/index.js';
export * from './health/index.js';
export * from './http/index.js';
export * from './logging/index.js';
export * from './metrics/index.js';
export * from './resilience/index.js';
export * from './database/index.js';
export * from './cache/index.js';
export * from './monitoring/index.js';
export * from './audit/index.js';
export * from './errors/service-error.js';

// Re-export service auth functions explicitly for TypeScript resolution
export { signUserIdHeader, verifyUserIdSignature, serviceAuthMiddleware } from './auth/service-auth.js';
// Re-export feature flag functions explicitly for TypeScript resolution
export { isFeatureEnabled, getFeatureFlagStatus } from './config/feature-flags.js';
// Re-export secrets provider functions explicitly for TypeScript resolution
export { getSecretsProvider, resolveSecret, type SecretsProvider } from './config/secrets-provider.js';
// Service locator
export { ServiceLocator, TestHelper } from './service-locator/index.js';
export {
  type ServiceRegistration,
  type IServiceDiscoveryClient,
  type ServiceRegistrationOptions,
  type IStandardizedEventBusClient,
  type StandardEvent,
  type EventSubscriptionCallback,
  type EventBusProvider,
  type EventHandler,
  type SubscriptionConfig,
  type AnalyticsEventData,
  type AnalyticsMetricData,
  type ProviderUsageData,
  RedisEventBusClient,
  createEvent,
  getServiceName,
  getSharedEventBusClient,
  EventSubscriber,
  createEventSubscriber,
  AnalyticsEventPublisher,
  getAnalyticsEventPublisher,
  publishAnalyticsEvent,
  publishAnalyticsMetric,
  publishProviderUsage,
  ServiceRegistrationClient,
  serviceRegistrationClient,
  createServiceRegistration as createServiceDiscoveryRegistration,
  KafkaEventBusClient,
  createEventBusClient,
} from './orchestration/index.js';
export * from './scheduling/index.js';
export * from './middleware/index.js';
export * from './lifecycle/index.js';
export * from './tracing/index.js';
export * from './seeds/index.js';

// Type exports
export type { PlatformConfig, ServiceDefinition, BootstrapConfig, HealthCheckConfig, LoggerConfig } from './types.js';

// Version information
export const PLATFORM_VERSION = '1.0.0';
