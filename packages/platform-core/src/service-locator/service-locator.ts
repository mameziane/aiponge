/**
 * Service Locator
 *
 * Service discovery and URL management for microservices
 */

import { createRequire } from 'module';
import { createLogger } from '../logging';
import { ServiceDefinition, ServiceLocatorOptions } from './types';
import { serializeError } from '../logging/error-serializer.js';
import { DomainError } from '../error-handling/errors.js';

const require = createRequire(import.meta.url);

export class ServiceLocator {
  private static services = new Map<string, ServiceDefinition>();
  private static initialized = false;
  private static logger = createLogger('service-locator');
  private static options: ServiceLocatorOptions = {
    defaultHost: 'localhost',
    defaultHealthEndpoint: '/health',
  };

  /**
   * Initialize service locator with service definitions
   * Now uses system-service/config/services.config.ts as single source of truth
   */
  static initialize(options: ServiceLocatorOptions = {}): void {
    if (this.initialized) {
      return;
    }

    this.options = { ...this.options, ...options };

    // Import from single source of truth
    // Note: This is a dynamic import to avoid circular dependencies
    let defaultServices: ServiceDefinition[] = [];

    try {
      // Load from generated service manifest (CommonJS-compatible).
      // Try two paths: the first works when running from built dist/ (production bundle),
      // the second works when running via tsx directly from src/ (development).
      let rawManifest: { services: { name: string; port: number; host?: string; healthEndpoint?: string; type?: ServiceDefinition['type']; tier?: ServiceDefinition['tier']; resources?: ServiceDefinition['resources'] }[] } | null = null;
      const candidatePaths = [
        '../../shared/service-manifest.cjs',   // production: dist/ is 2 levels above packages/shared/
        '../../../shared/service-manifest.cjs', // development: src/service-locator/ is 3 levels above packages/shared/
      ];
      for (const p of candidatePaths) {
        try { rawManifest = require(p); break; } catch { /* try next */ }
      }
      if (!rawManifest) throw new Error('Service manifest not found at any candidate path');
      const manifest = rawManifest;
      defaultServices = manifest.services.map((s) => ({
        name: s.name,
        port: s.port,
        host: s.host || this.options.defaultHost,
        healthEndpoint: s.healthEndpoint || '/health',
        type: s.type,
        tier: s.tier,
        resources: s.resources,
      }));
    } catch (error) {
      // Fallback for services that can't import system-service (circular deps)
      // Use only environment variables - no hardcoded port numbers
      this.logger.warn('⚠️ Could not load service manifest, using environment variables only', {
        error: serializeError(error),
      });

      const requiredEnvVars = [
        'API_GATEWAY_PORT',
        'SYSTEM_SERVICE_PORT',
        'STORAGE_SERVICE_PORT',
        'USER_SERVICE_PORT',
        'AI_CONFIG_SERVICE_PORT',
        'AI_ANALYTICS_SERVICE_PORT',
        'AI_CONTENT_SERVICE_PORT',
        'MUSIC_SERVICE_PORT',
      ];

      // Check if at least some service ports are defined in environment
      const definedPorts = requiredEnvVars.filter(v => process.env[v]);
      if (definedPorts.length === 0) {
        throw new DomainError(
          'ServiceLocator initialization failed: Could not load centralized config and no environment variables defined. ' +
            `Please define service ports in environment variables: ${requiredEnvVars.join(', ')}`,
          500
        );
      }

      defaultServices = [
        { name: 'api-gateway', port: parseInt(process.env.API_GATEWAY_PORT!) },
        { name: 'system-service', port: parseInt(process.env.SYSTEM_SERVICE_PORT!) },
        { name: 'storage-service', port: parseInt(process.env.STORAGE_SERVICE_PORT!) },
        { name: 'user-service', port: parseInt(process.env.USER_SERVICE_PORT!) },
        { name: 'ai-config-service', port: parseInt(process.env.AI_CONFIG_SERVICE_PORT!) },
        { name: 'ai-analytics-service', port: parseInt(process.env.AI_ANALYTICS_SERVICE_PORT!) },
        { name: 'ai-content-service', port: parseInt(process.env.AI_CONTENT_SERVICE_PORT!) },
        { name: 'music-service', port: parseInt(process.env.MUSIC_SERVICE_PORT!) },
      ].filter(s => !isNaN(s.port)); // Filter out services with undefined ports
    }

    // Merge with provided services, giving priority to provided ones
    const allServices = [...defaultServices];
    if (options.services) {
      options.services.forEach(service => {
        const existingIndex = allServices.findIndex(s => s.name === service.name);
        if (existingIndex >= 0) {
          allServices[existingIndex] = service;
        } else {
          allServices.push(service);
        }
      });
    }

    // Register all services
    allServices.forEach(service => {
      this.services.set(service.name, {
        ...service,
        host: service.host || this.options.defaultHost,
        healthEndpoint: service.healthEndpoint || this.options.defaultHealthEndpoint,
      });
    });

    this.initialized = true;
    this.logger.debug(`Service locator initialized: ${this.services.size} services`);
  }

