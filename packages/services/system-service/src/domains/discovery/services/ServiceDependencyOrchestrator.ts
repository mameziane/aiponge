/**
 * Service Dependency Orchestrator
 * Manages service dependency graphs and startup sequencing
 */

import { getLogger } from '../../../config/service-urls';
import { HEALTH_STATUS } from '@aiponge/shared-contracts';

export interface ServiceDependency {
  name: string;
  type: 'hard' | 'soft';
  timeout?: number;
  healthCheck?: string;
  isRequired?: boolean;
}

export interface ServiceNode {
  name: string;
  dependencies: ServiceDependency[];
  status: 'pending' | 'starting' | 'ready' | 'failed';
  startedAt?: Date;
  readyAt?: Date;
  error?: string;
}

export interface DependencyGraph {
  nodes: Map<string, ServiceNode>;
  edges: Map<string, string[]>; // service -> dependents
}

export interface ServiceRegistryEntry {
  name: string;
  dependencies?: ServiceDependency[];
  status?: string;
  [key: string]: unknown;
}

export class ServiceDependencyOrchestrator {
  private graph: DependencyGraph;
  private serviceRegistry: Map<string, ServiceRegistryEntry>;
  private logger = getLogger('service-dependency-orchestrator');

  constructor(serviceRegistry: Map<string, ServiceRegistryEntry>) {
    this.serviceRegistry = serviceRegistry;
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
    };
  }

  /**
   * Build dependency graph from registered services
   * FIXED: Incremental updates to prevent duplicate logging
   */
  buildDependencyGraph(): void {
    this.logger.info('🔗 Building dependency graph...', {
      component: 'dependency_orchestrator',
      operation: 'build_graph',
      phase: 'start',
    });

    const previousSize = this.graph.nodes.size;

    // Clear existing graph for clean rebuild
    this.graph.nodes.clear();
    this.graph.edges.clear();

    // Build nodes from registered services (only log new additions)
    for (const [serviceId, service] of Array.from(this.serviceRegistry.entries())) {
      const node: ServiceNode = {
        name: service.name,
        dependencies: service.dependencies || [],
        status: service.status === HEALTH_STATUS.HEALTHY ? 'ready' : 'pending',
      };

      this.graph.nodes.set(service.name, node);
    }

    // Only log when new services are added to prevent spam
    if (this.graph.nodes.size > previousSize) {
      const newServices = this.graph.nodes.size - previousSize;
      this.logger.info('📝 Graph updated', {
        component: 'dependency_orchestrator',
        operation: 'graph_update',
        totalNodes: this.graph.nodes.size,
        newServices,
        phase: 'incremental_update',
      });
    }

    // Build edges (dependency relationships) - only log new edges
    let edgeCount = 0;
    for (const [serviceName, node] of Array.from(this.graph.nodes.entries())) {
      for (const dependency of node.dependencies) {
        // Add edge from dependency to dependent
        if (!this.graph.edges.has(dependency.name)) {
          this.graph.edges.set(dependency.name, []);
        }
        this.graph.edges.get(dependency.name)!.push(serviceName);
        edgeCount++;

        this.logger.debug('🔗 Dependency edge created', {
          component: 'dependency_orchestrator',
          operation: 'build_edges',
          from: serviceName,
          to: dependency.name,
          type: dependency.type,
        });
      }
    }

    this.logger.info('✅ Graph built successfully', {
      component: 'dependency_orchestrator',
      operation: 'build_complete',
      totalNodes: this.graph.nodes.size,
      totalEdges: edgeCount,
      phase: 'complete',
    });
  }

  /**
   * Get startup order using topological sort
   */
  getStartupOrder(): string[][] {
    this.logger.info('📋 Computing startup order...', {
      component: 'dependency_orchestrator',
      operation: 'compute_order',
      phase: 'start',
    });

    const result: string[][] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const inDegree = new Map<string, number>();

    // Calculate in-degree for each node (number of required hard dependencies)
    for (const [serviceName, node] of Array.from(this.graph.nodes.entries())) {
      inDegree.set(
        serviceName,
        node.dependencies.filter(dep => dep.type === 'hard' && dep.isRequired !== false).length
      );
    }

    // Process services in waves (services with no dependencies can start together)
    while (visited.size < this.graph.nodes.size) {
      const currentWave: string[] = [];

      // Find services with no remaining hard dependencies
      for (const [serviceName, degree] of Array.from(inDegree.entries())) {
        if (degree === 0 && !visited.has(serviceName)) {
          currentWave.push(serviceName);
        }
      }

      if (currentWave.length === 0) {
        // Circular dependency detected or all remaining services have unmet dependencies
        const remaining = Array.from(this.graph.nodes.keys()).filter(s => !visited.has(s));
        this.logger.warn('⚠️ Potential circular dependency or missing dependencies', {
          component: 'dependency_orchestrator',
          operation: 'compute_order',
          remainingServices: remaining,
          phase: 'circular_dependency_detected',
        });

        // Add remaining services to break deadlock (they'll be validated at runtime)'
        currentWave.push(...remaining);
      }

      // Add current wave to result
      result.push(currentWave);
      this.logger.info('🌊 Startup wave computed', {
        component: 'dependency_orchestrator',
        operation: 'compute_order',
        waveNumber: result.length,
        servicesInWave: currentWave,
        phase: 'wave_complete',
      });

      // Mark as visited and reduce in-degree for dependents
      for (const serviceName of currentWave) {
        visited.add(serviceName);

        // Reduce in-degree for all dependents
        const dependents = this.graph.edges.get(serviceName) || [];
        for (const dependent of dependents) {
          const currentDegree = inDegree.get(dependent) || 0;
          inDegree.set(dependent, Math.max(0, currentDegree - 1));
        }
      }
    }

    this.logger.info('✅ Startup order computed successfully', {
      component: 'dependency_orchestrator',
      operation: 'compute_order',
      totalWaves: result.length,
      phase: 'complete',
    });
    return result;
  }

  /**
   * Validate that a service's dependencies are satisfied
   */
  async validateServiceDependencies(serviceName: string): Promise<{
    satisfied: boolean;
    missing: ServiceDependency[];
    failed: ServiceDependency[];
  }> {
    const node = this.graph.nodes.get(serviceName);
    if (!node) {
      return { satisfied: false, missing: [], failed: [] };
    }

    const missing: ServiceDependency[] = [];
    const failed: ServiceDependency[] = [];

    for (const dependency of node.dependencies) {
      const dependencyNode = this.graph.nodes.get(dependency.name);

      if (!dependencyNode) {
        missing.push(dependency);
        this.logger.warn('⚠️ Missing dependency', {
          component: 'dependency_orchestrator',
          operation: 'validate_dependencies',
          serviceName,
          missingDependency: dependency.name,
          phase: 'validation_failure',
        });
      } else if (dependencyNode.status === 'failed') {
        failed.push(dependency);
        this.logger.warn('⚠️ Failed dependency', {
          component: 'dependency_orchestrator',
          operation: 'validate_dependencies',
          serviceName,
          failedDependency: dependency.name,
          phase: 'validation_failure',
        });
      } else if (dependency.type === 'hard' && dependencyNode.status !== 'ready') {
        missing.push(dependency);
        this.logger.warn('⚠️ Hard dependency not ready', {
          component: 'dependency_orchestrator',
          operation: 'validate_dependencies',
          serviceName,
          dependency: dependency.name,
          dependencyStatus: dependencyNode.status,
          phase: 'validation_failure',
        });
      }
    }

    const satisfied = missing.length === 0 && (failed.length === 0 || node.dependencies.every(d => d.type === 'soft'));

    this.logger.info('🔍 Dependency validation completed', {
      component: 'dependency_orchestrator',
      operation: 'validate_dependencies',
      serviceName,
      satisfied,
      missingCount: missing.length,
      failedCount: failed.length,
      phase: 'validation_complete',
    });

    return { satisfied, missing, failed };
  }

  /**
   * Update service status in dependency graph
   */
  updateServiceStatus(serviceName: string, status: ServiceNode['status'], error?: string): void {
    const node = this.graph.nodes.get(serviceName);
    if (node) {
      const oldStatus = node.status;
      node.status = status;
      node.error = error;

      if (status === 'starting' && oldStatus !== 'starting') {
        node.startedAt = new Date();
      } else if (status === 'ready' && oldStatus !== 'ready') {
        node.readyAt = new Date();
      }

      this.logger.info('📊 Service status updated', {
        component: 'dependency_orchestrator',
        operation: 'update_service_status',
        serviceName,
        oldStatus,
        newStatus: status,
        phase: 'status_change',
      });
    }
  }

  /**
   * Get services that can start now (dependencies satisfied)
   */
  getReadyToStartServices(): string[] {
    const readyServices: string[] = [];

    for (const [serviceName, node] of Array.from(this.graph.nodes.entries())) {
      if (node.status === 'pending') {
        // Check if all hard dependencies are ready
        const hardDependenciesReady = node.dependencies
          .filter(dep => dep.type === 'hard')
          .every(dep => {
            const depNode = this.graph.nodes.get(dep.name);
            return depNode && depNode.status === 'ready';
          });

        if (hardDependenciesReady) {
          readyServices.push(serviceName);
        }
      }
    }

    return readyServices;
  }

  /**
   * Get dependency graph visualization
   */
  getGraphVisualization(): {
    nodes: Array<{ name: string; status: string; dependencies: number }>;
    edges: Array<{ from: string; to: string; type: string }>;
  } {
    const nodes = Array.from(this.graph.nodes.entries()).map(([name, node]) => ({
      name,
      status: node.status,
      dependencies: node.dependencies.length,
    }));

    const edges: Array<{ from: string; to: string; type: string }> = [];
    for (const [serviceName, node] of Array.from(this.graph.nodes.entries())) {
      for (const dependency of node.dependencies) {
        edges.push({
          from: dependency.name,
          to: serviceName,
          type: dependency.type,
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * Detect circular dependencies
   */
  detectCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (serviceName: string, path: string[]): void => {
      if (recursionStack.has(serviceName)) {
        // Found a cycle
        const cycleStart = path.indexOf(serviceName);
        cycles.push(path.slice(cycleStart).concat(serviceName));
        return;
      }

      if (visited.has(serviceName)) {
        return;
      }

      visited.add(serviceName);
      recursionStack.add(serviceName);

      const node = this.graph.nodes.get(serviceName);
      if (node) {
        for (const dependency of node.dependencies) {
          if (dependency.type === 'hard') {
            // Only check hard dependencies for cycles'
            dfs(dependency.name, path.concat(serviceName));
          }
        }
      }

      recursionStack.delete(serviceName);
    };

    for (const serviceName of Array.from(this.graph.nodes.keys())) {
      if (!visited.has(serviceName)) {
        dfs(serviceName, []);
      }
    }

    return cycles;
  }

  private getTotalEdges(): number {
    return Array.from(this.graph.edges.values()).reduce((sum, deps) => sum + deps.length, 0);
  }

  /**
   * Get summary statistics
   */
  getStatistics() {
    const totalServices = this.graph.nodes.size;
    const statusCounts = { pending: 0, starting: 0, ready: 0, failed: 0 };
    const dependencyCounts = { hard: 0, soft: 0 };

    for (const node of Array.from(this.graph.nodes.values())) {
      statusCounts[node.status]++;
      for (const dep of node.dependencies) {
        dependencyCounts[dep.type]++;
      }
    }

    return {
      totalServices,
      statusCounts,
      dependencyCounts,
      totalEdges: this.getTotalEdges(),
      cycles: this.detectCircularDependencies().length,
    };
  }

  /**
   * Get current orchestration status for all services
   */
  getOrchestrationStatus(): {
    orchestrationComplete: boolean;
    services: Array<{ serviceName: string; status: string; tier: number; error?: string }>;
    tierStatus: Array<{ tier: number; complete: boolean }>;
  } {
    const services: Array<{ serviceName: string; status: string; tier: number; error?: string }> = [];
    const tierMap = new Map<number, { total: number; ready: number }>();

    for (const [name, node] of Array.from(this.graph.nodes.entries())) {
      const tier = this.calculateTier(name);
      services.push({
        serviceName: name,
        status: node.status,
        tier,
        error: node.error,
      });

      if (!tierMap.has(tier)) {
        tierMap.set(tier, { total: 0, ready: 0 });
      }
      const tierStats = tierMap.get(tier)!;
      tierStats.total++;
      if (node.status === 'ready') {
        tierStats.ready++;
      }
    }

    const tierStatus = Array.from(tierMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([tier, stats]) => ({
        tier,
        complete: stats.ready === stats.total,
      }));

    const orchestrationComplete =
      services.length > 0 && services.every(s => s.status === 'ready' || s.status === 'failed');

    return { orchestrationComplete, services, tierStatus };
  }

  /**
   * Calculate tier for a service based on dependencies
   */
  private calculateTier(serviceName: string): number {
    const node = this.graph.nodes.get(serviceName);
    if (!node || node.dependencies.length === 0) {
      return 0;
    }

    let maxDepTier = 0;
    for (const dep of node.dependencies) {
      if (dep.type === 'hard') {
        const depTier = this.calculateTier(dep.name);
        maxDepTier = Math.max(maxDepTier, depTier + 1);
      }
    }
    return maxDepTier;
  }

  /**
   * Request startup clearance for a service
   * Returns true if all hard dependencies are ready
   */
  async requestStartupClearance(serviceName: string): Promise<boolean> {
    const validation = await this.validateServiceDependencies(serviceName);

    if (validation.satisfied) {
      this.updateServiceStatus(serviceName, 'starting');
      this.logger.info(`✅ Startup clearance granted for ${serviceName}`);
      return true;
    }

    this.logger.info(`⏳ Startup clearance denied for ${serviceName}`, {
      missing: validation.missing.map(d => d.name),
      failed: validation.failed.map(d => d.name),
    });
    return false;
  }

  /**
   * Report that a service is ready
   */
  reportServiceReady(serviceName: string): void {
    this.updateServiceStatus(serviceName, 'ready');
    this.logger.info(`✅ Service ${serviceName} reported as ready`);
  }

  /**
   * Report that a service has failed
   */
  reportServiceFailure(serviceName: string, error: string): void {
    this.updateServiceStatus(serviceName, 'failed', error);
    this.logger.error(`❌ Service ${serviceName} reported failure`, { error });
  }

  /**
   * Wait for a specific service to become ready
   */
  async waitForService(serviceName: string, timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const node = this.graph.nodes.get(serviceName);

      if (node?.status === 'ready') {
        return true;
      }

      if (node?.status === 'failed') {
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.warn(`⏰ Timeout waiting for service ${serviceName}`);
    return false;
  }
}
