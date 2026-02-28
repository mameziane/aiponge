/**
 * Services Dependency Manifest
 *
 * Auto-generated from services.config.ts - the single source of truth.
 * Defines a DAG (Directed Acyclic Graph) for deterministic service startup sequencing.
 *
 * NO HARDCODED PORTS - All data derived from services.config.ts
 */

import { SERVICES, ServiceConfig } from '@aiponge/platform-core';

export interface ServiceDependency {
  /** Service name identifier */
  serviceName: string;
  /** Services that must be ready before this service can start */
  dependencies: string[];
  /** Startup tier - lower numbers start first */
  tier: number;
  /** Service port */
  port: number;
  /** Health check endpoint path */
  healthEndpoint: string;
  /** Maximum startup timeout in milliseconds */
  startupTimeout?: number;
  /** Whether this service is critical for system functionality */
  critical: boolean;
  /** Service type classification */
  type: 'infrastructure' | 'foundation' | 'application' | 'frontend';
  /** Description of service functionality */
  description: string;
}

/**
 * Map tier names to numeric values for startup ordering
 */
const TIER_TO_NUMBER: Record<ServiceConfig['tier'], number> = {
  infrastructure: 0,
  foundation: 1,
  application: 2,
  frontend: 3,
};

/**
 * Service descriptions - could be moved to services.config.ts in the future
 */
const SERVICE_DESCRIPTIONS: Record<string, string> = {
  postgresql: 'PostgreSQL database server',
  redis: 'Redis cache server',
  'system-service': 'Service discovery, monitoring, and system orchestration',
  'storage-service': 'File storage abstraction and management',
  'user-service': 'User management, authentication, profiles, insights and authorization',
  'ai-config-service': 'Unified AI provider and template configuration service',
  'ai-content-service': 'Content generation and AI processing',
  'ai-analytics-service': 'Analytics, metrics, and system health monitoring',
  'music-service': 'Unified music generation, audio processing, catalog, and streaming service',
  'api-gateway': 'API gateway and request routing',
  aiponge: 'aiponge mobile app',
  'aiponge-metro': 'Metro bundler for aiponge app',
};

/**
 * Determine if a service is critical based on its type and dependencies
 */
function isCriticalService(service: ServiceConfig): boolean {
  // Infrastructure and foundation services are critical
  if (service.tier === 'infrastructure' || service.tier === 'foundation') {
    return true;
  }

  // API Gateway is critical
  if (service.name === 'api-gateway') {
    return true;
  }

  // AI config service is critical (core functionality)
  if (service.name === 'ai-config-service') {
    return true;
  }

  // Frontend apps are not critical
  if (service.type === 'frontend-app') {
    return false;
  }

  // Other application services are non-critical
  return false;
}

/**
 * Extract health endpoint from service definition
 */
function getHealthEndpoint(service: ServiceConfig): string {
  if (!service.healthCheck) {
    return '/health';
  }

  if (typeof service.healthCheck === 'string') {
    return service.healthCheck;
  }

  return service.healthCheck.live || '/health';
}

/**
 * Transform ServiceConfig to ServiceDependency
 */
function transformToServiceDependency(service: ServiceConfig): ServiceDependency {
  return {
    serviceName: service.name,
    dependencies: service.dependencies?.map(d => d.service) || [],
    tier: TIER_TO_NUMBER[service.tier],
    port: service.port.internal,
    healthEndpoint: getHealthEndpoint(service),
    startupTimeout: service.startupTimeout,
    critical: isCriticalService(service),
    type: service.tier,
    description: SERVICE_DESCRIPTIONS[service.name] || `${service.name} service`,
  };
}

/**
 * Calculate tiers for all services using topological sort
 * Ensures dependencies are always in lower tiers
 */
function calculateTiersTopologically(services: ServiceConfig[]): Map<string, number> {
  const tierMap = new Map<string, number>();
  const serviceMap = new Map(services.map(s => [s.name, s]));
  const visited = new Set<string>();
  const inProgress = new Set<string>();

  function calculateTier(serviceName: string): number {
    // If already calculated, return it
    if (tierMap.has(serviceName)) {
      return tierMap.get(serviceName)!;
    }

    // Detect cycles
    if (inProgress.has(serviceName)) {
      // Circular dependency - use base tier
      const service = serviceMap.get(serviceName);
      const baseTier = service ? TIER_TO_NUMBER[service.tier] : 0;
      tierMap.set(serviceName, baseTier);
      return baseTier;
    }

    const service = serviceMap.get(serviceName);
    if (!service) {
      tierMap.set(serviceName, 0);
      return 0;
    }

    inProgress.add(serviceName);

    // Calculate base tier
    const baseTier = TIER_TO_NUMBER[service.tier];

    // If no dependencies, use base tier
    if (!service.dependencies || service.dependencies.length === 0) {
      tierMap.set(serviceName, baseTier);
      inProgress.delete(serviceName);
      visited.add(serviceName);
      return baseTier;
    }

    // Calculate tiers for all dependencies first (recursive)
    const dependencyTiers = service.dependencies.map(dep => calculateTier(dep.service));
    const maxDepTier = Math.max(...dependencyTiers, -1);

    // Service must be at least one tier higher than its highest dependency
    const actualTier = Math.max(baseTier, maxDepTier + 1);

    tierMap.set(serviceName, actualTier);
    inProgress.delete(serviceName);
    visited.add(serviceName);

    return actualTier;
  }

  // Calculate tiers for all services
  services.forEach(service => calculateTier(service.name));

  return tierMap;
}