  /**
   * Get service URL
   */
  static getServiceUrl(serviceName: string): string {
    this.ensureInitialized();

    const service = this.services.get(serviceName);
    if (!service) {
      throw new DomainError(`Service '${serviceName}' not found in service registry`, 404);
    }

    return `http://${service.host}:${service.port}`;
  }

  /**
   * Get service port
   */
  static getServicePort(serviceName: string): number {
    this.ensureInitialized();

    const service = this.services.get(serviceName);
    if (!service) {
      throw new DomainError(`Service '${serviceName}' not found in service registry`, 404);
    }

    return service.port;
  }

  /**
   * CRITICAL: Validate that a service is using the correct port configuration.
   * This guard prevents non-gateway services from accidentally binding to process.env.PORT.
   *
   * The guard is smart: it only throws if the service would ACTUALLY bind to the wrong port.
   * Simply having process.env.PORT in the environment is fine as long as service-specific
   * port vars are properly configured.
   *
   * @param serviceName - The name of the service being validated
   * @param intendedPort - The port the service intends to bind to (optional, for validation)
   * @throws Error if a non-gateway service would bind to process.env.PORT
   */
  static validateServicePortConfiguration(serviceName: string, intendedPort?: number): void {
    // api-gateway is allowed to use process.env.PORT
    if (serviceName === 'api-gateway') {
      return;
    }

    const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_PORT`;
    const serviceSpecificPort = process.env[envVarName];
    const globalPort = process.env.PORT;

    // Case 1: Service-specific port is properly configured - all good
    if (serviceSpecificPort && !isNaN(parseInt(serviceSpecificPort, 10))) {
      // Optionally validate the intended port matches
      if (intendedPort !== undefined && intendedPort === parseInt(globalPort || '', 10)) {
        this.logger.warn(
          `⚠️ Service ${serviceName} intends to use port ${intendedPort} which equals process.env.PORT`,
          {
            service: serviceName,
            intendedPort,
            globalPort,
            serviceSpecificPort,
            recommendation: `Ensure ${envVarName} is being used, not PORT`,
          }
        );
      }
      return;
    }

    // Case 2: No service-specific port AND global PORT exists - this is dangerous
    if (globalPort && !serviceSpecificPort) {
      this.logger.error(`🚨 PORT CONFLICT RISK DETECTED`, {
        service: serviceName,
        issue: `process.env.PORT=${globalPort} exists but ${envVarName} is not set`,
        risk: 'Service may accidentally bind to the gateway port',
        solution: `Set ${envVarName} in turbo.json globalEnv and start-dev.sh`,
        documentation: 'See replit.md "Port Environment Propagation Architecture"',
      });

      throw new DomainError(
        `PORT CONFLICT RISK: Service '${serviceName}' has no ${envVarName} configured ` +
          `but process.env.PORT=${globalPort} exists. Without ${envVarName}, the service ` +
          `could accidentally bind to the gateway port. ` +
          `Fix: Add ${envVarName} to turbo.json globalEnv and start-dev.sh.`,
        500
      );
    }

    // Case 3: Neither port is set - just a warning, will use config default
    if (!globalPort && !serviceSpecificPort) {
      this.logger.debug(`Service ${serviceName} using default port from config (no env vars set)`, {
        service: serviceName,
        envVar: envVarName,
      });
    }
  }

  /**
   * Get the correct port for a service, enforcing the port contract.
   * This is the recommended way for services to determine their port.
   *
   * @param serviceName - The name of the service
   * @returns The port number the service should bind to
   * @throws Error if port configuration is invalid or would cause conflicts
   */
  static getValidatedServicePort(serviceName: string): number {
    this.ensureInitialized();

    // For api-gateway, allow process.env.PORT (Replit compatibility)
    if (serviceName === 'api-gateway') {
      if (process.env.PORT) {
        const port = parseInt(process.env.PORT, 10);
        if (isNaN(port)) {
          throw new DomainError(`Invalid PORT value: ${process.env.PORT} is not a number`, 500);
        }
        return port;
      }
      return this.getServicePort(serviceName);
    }

    // For all other services, use service-specific env var with fallback to config
    const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_PORT`;
    const envPort = process.env[envVarName];

    if (envPort) {
      const port = parseInt(envPort, 10);
      if (isNaN(port)) {
        throw new DomainError(`Invalid ${envVarName} value: ${envPort} is not a number`, 500);
      }

      // Run the guard with the intended port
      this.validateServicePortConfiguration(serviceName, port);
      return port;
    }

    // Fallback to ServiceLocator config - run guard to check for PORT conflict risk
    this.validateServicePortConfiguration(serviceName);
    return this.getServicePort(serviceName);
  }

