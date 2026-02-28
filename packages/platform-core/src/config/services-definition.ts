/**
 * Single Source of Truth - Service Configuration
 *
 * All service ports, dependencies, and configuration defined here.
 * All other configuration files are auto-generated from this definition.
 * Consolidated from @aiponge/shared-config into platform-core.
 *
 * DO NOT define ports anywhere else in the codebase.
 *
 * Note: ServiceConfig (formerly ServiceDefinition) renamed to avoid clash
 * with ServiceLocator's ServiceDefinition type. Similarly, getDefinitionServicePort
 * and getDefinitionServiceUrl renamed to avoid clash with the ServiceLocator-backed
 * getServicePort/getServiceUrl in service-config.ts.
 */

export interface HealthEndpoint {
  startup: string; // Health endpoint for startup readiness
  live: string; // Health endpoint for liveness
  timeout?: number; // Timeout in ms for health checks (default: 5000)
}

export interface DependencyDefinition {
  service: string;
  required: boolean; // If false, service can start without this dependency (degraded mode)
  timeout?: number; // Max wait time for dependency (default: 30000ms)
  retries?: number; // Number of retry attempts (default: 3)
}

export interface ResourceRequirement {
  type: 'database' | 'cache' | 'queue' | 'storage' | 'external-api';
  name: string;
  required: boolean;
  healthCheck?: string;
}

export interface ServiceConfig {
  name: string;
  type: 'backend-service' | 'frontend-app' | 'infrastructure';
  tier: 'infrastructure' | 'foundation' | 'application' | 'frontend'; // Startup tier
  port: {
    internal: number; // Container/service internal port
    external?: number; // External port mapping (Replit/load balancer)
    development?: number; // Development server port (if different from internal)
  };
  dependencies?: DependencyDefinition[];
  resources?: ResourceRequirement[];
  healthCheck?: HealthEndpoint | string;
  environment?: 'development' | 'production' | 'both';
  dockerContext?: string;
  packagePath?: string;
  startupTimeout?: number; // Max time to wait for service startup (default: 60000ms)
}

