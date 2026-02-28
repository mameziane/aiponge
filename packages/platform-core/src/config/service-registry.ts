import { DomainError } from '../error-handling/errors.js';
import { createIntervalScheduler, type IntervalScheduler } from '../scheduling/IntervalScheduler.js';

const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug') {
      console.log(`[service-registry] ${msg}`, meta || '');
    }
  },
  info: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[service-registry] ${msg}`, meta || '');
    }
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    console.warn(`[service-registry] ${msg}`, meta || '');
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    console.error(`[service-registry] ${msg}`, meta || '');
  },
};

export interface ServiceInstance {
  name: string;
  host: string;
  port: number;
  version: string;
  healthEndpoint: string;
  metadata: Record<string, unknown>;
  registeredAt: Date;
  lastHeartbeat: Date;
  status: 'healthy' | 'unhealthy' | 'unknown';
}

export interface RegistrationOptions {
  name: string;
  port: number;
  host?: string;
  version?: string;
  healthEndpoint?: string;
  metadata?: Record<string, unknown>;
}

export interface DiscoveryOptions {
  healthyOnly?: boolean;
  timeout?: number;
}

class ServiceRegistryImpl {
  private services = new Map<string, ServiceInstance>();
  private healthCheckSchedulers = new Map<string, IntervalScheduler>();
  private readonly healthCheckInterval: number;
  private readonly unhealthyThreshold: number;

  constructor() {
    this.healthCheckInterval = parseInt(process.env.REGISTRY_HEALTH_CHECK_INTERVAL || '10000', 10);
    this.unhealthyThreshold = parseInt(process.env.REGISTRY_UNHEALTHY_THRESHOLD || '30000', 10);
  }

  register(options: RegistrationOptions): ServiceInstance {
    const instance: ServiceInstance = {
      name: options.name,
      host: options.host || process.env.SERVICE_HOST || 'localhost',
      port: options.port,
      version: options.version || '1.0.0',
      healthEndpoint: options.healthEndpoint || '/health',
      metadata: options.metadata || {},
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
      status: 'unknown',
    };

    this.services.set(options.name, instance);
    this.startHealthCheck(options.name);

    logger.info(`Service registered: ${options.name}`, {
      host: instance.host,
      port: instance.port,
      version: instance.version,
    });

    return instance;
  }

  deregister(serviceName: string): boolean {
    const scheduler = this.healthCheckSchedulers.get(serviceName);
    if (scheduler) {
      scheduler.stop();
      this.healthCheckSchedulers.delete(serviceName);
    }

    const deleted = this.services.delete(serviceName);
    if (deleted) {
      logger.info(`Service deregistered: ${serviceName}`);
    }
    return deleted;
  }

  discover(serviceName: string, options: DiscoveryOptions = {}): ServiceInstance | undefined {
    const instance = this.services.get(serviceName);

    if (!instance) {
      return undefined;
    }

    if (options.healthyOnly && instance.status !== 'healthy') {
      logger.debug(`Service ${serviceName} found but not healthy (status: ${instance.status})`);
      return undefined;
    }

    return instance;
  }

  discoverAll(options: DiscoveryOptions = {}): ServiceInstance[] {
    const instances = Array.from(this.services.values());

    if (options.healthyOnly) {
      return instances.filter(i => i.status === 'healthy');
    }

    return instances;
  }

  getServiceUrl(serviceName: string): string {
    const instance = this.discover(serviceName);
    if (!instance) {
      throw new DomainError(
        `Service not found: ${serviceName}. Available services: ${this.listServices().join(', ')}`,
        404
      );
    }
    return `http://${instance.host}:${instance.port}`;
  }

  getServicePort(serviceName: string): number {
    const instance = this.discover(serviceName);
    if (!instance) {
      throw new DomainError(
        `Service not found: ${serviceName}. Available services: ${this.listServices().join(', ')}`,
        404
      );
    }
    return instance.port;
  }

  hasService(serviceName: string): boolean {
    return this.services.has(serviceName);
  }

  listServices(): string[] {
    return Array.from(this.services.keys());
  }

  heartbeat(serviceName: string): void {
    const instance = this.services.get(serviceName);
    if (instance) {
      instance.lastHeartbeat = new Date();
      instance.status = 'healthy';
    }
  }

  private startHealthCheck(serviceName: string): void {
    if (this.healthCheckSchedulers.has(serviceName)) {
      return;
    }

    const checkHealth = async () => {
      const instance = this.services.get(serviceName);
      if (!instance) return;

      try {
        const url = `http://${instance.host}:${instance.port}${instance.healthEndpoint}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          instance.lastHeartbeat = new Date();
          instance.status = 'healthy';

          try {
            const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(instance.host);
            if (!isIpAddress) {
              const dns = await import('dns/promises');
              const resolved = await dns.lookup(instance.host);
              logger.debug(`DNS resolved ${instance.host} -> ${resolved.address}`, {
                serviceName: serviceName,
              });
            }
          } catch {
            // DNS resolution failure is non-fatal — service is still healthy
          }
        } else {
          this.checkUnhealthy(instance);
        }
      } catch {
        this.checkUnhealthy(instance);
      }
    };

    const scheduler = createIntervalScheduler({
      name: `health-check-${serviceName}`,
      serviceName: 'service-registry',
      intervalMs: this.healthCheckInterval,
      handler: checkHealth,
      runOnStart: true,
      register: false,
    });
    scheduler.start();
    this.healthCheckSchedulers.set(serviceName, scheduler);
  }

  private checkUnhealthy(instance: ServiceInstance): void {
    const timeSinceHeartbeat = Date.now() - instance.lastHeartbeat.getTime();
    if (timeSinceHeartbeat > this.unhealthyThreshold) {
      if (instance.status !== 'unhealthy') {
        logger.warn(`Service unhealthy: ${instance.name}`, {
          lastHeartbeat: instance.lastHeartbeat,
          timeSinceHeartbeat,
        });
        instance.status = 'unhealthy';
      }
    }
  }

  async waitForService(serviceName: string, options: { timeout?: number; interval?: number } = {}): Promise<boolean> {
    const { timeout = 30000, interval = 1000 } = options;
    const startTime = Date.now();

    logger.info(`Waiting for service: ${serviceName}`, { timeout, interval });

    while (Date.now() - startTime < timeout) {
      const instance = this.discover(serviceName, { healthyOnly: true });
      if (instance) {
        logger.info(`Service ready: ${serviceName}`, { waitTime: Date.now() - startTime });
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    logger.error(`Service did not become ready: ${serviceName}`, { timeout });
    return false;
  }

  shutdown(): void {
    for (const scheduler of this.healthCheckSchedulers.values()) {
      scheduler.stop();
    }
    this.healthCheckSchedulers.clear();
    this.services.clear();
    logger.info('Service registry shutdown');
  }
}

export const ServiceRegistry = new ServiceRegistryImpl();

export function registerService(options: RegistrationOptions): ServiceInstance {
  return ServiceRegistry.register(options);
}

export function discoverService(serviceName: string, options?: DiscoveryOptions): ServiceInstance | undefined {
  return ServiceRegistry.discover(serviceName, options);
}

export function getServiceUrl(serviceName: string): string {
  return ServiceRegistry.getServiceUrl(serviceName);
}

export function getServicePort(serviceName: string): number {
  return ServiceRegistry.getServicePort(serviceName);
}

export function hasService(serviceName: string): boolean {
  return ServiceRegistry.hasService(serviceName);
}

export function listServices(): string[] {
  return ServiceRegistry.listServices();
}

export function waitForService(
  serviceName: string,
  options?: { timeout?: number; interval?: number }
): Promise<boolean> {
  return ServiceRegistry.waitForService(serviceName, options);
}

export function createServiceRegistration(options: RegistrationOptions) {
  return {
    register: () => ServiceRegistry.register(options),
    deregister: () => ServiceRegistry.deregister(options.name),
    heartbeat: () => ServiceRegistry.heartbeat(options.name),
  };
}