  /**
   * Get service definition
   */
  static getService(serviceName: string): ServiceDefinition {
    this.ensureInitialized();

    const service = this.services.get(serviceName);
    if (!service) {
      throw new DomainError(`Service '${serviceName}' not found in service registry`, 404);
    }

    return service;
  }

  /**
   * Check if service exists
   */
  static hasService(serviceName: string): boolean {
    this.ensureInitialized();
    return this.services.has(serviceName);
  }

  /**
   * List all registered services
   */
  static listServices(): string[] {
    this.ensureInitialized();
    return Array.from(this.services.keys());
  }

  /**
   * Get all backend service names (derived from manifest)
   */
  static getBackendServiceNames(): string[] {
    this.ensureInitialized();
    return Array.from(this.services.values())
      .filter(s => s.type === 'backend-service')
      .map(s => s.name);
  }

  /**
   * Check if a service requires a specific resource type
   */
  static serviceRequiresResource(serviceName: string, resourceType: string): boolean {
    this.ensureInitialized();
    const service = this.services.get(serviceName);
    if (!service?.resources) return false;
    return service.resources.some(r => r.type === resourceType);
  }

  /**
   * Register a new service or update existing one
   */
  static registerService(service: ServiceDefinition): void {
    this.ensureInitialized();

    this.services.set(service.name, {
      ...service,
      host: service.host || this.options.defaultHost,
      healthEndpoint: service.healthEndpoint || this.options.defaultHealthEndpoint,
    });

    this.logger.info(`📍 Service registered: ${service.name}`, {
      port: service.port,
      host: service.host || this.options.defaultHost,
    });
  }

  /**
   * Wait for a service to become ready
   */
  static async waitForService(
    serviceName: string,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<boolean> {
    this.ensureInitialized();

    const { timeout = 30000, interval = 1000 } = options;
    const service = this.getService(serviceName);
    const startTime = Date.now();

    this.logger.info(`⏳ Waiting for service to become ready: ${serviceName}`, {
      timeout,
      interval,
      url: `${this.getServiceUrl(serviceName)}${service.healthEndpoint}`,
    });

    while (Date.now() - startTime < timeout) {
      try {
        const url = `${this.getServiceUrl(serviceName)}${service.healthEndpoint}`;
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal as AbortSignal,
        });

        clearTimeout(fetchTimeout);

        if (response.ok) {
          this.logger.info(`✅ Service ready: ${serviceName}`, {
            waitTime: Date.now() - startTime,
            url,
          });
          return true;
        }
      } catch (_error) {
        // Service not ready yet, continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    this.logger.error(`❌ Service failed to become ready: ${serviceName}`, {
      timeout,
      totalWaitTime: Date.now() - startTime,
    });

    return false;
  }

  private static ensureInitialized(): void {
    if (!this.initialized) {
      // Auto-initialize with defaults if not manually initialized
      this.initialize();
    }
  }
}