// 🎯 SINGLE SOURCE OF TRUTH - ALL SERVICES DEFINED HERE
export const SERVICES: ServiceConfig[] = [
  // Infrastructure Tier - Must start first
  {
    name: 'postgresql',
    type: 'infrastructure',
    tier: 'infrastructure',
    port: { internal: 5432, development: 5432 },
  },
  {
    name: 'redis',
    type: 'infrastructure',
    tier: 'infrastructure',
    port: { internal: 6379, development: 6379 },
  },
  {
    name: 'kafka',
    type: 'infrastructure',
    tier: 'infrastructure',
    port: { internal: 9092, development: 9092 },
  },

  // Foundation Tier - Core platform services
  {
    name: 'system-service',
    type: 'backend-service',
    tier: 'foundation',
    port: { internal: 3001, development: 3001 },
    resources: [{ type: 'database', name: 'postgresql', required: true }],
    healthCheck: {
      startup: '/health/startup',
      live: '/health',
      timeout: 10000,
    },
    packagePath: 'packages/services/system-service',
    startupTimeout: 30000,
  },
  {
    name: 'storage-service',
    type: 'backend-service',
    tier: 'foundation',
    port: { internal: 3002, development: 3002 },
    dependencies: [{ service: 'system-service', required: true }],
    resources: [{ type: 'database', name: 'postgresql', required: true }],
    healthCheck: {
      startup: '/health/startup',
      live: '/health',
    },
    packagePath: 'packages/services/storage-service',
  },
  {
    name: 'user-service',
    type: 'backend-service',
    tier: 'foundation',
    port: { internal: 3003, development: 3003 },
    dependencies: [
      { service: 'system-service', required: true },
      { service: 'ai-content-service', required: false }, // For safety analysis
    ],
    resources: [
      { type: 'database', name: 'postgresql', required: true },
      { type: 'cache', name: 'redis', required: true }, // Required for session management in production
    ],
    healthCheck: {
      startup: '/health/startup',
      live: '/health',
    },
    packagePath: 'packages/services/user-service',
  },

  // Application Tier - Business logic services
  {
    name: 'ai-config-service',
    type: 'backend-service',
    tier: 'application',
    port: { internal: 3004, development: 3004 },
    dependencies: [{ service: 'system-service', required: true }],
    resources: [
      { type: 'database', name: 'postgresql', required: true },
      { type: 'cache', name: 'redis', required: false },
    ],
    healthCheck: {
      startup: '/health/startup',
      live: '/health',
    },
    packagePath: 'packages/services/ai-config-service',
  },
  {
    name: 'ai-content-service',
    type: 'backend-service',
    tier: 'application',
    port: { internal: 3005, development: 3005 },
    dependencies: [
      { service: 'system-service', required: true },
      { service: 'ai-config-service', required: true },
    ],
    resources: [{ type: 'database', name: 'postgresql', required: true }],
    healthCheck: {
      startup: '/health/startup',
      live: '/health',
    },
    packagePath: 'packages/services/ai-content-service',
  },
  {
    name: 'ai-analytics-service',
    type: 'backend-service',
    tier: 'application',
    port: { internal: 3006, development: 3006 },
    dependencies: [{ service: 'system-service', required: true }],
    resources: [
      { type: 'database', name: 'postgresql', required: true },
      { type: 'cache', name: 'redis', required: false },
    ],
    healthCheck: {
      startup: '/health/startup',
      live: '/health',
    },
    packagePath: 'packages/services/ai-analytics-service',
  },
  {
    name: 'music-service',
    type: 'backend-service',
    tier: 'application',
    port: { internal: 3007, development: 3007 },
    dependencies: [
      { service: 'system-service', required: true },
      { service: 'ai-config-service', required: true },
      { service: 'ai-content-service', required: true }, // For lyrics generation
      { service: 'storage-service', required: false },
      { service: 'ai-analytics-service', required: false }, // For usage tracking
    ],
    resources: [{ type: 'database', name: 'postgresql', required: true }],
    healthCheck: {
      startup: '/health/startup',
      live: '/health',
    },
    packagePath: 'packages/services/music-service',
  },
  {
    name: 'api-gateway',
    type: 'backend-service',
    tier: 'application',
    port: { internal: 8080, external: 8080, development: 8080 },
    dependencies: [
      { service: 'system-service', required: true },
      { service: 'user-service', required: true },
      { service: 'music-service', required: false },
      { service: 'ai-content-service', required: false }, // For content routes
      { service: 'storage-service', required: false }, // For file uploads
      { service: 'ai-analytics-service', required: false }, // For admin analytics
    ],
    resources: [
      { type: 'cache', name: 'redis', required: true }, // Required for rate limiting
    ],
    healthCheck: {
      startup: '/health/startup',
      live: '/health',
    },
    packagePath: 'packages/services/api-gateway',
  },

  // Frontend Tier - UI Applications (Development only)
  {
    name: 'aiponge',
    type: 'frontend-app',
    tier: 'frontend',
    port: { internal: 3020, external: 8081, development: 3020 },
    dependencies: [{ service: 'api-gateway', required: true }],
    environment: 'development',
    packagePath: 'apps/aiponge',
  },

  // Metro Bundler Port for Expo App
  {
    name: 'aiponge-metro',
    type: 'frontend-app',
    tier: 'frontend',
    port: { internal: 8082, development: 8082 },
    dependencies: [{ service: 'aiponge', required: true }],
    environment: 'development',
    packagePath: 'apps/aiponge',
  },
];

// Helper functions for safe service access
export function getServiceByName(name: string): ServiceConfig {
  const service = SERVICES.find(s => s.name === name);
  if (!service) {
    throw new Error(
      `Service '${name}' not found in configuration. Available services: ${SERVICES.map(s => s.name).join(', ')}`
    );
  }
  return service;
}

export function getDefinitionServicePort(name: string, environment: 'development' | 'production' = 'development'): number {
  const service = getServiceByName(name);

  if (environment === 'development' && service.port.development) {
    return service.port.development;
  }

  return service.port.internal;
}

export function getDefinitionServiceUrl(name: string, environment: 'development' | 'production' = 'development'): string {
  const port = getDefinitionServicePort(name, environment);
  return `http://localhost:${port}`;
}

export function getServicesByType(type: ServiceConfig['type']): ServiceConfig[] {
  return SERVICES.filter(s => s.type === type);
}

export function getBackendServices(): ServiceConfig[] {
  return getServicesByType('backend-service');
}

export function getFrontendApps(): ServiceConfig[] {
  return getServicesByType('frontend-app');
}

export function getInfrastructureServices(): ServiceConfig[] {
  return getServicesByType('infrastructure');
}

// ===== DEPENDENCY ORCHESTRATION SYSTEM =====

export interface DependencyNode {
  service: string;
  tier: string;
  dependencies: string[];
  dependents: string[];
}

export interface StartupTier {
  tier: 'infrastructure' | 'foundation' | 'application' | 'frontend';
  services: ServiceConfig[];
  order: number;
}

