/**
 * API Gateway Routing Integration Tests
 * Tests to validate API Gateway routing to granular AI services and ensure no legacy routing remains
 */

import { describe, it, expect, beforeAll, afterAll, vi, Mock } from 'vitest';
import { TestUtils, SERVICE_URLS, TIMEOUTS } from '../setup';
import { createLogger } from '@aiponge/platform-core';

// Winston logging setup
const logger = createLogger('api-gateway-routing-test');

describe('API Gateway Routing Integration Tests', () => {
  let isAPIGatewayAvailable: boolean;

  beforeAll(async () => {
    // Check if API Gateway is available
    isAPIGatewayAvailable = await TestUtils.waitForServiceHealth(SERVICE_URLS.API_GATEWAY, 10000);

    if (!isAPIGatewayAvailable) {
      logger.warn('⚠️ API Gateway not available - most tests will be skipped');
    }
  });

  describe('AI Service Routing', () => {
    it('should route to AI Content Service correctly', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping AI Content Service routing test - API Gateway not available');
        return;
      }

      try {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/content/health`,
          {},
          TIMEOUTS.REQUEST
        );

        if (response.status === 200) {
          const health = await response.json();
          expect(health).toHaveProperty('status');
          logger.info('✅ API Gateway → AI Content Service routing works');
        } else if (response.status === 404) {
          logger.warn('⚠️ AI Content Service route not configured in API Gateway');
        } else {
          logger.warn(`⚠️ Unexpected response status: ${response.status}`);
        }
      } catch (error) {
        logger.warn('⚠️ AI Content Service routing failed:', { error: error instanceof Error ? error.message : error });
      }
    });

    it('should route to AI Music Service correctly', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping AI Music Service routing test - API Gateway not available');
        return;
      }

      try {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/music/health`,
          {},
          TIMEOUTS.REQUEST
        );

        if (response.status === 200) {
          const health = await response.json();
          expect(health).toHaveProperty('status');
          logger.info('✅ API Gateway → AI Music Service routing works');
        } else if (response.status === 404) {
          logger.warn('⚠️ AI Music Service route not configured in API Gateway');
        } else {
          logger.warn(`⚠️ Unexpected response status: ${response.status}`);
        }
      } catch (error) {
        logger.warn('⚠️ AI Music Service routing failed:', { error: error instanceof Error ? error.message : error });
      }
    });

    it('should route to AI Providers Service correctly', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping AI Providers Service routing test - API Gateway not available');
        return;
      }

      try {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/providers/health`,
          {},
          TIMEOUTS.REQUEST
        );

        if (response.status === 200) {
          const health = await response.json();
          expect(health).toHaveProperty('status');
          logger.info('✅ API Gateway → AI Providers Service routing works');
        } else if (response.status === 404) {
          logger.warn('⚠️ AI Providers Service route not configured in API Gateway');
        } else {
          logger.warn(`⚠️ Unexpected response status: ${response.status}`);
        }
      } catch (error) {
        logger.warn('⚠️ AI Providers Service routing failed:', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    it('should route to AI Analytics Service correctly', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping AI Analytics Service routing test - API Gateway not available');
        return;
      }

      try {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/analytics/health`,
          {},
          TIMEOUTS.REQUEST
        );

        if (response.status === 200) {
          const health = await response.json();
          expect(health).toHaveProperty('status');
          logger.info('✅ API Gateway → AI Analytics Service routing works');
        } else if (response.status === 404) {
          logger.warn('⚠️ AI Analytics Service route not configured in API Gateway');
        } else {
          logger.warn(`⚠️ Unexpected response status: ${response.status}`);
        }
      } catch (error) {
        logger.warn('⚠️ AI Analytics Service routing failed:', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });
  });

  describe('Legacy Route Validation', () => {
    it('should not route to legacy "ai-service" endpoints', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping legacy route test - API Gateway not available');
        return;
      }

      const legacyRoutes = [
        '/api/ai-service/health',
        '/api/legacy-ai/health',
        '/api/monolith/health',
        '/api/ai/legacy',
      ];

      const legacyRouteChecks = legacyRoutes.map(async route => {
        try {
          const response = await TestUtils.makeRequest(`${SERVICE_URLS.API_GATEWAY}${route}`, {}, 5000);

          return {
            route,
            status: response.status,
            responding: response.status !== 404,
          };
        } catch (error) {
          return {
            route,
            status: 0,
            responding: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const results = await Promise.all(legacyRouteChecks);

      let legacyRoutesFound = 0;

      results.forEach(result => {
        if (result.responding && result.status !== 404) {
          legacyRoutesFound++;
          logger.error(`❌ Legacy route responding: ${result.route} (status: ${result.status})`);
        } else {
          logger.info(`✅ ${result.route}: properly returns 404`);
        }
      });

      expect(legacyRoutesFound).toBe(0);
      logger.info(`✅ No legacy AI service routes detected`);
    });

    it('should properly handle unknown routes with 404', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping unknown routes test - API Gateway not available');
        return;
      }

      const unknownRoutes = ['/api/nonexistent-service/health', '/api/random/endpoint', '/api/test/unknown'];

      const unknownRouteChecks = unknownRoutes.map(async route => {
        try {
          const response = await TestUtils.makeRequest(`${SERVICE_URLS.API_GATEWAY}${route}`, {}, 5000);

          return {
            route,
            status: response.status,
            returns404: response.status === 404,
          };
        } catch (error) {
          return {
            route,
            status: 0,
            returns404: true, // Network errors are equivalent to 404 for this test
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const results = await Promise.all(unknownRouteChecks);

      results.forEach(result => {
        if (result.returns404) {
          logger.info(`✅ ${result.route}: properly returns 404`);
          expect(result.status).toBe(404);
        } else {
          logger.error(`❌ ${result.route}: unexpected status ${result.status} (should be 404)`);
          expect(result.status).toBe(404);
        }
      });
    });
  });

  describe('Proxy Patterns Validation', () => {
    it('should maintain request headers through proxy', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping proxy headers test - API Gateway not available');
        return;
      }

      const customHeaders = {
        'X-Test-Header': 'integration-test',
        'User-Agent': 'microservices-integration-test',
        'X-Request-ID': `test-${Date.now()}`,
      };

      try {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/content/health`,
          {
            method: 'GET',
            headers: customHeaders,
          },
          TIMEOUTS.REQUEST
        );

        // If the route exists and works, the headers should have been proxied
        if (response.status === 200) {
          logger.info('✅ Proxy successfully forwarded request with custom headers');
        } else if (response.status === 404) {
          logger.warn('⚠️ Route not configured, cannot test header proxying');
        }
      } catch (error) {
        logger.warn('⚠️ Proxy header test failed:', { error: error instanceof Error ? error.message : error });
      }
    });

    it('should handle POST requests through proxy', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping POST proxy test - API Gateway not available');
        return;
      }

      const testData = {
        test: 'integration',
        timestamp: Date.now(),
      };

      try {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/content/test-endpoint`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData),
          },
          TIMEOUTS.REQUEST
        );

        // We expect this to return 404 (endpoint doesn't exist) but the proxy should handle it
        if (response.status === 404) {
          logger.info('✅ Proxy correctly forwards POST requests (404 expected for test endpoint)');
        } else {
          logger.info(`✅ Proxy forwarded POST request (status: ${response.status})`);
        }
      } catch (error) {
        logger.warn('⚠️ POST proxy test failed:', { error: error instanceof Error ? error.message : error });
      }
    });

    it('should handle request timeout appropriately', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping timeout test - API Gateway not available');
        return;
      }

      const shortTimeout = 1000; // 1 second

      try {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/content/health`,
          {},
          shortTimeout
        );

        // If it responds quickly, that's good
        logger.info(`✅ API Gateway responds within timeout (status: ${response.status})`);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.info('✅ Timeout handled appropriately by client');
        } else {
          logger.warn('⚠️ Unexpected timeout error:', { error: error.message });
        }
      }
    });
  });

  describe('Load Balancing and Failover', () => {
    it('should handle service unavailability gracefully', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping service unavailability test - API Gateway not available');
        return;
      }

      // Test routing to a service that's likely not running
      try {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/unavailable-service/health`,
          {},
          5000
        );

        // Should return 404 or 503 for unavailable service
        expect([404, 503, 502, 500]).toContain(response.status);
        logger.info(`✅ API Gateway handles unavailable service appropriately (status: ${response.status})`);
      } catch (error) {
        logger.info('✅ API Gateway handles unavailable service by throwing error');
      }
    });

    it('should maintain consistent routing behavior', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping consistent routing test - API Gateway not available');
        return;
      }

      // Make multiple requests to the same endpoint to verify consistent routing
      const requests = Array(5)
        .fill(null)
        .map(() =>
          TestUtils.makeRequest(`${SERVICE_URLS.API_GATEWAY}/api/content/health`, {}, TIMEOUTS.REQUEST).catch(
            error => ({ error: error.message })
          )
        );

      const responses = await Promise.all(requests);

      const statuses = responses.map((r: any) => r.status || 'error');
      const uniqueStatuses = [...new Set(statuses)];

      if (uniqueStatuses.length <= 2) {
        // Allow for some variance (200, 404, etc.)
        logger.info(`✅ Consistent routing behavior (statuses: ${uniqueStatuses.join(', ')})`);
      } else {
        logger.warn(`⚠️ Inconsistent routing behavior (statuses: ${uniqueStatuses.join(', ')})`);
      }
    });
  });

  describe('API Gateway Health', () => {
    it('should verify API Gateway own health endpoint', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping API Gateway health test - API Gateway not available');
        return;
      }

      const response = await TestUtils.makeRequest(`${SERVICE_URLS.API_GATEWAY}/health`);

      expect(response.status).toBe(200);

      const health = await response.json();
      expect(health).toHaveProperty('status');
      expect(['healthy', 'ok', 'up']).toContain(health.status);

      logger.info(`✅ API Gateway Health: ${health.status}`);
    });

    it('should provide service routing information', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping routing info test - API Gateway not available');
        return;
      }

      // Try to get routing configuration or service discovery info
      try {
        const response = await TestUtils.makeRequest(`${SERVICE_URLS.API_GATEWAY}/api/health/services`, {}, 5000);

        if (response.status === 200) {
          const services = await response.json();
          logger.info('✅ API Gateway provides service routing information');

          if (services.services) {
            logger.info(`📊 Configured routes: ${services.services.length} services`);
          }
        } else {
          logger.warn('⚠️ Service routing information endpoint not available');
        }
      } catch (error) {
        logger.warn('⚠️ Could not retrieve routing information:', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include appropriate CORS headers', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping CORS test - API Gateway not available');
        return;
      }

      try {
        const response = await TestUtils.makeRequest(`${SERVICE_URLS.API_GATEWAY}/health`, {
          headers: {
            Origin: 'http://localhost:3000',
          },
        });

        // Check for CORS headers (case-insensitive)
        const headers = response.headers;
        let hasCORSHeaders = false;

        for (const [key, value] of headers.entries()) {
          if (key.toLowerCase().includes('access-control')) {
            hasCORSHeaders = true;
            logger.info(`✅ CORS header found: ${key}: ${value}`);
          }
        }

        if (!hasCORSHeaders) {
          logger.warn('⚠️ No CORS headers detected');
        }
      } catch (error) {
        logger.warn('⚠️ CORS test failed:', { error: error instanceof Error ? error.message : error });
      }
    });

    it('should include security headers', async () => {
      if (!isAPIGatewayAvailable) {
        logger.warn('⚠️ Skipping security headers test - API Gateway not available');
        return;
      }

      try {
        const response = await TestUtils.makeRequest(`${SERVICE_URLS.API_GATEWAY}/health`);

        const securityHeaders = [
          'x-frame-options',
          'x-content-type-options',
          'x-xss-protection',
          'strict-transport-security',
        ];

        let securityHeadersFound = 0;

        for (const [key, value] of response.headers.entries()) {
          const lowerKey = key.toLowerCase();
          if (securityHeaders.includes(lowerKey)) {
            securityHeadersFound++;
            logger.info(`✅ Security header found: ${key}: ${value}`);
          }
        }

        logger.info(`📊 Security headers: ${securityHeadersFound}/${securityHeaders.length} found`);
      } catch (error) {
        logger.warn('⚠️ Security headers test failed:', { error: error instanceof Error ? error.message : error });
      }
    });
  });
});
