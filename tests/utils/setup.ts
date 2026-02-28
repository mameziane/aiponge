/**
 * Integration Test Setup
 * Common setup for all microservices integration tests
 */

import { vi, beforeAll, afterAll, expect } from 'vitest';
import { setTimeout } from 'timers/promises';

// Simple logger for tests
const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

// Service port configuration
const SERVICE_PORTS: Record<string, number> = {
  apiGateway: 8080,
  systemService: 8082,
  aiConfigService: 8084,
  aiContentService: 8085,
  musicService: 8086,
  aiAnalyticsService: 8088,
  userService: 8081,
  storageService: 8083,
};

function getServiceUrl(serviceName: string, host = 'localhost'): string {
  const port = SERVICE_PORTS[serviceName];
  if (!port) throw new Error(`Unknown service: ${serviceName}`);
  return `http://${host}:${port}`;
}

// Environment setup
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'warn'; // Reduce log noise during tests

// Service URLs - use centralized port configuration with environment variable overrides
export const SERVICE_URLS = {
  SYSTEM_SERVICE: process.env.SYSTEM_SERVICE_URL || getServiceUrl('systemService', 'localhost'),
  AI_CONFIG_SERVICE: process.env.AI_CONFIG_SERVICE_URL || getServiceUrl('aiConfigService', 'localhost'),
  AI_CONTENT_SERVICE: process.env.AI_CONTENT_SERVICE_URL || getServiceUrl('aiContentService', 'localhost'),
  MUSIC_SERVICE: process.env.MUSIC_SERVICE_URL || getServiceUrl('musicService', 'localhost'),
  AI_ANALYTICS_SERVICE: process.env.AI_ANALYTICS_SERVICE_URL || getServiceUrl('aiAnalyticsService', 'localhost'),
  API_GATEWAY: process.env.API_GATEWAY_URL || getServiceUrl('apiGateway', 'localhost'),
};

// Test timeouts
export const TIMEOUTS = {
  SERVICE_STARTUP: 30000, // 30 seconds for services to be ready
  REQUEST: 15000, // 15 seconds for individual requests
  HEALTH_CHECK: 5000, // 5 seconds for health checks
};

// Simple HTTP client for tests
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = global.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    global.clearTimeout(timeoutId);
  }
}

// Test utilities
export class TestUtils {
  /**
   * Wait for a service to be healthy
   */
  static async waitForServiceHealth(
    serviceUrl: string, 
    maxWaitMs: number = TIMEOUTS.SERVICE_STARTUP
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await fetchWithTimeout(`${serviceUrl}/health`, {}, TIMEOUTS.HEALTH_CHECK);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'healthy' || data.status === 'ok') {
            return true;
          }
        }
      } catch (error) {
        // Service not ready yet
      }
      
      await setTimeout(1000); // Wait 1 second before retrying
    }
    
    return false;
  }

  /**
   * Wait for all services to be healthy
   */
  static async waitForAllServices(): Promise<{
    healthy: string[];
    unhealthy: string[];
  }> {
    logger.info('⏳ Waiting for all services to be healthy...');
    
    const healthChecks = Object.entries(SERVICE_URLS).map(async ([name, url]) => {
      const isHealthy = await this.waitForServiceHealth(url);
      return { name, url, healthy: isHealthy };
    });
    
    const results = await Promise.all(healthChecks);
    
    const healthy = results.filter(r => r.healthy).map(r => r.name);
    const unhealthy = results.filter(r => !r.healthy).map(r => r.name);
    
    logger.info(`✅ Healthy services: ${healthy.join(', ')}`);
    if (unhealthy.length > 0) {
      logger.warn(`❌ Unhealthy services: ${unhealthy.join(', ')}`);
    }
    
    return { healthy, unhealthy };
  }

  /**
   * Create a test HTTP request with timeout
   */
  static async makeRequest(
    url: string, 
    options: RequestInit = {}, 
    timeoutMs: number = TIMEOUTS.REQUEST
  ): Promise<any> {
    const response = await fetchWithTimeout(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
      }
    }, timeoutMs);
    
    const data = await response.json();
    return { success: response.ok, data, status: response.status, error: response.ok ? undefined : data?.error };
  }

  /**
   * Validate response follows standard API pattern
   */
  static validateApiResponse(response: any): void {
    expect(response).toHaveProperty('success');
    expect(typeof response.success).toBe('boolean');
    
    if (response.success === false) {
      expect(response).toHaveProperty('error');
      expect(typeof response.error).toBe('string');
    }
  }

  /**
   * Generate test data
   */
  static generateTestData = {
    textAnalysisRequest: () => ({
      content: 'This is a test piece of text for analysis. It contains various emotions and themes to test our AI analysis capabilities.',
      analysisType: 'comprehensive' as const,
      context: {
        userId: 'test-user-123',
        domainContext: 'integration-test'
      }
    }),

    contentGenerationRequest: () => ({
      prompt: 'Generate insights about personal growth and reflection',
      contentType: 'insights' as const,
      parameters: {
        maxLength: 500,
        temperature: 0.7,
        tone: 'encouraging',
        style: 'conversational'
      },
      context: {
        userId: 'test-user-123'
      }
    }),

    reflectionGenerationRequest: () => ({
      originalQuestion: 'What are you most grateful for today?',
      userResponse: 'I am grateful for my family and the opportunity to learn new things.',
      reflectionType: 'follow-up-questions' as const,
      depth: 'comprehensive' as const,
      context: {}
    }),

    musicGenerationRequest: () => ({
      prompt: 'Create a peaceful ambient song for meditation and reflection',
      parameters: {
        musicType: 'ambient',
        style: 'meditative',
        genre: 'ambient',
        mood: 'peaceful',
        duration: 120, // 2 minutes
        quality: 'standard',
        priority: 'normal',
        wellbeingPurpose: 'meditation'
      }
    }),

    musicAnalysisRequest: () => ({
      audioUrl: 'https://example.com/test-audio.mp3', // Mock URL for testing
      analysisType: 'comprehensive' as const,
      options: {
        includeGenre: true,
        includeMood: true,
        includeTempo: true,
        includeKey: true,
        includeInstruments: true
      }
    })
  };
}

