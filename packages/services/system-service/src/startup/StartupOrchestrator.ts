/**
 * Startup Orchestrator - Wave-based Service Startup Optimization
 *
 * Replaces parallel service startup with dependency-aware wave-based startup
 * using topological sort for optimal parallelization and faster system initialization.
 */

import { createHttpClient, errorMessage } from '@aiponge/platform-core';
import { getLogger } from '../config/service-urls';
import { ServiceDependencyOrchestrator } from '../domains/discovery/services/ServiceDependencyOrchestrator';
import { unifiedConfig } from '../config/ConfigurationManager';
import { SystemError } from '../application/errors';

const logger = getLogger('system-service-startuporchestrator');

export interface StartupWave {
  wave: number;
  services: string[];
  dependencies: string[];
  parallelizable: boolean;
}

export interface StartupConfiguration {
  maxConcurrentServices: number;
  waveDelayMs: number;
  healthCheckTimeoutMs: number;
  retryAttempts: number;
  enableOptimization: boolean;
}

export interface ServiceStartupConfig {
  name: string;
  port: number;
  startCommand: string;
  workingDirectory: string;
  dependencies: Array<{
    name: string;
    type: 'hard' | 'soft';
    timeout?: number;
  }>;
  healthEndpoint?: string;
  startupTimeoutMs?: number;
}

export class StartupOrchestrator {
  private dependencyOrchestrator: ServiceDependencyOrchestrator;
  private config: StartupConfiguration;
  private serviceConfigs: Map<string, ServiceStartupConfig>;
  private runningProcesses: Map<string, unknown> = new Map();
  private httpClient = createHttpClient({ serviceName: 'system-service' });

  constructor(dependencyOrchestrator: ServiceDependencyOrchestrator, config: Partial<StartupConfiguration> = {}) {
    this.dependencyOrchestrator = dependencyOrchestrator;
    this.config = {
      maxConcurrentServices: 4,
      waveDelayMs: 2000,
      healthCheckTimeoutMs: 15000,
      retryAttempts: 3,
      enableOptimization: true,
      ...config,
    };

    this.serviceConfigs = new Map();
    this.initializeServiceConfigurations();
  }

  /**
   * Initialize service configurations from UnifiedConfigurationManager
   */
  private initializeServiceConfigurations(): void {
    logger.debug('🔧 Initializing service configurations...');

    const serviceDefinitions: ServiceStartupConfig[] = [
      {
        name: 'system-service',
        port: unifiedConfig.getServiceConfig('systemService').port,
        startCommand: 'tsx src/main.ts',
        workingDirectory: 'packages/services/system-service',
        dependencies: [],
        healthEndpoint: '/ready', // Use /ready endpoint for proper initialization gating
        startupTimeoutMs: 10000,
      },
      {
        name: 'api-gateway',
        port: unifiedConfig.getServiceConfig('apiGateway').port,
        startCommand: 'tsx src/index.ts',
        workingDirectory: 'packages/services/api-gateway',
        dependencies: [{ name: 'system-service', type: 'hard', timeout: 10000 }],
        healthEndpoint: '/health',
        startupTimeoutMs: 15000,
      },
      {
        name: 'user-service',
        port: unifiedConfig.getServiceConfig('userService').port,
        startCommand: 'tsx src/main.ts',
        workingDirectory: 'packages/services/user-service',
        dependencies: [
          { name: 'system-service', type: 'hard' },
          { name: 'api-gateway', type: 'soft' },
        ],
        healthEndpoint: '/health',
      },
      {
        name: 'ai-content-service',
        port: unifiedConfig.getServiceConfig('aiContentService').port,
        startCommand: 'tsx src/main.ts',
        workingDirectory: 'packages/services/ai-content-service',
        dependencies: [
          { name: 'system-service', type: 'hard' },
          { name: 'user-service', type: 'soft' },
        ],
        healthEndpoint: '/health',
      },
      {
        name: 'music-service',
        port: unifiedConfig.getServiceConfig('musicService').port,
        startCommand: 'tsx src/main.ts',
        workingDirectory: 'packages/services/music-service',
        dependencies: [
          { name: 'system-service', type: 'hard' },
          { name: 'ai-content-service', type: 'soft' },
          { name: 'user-service', type: 'soft' },
        ],
        healthEndpoint: '/health',
      },
      {
        name: 'storage-service',
        port: unifiedConfig.getServiceConfig('storageService').port,
        startCommand: 'tsx src/main.ts',
        workingDirectory: 'packages/services/storage-service',
        dependencies: [{ name: 'system-service', type: 'hard' }],
        healthEndpoint: '/health',
      },
    ];

    for (const serviceConfig of serviceDefinitions) {
      this.serviceConfigs.set(serviceConfig.name, serviceConfig);
    }

    logger.debug(`Configured ${serviceDefinitions.length} services for wave-based startup`);
  }

