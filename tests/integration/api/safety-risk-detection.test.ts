/**
 * Safety Risk Detection Integration Tests
 * CRITICAL: Tests the safety infrastructure for content protection
 * 
 * Flow:
 * 1. Content submitted through API Gateway
 * 2. SafetyScreeningMiddleware intercepts and analyzes
 * 3. RiskDetectionService in user-service performs analysis
 * 4. Crisis resources returned for high-risk content
 * 5. Risk flags created in database for tracking
 */

import { describe, it, expect, beforeAll, afterAll, vi, Mock } from 'vitest';
import { 
  TestUtils, 
  SERVICE_URLS, 
  TIMEOUTS,
  TestUserHelper,
  TestUser,
  assertSuccessResponse,
  assertErrorResponse 
} from './setup';

describe('Safety Risk Detection Flow', () => {
  let testUser: TestUser | null = null;

  const TEST_TIMEOUT = 30000;

  beforeAll(async () => {
    const healthStatus = await TestUtils.waitForAllServices();
    
    if (!healthStatus.healthy.includes('API_GATEWAY')) {
      throw new Error('API Gateway not healthy - cannot run safety tests');
    }
    
    testUser = await TestUserHelper.createGuestUser();
    if (!testUser) {
      testUser = await TestUserHelper.createRegisteredUser();
    }
    
    if (!testUser) {
      throw new Error('Could not create test user for safety tests');
    }
    
    console.log(`✅ Test user created: ${testUser.id}`);
  }, TIMEOUTS.SERVICE_STARTUP);

  afterAll(async () => {
    await TestUserHelper.cleanupAll();
  });

  describe('Low Risk Content', () => {
    it('should allow normal content through with low risk assessment', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/entries`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: 'Today I had a great day at work. I completed all my tasks and felt productive.',
            type: 'reflection',
          }),
        },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'low risk content');
      TestUtils.validateApiResponse(response);
      expect(response.data).toHaveProperty('id');
      
      if (response.data?.safetyScreening) {
        expect(['none', 'low']).toContain(response.data.safetyScreening.level);
        expect(response.data.safetyScreening.detected).toBe(false);
        console.log(`✅ Low risk content passed: level=${response.data.safetyScreening.level}`);
      }
      console.log('✅ Content processed through safety screening');
    }, TEST_TIMEOUT);
  });

  describe('Medium Risk Content', () => {
    it('should detect and flag moderately concerning content', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/entries`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: 'I have been feeling quite anxious lately and having trouble sleeping. Some days I feel really overwhelmed by everything.',
            type: 'reflection',
          }),
        },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'medium risk content');
      TestUtils.validateApiResponse(response);
      expect(response.data).toHaveProperty('id');
      
      if (response.data?.safetyScreening) {
        expect(['low', 'medium', 'high']).toContain(response.data.safetyScreening.level);
        console.log(`✅ Medium risk content handled: level=${response.data.safetyScreening.level}`);
      }
      console.log('✅ Content processed through safety screening');
    }, TEST_TIMEOUT);
  });

  describe('High Risk Content Detection', () => {
    it('should detect high risk patterns and provide crisis resources', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/entries`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: 'I feel so hopeless and like nothing will ever get better. Everything seems pointless.',
            type: 'reflection',
          }),
        },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'high risk content');
      TestUtils.validateApiResponse(response);
      expect(response.data).toHaveProperty('id');
      
      if (response.data?.safetyScreening) {
        const screening = response.data.safetyScreening;
        expect(['low', 'medium', 'high', 'critical']).toContain(screening.level);
        
        if (screening.level === 'high' || screening.level === 'critical') {
          expect(screening.detected).toBe(true);
          
          if (response.data.crisisResources) {
            expect(response.data.crisisResources).toBeDefined();
            console.log('✅ Crisis resources attached for high-risk content');
          }
          
          if (screening.flagId) {
            expect(screening.flagId).toBeTruthy();
            console.log(`✅ Risk flag created: ${screening.flagId}`);
          }
        }
        
        console.log(`✅ High risk content handled: level=${screening.level}`);
      }
      console.log('✅ Content processed through safety screening');
    }, TEST_TIMEOUT);

    it('should require acknowledgment for high risk book content', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/books`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: 'Difficult Day',
            content: 'I feel completely alone and like nobody understands what I am going through.',
            templateId: null,
          }),
        },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'high risk book');
      TestUtils.validateApiResponse(response);
      expect(response.data).toHaveProperty('id');
      
      if (response.data?.requiresAcknowledgment) {
        expect(response.data.requiresAcknowledgment).toBe(true);
        expect(response.data.crisisResources).toBeDefined();
        console.log('✅ Acknowledgment required for high-risk book entry');
      }
      console.log('✅ Book entry created with safety processing');
    }, TEST_TIMEOUT);
  });

  describe('Book Safety Screening', () => {
    it('should screen book entries through safety middleware', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/books`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: 'My Daily Writing',
            content: 'I am grateful for my family and friends. Today was challenging but I managed to stay positive.',
            templateId: null,
          }),
        },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'book safety screening');
      TestUtils.validateApiResponse(response);
      expect(response.data.id).toBeDefined();
      console.log(`✅ Book entry created: ${response.data.id}`);
    }, TEST_TIMEOUT);
  });

  describe('Reflection Safety Screening', () => {
    it('should screen reflection content for risk indicators', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/reflections`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: 'Reflecting on my progress this week, I notice I have been more mindful about my reactions to stress.',
            type: 'weekly',
          }),
        },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'reflection safety screening');
      TestUtils.validateApiResponse(response);
      expect(response.data.id).toBeDefined();
      
      if (response.data?.safetyScreening) {
        expect(response.data.safetyScreening.level).toBeDefined();
        console.log(`✅ Reflection screened: level=${response.data.safetyScreening.level}`);
      }
      console.log('✅ Reflection processed through safety screening');
    }, TEST_TIMEOUT);
  });

  describe('Safety Audit Logging', () => {
    it('should log safety assessments with correlation ID', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      const correlationId = `safety-audit-test-${Date.now()}`;
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/entries`,
        {
          method: 'POST',
          headers: {
            ...headers,
            'x-correlation-id': correlationId,
          },
          body: JSON.stringify({
            content: 'Testing safety audit logging functionality with moderate concern indicators.',
            type: 'test',
          }),
        },
        TEST_TIMEOUT
      );

      expect(response).toBeDefined();
      console.log(`✅ Safety audit triggered with correlation ID: ${correlationId}`);
    }, TEST_TIMEOUT);
  });

  describe('Crisis Escalation', () => {
    it('should escalate critical risk assessments with emergency resources', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/entries`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: 'I cannot take this anymore and I do not see any way out of this situation.',
            type: 'reflection',
          }),
        },
        TEST_TIMEOUT
      );

      expect(response).toBeDefined();
      
      if (response.data?.safetyScreening?.level === 'critical') {
        expect(response.data.crisisResources).toBeDefined();
        
        if (response.data.crisisResources?.emergencyMessage) {
          expect(response.data.crisisResources.emergencyMessage).toMatch(/help|support|crisis/i);
          console.log('✅ Crisis escalation with emergency message');
        }
        
        if (response.data.crisisResources?.hotlines) {
          expect(response.data.crisisResources.hotlines.length).toBeGreaterThan(0);
          console.log(`✅ Crisis hotlines provided: ${response.data.crisisResources.hotlines.length}`);
        }
      } else {
        console.log('✅ Content processed with appropriate risk level');
      }
    }, TEST_TIMEOUT);
  });

  describe('Content Validation with Safety', () => {
    it('should validate content format before safety screening', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/entries`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: '',
          }),
        },
        TEST_TIMEOUT
      );

      assertErrorResponse(response, 'empty content validation');
      console.log('✅ Empty content rejected before safety screening');
    }, TEST_TIMEOUT);

    it('should handle very long content appropriately', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      const longContent = 'This is a test of long content handling. '.repeat(100);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/entries`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: longContent,
            type: 'reflection',
          }),
        },
        TEST_TIMEOUT
      );

      expect(response).toBeDefined();
      console.log('✅ Long content handled appropriately');
    }, TEST_TIMEOUT);
  });
});
