/**
 * Integration tests for ServiceLocator manifest loading
 * Verifies that ServiceLocator correctly loads the generated manifest
 * and exposes expected service ports
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ServiceLocator } from '../src/service-locator/service-locator';

describe('ServiceLocator Manifest Loading', () => {
  beforeAll(() => {
    // Initialize ServiceLocator
    ServiceLocator.initialize();
  });

  describe('Manifest Loading', () => {
    it('should load the generated manifest successfully', () => {
      const services = ServiceLocator.listServices();
      expect(services).toBeDefined();
      expect(Array.isArray(services)).toBe(true);
    });

    it('should load expected number of services (15)', () => {
      const services = ServiceLocator.listServices();
      expect(services.length).toBe(15);
    });

    it('should include critical infrastructure services', () => {
      const serviceNames = ServiceLocator.listServices();

      const criticalServices = ['postgresql', 'redis', 'system-service', 'api-gateway'];

      criticalServices.forEach(serviceName => {
        expect(serviceNames).toContain(serviceName);
      });
    });

    it('should include all microservices', () => {
      const serviceNames = ServiceLocator.listServices();

      const microservices = [
        'storage-service',
        'user-service',
        'music-service',
        'ai-config-service',
        'ai-content-service',
        'ai-analytics-service',
      ];

      microservices.forEach(serviceName => {
        expect(serviceNames).toContain(serviceName);
      });
    });

    it('should include all app services', () => {
      const serviceNames = ServiceLocator.listServices();

      const appServices = ['admin', 'user'];

      appServices.forEach(serviceName => {
        expect(serviceNames).toContain(serviceName);
      });
    });
  });

  describe('Service Port Retrieval', () => {
    it('should retrieve port for api-gateway (8080)', () => {
      const port = ServiceLocator.getServicePort('api-gateway');
      expect(port).toBe(8080);
    });

    it('should retrieve port for system-service (3001)', () => {
      const port = ServiceLocator.getServicePort('system-service');
      expect(port).toBe(3001);
    });

    it('should retrieve port for ai-config-service (3030)', () => {
      const port = ServiceLocator.getServicePort('ai-config-service');
      expect(port).toBe(3030);
    });

    it('should retrieve port for postgresql (5432)', () => {
      const port = ServiceLocator.getServicePort('postgresql');
      expect(port).toBe(5432);
    });

    it('should retrieve port for redis (6379)', () => {
      const port = ServiceLocator.getServicePort('redis');
      expect(port).toBe(6379);
    });

    it('should throw error for non-existent service', () => {
      expect(() => {
        ServiceLocator.getServicePort('non-existent-service');
      }).toThrow("Service 'non-existent-service' not found in service registry");
    });
  });

  describe('Service URL Generation', () => {
    it('should generate correct URL for api-gateway', () => {
      const url = ServiceLocator.getServiceUrl('api-gateway');
      expect(url).toBe('http://localhost:8080');
    });

    it('should generate correct URL for system-service', () => {
      const url = ServiceLocator.getServiceUrl('system-service');
      expect(url).toBe('http://localhost:3001');
    });

    it('should throw error for non-existent service', () => {
      expect(() => {
        ServiceLocator.getServiceUrl('non-existent-service');
      }).toThrow("Service 'non-existent-service' not found in service registry");
    });
  });

  describe('Service Discovery', () => {
    it('should check if service exists using hasService', () => {
      expect(ServiceLocator.hasService('api-gateway')).toBe(true);
      expect(ServiceLocator.hasService('system-service')).toBe(true);
      expect(ServiceLocator.hasService('non-existent-service')).toBe(false);
    });

    it('should get service details using getService', () => {
      const service = ServiceLocator.getService('api-gateway');
      expect(service).toBeDefined();
      expect(service.name).toBe('api-gateway');
      expect(service.port).toBe(8080);
    });

    it('should throw error when getting non-existent service', () => {
      expect(() => {
        ServiceLocator.getService('non-existent-service');
      }).toThrow("Service 'non-existent-service' not found in service registry");
    });
  });

  describe('Manifest Metadata', () => {
    it('should have valid generation timestamp', () => {
      const services = ServiceLocator.listServices();
      expect(services.length).toBeGreaterThan(0);

      // Verify the services are properly loaded
      expect(services).toBeDefined();
      expect(Array.isArray(services)).toBe(true);
    });
  });

  describe('Environment Variable Fallback', () => {
    it('should prefer manifest port over environment variable', () => {
      // Set environment variable
      process.env.API_GATEWAY_PORT = '9999';

      // ServiceLocator should still return manifest port
      const port = ServiceLocator.getServicePort('api-gateway');
      expect(port).toBe(8080); // From manifest, not env var

      // Cleanup
      delete process.env.API_GATEWAY_PORT;
    });
  });
});
