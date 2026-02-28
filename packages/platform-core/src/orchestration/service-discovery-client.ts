/**
 * Service Discovery Client
 *
 * Client for service registration and discovery
 * Consolidates functionality previously in packages/shared/backend
 */

import { getLogger } from '../logging/logger.js';
import { getServicePort } from '../config/service-config.js';

const logger = getLogger('service-discovery-client');

/**
 * Service registration information
 */
export interface ServiceRegistration {
  name: string;
  host: string;
  port: number;
  healthCheckPath?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Service discovery client interface
 */
export interface IServiceDiscoveryClient {
  register(registration: ServiceRegistration): Promise<void>;
  unregister(serviceName: string): Promise<void>;
  discover(serviceName: string): Promise<ServiceRegistration | null>;
  listServices(): Promise<ServiceRegistration[]>;
}

/**
 * Service Registration Client implementation
 */
export class ServiceRegistrationClient implements IServiceDiscoveryClient {
  private registrations = new Map<string, ServiceRegistration>();

  async register(registration: ServiceRegistration): Promise<void> {
    try {
      this.registrations.set(registration.name, registration);
      logger.info('Registered service: {} at {}:{}', {
        data0: registration.name,
        data1: registration.host,
        data2: registration.port,
      });
    } catch (error) {
      logger.error('Failed to register service {}', { data0: registration.name, error });
      throw error;
    }
  }

  async unregister(serviceName: string): Promise<void> {
    try {
      this.registrations.delete(serviceName);
      logger.info('Unregistered service: {}', { data0: serviceName });
    } catch (error) {
      logger.error('Failed to unregister service {}', { data0: serviceName, error });
      throw error;
    }
  }

  async discover(serviceName: string): Promise<ServiceRegistration | null> {
    try {
      const registration = this.registrations.get(serviceName);
      if (registration) {
        logger.debug('Discovered service: {} at {}:{}', {
          data0: serviceName,
          data1: registration.host,
          data2: registration.port,
        });
        return registration;
      }

      logger.debug('Service not found: {}', { data0: serviceName });
      return null;
    } catch (error) {
      logger.error('Failed to discover service {}', { data0: serviceName, error });
      throw error;
    }
  }

  async listServices(): Promise<ServiceRegistration[]> {
    try {
      const services = Array.from(this.registrations.values());
      logger.debug('Listed {} registered services', { data0: services.length });
      return services;
    } catch (error) {
      logger.error('Failed to list services', { error });
      throw error;
    }
  }
}

/**
 * Create a service registration with sensible defaults
 */
export function createServiceRegistration(
  serviceName: string,
  port?: number,
  host?: string,
  options?: {
    healthCheckPath?: string;
    metadata?: Record<string, unknown>;
  }
): ServiceRegistration {
  return {
    name: serviceName,
    host: host || process.env.SERVICE_HOST || 'localhost',
    port: port || getServicePort(serviceName),
    healthCheckPath: options?.healthCheckPath || '/health',
    metadata: options?.metadata || {},
  };
}

/**
 * Default service registration client instance
 */
export const serviceRegistrationClient = new ServiceRegistrationClient();