// Global test setup
beforeAll(async () => {
  logger.info('🚀 Starting microservices integration test suite...');
  
  // Wait for critical services to be healthy
  const { healthy, unhealthy } = await TestUtils.waitForAllServices();
  
  // Log service health status but don't fail if some services are unhealthy
  // Individual tests will handle service availability gracefully
  if (unhealthy.length > 0) {
    logger.warn(`⚠️ Some services are not healthy: ${unhealthy.join(', ')}`);
    logger.warn('Tests will proceed but may skip tests for unhealthy services');
  }
});

afterAll(async () => {
  logger.info('✅ Integration test suite completed');
});

vi.setConfig({ testTimeout: 60000 });

/**
 * Test User Helper - Creates real authenticated test users
 */
export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  isGuest: boolean;
}

export class TestUserHelper {
  private static createdUsers: TestUser[] = [];

  /**
   * Create a guest user for testing
   */
  static async createGuestUser(): Promise<TestUser | null> {
    const response = await TestUtils.makeRequest(
      `${SERVICE_URLS.API_GATEWAY}/api/auth/guest`,
      { method: 'POST' },
      TIMEOUTS.REQUEST
    );

    if (response.success && response.data) {
      const user: TestUser = {
        id: response.data.user?.id || response.data.id,
        email: '',
        accessToken: response.data.token || response.data.accessToken,
        refreshToken: response.data.refreshToken,
        isGuest: true,
      };
      this.createdUsers.push(user);
      return user;
    }
    return null;
  }

  /**
   * Create a registered user for testing
   */
  static async createRegisteredUser(email?: string, password?: string): Promise<TestUser | null> {
    const testEmail = email || `test-${Date.now()}-${Math.random().toString(36).substring(7)}@integration-test.local`;
    const testPassword = password || 'TestPassword123!';

    const response = await TestUtils.makeRequest(
      `${SERVICE_URLS.API_GATEWAY}/api/auth/register`,
      {
        method: 'POST',
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Integration Test User',
        }),
      },
      TIMEOUTS.REQUEST
    );

    if (response.success && response.data) {
      const user: TestUser = {
        id: response.data.user?.id || response.data.id,
        email: testEmail,
        accessToken: response.data.token || response.data.accessToken,
        refreshToken: response.data.refreshToken,
        isGuest: false,
      };
      this.createdUsers.push(user);
      return user;
    }
    return null;
  }

  /**
   * Get auth headers for a test user
   */
  static getAuthHeaders(user: TestUser): Record<string, string> {
    return {
      'Authorization': `Bearer ${user.accessToken}`,
      'x-user-id': user.id,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Cleanup all created test users
   */
  static async cleanupAll(): Promise<void> {
    for (const user of this.createdUsers) {
      try {
        await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/logout`,
          {
            method: 'POST',
            headers: this.getAuthHeaders(user),
          },
          TIMEOUTS.HEALTH_CHECK
        );
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    this.createdUsers = [];
  }
}

/**
 * Assert that a response is a successful API response
 */
export function assertSuccessResponse(response: any, context?: string): void {
  const ctx = context ? ` [${context}]` : '';
  expect(response).toBeDefined();
  expect(response.success).toBe(true);
  if (!response.success) {
    throw new Error(`Expected success but got error${ctx}: ${response.error || JSON.stringify(response)}`);
  }
}

/**
 * Assert that a response is an error response
 */
export function assertErrorResponse(response: any, context?: string): void {
  const ctx = context ? ` [${context}]` : '';
  expect(response).toBeDefined();
  expect(response.success).toBe(false);
  if (response.success) {
    throw new Error(`Expected error but got success${ctx}: ${JSON.stringify(response)}`);
  }
}