  /**
   * Generate optimized startup waves using topological sort
   */
  getOptimizedStartupWaves(): StartupWave[] {
    logger.warn('🌊 Computing optimized startup waves...');

    if (!this.config.enableOptimization) {
      logger.warn('Optimization disabled, using parallel startup fallback');
      return this.getParallelStartupWaves();
    }

    // Build dependency graph with our service configurations
    this.updateDependencyGraph();

    // Get startup order from ServiceDependencyOrchestrator
    const startupOrder = this.dependencyOrchestrator.getStartupOrder();

    const waves: StartupWave[] = startupOrder.map((services, index) => ({
      wave: index + 1,
      services,
      dependencies: this.getWaveDependencies(services),
      parallelizable: services.length > 1,
    }));

    logger.warn(`Generated ${waves.length} optimized startup waves:`);
    waves.forEach(wave => {
      logger.warn(
        `Wave ${wave.wave}: [${wave.services.join(', ')}] ${wave.parallelizable ? '(parallel)' : '(sequential)'}`
      );
    });

    return waves;
  }

  /**
   * Parallel startup fallback
   */
  private getParallelStartupWaves(): StartupWave[] {
    return [
      {
        wave: 1,
        services: ['system-service'],
        dependencies: [],
        parallelizable: false,
      },
      {
        wave: 2,
        services: ['api-gateway'],
        dependencies: ['system-service'],
        parallelizable: false,
      },
      {
        wave: 3,
        services: ['user-service', 'ai-content-service', 'music-service', 'storage-service'],
        dependencies: ['system-service', 'api-gateway'],
        parallelizable: true,
      },
    ];
  }

  /**
   * Update dependency graph with current service configurations
   */
  private updateDependencyGraph(): void {
    // Create mock service registry for ServiceDependencyOrchestrator
    const mockServiceRegistry = new Map();

    for (const [serviceName, config] of this.serviceConfigs.entries()) {
      mockServiceRegistry.set(serviceName, {
        name: serviceName,
        dependencies: config.dependencies,
        status: 'pending',
        host: '127.0.0.1',
        port: config.port,
        healthEndpoint: config.healthEndpoint || '/health',
      });
    }

    // Update the orchestrator's service registry
    (this.dependencyOrchestrator as unknown as { serviceRegistry: Map<string, unknown> }).serviceRegistry =
      mockServiceRegistry;
    this.dependencyOrchestrator.buildDependencyGraph();
  }

  /**
   * Get dependencies for a wave of services
   */
  private getWaveDependencies(services: string[]): string[] {
    const dependencies = new Set<string>();

    for (const serviceName of services) {
      const config = this.serviceConfigs.get(serviceName);
      if (config) {
        for (const dep of config.dependencies) {
          if (dep.type === 'hard') {
            dependencies.add(dep.name);
          }
        }
      }
    }

    return Array.from(dependencies);
  }

