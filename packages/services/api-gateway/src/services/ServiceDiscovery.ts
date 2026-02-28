/**
 * Service Discovery Implementation
 * Actual service registration, health checking, and discovery
 *
 * Uses ServiceLocator as the single source of truth for service ports/URLs.
 * ServiceLocator loads from the generated service-manifest.cjs (derived from
 * packages/platform-core/src/config/services-definition.ts) with env var overrides.
 */

import { randomUUID } from 'crypto';
import {
  ServiceLocator,
  createHttpClient,
  logAndTrackError,
  serializeError,
  createIntervalScheduler,
  type IntervalScheduler,
} from '@aiponge/platform-core';
import { getLogger } from '../config/service-urls';
import { GatewayConfig } from '../config/GatewayConfig';
import { GatewayError } from '../errors';

const getServicePort = (serviceName: string) => ServiceLocator.getServicePort(serviceName);

const AbortControllerConstructor = globalThis.AbortController;

const KNOWN_SERVICES = [
  'system-service',
  'storage-service',
  'user-service',
  'ai-config-service',
  'ai-content-service',
  'ai-analytics-service',
  'music-service',
  'api-gateway',
];

function getServiceUrl(serviceName: string): string {
  try {
    return ServiceLocator.getServiceUrl(serviceName);
  } catch (error) {
    const { error: wrappedError } = logAndTrackError(
      error,
      `Failed to get service URL for ${serviceName}`,
      {
        module: 'api_gateway_service_discovery',
        operation: 'get_service_url',
        serviceName,
      },
      'API_GATEWAY_SERVICE_URL_ERROR',
      500
    );
    throw wrappedError;
  }
}

export interface ServiceInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  version: string;
  protocol: 'http' | 'https';
  healthEndpoint: string;
  metadata: Record<string, unknown>;
  registeredAt: Date;
  lastHealthCheck?: Date;
  healthy: boolean;
  weight: number; // For load balancing
}

export interface HealthCheckResult {
  healthy: boolean;
  responseTime: number;
  error?: string;
  checkedAt: Date;
}

export interface DiscoveredService {
  id: string;
  name: string;
  host?: string;
  port?: number;
  status?: string;
  healthEndpoint?: string;
  metadata?: {
    version?: string;
    capabilities?: Array<string>;
    architecture?: string;
    [key: string]: unknown;
  };
}

export type DiscoveryMode = 'dynamic' | 'static' | 'transitioning';

export interface DiscoveryStatus {
  mode: DiscoveryMode;
  systemServiceAvailable: boolean;
  lastDynamicAttempt?: Date;
  lastStaticFallback?: Date;
  lastModeSwitch?: Date;
  probeInterval: number;
  failureCount: number;
  successCount: number;
}

export class ServiceDiscovery {
  private services: Map<string, ServiceInstance[]> = new Map();
  private healthCheckScheduler: IntervalScheduler | null = null;
  private healthCheckIntervalMs = parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000'); // Reduced frequency for dev
  private httpClient = createHttpClient({ ...GatewayConfig.http.defaults, serviceName: 'api-gateway' });
  private logger = getLogger('api-gateway-service-discovery');

  // Service TTL for memory leak prevention (1 hour default)
  private serviceTTL = parseInt(process.env.SERVICE_TTL_MS || '3600000');
  private lastEvictionTime = Date.now();
  private evictionIntervalMs = parseInt(process.env.EVICTION_INTERVAL_MS || '300000'); // 5 minutes

  // Discovery mode tracking
  private discoveryStatus: DiscoveryStatus = {
    mode: 'transitioning',
    systemServiceAvailable: false,
    probeInterval: parseInt(process.env.DISCOVERY_PROBE_INTERVAL || '45000'), // 45 seconds
    failureCount: 0,
    successCount: 0,
  };

  private discoveryProbeScheduler: IntervalScheduler | null = null;

  constructor() {
    this.initializeServices().catch(error => {
      this.logger.error('Failed to initialize services', {
        module: 'api_gateway_service_discovery',
        operation: 'constructor',
        error: serializeError(error),
        phase: 'initialization_error',
      });
    });
    this.startHealthChecking();
    this.startDiscoveryProbing();
  }

