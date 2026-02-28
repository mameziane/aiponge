/**
 * Gateway Core - Service Management
 * Provides service discovery, health checking, and circuit breaker status.
 * API routing is handled by explicit Express mounts in app.ts.
 */

import { ReverseProxy } from './ReverseProxy';
import { ServiceDiscovery } from './ServiceDiscovery';
import { getLogger } from '../config/service-urls';

const logger = getLogger('api-gateway-gatewaycore');

export interface GatewayConfig {
  proxyTimeout?: number;
  retries?: number;
  healthCheckInterval?: number;
}

export interface ServiceConfig {
  name: string;
  url: string;
  health?: string;
  version?: string;
  loadBalancer?: unknown;
}

export interface GatewayStatus {
  gateway: {
    status: string;
    uptime: number;
    version: string;
  };
  proxy: unknown;
  circuitBreakers: unknown;
  loadBalancer: unknown;
  services: Array<{
    name: string;
    [key: string]: unknown;
  }>;
  config: GatewayConfig & {
    totalServices: number;
  };
}

export class GatewayCore {
  private reverseProxy: ReverseProxy;
  private serviceDiscovery: ServiceDiscovery;
  private config: Required<GatewayConfig>;

  constructor(config: GatewayConfig = {}) {
    this.config = {
      proxyTimeout: config.proxyTimeout || 10000,
      retries: config.retries || 3,
      healthCheckInterval: config.healthCheckInterval || 30000,
    };

    // Initialize core components
    this.reverseProxy = new ReverseProxy({
      timeout: this.config.proxyTimeout,
      keepAlive: true,
      maxSockets: 100,
      circuitBreakerEnabled: true,
    });

    this.serviceDiscovery = new ServiceDiscovery();

    logger.debug('🚀 Gateway Core initialized with all components');
  }

  /**
   * Get comprehensive gateway status
   */
  getGatewayStatus(): GatewayStatus {
    const allServices = this.serviceDiscovery.getAllServices();
    const serviceStats = Array.from(allServices.entries()).map(([name, _instances]) => {
      const stats = this.serviceDiscovery.getServiceStats(name);
      return {
        name,
        ...stats,
      };
    });

    return {
      gateway: {
        status: 'healthy',
        uptime: process.uptime(),
        version: '1.0.0',
      },
      proxy: this.reverseProxy.getStats(),
      circuitBreakers: this.reverseProxy.getCircuitBreakerStats(),
      loadBalancer: { strategy: 'random', requests: 0 }, // Simple load balancing stats
      services: serviceStats,
      config: {
        ...this.config,
        totalServices: allServices.size,
      },
    };
  }

  /**
   * Get ServiceDiscovery instance (for sharing with other components)
   */
  getServiceDiscovery(): ServiceDiscovery {
    return this.serviceDiscovery;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<GatewayConfig>): void {
    this.config = { ...this.config, ...newConfig };

    logger.warn('🔧 Gateway configuration updated');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    void this.reverseProxy.destroy();
    void this.serviceDiscovery.destroy();
    logger.warn('Gateway Core destroyed');
  }

  // Delegation methods for server.ts compatibility
  registerService(_config: ServiceConfig): void {
    // Delegate to ServiceDiscovery - adjust method name as needed
    const serviceDiscovery = this.serviceDiscovery as ServiceDiscovery & {
      registerService?: (_config: ServiceConfig) => void;
    };
    if (typeof serviceDiscovery.registerService === 'function') {
      const typedDiscovery = this.serviceDiscovery as ServiceDiscovery & {
        registerService: (_config: ServiceConfig) => void;
      };
      typedDiscovery.registerService(_config);
    }
  }

  deregisterService(_name: string): void {
    // Delegate to ServiceDiscovery - adjust method name as needed
    const serviceDiscovery2 = this.serviceDiscovery as ServiceDiscovery & {
      deregisterService?: (_name: string) => void;
    };
    if (typeof serviceDiscovery2.deregisterService === 'function') {
      const typedDiscovery2 = this.serviceDiscovery as ServiceDiscovery & {
        deregisterService: (_name: string) => void;
      };
      typedDiscovery2.deregisterService(_name);
    }
  }

  async checkServiceHealth(_name: string): Promise<{ status: string; [key: string]: unknown }> {
    // Delegate to ServiceDiscovery - adjust method name as needed
    const healthServiceDiscovery = this.serviceDiscovery as ServiceDiscovery & {
      checkServiceHealth?: (_name: string) => Promise<{ status: string; [key: string]: unknown }>;
    };
    if (typeof healthServiceDiscovery.checkServiceHealth === 'function') {
      const typedHealthDiscovery = this.serviceDiscovery as ServiceDiscovery & {
        checkServiceHealth: (_name: string) => Promise<{ status: string; [key: string]: unknown }>;
      };
      return await typedHealthDiscovery.checkServiceHealth(_name);
    }
    return { status: 'unknown' };
  }
}
