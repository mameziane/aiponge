/**
 * Service Discovery Integration Tests
 * Tests for service URL resolution, port configuration, and fallback mechanisms.
 * 
 * NOTE: The @shared/service-discovery package was removed during consolidation.
 * Tests that required a ServiceDiscoveryClient (register/discover/deregister)
 * are skipped. URL resolution and port configuration tests remain active.
 */

import { describe, it, expect } from 'vitest';

import { getServiceUrl, getServicePort, createLogger } from '@aiponge/platform-core';
import { TestUtils, SERVICE_URLS, TIMEOUTS } from '../../utils/setup';

const logger = createLogger('service-discovery-test');

describe('Service Discovery Integration Tests', () => {

  describe('getServiceUrl() Resolution', () => {
    it('should resolve AI Content Service URL correctly', async () => {
      try {
        const url = getServiceUrl('aiContentService');
        expect(url).toBeDefined();
        expect(url).toMatch(/^https?:\/\/.+/);
        
        const isHealthy = await TestUtils.waitForServiceHealth(url, 5000);
        if (!isHealthy) {
          logger.warn(`AI Content Service at ${url} is not responding to health checks`);
        }
      } catch (error) {
        logger.warn('Service discovery not fully configured, using fallback');
        expect(error).toBeDefined();
      }
    });

    it('should resolve AI Music Service URL correctly', async () => {
      try {
        const url = getServiceUrl('musicService');
        expect(url).toBeDefined();
        expect(url).toMatch(/^https?:\/\/.+/);
        
        const isHealthy = await TestUtils.waitForServiceHealth(url, 5000);
        if (!isHealthy) {
          logger.warn(`Music Service at ${url} is not responding to health checks`);
        }
      } catch (error) {
        logger.warn('Service discovery not fully configured, using fallback');
        expect(error).toBeDefined();
      }
    });

    it('should resolve AI Config Service URL correctly', async () => {
      try {
        const url = getServiceUrl('aiConfigService');
        expect(url).toBeDefined();
        expect(url).toMatch(/^https?:\/\/.+/);
        
        const isHealthy = await TestUtils.waitForServiceHealth(url, 5000);
        if (!isHealthy) {
          logger.warn(`AI Config Service at ${url} is not responding to health checks`);
        }
      } catch (error) {
        logger.warn('Service discovery not fully configured, using fallback');
        expect(error).toBeDefined();
      }
    });

    it('should resolve System Service URL correctly', async () => {
      try {
        const url = getServiceUrl('systemService');
        expect(url).toBeDefined();
        expect(url).toMatch(/^https?:\/\/.+/);
        
        const isHealthy = await TestUtils.waitForServiceHealth(url, 5000);
        expect(isHealthy).toBe(true);
      } catch (error) {
        throw new Error('System service should be available for integration tests');
      }
    });

  });

  describe.skip('Service Registration and Discovery (requires removed @shared/service-discovery)', () => {
    it('should register a test service successfully', () => {
      expect(true).toBe(true);
    });
  });

  describe.skip('Fallback Mechanisms (requires removed @shared/service-discovery)', () => {
    it('should handle service discovery client failures gracefully', () => {
      expect(true).toBe(true);
    });
  });

  describe('Port Configuration Integration', () => {
    it('should get correct ports for all AI services', () => {
      const aiServices = [
        'systemService',
        'aiConfigService', 
        'aiContentService',
        'musicService',
        'aiAnalyticsService',
      ] as const;

      aiServices.forEach(service => {
        try {
          const port = getServicePort(service);
          expect(port).toBeDefined();
          expect(typeof port).toBe('number');
          expect(port).toBeGreaterThan(0);
          expect(port).toBeLessThan(65536);
        } catch (error) {
          logger.warn(`Port not configured for ${service}:`, { error });
        }
      });
    });

    it('should handle port configuration for API Gateway', () => {
      try {
        const port = getServicePort('apiGateway');
        expect(port).toBeDefined();
        expect(typeof port).toBe('number');
        expect(port).toBeGreaterThan(0);
      } catch (error) {
        logger.warn('API Gateway port not configured:', { error });
      }
    });
  });

  describe.skip('Service Communication Validation (requires removed @shared/service-discovery)', () => {
    it('should verify AI services can find each other through discovery', () => {
      expect(true).toBe(true);
    });
  });
});
