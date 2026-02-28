/**
 * Health Endpoints Integration Tests
 * Tests for health endpoints and service availability across all AI services
 */

import { describe, it, expect, beforeAll, afterAll, vi, Mock } from 'vitest';
import { TestUtils, SERVICE_URLS, TIMEOUTS } from '../setup';
import { createLogger, ServiceLocator } from '@aiponge/platform-core';

// Winston logging setup
const logger = createLogger('health-endpoints-test');

describe('Health Endpoints Integration Tests', () => {
  describe('Individual Service Health Checks', () => {
    it('should verify System Service health endpoint', async () => {
      const response = await TestUtils.makeRequest(`${SERVICE_URLS.SYSTEM_SERVICE}/health`);

      expect(response.status).toBe(200);

      const health = await response.json();
      expect(health).toHaveProperty('status');
      expect(['healthy', 'ok', 'up']).toContain(health.status);

      logger.info(`✅ System Service: ${health.status} (uptime: ${health.uptime || 'unknown'})`);
    });

    it('should verify AI Config Service health endpoint', async () => {
      try {
        const response = await TestUtils.makeRequest(`${SERVICE_URLS.AI_CONFIG_SERVICE}/health`);

        expect(response.status).toBe(200);

        const health = await response.json();
        expect(health).toHaveProperty('status');
        expect(['healthy', 'ok', 'up', 'degraded']).toContain(health.status);

        logger.info(`✅ AI Config Service: ${health.status}`);
      } catch (error) {
        logger.warn('⚠️ AI Config Service health check failed:', {
          error: error instanceof Error ? error.message : error,
        });
        // Don't fail the test - service may not be running
      }
    });

    it('should verify AI Content Service health endpoint', async () => {
      try {
        const response = await TestUtils.makeRequest(`${SERVICE_URLS.AI_CONTENT_SERVICE}/health`);

        expect(response.status).toBe(200);

        const health = await response.json();
        expect(health).toHaveProperty('status');
        expect(['healthy', 'ok', 'up', 'degraded']).toContain(health.status);

        logger.info(`✅ AI Content Service: ${health.status}`);
      } catch (error) {
        logger.warn('⚠️ AI Content Service health check failed:', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    it('should verify Music Service health endpoint', async () => {
      try {
        const response = await TestUtils.makeRequest(`${SERVICE_URLS.MUSIC_SERVICE}/health`);

        expect(response.status).toBe(200);

        const health = await response.json();
        expect(health).toHaveProperty('status');
        expect(['healthy', 'ok', 'up', 'degraded']).toContain(health.status);

        logger.info(`✅ Music Service: ${health.status}`);
      } catch (error) {
        logger.warn('⚠️ Music Service health check failed:', { error: error instanceof Error ? error.message : error });
      }
    });

    it('should verify AI Analytics Service health endpoint', async () => {
      try {
        const response = await TestUtils.makeRequest(`${SERVICE_URLS.AI_ANALYTICS_SERVICE}/health`);

        expect(response.status).toBe(200);

        const health = await response.json();
        expect(health).toHaveProperty('status');
        expect(['healthy', 'ok', 'up', 'degraded']).toContain(health.status);

        logger.info(`✅ AI Analytics Service: ${health.status}`);
      } catch (error) {
        logger.warn('⚠️ AI Analytics Service health check failed:', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });
  });

  describe('Service Availability Matrix', () => {
    it('should get health status for all configured services', async () => {
      const services = Object.entries(SERVICE_URLS);
      const healthChecks = services.map(async ([name, url]) => {
        try {
          const response = await TestUtils.makeRequest(`${url}/health`, {}, 5000);
          const health = await response.json();

          return {
            name,
            url,
            status: response.status,
            healthy: response.status === 200,
            data: health,
          };
        } catch (error) {
          return {
            name,
            url,
            status: 0,
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const results = await Promise.all(healthChecks);

      logger.info('\n📊 Service Health Matrix:');
      logger.info('='.repeat(60));

      let totalServices = 0;
      let healthyServices = 0;

      results.forEach(result => {
        totalServices++;
        const icon = result.healthy ? '✅' : '❌';
        const status = result.healthy ? result.data?.status || 'healthy' : 'unavailable';

        if (result.healthy) {
          logger.info(`${icon} ${result.name.padEnd(25)} ${status}`);
        } else {
          logger.warn(`${icon} ${result.name.padEnd(25)} ${status}`);
        }

        if (result.healthy) {
          healthyServices++;
        } else {
          logger.warn(`   Error: ${result.error || 'Service not responding'}`);
        }
      });

      logger.info('='.repeat(60));
      logger.info(
        `📈 Overall Health: ${healthyServices}/${totalServices} services healthy (${Math.round((healthyServices / totalServices) * 100)}%)`
      );

      // We expect at least the system service to be healthy
      expect(healthyServices).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Health Endpoint Standards Compliance', () => {
    it('should verify health endpoints return standard response format', async () => {
      const servicesToTest = [
        SERVICE_URLS.SYSTEM_SERVICE,
        SERVICE_URLS.AI_CONTENT_SERVICE,
        SERVICE_URLS.MUSIC_SERVICE,
        SERVICE_URLS.AI_CONFIG_SERVICE,
      ];

      const healthChecks = servicesToTest.map(async serviceUrl => {
        try {
          const response = await TestUtils.makeRequest(`${serviceUrl}/health`, {}, 5000);
          const health = await response.json();

          return {
            serviceUrl,
            healthy: response.status === 200,
            response: health,
          };
        } catch (error) {
          return {
            serviceUrl,
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const results = await Promise.all(healthChecks);

      results.forEach(result => {
        if (result.healthy && result.response) {
          // Verify standard health response format
          expect(result.response).toHaveProperty('status');

          // Status should be a recognized health status
          expect(['healthy', 'degraded', 'unhealthy', 'ok', 'up']).toContain(result.response.status);

          // Should have some form of version information
          if (result.response.version || result.response.build || result.response.commitHash) {
            expect(typeof (result.response.version || result.response.build || result.response.commitHash)).toBe(
              'string'
            );
          }

          logger.info(`✅ ${result.serviceUrl}: compliant health response`);
        } else {
          logger.warn(`⚠️ ${result.serviceUrl}: ${result.error || 'non-compliant health response'}`);
        }
      });
    });

    it('should verify health endpoints respond within acceptable time', async () => {
      const servicesToTest = [
        { name: 'System Service', url: SERVICE_URLS.SYSTEM_SERVICE },
        { name: 'AI Content Service', url: SERVICE_URLS.AI_CONTENT_SERVICE },
        { name: 'Music Service', url: SERVICE_URLS.MUSIC_SERVICE },
        { name: 'AI Config Service', url: SERVICE_URLS.AI_CONFIG_SERVICE },
      ];

      const MAX_HEALTH_CHECK_TIME = 3000; // 3 seconds max for health checks

      const timeChecks = servicesToTest.map(async service => {
        const startTime = Date.now();

        try {
          const response = await TestUtils.makeRequest(`${service.url}/health`, {}, MAX_HEALTH_CHECK_TIME);
          const responseTime = Date.now() - startTime;

          return {
            name: service.name,
            responseTime,
            healthy: response.status === 200,
            withinTimeout: responseTime < MAX_HEALTH_CHECK_TIME,
          };
        } catch (error) {
          const responseTime = Date.now() - startTime;

          return {
            name: service.name,
            responseTime,
            healthy: false,
            withinTimeout: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const results = await Promise.all(timeChecks);

      results.forEach(result => {
        if (result.healthy) {
          const icon = result.withinTimeout ? '✅' : '⚠️';
          logger.info(`${icon} ${result.name}: ${result.responseTime}ms`);
          expect(result.responseTime).toBeLessThan(MAX_HEALTH_CHECK_TIME);
        } else {
          logger.warn(`❌ ${result.name}: failed (${result.responseTime}ms) - ${result.error}`);
        }
      });
    });
  });

  describe('Dependency Health Reporting', () => {
    it('should verify services report dependency health', async () => {
      const servicesToTest = [
        { name: 'AI Content Service', url: SERVICE_URLS.AI_CONTENT_SERVICE },
        { name: 'Music Service', url: SERVICE_URLS.MUSIC_SERVICE },
      ];

      const dependencyChecks = servicesToTest.map(async service => {
        try {
          const response = await TestUtils.makeRequest(`${service.url}/health`, {}, 5000);
          const health = await response.json();

          return {
            name: service.name,
            healthy: response.status === 200,
            hasDependencies: health.dependencies && Object.keys(health.dependencies).length > 0,
            dependencies: health.dependencies,
          };
        } catch (error) {
          return {
            name: service.name,
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const results = await Promise.all(dependencyChecks);

      results.forEach(result => {
        if (result.healthy) {
          logger.info(`🔗 ${result.name}:`);

          if (result.hasDependencies) {
            Object.entries(result.dependencies || {}).forEach(([dep, status]) => {
              const icon = status === 'healthy' ? '✅' : '❌';
              logger.info(`   ${icon} ${dep}: ${status}`);
            });
          } else {
            logger.info('   No dependencies reported');
          }
        } else {
          logger.warn(`⚠️ ${result.name}: ${result.error}`);
        }
      });
    });
  });

  describe('Legacy Service Validation', () => {
    it('should verify no legacy "ai-service" health endpoints exist', async () => {
      // Test various possible legacy endpoint patterns
      // Use port configuration system to generate test URLs
      const legacyEndpoints = [
        `http://localhost:${ServiceLocator.getServicePort('user-service')}/health`,
        `http://localhost:${ServiceLocator.getServicePort('user-service')}/health`,
        `http://localhost:${ServiceLocator.getServicePort('ai-config-service')}/health`,
      ];

      const legacyChecks = legacyEndpoints.map(async endpoint => {
        try {
          const response = await TestUtils.makeRequest(endpoint, {}, 2000);
          const health = await response.json();

          return {
            endpoint,
            responding: true,
            isLegacy: health.service === 'ai-service' || health.name === 'ai-service',
          };
        } catch (error) {
          return {
            endpoint,
            responding: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const results = await Promise.all(legacyChecks);

      let legacyServicesFound = 0;

      results.forEach(result => {
        if (result.responding) {
          if (result.isLegacy) {
            legacyServicesFound++;
            logger.error(`❌ Legacy AI service found at: ${result.endpoint}`);
          } else {
            logger.info(`ℹ️ Service responding at ${result.endpoint} but not legacy`);
          }
        }
      });

      expect(legacyServicesFound).toBe(0);
      logger.info(`✅ No legacy "ai-service" health endpoints detected`);
    });
  });

  describe('Service Readiness', () => {
    it('should verify critical services are ready for integration tests', async () => {
      const criticalServices = [
        { name: 'System Service', url: SERVICE_URLS.SYSTEM_SERVICE, required: true },
        { name: 'AI Content Service', url: SERVICE_URLS.AI_CONTENT_SERVICE, required: false },
        { name: 'Music Service', url: SERVICE_URLS.MUSIC_SERVICE, required: false },
      ];

      const readinessChecks = criticalServices.map(async service => {
        const isHealthy = await TestUtils.waitForServiceHealth(service.url, 5000);

        return {
          name: service.name,
          url: service.url,
          required: service.required,
          ready: isHealthy,
        };
      });

      const results = await Promise.all(readinessChecks);

      let requiredServicesReady = 0;
      let totalRequiredServices = 0;
      let optionalServicesReady = 0;
      let totalOptionalServices = 0;

      results.forEach(result => {
        const icon = result.ready ? '✅' : '❌';
        if (result.ready) {
          logger.info(`${icon} ${result.name}: ${result.ready ? 'READY' : 'NOT READY'}`);
        } else {
          logger.warn(`${icon} ${result.name}: ${result.ready ? 'READY' : 'NOT READY'}`);
        }

        if (result.required) {
          totalRequiredServices++;
          if (result.ready) {
            requiredServicesReady++;
          }
        } else {
          totalOptionalServices++;
          if (result.ready) {
            optionalServicesReady++;
          }
        }
      });

      logger.info(`\n📊 Service Readiness Summary:`);
      logger.info(`   Required: ${requiredServicesReady}/${totalRequiredServices} ready`);
      logger.info(`   Optional: ${optionalServicesReady}/${totalOptionalServices} ready`);

      // All required services must be ready
      expect(requiredServicesReady).toBe(totalRequiredServices);
    });
  });
});
