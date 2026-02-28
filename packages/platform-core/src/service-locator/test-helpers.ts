/**
 * Test Helpers
 *
 * Testing utilities for service locator functionality
 */

/**
 * Testing utilities for creating mock service registries
 */
export class TestHelper {
  /**
   * Create mock service registry for tests with isolated ports
   */
  static createMockServiceRegistry(testId: string, services: string[]): Record<string, Record<string, unknown>> {
    const testOffset = testId.charCodeAt(0); // Simple test isolation
    const registry: Record<string, Record<string, unknown>> = {};

    services.forEach((serviceName, index) => {
      const basePort = 3000 + index * 10 + testOffset;
      registry[serviceName] = {
        name: serviceName,
        host: 'localhost',
        port: basePort,
        health: '/health',
        enabled: true,
        url: `http://localhost:${basePort}`,
      };
    });

    return registry;
  }
}
