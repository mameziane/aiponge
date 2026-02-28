/**
 * Configuration Module - Index
 *
 * Exports all configuration functionality for platform-core
 */

// Service configuration utilities - explicit exports to avoid conflicts
export { getServicePort, getServiceUrl, initializeServiceConfig } from './service-config.js';

// Database configuration utilities
export * from './database-config.js';

// Environment configuration utilities
export * from './environment-config.js';

// Configuration builder utilities
export * from './config-builder.js';

// Service URLs factory - consolidated from duplicated service-urls.ts files
export {
  createServiceUrlsConfig,
  type ServiceNameKey,
  type ServiceUrlsConfig,
  type ServiceClientResult,
  type HttpClientType,
  type HttpClientConfigType as HttpClientConfig,
} from './service-urls-factory.js';

// Config client (consolidated from @aiponge/config-client)
export {
  createConfigClient,
  initializeConfig,
  getConfig,
  setConfig,
  getExperimentVariant,
  setFeatureFlag,
  setExperiment,
  setConfigOverride,
  setFlagOverride,
  onConfigChange,
  onFlagChange,
  getConfigStats,
  clearConfigCache,
  stopConfigRefresh,
  shutdownConfig,
  config,
  flags,
  experiments,
  type ConfigClient,
  type ConfigClientOptions,
  type ConfigClientStats,
  type ConfigDocument,
  type FeatureFlagDefinition,
  type ExperimentDefinition,
  type ExperimentVariant,
  type ExperimentContext,
  type TargetingRule,
  type FlagEvaluationContext,
} from './config-client.js';

// Feature flag utilities
export * from './feature-flags.js';

// Secrets provider - environment and AWS SSM secret management
export { getSecretsProvider, resolveSecret, type SecretsProvider } from './secrets-provider.js';

// Service registry (consolidated from @aiponge/service-registry)
export {
  ServiceRegistry,
  registerService,
  discoverService,
  getServiceUrl as getRegistryServiceUrl,
  getServicePort as getRegistryServicePort,
  hasService,
  listServices,
  waitForService,
  createServiceRegistration,
  type ServiceInstance,
  type RegistrationOptions,
  type DiscoveryOptions,
} from './service-registry.js';

// Timeout hierarchy
export {
  TimeoutHierarchy,
  timeoutHierarchy,
  type TimeoutTier,
  type TimeoutHierarchyConfig,
} from './timeout-hierarchy.js';

// Workspace root utilities
export { findWorkspaceRoot, getUploadsPath } from './workspace.js';

// Service definitions - single source of truth for all service configurations
// (consolidated from @aiponge/shared-config)
export {
  SERVICES,
  getServiceByName,
  getDefinitionServicePort,
  getDefinitionServiceUrl,
  getServicesByType,
  getBackendServices,
  getFrontendApps,
  getInfrastructureServices,
  buildDependencyGraph,
  detectCycles,
  generateStartupOrder,
  validateDependencies,
  getServicesByTier,
  hasDependency,
  getAllDependencies,
  type ServiceConfig,
  type HealthEndpoint,
  type DependencyDefinition,
  type ResourceRequirement,
  type DependencyNode,
  type StartupTier,
  type DependencyValidationResult,
} from './services-definition.js';
