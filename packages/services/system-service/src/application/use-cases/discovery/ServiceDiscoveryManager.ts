/**
 * Service Discovery Manager
 * DYNAMIC ONLY - All service data discovered via network probing
 */

import { ServiceLocator, SERVICES } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { HEALTH_STATUS } from '@aiponge/shared-contracts';

export type DiscoveryHealthStatus =
  | typeof HEALTH_STATUS.HEALTHY
  | typeof HEALTH_STATUS.DEGRADED
  | typeof HEALTH_STATUS.DOWN;

export interface ServiceCapability {
  name: string;
  description: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  inputSchema?: unknown;
  outputSchema?: unknown;
  dependencies?: string[];
}

export interface ServiceMetadata {
  serviceName: string;
  version: string;
  status: DiscoveryHealthStatus;
  description: string;
  repository: string;
  capabilities: ServiceCapability[];
  healthEndpoint: string;
  documentation?: string;
}

/** Health endpoint response structure */
interface HealthResponse {
  service?: string;
  version?: string;
  description?: string;
  repository?: string;
  capabilities?: ServiceCapability[];
  features?: string[];
}

// Environment-based configuration - completely independent service
const logger = getLogger('service-discovery-manager');
const logPortConfiguration = () => {
  try {
    logger.info('🔧 System Service Ports configured', {
      module: 'service_discovery_manager',
      operation: 'port_configuration',
      systemPort: ServiceLocator.getServicePort('system-service'),
      phase: 'ports_loaded',
    });
  } catch (error) {
    // ServiceLocator may not be initialized yet, skip logging
    logger.debug('ServiceLocator not yet initialized for port logging');
  }
};

export class ServiceDiscoveryManager {
  private services: Map<string, ServiceMetadata> = new Map();
  private discoveryPorts: number[];
  private logger = getLogger('service-discovery-manager');

  constructor() {
    this.logger.info('🔍 ZERO STATIC DATA - Network discovery only', {
      module: 'service_discovery_manager',
      operation: 'constructor',
      phase: 'initialization',
    });

    // Dynamically load ports from services.config.ts - single source of truth
    // Prefer development port if defined, otherwise use internal port
    const ports = SERVICES.filter(service => service.type === 'backend-service' || service.type === 'frontend-app').map(
      service => service.port.development || service.port.internal
    );

    // Remove duplicates and sort
    this.discoveryPorts = Array.from(new Set(ports)).sort((a, b) => a - b);

    this.logger.info('📦 Loaded discovery ports from services.config.ts', {
      module: 'service_discovery_manager',
      operation: 'constructor',
      portCount: this.discoveryPorts.length,
      ports: this.discoveryPorts,
      phase: 'ports_loaded',
    });

    logPortConfiguration();
  }

  async discoverServices(): Promise<ServiceMetadata[]> {
    this.services.clear(); // Clear any previous discoveries
    const discoveredServices: ServiceMetadata[] = [];

    this.logger.info('🔍 Scanning ports for live services', {
      module: 'service_discovery_manager',
      operation: 'discover_services',
      portCount: this.discoveryPorts.length,
      phase: 'scan_start',
    });

    for (const port of this.discoveryPorts) {
      try {
        const response = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(1000),
        });

        if (response.ok) {
          const healthData = (await response.json()) as HealthResponse;

          const service: ServiceMetadata = {
            serviceName: healthData.service || `service-${port}`,
            version: healthData.version || '1.0.0',
            status: HEALTH_STATUS.HEALTHY,
            description: healthData.description || `Live service on port ${port}`,
            repository: healthData.repository || 'Unknown',
            healthEndpoint: '/health',
            capabilities: this.extractCapabilitiesFromHealth(healthData),
          };

          discoveredServices.push(service);
          this.services.set(service.serviceName, service);
          this.logger.info('✅ Service discovered', {
            module: 'service_discovery_manager',
            operation: 'discover_services',
            serviceName: service.serviceName,
            port,
            phase: 'service_discovered',
          });
        }
      } catch (error) {
        // Service not available - this is expected for most ports
      }
    }

    this.logger.info('🎯 Final discovery completed', {
      module: 'service_discovery_manager',
      operation: 'discover_services',
      liveServicesFound: discoveredServices.length,
      phase: 'final_discovery_complete',
    });
    return discoveredServices;
  }

  private extractCapabilitiesFromHealth(healthData: HealthResponse): ServiceCapability[] {
    if (healthData.capabilities) {
      return healthData.capabilities;
    }

    if (healthData.features) {
      return healthData.features.map((feature: string) => ({
        name: feature,
        description: `${feature} functionality`,
        endpoint: `/api/${feature.toLowerCase()}`,
        method: 'GET' as const,
      }));
    }

    // Default capability for any discovered service
    return [
      {
        name: 'Health Check',
        description: 'Service health monitoring',
        endpoint: '/health',
        method: 'GET',
      },
    ];
  }

  /**
   * Get all discovered services (ONLY from network discovery)
   */
  getAllServices(): ServiceMetadata[] {
    return Array.from(this.services.values());
  }

  /**
   * Get specific service information
   */
  getService(serviceName: string): ServiceMetadata | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Find services by capability
   */
  getServicesByCapability(capabilityName: string): ServiceMetadata[] {
    return Array.from(this.services.values()).filter(service =>
      service.capabilities.some(cap => cap.name.toLowerCase().includes(capabilityName.toLowerCase()))
    );
  }

  /**
   * Search services by name or description
   */
  searchServices(query: string): ServiceMetadata[] {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.services.values()).filter(
      service =>
        service.serviceName.toLowerCase().includes(lowercaseQuery) ||
        service.description.toLowerCase().includes(lowercaseQuery) ||
        service.capabilities.some(
          cap =>
            cap.name.toLowerCase().includes(lowercaseQuery) || cap.description.toLowerCase().includes(lowercaseQuery)
        )
    );
  }

  /**
   * Get system overview (ONLY from discovered services)
   */
  getSystemOverview() {
    const services = Array.from(this.services.values());
    const healthyServices = services.filter(s => s.status === HEALTH_STATUS.HEALTHY).length;
    const totalCapabilities = services.reduce((sum, s) => sum + s.capabilities.length, 0);

    return {
      totalServices: services.length,
      healthyServices,
      totalCapabilities,
      systemHealth: services.length > 0 ? Math.round((healthyServices / services.length) * 100) : 0,
    };
  }
}