/**
 * Comprehensive service dependency manifest
 * AUTO-GENERATED from services.config.ts - DO NOT MANUALLY EDIT
 *
 * Includes all services (backend, infrastructure, and frontend) for complete visibility
 */
export const SERVICE_DEPENDENCY_MANIFEST: ServiceDependency[] = (() => {
  // Include all services - backend, infrastructure, AND frontend
  // Frontend apps need to be in the manifest for orchestration dashboards and build tooling
  const allServices = SERVICES;

  // Calculate tiers topologically for all services
  const tierMap = calculateTiersTopologically(allServices);

  // Transform to ServiceDependency with calculated tiers
  return allServices
    .map(service => {
      const dependency = transformToServiceDependency(service);
      dependency.tier = tierMap.get(service.name) || TIER_TO_NUMBER[service.tier];
      return dependency;
    })
    .sort((a, b) => {
      // Sort by tier first, then by name
      if (a.tier !== b.tier) {
        return a.tier - b.tier;
      }
      return a.serviceName.localeCompare(b.serviceName);
    });
})();

/**
 * Service startup tiers for easy reference
 *
 * Note: Tiers 0-3 map to ServiceConfig['tier'] names from services.config.ts
 * Higher tiers (4+) are computed dynamically for services with deep dependency chains
 */
export const SERVICE_TIERS = {
  INFRASTRUCTURE: 0, // Core infrastructure (postgres, redis)
  FOUNDATION: 1, // Foundation services (system-service, storage-service, user-service)
  APPLICATION: 2, // Application services (ai-providers, ai-content, etc.)
  FRONTEND: 3, // Frontend applications
  GATEWAY: 4, // API Gateway and services with tier-3 dependencies
  EXTENDED: 5, // Extended tier for deeply nested dependencies
} as const;

/**
 * Get services by tier for orchestrated startup
 */
export function getServicesByTier(tier: number): ServiceDependency[] {
  return SERVICE_DEPENDENCY_MANIFEST.filter(service => service.tier === tier);
}

/**
 * Get service dependencies by name
 */
export function getServiceDependencies(serviceName: string): string[] {
  const service = SERVICE_DEPENDENCY_MANIFEST.find(s => s.serviceName === serviceName);
  return service?.dependencies || [];
}

/**
 * Get all tiers in order
 */
export function getAllTiers(): number[] {
  const tierSet = new Set(SERVICE_DEPENDENCY_MANIFEST.map(s => s.tier));
  const tiers = Array.from(tierSet);
  return tiers.sort((a, b) => a - b);
}

/**
 * Validate that the dependency manifest forms a valid DAG
 */
function checkDependenciesExist(services: Map<string, (typeof SERVICE_DEPENDENCY_MANIFEST)[number]>): string[] {
  const errors: string[] = [];
  for (const service of SERVICE_DEPENDENCY_MANIFEST) {
    for (const dep of service.dependencies) {
      if (!services.has(dep)) {
        errors.push(`Service '${service.serviceName}' depends on non-existent service '${dep}'`);
      }
    }
  }
  return errors;
}

function checkCircularDependencies(services: Map<string, (typeof SERVICE_DEPENDENCY_MANIFEST)[number]>): string[] {
  const errors: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function hasCycle(serviceName: string): boolean {
    if (visiting.has(serviceName)) {
      errors.push(`Circular dependency detected involving service '${serviceName}'`);
      return true;
    }
    if (visited.has(serviceName)) {
      return false;
    }

    visiting.add(serviceName);

    const service = services.get(serviceName);
    if (service) {
      for (const dep of service.dependencies) {
        if (hasCycle(dep)) {
          return true;
        }
      }
    }

    visiting.delete(serviceName);
    visited.add(serviceName);
    return false;
  }

  for (const service of SERVICE_DEPENDENCY_MANIFEST) {
    if (!visited.has(service.serviceName)) {
      hasCycle(service.serviceName);
    }
  }

  return errors;
}

function checkTierConsistency(services: Map<string, (typeof SERVICE_DEPENDENCY_MANIFEST)[number]>): string[] {
  const errors: string[] = [];
  for (const service of SERVICE_DEPENDENCY_MANIFEST) {
    for (const depName of service.dependencies) {
      const dependency = services.get(depName);
      if (dependency && dependency.tier >= service.tier) {
        errors.push(
          `Service '${service.serviceName}' (tier ${service.tier}) depends on '${depName}' (tier ${dependency.tier}), but dependencies must be in lower tiers`
        );
      }
    }
  }
  return errors;
}

export function validateDependencyDAG(): { valid: boolean; errors: string[] } {
  const services = new Map(SERVICE_DEPENDENCY_MANIFEST.map(s => [s.serviceName, s]));

  const errors: string[] = [
    ...checkDependenciesExist(services),
    ...checkCircularDependencies(services),
    ...checkTierConsistency(services),
  ];

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default SERVICE_DEPENDENCY_MANIFEST;