  /**
   * Initialize services using dynamic discovery from system-service
   */
  private async initializeServices(): Promise<void> {
    this.logger.debug('🔄 Initializing service discovery', {
      module: 'api_gateway_service_discovery',
      operation: 'initialize',
      phase: 'initialization_start',
    });
    try {
      await this.attemptDynamicDiscovery();
    } catch (error) {
      this.logger.warn('Dynamic discovery unavailable at startup, using static registry (will retry)', {
        module: 'api_gateway_service_discovery',
        operation: 'initialize_services',
        phase: 'fallback_to_static_registry',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.fallbackToStaticRegistry();
    }
  }

  /**
   * Attempt dynamic discovery from system-service
   */
  private async attemptDynamicDiscovery(): Promise<void> {
    this.discoveryStatus.mode = 'transitioning';
    this.discoveryStatus.lastDynamicAttempt = new Date();

    try {
      // 1) Use proper discovery from system-service
      const discoveredServices = await this.discoverServicesFromSystemService();

      // 2) Clear existing services when upgrading to dynamic mode
      this.clearStaticServices();

      // 3) Register discovered services
      discoveredServices.forEach((service: DiscoveredService) => {
        void this.registerService({
          id: randomUUID(),
          name: service.name,
          host: service.host || 'localhost',
          port: service.port || this.extractPortFromService(service),
          version: service.metadata?.version || '1.0.0',
          protocol: 'http',
          healthEndpoint: service.healthEndpoint || '/health',
          metadata: {
            environment: 'development',
            discovered: true,
            originalId: service.id,
            capabilities: service.metadata?.capabilities || [],
            architecture: service.metadata?.architecture || 'Unknown',
          },
          registeredAt: new Date(),
          healthy: service.status === 'healthy',
          weight: 1,
        });
      });

      // 4) Update discovery status to dynamic
      this.discoveryStatus.mode = 'dynamic';
      this.discoveryStatus.systemServiceAvailable = true;
      this.discoveryStatus.lastModeSwitch = new Date();
      this.discoveryStatus.successCount++;
      this.discoveryStatus.failureCount = 0; // Reset failure count on success

      this.logger.debug('Service Discovery: Upgraded to dynamic mode', {
        module: 'api_gateway_service_discovery',
        operation: 'attempt_dynamic_discovery',
        servicesLoaded: discoveredServices.length,
        phase: 'dynamic_mode_upgrade_success',
      });
    } catch (error) {
      this.discoveryStatus.failureCount++;
      this.discoveryStatus.systemServiceAvailable = false;

      const currentMode = this.discoveryStatus.mode;
      if (currentMode === 'dynamic' || currentMode === 'transitioning') {
        this.logger.warn('Dynamic discovery attempt failed', {
          module: 'api_gateway_service_discovery',
          operation: 'attempt_dynamic_discovery',
          phase: 'dynamic_discovery_failed',
          mode: currentMode,
          failureCount: this.discoveryStatus.failureCount,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } else {
        this.logger.debug('🔍 System-service probe failed (expected in static mode)', {
          module: 'api_gateway_service_discovery',
          operation: 'attempt_dynamic_discovery',
          error: error instanceof Error ? error.message : 'Unknown error',
          mode: currentMode,
          phase: 'static_mode_probe_failed',
        });
      }

      throw error;
    }
  }

  /**
   * Discover services from system-service API
   */
  private async discoverServicesFromSystemService(): Promise<Array<DiscoveredService>> {
    const systemServiceUrl = process.env.SYSTEM_SERVICE_URL || getServiceUrl('system-service');
    const discoveryEndpoint = `${systemServiceUrl}/api/discovery/services`;

    this.logger.debug('🔍 Discovering services from endpoint', {
      module: 'api_gateway_service_discovery',
      operation: 'discover_services_from_dynamic_registry',
      discoveryEndpoint,
      phase: 'discovery_endpoint_start',
    });

    const discoveryData = await this.httpClient.get<{ services?: Array<DiscoveredService> } | Array<DiscoveredService>>(
      discoveryEndpoint,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'API-Gateway-Discovery/1.0',
        },
        timeout: 10000,
      }
    );

    // Handle different response formats from system-service
    // Standard envelope: { success: true, data: { services: [...] } }
    // Or direct: { services: [...] } or raw array
    const responseObj = discoveryData as Record<string, unknown>;
    const payload = responseObj.data && typeof responseObj.data === 'object' ? responseObj.data as Record<string, unknown> : responseObj;

    if (Array.isArray(discoveryData)) {
      return discoveryData;
    } else if (Array.isArray(payload.services)) {
      return payload.services as Array<DiscoveredService>;
    } else {
      throw GatewayError.internalError('Invalid discovery response format');
    }
  }

  /**
   * Extract port from discovered service (multiple possible sources)
   */
  private extractPortFromService(service: DiscoveredService): number {
    // Try multiple ways to get the port
    if (service.port) return service.port;
    if (service.metadata?.port && typeof service.metadata.port === 'number') return service.metadata.port;

    // Try to extract from healthEndpoint URL
    if (service.healthEndpoint) {
      const match = service.healthEndpoint.match(/:([0-9]+)/);
      if (match) return parseInt(match[1]);
    }

    // Use unified port configuration to determine port
    // Note: ServiceLocator expects kebab-case service names, not camelCase
    try {
      return getServicePort(service.name);
    } catch (error) {
      this.logger.warn('⚠️ Failed to get port for service from unified config', {
        module: 'api_gateway_service_discovery',
        operation: 'discover_services_from_dynamic_registry',
        serviceName: service.name,
        error: serializeError(error),
        phase: 'service_port_config_failed',
      });
    }

    throw new GatewayError(
      `Cannot determine port for service ${service.name}. Ensure it is registered in services.config.ts.`,
      500
    );
  }

  /**
   * Fallback to static registry when system-service is unavailable
   */
  private fallbackToStaticRegistry(): void {
    this.discoveryStatus.mode = 'static';
    this.discoveryStatus.systemServiceAvailable = false;
    this.discoveryStatus.lastStaticFallback = new Date();
    this.discoveryStatus.lastModeSwitch = new Date();

    for (const [serviceName, instances] of this.services.entries()) {
      this.services.set(
        serviceName,
        instances.filter(i => i.metadata.discovered === true)
      );
    }

    const services = this.loadServicesFromServiceLocator();

    services.forEach(service => {
      void this.registerService({
        id: `static-${service.name}`,
        name: service.name,
        host: service.host,
        port: service.port,
        version: '1.0.0',
        protocol: 'http',
        healthEndpoint: '/health',
        metadata: {
          environment: process.env.NODE_ENV || 'development',
          discovered: false,
          fallback: true,
        },
        registeredAt: new Date(),
        healthy: true,
        weight: 1,
      });
    });

    this.logger.info('🔄 Service Discovery: Fallback to static mode', {
      module: 'api_gateway_service_discovery',
      operation: 'fallback_to_static_registry',
      servicesLoaded: services.length,
      phase: 'static_mode_fallback',
    });
  }

  /**
   * Clear static services when upgrading to dynamic discovery
   */
  private clearStaticServices(): void {
    const servicesToClear: string[] = [];

    for (const [serviceName, instances] of this.services.entries()) {
      const staticInstances = instances.filter(
        instance => instance.metadata.discovered === false || instance.metadata.fallback === true
      );

      if (staticInstances.length > 0) {
        servicesToClear.push(serviceName);
        // Remove static instances
        this.services.set(
          serviceName,
          instances.filter(instance => instance.metadata.discovered !== false && instance.metadata.fallback !== true)
        );
      }
    }

    if (servicesToClear.length > 0) {
      this.logger.info('🧹 Cleared static services for dynamic upgrade', {
        module: 'api_gateway_service_discovery',
        operation: 'clear_static_services',
        servicesToClear: servicesToClear.join(', '),
        phase: 'static_services_cleared',
      });
    }
  }

  private loadServicesFromServiceLocator(): Array<{ name: string; host: string; port: number }> {
    return KNOWN_SERVICES.map(name => {
      const port = getServicePort(name);
      const host = process.env.SERVICE_HOST || 'localhost';
      return { name, host, port };
    });
  }

  /**
   * Register a service instance
   */
  registerService(instance: ServiceInstance): Promise<void> {
    const serviceName = instance.name;

    if (!this.services.has(serviceName)) {
      this.services.set(serviceName, []);
    }

    const instances = this.services.get(serviceName)!;

    // Remove existing instance with same ID
    const existingIndex = instances.findIndex(s => s.id === instance.id);
    if (existingIndex >= 0) {
      instances.splice(existingIndex, 1);
    }

    instances.push(instance);
    this.logger.info('📝 Registered service', {
      module: 'api_gateway_service_discovery',
      operation: 'register_service',
      serviceName,
      host: instance.host,
      port: instance.port,
      phase: 'service_registered',
    });
    return Promise.resolve();
  }

  /**
   * Deregister a service instance
   */
  deregisterService(serviceName: string, instanceId: string): Promise<void> {
    const instances = this.services.get(serviceName);
    if (instances) {
      const index = instances.findIndex(s => s.id === instanceId);
      if (index >= 0) {
        instances.splice(index, 1);
        this.logger.info('🗑️ Deregistered service', {
          module: 'api_gateway_service_discovery',
          operation: 'deregister_service',
          serviceName,
          instanceId,
          phase: 'service_deregistered',
        });
      }
    }
    return Promise.resolve();
  }

  /**
   * Discover healthy instances of a service
   */
  discoverService(serviceName: string): ServiceInstance[] {
    const instances = this.services.get(serviceName) || [];
    return instances.filter(instance => instance.healthy);
  }

  /**
   * Get all services and their instances
   */
  getAllServices(): Map<string, ServiceInstance[]> {
    return new Map(this.services);
  }

  /**
   * Get service statistics
   */
  getServiceStats(serviceName: string): {
    total: number;
    healthy: number;
    unhealthy: number;
    instances: ServiceInstance[];
  } {
    const instances = this.services.get(serviceName) || [];
    const healthy = instances.filter(i => i.healthy);
    const unhealthy = instances.filter(i => !i.healthy);

    return {
      total: instances.length,
      healthy: healthy.length,
      unhealthy: unhealthy.length,
      instances,
    };
  }

  /**
   * Perform health check on a service instance
   */
  async checkHealth(instance: ServiceInstance): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const url = `${instance.protocol}://${instance.host}:${instance.port}${instance.healthEndpoint || '/health'}`;

    try {
      // Use AbortController for timeout instead of fetch timeout option
      const controller = new AbortControllerConstructor();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await this.httpClient.get(url, {
        headers: {
          'user-agent': 'aiponge-Gateway-HealthCheck/1.0',
        },
        timeout: 5000,
      });

      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      const responseObj = response as Record<string, unknown>;
      const healthy = responseObj?.status === 'healthy' || Boolean(responseObj?.success);

      return {
        healthy,
        responseTime,
        checkedAt: new Date(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        healthy: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        checkedAt: new Date(),
      };
    }
  }

  /**
   * Start periodic health checking with jitter to prevent thundering herd
   */
  private startHealthChecking(): void {
    // Add random jitter (±10%) to prevent synchronized health checks across instances
    const jitter = Math.random() * 0.2 - 0.1; // -10% to +10%
    const jitteredInterval = this.healthCheckIntervalMs * (1 + jitter);

    this.healthCheckScheduler = createIntervalScheduler({
      name: 'gateway-service-health-check',
      serviceName: 'api-gateway',
      intervalMs: jitteredInterval,
      handler: async () => {
        await this.performHealthChecks();
        await this.performServiceEviction();
      },
    });
    this.healthCheckScheduler.start();

    this.logger.debug('💓 Health checking started with jitter', {
      module: 'api_gateway_service_discovery',
      operation: 'start_health_checking',
      baseIntervalMs: this.healthCheckIntervalMs,
      jitteredIntervalMs: Math.round(jitteredInterval),
      jitterPercent: Math.round(jitter * 100),
      phase: 'health_checking_started',
    });
  }

  /**
   * Perform health checks on all registered services
   */
  private async performHealthChecks(): Promise<void> {
    const allInstances: ServiceInstance[] = [];

    for (const instances of this.services.values()) {
      allInstances.push(...instances);
    }

    const healthChecks = allInstances.map(async instance => {
      const result = await this.checkHealth(instance);
      instance.healthy = result.healthy;
      instance.lastHealthCheck = result.checkedAt;

      if (!result.healthy) {
        this.logger.warn('🚨 Health check failed', {
          module: 'api_gateway_service_discovery',
          operation: 'check_health',
          serviceName: instance.name,
          instanceId: instance.id,
          error: result.error,
          phase: 'health_check_failed',
        });
      }
    });

    await Promise.allSettled(healthChecks);
  }

  /**
   * Perform service eviction to prevent memory leaks
   * Removes services that haven't been registered/updated within TTL window
   */
  private async performServiceEviction(): Promise<void> {
    const now = Date.now();

    // Only run eviction every evictionIntervalMs to reduce overhead
    if (now - this.lastEvictionTime < this.evictionIntervalMs) {
      return;
    }

    this.lastEvictionTime = now;
    let evictedCount = 0;

    for (const [serviceName, instances] of this.services.entries()) {
      const validInstances = instances.filter(instance => {
        const age = now - instance.registeredAt.getTime();
        const isExpired = age > this.serviceTTL;

        if (isExpired) {
          evictedCount++;
          this.logger.info('🗑️ Evicting stale service instance', {
            module: 'api_gateway_service_discovery',
            operation: 'perform_service_eviction',
            serviceName,
            instanceId: instance.id,
            ageMs: age,
            ttlMs: this.serviceTTL,
            phase: 'service_evicted',
          });
        }

        return !isExpired;
      });

      if (validInstances.length === 0) {
        // Remove the service entry entirely if no instances left
        this.services.delete(serviceName);
      } else if (validInstances.length !== instances.length) {
        // Update with only valid instances
        this.services.set(serviceName, validInstances);
      }
    }

    if (evictedCount > 0) {
      this.logger.info('🧹 Service eviction completed', {
        module: 'api_gateway_service_discovery',
        operation: 'perform_service_eviction',
        evictedCount,
        remainingServices: this.services.size,
        phase: 'eviction_completed',
      });
    }
  }

  /**
   * Stop health checking
   */
  stopHealthChecking(): void {
    if (this.healthCheckScheduler) {
      this.healthCheckScheduler.stop();
      this.healthCheckScheduler = null;
      this.logger.info('💓 Health checking stopped', {
        module: 'api_gateway_service_discovery',
        operation: 'stop_health_checking',
        phase: 'health_checking_stopped',
      });
    }
  }

  /**
   * Start background discovery probing
   */
  private startDiscoveryProbing(): void {
    this.discoveryProbeScheduler = createIntervalScheduler({
      name: 'gateway-discovery-probe',
      serviceName: 'api-gateway',
      intervalMs: this.discoveryStatus.probeInterval,
      handler: () => this.performDiscoveryProbe(),
    });
    this.discoveryProbeScheduler.start();

    this.logger.debug('🔍 Discovery probing started', {
      module: 'api_gateway_service_discovery',
      operation: 'start_discovery_probing',
      intervalMs: this.discoveryStatus.probeInterval,
      phase: 'discovery_probing_started',
    });
  }

  /**
   * Perform background discovery probe
   */
  private async performDiscoveryProbe(): Promise<void> {
    // Only probe if we're in static mode or if system-service was unavailable
    if (this.discoveryStatus.mode === 'dynamic' && this.discoveryStatus.systemServiceAvailable) {
      return;
    }

    try {
      // Check if system-service is available by trying dynamic discovery
      await this.attemptDynamicDiscovery();
      if (this.discoveryStatus.mode === 'dynamic') {
        this.logger.info('🎉 Discovery probe successful: Upgraded from static to dynamic discovery!', {
          module: 'api_gateway_service_discovery',
          operation: 'start_discovery_probing',
          phase: 'dynamic_discovery_upgrade_success',
        });
      }
    } catch (error) {
      // Probe failed - system-service still not available
      if (this.discoveryStatus.mode !== 'static') {
        this.logger.info('🔍 Discovery probe: system-service not ready, maintaining static mode', {
          module: 'api_gateway_service_discovery',
          operation: 'start_discovery_probing',
          phase: 'system_service_not_ready_static_mode',
        });
        this.fallbackToStaticRegistry();
      }
    }
  }

  /**
   * Stop discovery probing
   */
  private stopDiscoveryProbing(): void {
    if (this.discoveryProbeScheduler) {
      this.discoveryProbeScheduler.stop();
      this.discoveryProbeScheduler = null;
      this.logger.info('🔍 Discovery probing stopped', {
        module: 'api_gateway_service_discovery',
        operation: 'stop_discovery_probing',
        phase: 'discovery_probing_stopped',
      });
    }
  }

  /**
   * Get current discovery status
   */
  getDiscoveryStatus(): DiscoveryStatus {
    return { ...this.discoveryStatus };
  }

  /**
   * Force discovery mode switch (for manual intervention)
   */
  async forceDynamicDiscovery(): Promise<boolean> {
    try {
      await this.attemptDynamicDiscovery();
      return this.discoveryStatus.mode === 'dynamic';
    } catch (error) {
      this.logger.warn('Failed to force dynamic discovery', {
        module: 'api_gateway_service_discovery',
        operation: 'force_dynamic_discovery',
        error: serializeError(error),
        phase: 'force_dynamic_discovery_failed',
      });
      return false;
    }
  }

  /**
   * Force fallback to static mode
   */
  forceStaticFallback(): void {
    this.logger.info('🔄 Forcing fallback to static discovery mode', {
      module: 'api_gateway_service_discovery',
      operation: 'force_fallback_to_static',
      phase: 'force_static_fallback',
    });
    this.clearDynamicServices();
    this.fallbackToStaticRegistry();
  }

  /**
   * Clear dynamic services when falling back to static
   */
  private clearDynamicServices(): void {
    const servicesToClear: string[] = [];

    for (const [serviceName, instances] of this.services.entries()) {
      const dynamicInstances = instances.filter(instance => instance.metadata.discovered === true);

      if (dynamicInstances.length > 0) {
        servicesToClear.push(serviceName);
        // Remove dynamic instances
        this.services.set(
          serviceName,
          instances.filter(instance => instance.metadata.discovered !== true)
        );
      }
    }

    if (servicesToClear.length > 0) {
      this.logger.info('🧹 Cleared dynamic services for static fallback', {
        module: 'api_gateway_service_discovery',
        operation: 'clear_dynamic_services',
        servicesToClear: servicesToClear.join(', '),
        phase: 'dynamic_services_cleared',
      });
    }
  }

  /**
   * Service mapping with type safety
   */
  private static readonly SERVICE_MAPPING = {
    'system-service': 'systemService',
    'user-service': 'userService',
    'ai-content-service': 'aiContentService',
    'ai-config-service': 'aiConfigService',
    'ai-analytics-service': 'aiAnalyticsService',
    'music-service': 'musicService',
    'storage-service': 'storageService',
  } as const;

  /**
   * Map service discovery names to unified config service keys
   */
  private mapServiceNameToUnifiedKey(
    serviceName: string
  ): (typeof ServiceDiscovery.SERVICE_MAPPING)[keyof typeof ServiceDiscovery.SERVICE_MAPPING] | null {
    const key = ServiceDiscovery.SERVICE_MAPPING[serviceName as keyof typeof ServiceDiscovery.SERVICE_MAPPING];
    return key || null;
  }

  /**
   * Cleanup resources
   */
  destroy(): Promise<void> {
    this.stopHealthChecking();
    this.stopDiscoveryProbing();
    this.services.clear();
    return Promise.resolve();
  }
}
