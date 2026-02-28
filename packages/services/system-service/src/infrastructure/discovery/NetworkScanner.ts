/**
 * Network Scanner Infrastructure
 * Handles actual network discovery and health checks
 */

import { Service, ServiceCapabilities, type ServiceHealthStatus } from '../../domains/discovery/entities/Service';
import { getLogger } from '../../config/service-urls';
import { SERVICES } from '@aiponge/platform-core';
import { HEALTH_STATUS } from '@aiponge/shared-contracts';

interface HealthResponse {
  service?: string;
  endpoints?: string[];
  version?: string;
  dependencies?: string[];
  [key: string]: unknown;
}

export interface ScanResult {
  host: string;
  port: number;
  isOpen: boolean;
  responseTime: number;
  serviceName?: string;
  capabilities?: ServiceCapabilities;
}

export class NetworkScanner {
  private readonly scanPorts: number[];
  private logger = getLogger('network-scanner');

  constructor() {
    // Dynamically load ports from services.config.ts - single source of truth
    // Prefer development port if defined, otherwise use internal port
    const ports = SERVICES.filter(service => service.type === 'backend-service' || service.type === 'frontend-app').map(
      service => service.port.development || service.port.internal
    );

    // Remove duplicates and sort
    this.scanPorts = Array.from(new Set(ports)).sort((a, b) => a - b);

    this.logger.info('🔍 Pure dynamic discovery - scanning configured service ports from services.config.ts', {
      module: 'network_scanner',
      operation: 'constructor',
      phase: 'initialization',
      scanPorts: this.scanPorts,
      serviceCount: this.scanPorts.length,
    });
  }

  async scanNetwork(host: string = 'localhost'): Promise<ScanResult[]> {
    this.logger.info('🔍 Scanning network', {
      module: 'network_scanner',
      operation: 'scan_network',
      host,
      ports: this.scanPorts,
      portCount: this.scanPorts.length,
      phase: 'network_scan_start',
    });

    const scanPromises = this.scanPorts.map(port => this.scanPort(host, port));
    const results = await Promise.allSettled(scanPromises);

    return results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<ScanResult>).value)
      .filter(result => result.isOpen);
  }

  async scanPort(host: string, port: number): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const response = await fetch(`http://0.0.0.0:${port}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const healthData = (await response.json().catch(error => {
          this.logger.error('Failed to parse health response JSON', {
            module: 'network_scanner',
            operation: 'scan_port',
            port,
            error: error.message,
            stack: error.stack,
            phase: 'json_parse_failure',
          });
          throw error;
        })) as HealthResponse;
        // Pure dynamic discovery - services MUST self-identify through health endpoint
        const serviceName = healthData.service || `discovered-service-${port}`;

        const capabilities: ServiceCapabilities = {
          endpoints: healthData.endpoints || ['/health'],
          healthCheckUrl: '/health',
          version: healthData.version || '1.0.0',
          protocols: ['http'],
          dependencies: healthData.dependencies || [],
        };

        return {
          host,
          port,
          isOpen: true,
          responseTime,
          serviceName,
          capabilities,
        };
      } else {
        // Port is open but service is not healthy - no assumptions about service type
        return {
          host,
          port,
          isOpen: true,
          responseTime,
          serviceName: `unhealthy-service-${port}`,
          capabilities: {
            endpoints: ['/health'],
            healthCheckUrl: '/health',
            version: '1.0.0',
            protocols: ['http'],
            dependencies: [],
          },
        };
      }
    } catch (error) {
      // Port is closed or unreachable
      return {
        host,
        port,
        isOpen: false,
        responseTime: Date.now() - startTime,
      };
    }
  }

  async performHealthCheck(service: Service): Promise<{ status: string; responseTime: number; error?: string }> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(service.getHealthCheckUrl(), {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      return {
        status: response.ok ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.UNHEALTHY,
        responseTime,
      };
    } catch (error) {
      return {
        status: HEALTH_STATUS.DOWN,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async discoverServices(host: string = 'localhost'): Promise<Service[]> {
    const scanResults = await this.scanNetwork(host);
    const services: Service[] = [];

    for (const result of scanResults.filter(r => r.isOpen && r.serviceName && r.capabilities)) {
      const service = Service.create(
        result.serviceName!,
        result.host,
        result.port,
        result.capabilities!,
        ['discovered', 'active'],
        {
          discoveredAt: new Date(),
          lastScanTime: Date.now(),
        }
      );

      // Perform immediate health check
      const healthCheck = await this.performHealthCheck(service);
      const updatedService = service.updateStatus(healthCheck.status as ServiceHealthStatus).updateMetrics({
        responseTime: healthCheck.responseTime,
        uptime: healthCheck.status === HEALTH_STATUS.HEALTHY ? 100 : 0,
      });

      services.push(updatedService);
    }

    this.logger.info('🎯 Services discovery completed', {
      module: 'network_scanner',
      operation: 'discover_services',
      discoveredCount: services.length,
      serviceNames: services.map(s => s.name),
      phase: 'discovery_complete',
    });
    return services;
  }
}
