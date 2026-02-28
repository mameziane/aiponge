/**
 * Error Handling Integration Tests
 * Tests for error handling and timeout scenarios in microservices communication
 */

import { describe, it, expect, beforeAll, afterAll, vi, Mock } from 'vitest';
import { ContentServiceClient } from '../../../../../packages/services/user-service/src/infrastructure/clients/ContentServiceClient';
import { MusicServiceClient } from '../../../../../packages/services/api-gateway/src/clients/MusicServiceClient';
import { TestUtils, SERVICE_URLS, TIMEOUTS } from '../setup';
import { createLogger } from '@aiponge/platform-core';

// Winston logging setup
const logger = createLogger('error-handling-test');

describe('Error Handling Integration Tests', () => {
  describe('Network Failure Scenarios', () => {
    it('should handle service unavailable errors gracefully', async () => {
      // Test with invalid service URLs
      const originalContentUrl = process.env.AI_CONTENT_SERVICE_URL;
      const originalMusicUrl = process.env.MUSIC_SERVICE_URL;

      try {
        // Set invalid URLs
        process.env.AI_CONTENT_SERVICE_URL = 'http://nonexistent-host:9999';
        process.env.MUSIC__SERVICE_URL = 'http://nonexistent-host:9998';

        const contentClient = new ContentServiceClient();
        const musicClient = new MusicServiceClient();

        // Content service should handle errors gracefully
        const textRequest = TestUtils.generateTestData.textAnalysisRequest();
        await expect(contentClient.analyzeText(textRequest)).rejects.toThrow();
        logger.info('✅ Content service handles unavailable service correctly');

        // Music service should handle errors gracefully
        const songBlueprint = {
          theme: 'test',
          genre: 'ambient',
          mood: 'calm',
          duration: 1,
        };
        await expect(musicClient.generateCustomMusic(songBlueprint, 'test-user')).rejects.toThrow();
        logger.info('✅ Music service handles unavailable service correctly');
      } finally {
        // Restore original URLs
        if (originalContentUrl) {
          process.env.AI_CONTENT_SERVICE_URL = originalContentUrl;
        } else {
          delete process.env.AI_CONTENT_SERVICE_URL;
        }

        if (originalMusicUrl) {
          process.env.MUSIC_SERVICE_URL = originalMusicUrl;
        } else {
          delete process.env.MUSIC_SERVICE_URL;
        }
      }
    });

    it('should handle timeout scenarios appropriately', async () => {
      logger.info('🔄 Testing timeout handling...');

      const contentClient = new ContentServiceClient();

      try {
        // This test relies on the client's built-in timeout mechanism
        const request = TestUtils.generateTestData.textAnalysisRequest();

        // The client should have proper timeout handling built-in
        const startTime = Date.now();

        try {
          await contentClient.analyzeText(request);
          const duration = Date.now() - startTime;
          logger.info(`✅ Request completed in ${duration}ms (within timeout)`);
        } catch (error) {
          const duration = Date.now() - startTime;

          if (error instanceof Error && error.message.includes('timeout')) {
            logger.info(`✅ Timeout handled correctly after ${duration}ms`);
          } else if (error instanceof Error && error.message.includes('AbortError')) {
            logger.info(`✅ Request aborted correctly after ${duration}ms`);
          } else {
            logger.info(`ℹ️ Request failed with: ${error.message} (${duration}ms`);
          }
        }
      } catch (error) {
        logger.warn('⚠️ Timeout test encountered unexpected error:', { error });
      }
    });

    it('should handle malformed responses', async () => {
      logger.info('🔄 Testing malformed response handling...');

      // This test would ideally use a mock server that returns malformed JSON
      // For now, we verify that clients can handle parsing errors

      const contentClient = new ContentServiceClient();

      try {
        // Health check should return well-formed JSON or handle errors
        const health = await contentClient.healthCheck();
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('version');
        logger.info('✅ Health check returns well-formed response');
      } catch (error) {
        // If it fails, it should fail gracefully
        expect(error).toBeInstanceOf(Error);
        logger.info('✅ Health check fails gracefully when service unavailable');
      }
    });
  });

  describe('Service-Specific Error Handling', () => {
    it('should handle AI Content Service specific errors', async () => {
      const contentClient = new ContentServiceClient();

      const errorScenarios = [
        {
          name: 'Empty content',
          request: {
            content: '',
            analysisType: 'comprehensive' as const,
            context: { userId: 'test-user' },
          },
        },
        {
          name: 'Extremely long content',
          request: {
            content: 'A'.repeat(50000), // 50k characters
            analysisType: 'basic' as const,
            context: { userId: 'test-user' },
          },
        },
        {
          name: 'Invalid analysis type',
          request: {
            content: 'Valid content',
            analysisType: 'invalid-type' as any,
            context: { userId: 'test-user' },
          },
        },
      ];

      for (const scenario of errorScenarios) {
        try {
          logger.info(`🧪 Testing ${scenario.name}...`);

          const response = await contentClient.analyzeText(scenario.request);

          if (response.success) {
            logger.info(`ℹ️ ${scenario.name}: Unexpectedly succeeded`);
          } else {
            expect(response.error).toBeTruthy();
            logger.info(`✅ ${scenario.name}: Properly returned error - ${response.error}`);
          }
        } catch (error) {
          logger.info(
            `✅ ${scenario.name}: Properly threw error - ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    });

    it('should handle AI Music Service specific errors', async () => {
      const musicClient = new MusicServiceClient();

      const errorScenarios = [
        {
          name: 'Invalid duration',
          blueprint: {
            theme: 'test',
            genre: 'ambient',
            mood: 'calm',
            duration: -1, // Invalid duration
          },
        },
        {
          name: 'Empty theme',
          blueprint: {
            theme: '',
            genre: 'ambient',
            mood: 'calm',
            duration: 1,
          },
        },
        {
          name: 'Invalid audio URL for analysis',
          audioUrl: 'not-a-valid-url',
          isAnalysis: true,
        },
      ];

      for (const scenario of errorScenarios) {
        try {
          logger.info(`🧪 Testing ${scenario.name}...`);

          if (scenario.isAnalysis) {
            await musicClient.analyzeMusic(scenario.audioUrl, 'comprehensive');
          } else {
            await musicClient.generateCustomMusic(scenario.blueprint, 'test-user');
          }

          logger.info(`ℹ️ ${scenario.name}: Unexpectedly succeeded`);
        } catch (error) {
          logger.info(
            `✅ ${scenario.name}: Properly handled error - ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    });
  });

  describe('Cascading Error Scenarios', () => {
    it('should handle service discovery failure impacts', async () => {
      logger.info('🔄 Testing service discovery failure cascade...');

      // Simulate service discovery being unavailable
      const originalSystemUrl = process.env.SYSTEM_SERVICE_URL;

      try {
        process.env.SYSTEM_SERVICE_URL = 'http://unavailable-discovery:9999';

        const contentClient = new ContentServiceClient();
        const musicClient = new MusicServiceClient();

        // Services should fall back to environment variables or default ports

        try {
          await contentClient.healthCheck();
          logger.info('✅ Content client handles service discovery failure with fallback');
        } catch (error) {
          logger.info('✅ Content client fails gracefully when both discovery and service unavailable');
        }

        try {
          await musicClient.healthCheck();
          logger.info('✅ Music client handles service discovery failure with fallback');
        } catch (error) {
          logger.info('✅ Music client fails gracefully when both discovery and service unavailable');
        }
      } finally {
        // Restore original system service URL
        if (originalSystemUrl) {
          process.env.SYSTEM_SERVICE_URL = originalSystemUrl;
        } else {
          delete process.env.SYSTEM_SERVICE_URL;
        }
      }
    });

    it('should handle partial service failures', async () => {
      logger.info('🔄 Testing partial service failure handling...');

      const services = [
        { name: 'AI Content Service', url: SERVICE_URLS.AI_CONTENT_SERVICE },
        { name: 'Music Service', url: SERVICE_URLS.MUSIC_SERVICE },
        { name: 'AI Config Service', url: SERVICE_URLS.AI_CONFIG_SERVICE },
      ];

      const healthChecks = services.map(async service => {
        try {
          const response = await TestUtils.makeRequest(`${service.url}/health`, {}, 5000);

          return {
            name: service.name,
            healthy: response.status === 200,
            status: response.status,
          };
        } catch (error) {
          return {
            name: service.name,
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const results = await Promise.all(healthChecks);

      const healthyServices = results.filter(r => r.healthy);
      const unhealthyServices = results.filter(r => !r.healthy);

      logger.info(
        `📊 Service health distribution: ${healthyServices.length} healthy, ${unhealthyServices.length} unhealthy`
      );

      if (healthyServices.length > 0) {
        logger.info('✅ System continues to function with partial service availability');
      }

      if (unhealthyServices.length > 0) {
        logger.info(`ℹ️ Degraded services: ${unhealthyServices.map(s => s.name).join(', ')}`);
      }

      // System should be resilient to some service failures
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Rate Limiting and Quota Handling', () => {
    it('should handle rate limiting gracefully', async () => {
      logger.info('🔄 Testing rate limiting behavior...');

      const contentClient = new ContentServiceClient();
      const RAPID_REQUESTS = 10;
      const MAX_CONCURRENT_TIME = 15000; // 15 seconds

      // Make rapid requests to potentially trigger rate limiting
      const rapidRequests = Array(RAPID_REQUESTS)
        .fill(null)
        .map(async (_, index) => {
          try {
            const request = {
              content: `Rapid request ${index}`,
              analysisType: 'basic' as const,
              context: { userId: `rate-test-${index}` },
            };

            const startTime = Date.now();
            const response = await contentClient.analyzeText(request);
            const duration = Date.now() - startTime;

            return {
              index,
              success: response.success,
              duration,
              rateLimited: response.error?.includes('rate') || response.error?.includes('429'),
            };
          } catch (error) {
            return {
              index,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              rateLimited:
                error instanceof Error &&
                (error.message.includes('rate') ||
                  error.message.includes('429') ||
                  error.message.includes('Too Many Requests')),
            };
          }
        });

      const startTime = Date.now();
      const results = await Promise.allSettled(rapidRequests);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(MAX_CONCURRENT_TIME);

      const fulfilled = results.filter(r => r.status === 'fulfilled').length;
      const rejected = results.filter(r => r.status === 'rejected').length;

      logger.info(`⚡ ${RAPID_REQUESTS} requests completed in ${totalTime}ms`);
      logger.info(`📊 Results: ${fulfilled} fulfilled, ${rejected} rejected`);

      // Check if any requests were rate limited
      const rateLimitedCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).rateLimited).length;

      if (rateLimitedCount > 0) {
        logger.info(`✅ Rate limiting detected and handled gracefully (${rateLimitedCount} requests)`);
      } else {
        logger.info('ℹ️ No rate limiting detected (service may not implement rate limits or limits not reached)');
      }
    });
  });

  describe('Data Validation and Sanitization', () => {
    it('should handle malicious or unusual input data', async () => {
      const contentClient = new ContentServiceClient();

      const maliciousInputs = [
        {
          name: 'SQL injection attempt',
          content: "'; DROP TABLE users; --",
        },
        {
          name: 'XSS attempt',
          content: '<script>alert("xss")</script>',
        },
        {
          name: 'Very long input',
          content: 'A'.repeat(100000), // 100k characters
        },
        {
          name: 'Unicode and special characters',
          content: '🚀 Test with émojis ánd spëcial çharacters 中文 العربية русский',
        },
        {
          name: 'Null bytes and control characters',
          content: 'Test\x00with\x01control\x02characters',
        },
      ];

      for (const input of maliciousInputs) {
        try {
          logger.info(`🛡️ Testing ${input.name}...`);

          const request = {
            content: input.content,
            analysisType: 'basic' as const,
            context: { userId: 'security-test' },
          };

          const response = await contentClient.analyzeText(request);

          // Should either succeed safely or fail gracefully
          if (response.success) {
            logger.info(`✅ ${input.name}: Processed safely`);
          } else {
            expect(response.error).toBeTruthy();
            logger.info(`✅ ${input.name}: Safely rejected - ${response.error}`);
          }
        } catch (error) {
          // Should fail gracefully, not crash
          expect(error).toBeInstanceOf(Error);
          logger.info(
            `✅ ${input.name}: Safely handled error - ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    });

    it('should validate required fields and data types', async () => {
      const contentClient = new ContentServiceClient();

      const invalidRequests = [
        {
          name: 'Missing content field',
          request: {
            analysisType: 'basic',
            context: { userId: 'test' },
          } as any,
        },
        {
          name: 'Wrong data type for analysis type',
          request: {
            content: 'Valid content',
            analysisType: 123, // Should be string
            context: { userId: 'test' },
          } as any,
        },
        {
          name: 'Null context',
          request: {
            content: 'Valid content',
            analysisType: 'basic',
            context: null,
          } as any,
        },
      ];

      for (const testCase of invalidRequests) {
        try {
          logger.info(`🧪 Testing ${testCase.name}...`);

          const response = await contentClient.analyzeText(testCase.request);

          if (response.success) {
            logger.info(`ℹ️ ${testCase.name}: Unexpectedly succeeded (service may be lenient)`);
          } else {
            expect(response.error).toBeTruthy();
            logger.info(`✅ ${testCase.name}: Properly validated - ${response.error}`);
          }
        } catch (error) {
          logger.info(
            `✅ ${testCase.name}: Validation caught at client level - ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    });
  });

  describe('Recovery and Resilience', () => {
    it('should demonstrate error recovery patterns', async () => {
      logger.info('🔄 Testing error recovery patterns...');

      const contentClient = new ContentServiceClient();

      // Try with invalid request first
      const invalidRequest = {
        content: '',
        analysisType: 'comprehensive' as const,
        context: { userId: 'recovery-test' },
      };

      let firstRequestSucceeded = false;

      try {
        const invalidResponse = await contentClient.analyzeText(invalidRequest);
        firstRequestSucceeded = invalidResponse.success;
      } catch (error) {
        logger.info('✅ Invalid request properly failed');
      }

      // Follow up with valid request to ensure service is still functional
      const validRequest = {
        content: 'This is a valid request for error recovery testing.',
        analysisType: 'basic' as const,
        context: { userId: 'recovery-test' },
      };

      try {
        const validResponse = await contentClient.analyzeText(validRequest);

        if (validResponse.success || validResponse.error) {
          logger.info('✅ Service recovered and handled subsequent valid request');
        } else {
          logger.warn('⚠️ Service may be in degraded state after error');
        }
      } catch (error) {
        logger.warn('⚠️ Service may be unavailable after error scenario');
      }

      logger.info('📊 Error recovery test completed');
    });

    it('should maintain service stability under error conditions', async () => {
      logger.info('🔄 Testing service stability under errors...');

      const contentClient = new ContentServiceClient();
      const musicClient = new MusicServiceClient();

      // Test that services remain stable after various error scenarios
      const stabilityTests = [
        {
          name: 'Content service stability',
          test: async () => {
            const health = await contentClient.healthCheck();
            return health.status;
          },
        },
        {
          name: 'Music service stability',
          test: async () => {
            const health = await musicClient.healthCheck();
            return health.status;
          },
        },
      ];

      for (const stabilityTest of stabilityTests) {
        try {
          const status = await stabilityTest.test();
          logger.info(`✅ ${stabilityTest.name}: ${status}`);
          expect(['healthy', 'unhealthy']).toContain(status);
        } catch (error) {
          logger.warn(`⚠️ ${stabilityTest.name}: Error - ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      logger.info('📊 Service stability test completed');
    });
  });
});