export interface DependencyValidationResult {
  valid: boolean;
  errors: string[];
  cycles: string[][];
  missingServices: string[];
  dag: DependencyNode[];
  startupOrder: StartupTier[];
}

/**
 * Build dependency graph from service definitions
 */
export function buildDependencyGraph(): DependencyNode[] {
  const nodes = new Map<string, DependencyNode>();

  // Initialize all nodes
  SERVICES.forEach(service => {
    nodes.set(service.name, {
      service: service.name,
      tier: service.tier,
      dependencies: service.dependencies?.map(d => d.service) || [],
      dependents: [],
    });
  });

  // Build reverse dependencies (dependents)
  nodes.forEach(node => {
    node.dependencies.forEach(depName => {
      const depNode = nodes.get(depName);
      if (depNode) {
        depNode.dependents.push(node.service);
      }
    });
  });

  return Array.from(nodes.values());
}

/**
 * Detect cycles in dependency graph using DFS
 */
export function detectCycles(nodes: DependencyNode[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const nodeMap = new Map(nodes.map(n => [n.service, n]));

  function dfs(serviceName: string, path: string[]): void {
    if (recursionStack.has(serviceName)) {
      // Found a cycle
      const cycleStart = path.indexOf(serviceName);
      cycles.push([...path.slice(cycleStart), serviceName]);
      return;
    }

    if (visited.has(serviceName)) {
      return;
    }

    visited.add(serviceName);
    recursionStack.add(serviceName);

    const node = nodeMap.get(serviceName);
    if (node) {
      node.dependencies.forEach(dep => {
        dfs(dep, [...path, serviceName]);
      });
    }

    recursionStack.delete(serviceName);
  }

  nodes.forEach(node => {
    if (!visited.has(node.service)) {
      dfs(node.service, []);
    }
  });

  return cycles;
}

/**
 * Generate startup order based on tiers and dependencies
 */
export function generateStartupOrder(): StartupTier[] {
  const tierOrder = ['infrastructure', 'foundation', 'application', 'frontend'] as const;
  const tiers: StartupTier[] = [];

  tierOrder.forEach((tierName, index) => {
    const services = SERVICES.filter(s => s.tier === tierName);
    if (services.length > 0) {
      tiers.push({
        tier: tierName,
        services,
        order: index,
      });
    }
  });

  return tiers;
}

/**
 * Validate the entire dependency configuration
 */
export function validateDependencies(): DependencyValidationResult {
  const errors: string[] = [];
  const missingServices: string[] = [];

  // Check for missing services
  const serviceNames = new Set(SERVICES.map(s => s.name));
  SERVICES.forEach(service => {
    service.dependencies?.forEach(dep => {
      if (!serviceNames.has(dep.service)) {
        missingServices.push(dep.service);
        errors.push(`Service '${service.name}' depends on missing service '${dep.service}'`);
      }
    });
  });

  // Build DAG
  const dag = buildDependencyGraph();

  // Detect cycles
  const cycles = detectCycles(dag);
  cycles.forEach(cycle => {
    errors.push(`Dependency cycle detected: ${cycle.join(' -> ')}`);
  });

  // Generate startup order
  const startupOrder = generateStartupOrder();

  return {
    valid: errors.length === 0,
    errors,
    cycles,
    missingServices: Array.from(new Set(missingServices)),
    dag,
    startupOrder,
  };
}

/**
 * Get services by startup tier in dependency order
 */
export function getServicesByTier(
  tier: 'infrastructure' | 'foundation' | 'application' | 'frontend'
): ServiceConfig[] {
  return SERVICES.filter(s => s.tier === tier);
}

/**
 * Check if service A depends on service B (directly or transitively)
 */
export function hasDependency(serviceA: string, serviceB: string): boolean {
  const visited = new Set<string>();

  function checkDependency(current: string): boolean {
    if (visited.has(current)) return false;
    visited.add(current);

    const service = getServiceByName(current);
    const dependencies = service.dependencies?.map(d => d.service) || [];

    if (dependencies.includes(serviceB)) {
      return true;
    }

    return dependencies.some(dep => checkDependency(dep));
  }

  return checkDependency(serviceA);
}

/**
 * Get all dependencies of a service (transitively)
 */
export function getAllDependencies(serviceName: string): string[] {
  const visited = new Set<string>();
  const dependencies = new Set<string>();

  function collectDependencies(current: string): void {
    if (visited.has(current)) return;
    visited.add(current);

    const service = getServiceByName(current);
    service.dependencies?.forEach(dep => {
      dependencies.add(dep.service);
      collectDependencies(dep.service);
    });
  }

  collectDependencies(serviceName);
  return Array.from(dependencies);
}