  /**
   * Execute optimized startup with wave-based parallelization
   */
  private async executeWaveParallel(
    wave: StartupWave,
    servicesStarted: string[],
    errors: Array<{ service: string; error: string }>
  ): Promise<void> {
    const startPromises = wave.services.map(service =>
      this.startService(service).catch(error => {
        errors.push({ service, error: error.message });
        return false;
      })
    );

    const results = await Promise.allSettled(startPromises);

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        servicesStarted.push(wave.services[i]);
      }
    }
  }

  private async executeWaveSequential(
    wave: StartupWave,
    servicesStarted: string[],
    errors: Array<{ service: string; error: string }>
  ): Promise<void> {
    for (const service of wave.services) {
      try {
        await this.startService(service);
        servicesStarted.push(service);
      } catch (error) {
        errors.push({ service, error: errorMessage(error) });
      }
    }
  }

  private logStartupResult(
    success: boolean,
    totalTime: number,
    servicesStarted: string[],
    errors: Array<{ service: string; error: string }>
  ): void {
    logger.warn(`${success ? '✅' : '⚠️'} Startup completed in ${totalTime}ms`);
    logger.warn(`Services started: ${servicesStarted.length}/${this.serviceConfigs.size}`);
    if (errors.length > 0) {
      logger.warn(`Errors: ${errors.length}`);
      errors.forEach(err => logger.warn(`${err.service}: ${err.error}`));
    }
  }

  async executeOptimizedStartup(): Promise<{
    success: boolean;
    totalTime: number;
    wavesExecuted: number;
    servicesStarted: string[];
    errors: Array<{ service: string; error: string }>;
  }> {
    const startTime = Date.now();
    const errors: Array<{ service: string; error: string }> = [];
    const servicesStarted: string[] = [];

    logger.warn('🚀 Beginning optimized wave-based startup...');

    try {
      const waves = this.getOptimizedStartupWaves();

      for (const wave of waves) {
        logger.warn(`🌊 Executing Wave ${wave.wave}: [${wave.services.join(', ')}]`);

        await this.validateWaveDependencies(wave);

        if (wave.parallelizable && wave.services.length > 1) {
          await this.executeWaveParallel(wave, servicesStarted, errors);
        } else {
          await this.executeWaveSequential(wave, servicesStarted, errors);
        }

        if (wave.wave < waves.length) {
          logger.warn(`⏳ Wave ${wave.wave} complete, waiting ${this.config.waveDelayMs}ms...`);
          await this.delay(this.config.waveDelayMs);
        }
      }

      const totalTime = Date.now() - startTime;
      const success = errors.length === 0;

      this.logStartupResult(success, totalTime, servicesStarted, errors);

      return {
        success,
        totalTime,
        wavesExecuted: waves.length,
        servicesStarted,
        errors,
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      logger.error('Critical startup failure:', { error: error instanceof Error ? error.message : String(error) });

      return {
        success: false,
        totalTime,
        wavesExecuted: 0,
        servicesStarted,
        errors: [{ service: 'orchestrator', error: errorMessage(error) }],
      };
    }
  }

  /**
   * Validate that wave dependencies are satisfied
   */
  private async validateWaveDependencies(wave: StartupWave): Promise<void> {
    for (const dependency of wave.dependencies) {
      const validation = await this.dependencyOrchestrator.validateServiceDependencies(dependency);
      if (!validation.satisfied) {
        throw SystemError.operationFailed(
          'validateWaveDependencies',
          `Wave ${wave.wave} dependency validation failed: ${dependency} not ready`
        );
      }
    }
  }

  /**
   * Start a single service with health check validation
   */
  private async startService(serviceName: string): Promise<boolean> {
    const config = this.serviceConfigs.get(serviceName);
    if (!config) {
      throw SystemError.notFound('ServiceConfiguration', serviceName);
    }

    logger.warn(`🔧 Starting ${serviceName} on port ${config.port}...`);

    try {
      // Mark service as starting in dependency graph
      this.dependencyOrchestrator.updateServiceStatus(serviceName, 'starting');

      // Start the service process (mock implementation for now)
      const success = await this.mockStartServiceProcess(config);

      if (success) {
        // Wait for health check
        await this.waitForServiceHealth(serviceName, config);

        // Mark as ready in dependency graph
        this.dependencyOrchestrator.updateServiceStatus(serviceName, 'ready');

        logger.warn(`${serviceName} started successfully`);
        return true;
      } else {
        this.dependencyOrchestrator.updateServiceStatus(serviceName, 'failed', 'Failed to start process');
        throw SystemError.operationFailed('startService', `Failed to start process for ${serviceName}`);
      }
    } catch (error) {
      this.dependencyOrchestrator.updateServiceStatus(serviceName, 'failed', errorMessage(error));
      logger.error('Failed to start ${serviceName}:', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mock service process start (to be replaced with actual process spawning)
   */
  private async mockStartServiceProcess(_config: ServiceStartupConfig): Promise<boolean> {
    // This would spawn the actual process in production
    // For now, just simulate a successful start
    await this.delay(500);
    return true;
  }

  /**
   * Wait for service to become healthy
   */
  private async waitForServiceHealth(serviceName: string, config: ServiceStartupConfig): Promise<void> {
    const maxAttempts = 15;
    const retryDelayMs = 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const healthUrl = `http://127.0.0.1:${config.port}${config.healthEndpoint || '/health'}`;

        // Mock health check (replace with actual fetch in production)
        const isHealthy = await this.mockHealthCheck(healthUrl);

        if (isHealthy) {
          logger.warn(`${serviceName} health check passed`);
          return;
        }
      } catch (error) {
        logger.debug(`${serviceName} health check attempt ${attempt} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (attempt < maxAttempts) {
        logger.warn(`⏳ ${serviceName} health check attempt ${attempt}/${maxAttempts}...`);
        await this.delay(retryDelayMs);
      }
    }

    throw SystemError.operationFailed(
      'waitForServiceHealth',
      `${serviceName} failed health check after ${maxAttempts} attempts`
    );
  }

  /**
   * Mock health check (to be replaced with actual HTTP request)
   */
  private async mockHealthCheck(url: string): Promise<boolean> {
    try {
      // Use standardized HTTP client for health checks
      // Local HTTP client implementation
      const createHttpClient = (_config: Record<string, unknown>) => ({
        get: (url: string) => fetch(url, { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
        post: (url: string, data: unknown) =>
          fetch(url, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
          }).then(r => r.json()),
      });
      const httpClient = createHttpClient({ serviceName: 'system-service' });
      const response = await httpClient.get(url);

      // For /ready endpoint, we expect 200 status when ready
      // For /health endpoint, we expect 200 status when healthy
      if (url.includes('/ready')) {
        // Ready endpoint should return 200 when ready, 503 when not ready
        return (response as Record<string, unknown>).status === 200;
      } else {
        // Health endpoint should return 200 when healthy
        return (response as Record<string, unknown>).status === 200;
      }
    } catch (error) {
      logger.warn('Health check failed for ${url}:', { data: errorMessage(error) });
      return false;
    }
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get startup performance analytics
   */
  getStartupAnalytics(): {
    optimizationEnabled: boolean;
    totalServices: number;
    estimatedWaves: number;
    maxParallelization: number;
    estimatedTimeReduction: string;
  } {
    const waves = this.getOptimizedStartupWaves();
    const _parallelWaves = waves.filter(w => w.parallelizable).length;
    const maxParallel = Math.max(...waves.map(w => w.services.length));

    // Estimate time reduction vs sequential startup
    const sequentialTime = this.serviceConfigs.size * 5; // 5 seconds per service
    const optimizedTime = waves.length * 3; // 3 seconds per wave average
    const reductionPercent = Math.round(((sequentialTime - optimizedTime) / sequentialTime) * 100);

    return {
      optimizationEnabled: this.config.enableOptimization,
      totalServices: this.serviceConfigs.size,
      estimatedWaves: waves.length,
      maxParallelization: maxParallel,
      estimatedTimeReduction: `${reductionPercent}%`,
    };
  }

  /**
   * Generate startup graph visualization data
   */
  generateStartupGraphVisualization(): {
    waves: Array<{
      waveNumber: number;
      services: string[];
      parallelizable: boolean;
      dependencies: string[];
    }>;
    dependencies: Array<{
      from: string;
      to: string;
      type: 'hard' | 'soft';
    }>;
  } {
    const waves = this.getOptimizedStartupWaves();
    const dependencies: Array<{ from: string; to: string; type: 'hard' | 'soft' }> = [];

    // Extract all dependency relationships
    for (const [serviceName, config] of this.serviceConfigs.entries()) {
      for (const dep of config.dependencies) {
        dependencies.push({
          from: dep.name,
          to: serviceName,
          type: dep.type,
        });
      }
    }

    return {
      waves: waves.map(wave => ({
        waveNumber: wave.wave,
        services: wave.services,
        parallelizable: wave.parallelizable,
        dependencies: wave.dependencies,
      })),
      dependencies,
    };
  }
}
