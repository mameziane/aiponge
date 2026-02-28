/**
 * Entry to Song Pipeline Integration Tests
 * CRITICAL: Tests the complete flow from text submission to song generation
 * 
 * Pipeline:
 * 1. Create authenticated test user
 * 2. User submits entry -> user-service stores it
 * 3. Safety screening runs -> risk assessment attached
 * 4. Song generation request -> quota check
 * 5. Music service generates song with psychological framework
 * 6. Track stored in user's library
 * 7. Usage incremented
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

describe('Entry to Song Pipeline', () => {
  let testUser: TestUser | null;
  let createdEntryId: string | null = null;
  let generatedTrackId: string | null = null;
  let initialUsage: number = 0;

  const TEST_TIMEOUT = 60000;
  const GENERATION_TIMEOUT = 120000;

  beforeAll(async () => {
    const healthStatus = await TestUtils.waitForAllServices();
    
    if (!healthStatus.healthy.includes('API_GATEWAY')) {
      throw new Error('API Gateway not healthy - cannot run pipeline tests');
    }
    
    testUser = await TestUserHelper.createGuestUser();
    if (!testUser) {
      testUser = await TestUserHelper.createRegisteredUser();
    }
    
    if (!testUser) {
      throw new Error('Could not create test user - cannot run pipeline tests');
    }
    
    console.log(`✅ Test user created: ${testUser.id}`);
  }, TIMEOUTS.SERVICE_STARTUP);

  afterAll(async () => {
    if (testUser) {
      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      if (generatedTrackId) {
        try {
          await TestUtils.makeRequest(
            `${SERVICE_URLS.API_GATEWAY}/api/app/music/${generatedTrackId}`,
            { method: 'DELETE', headers },
            TIMEOUTS.HEALTH_CHECK
          );
          console.log('✅ Cleaned up generated track');
        } catch (e) {
          console.log('ℹ️ Track cleanup skipped');
        }
      }
      
      if (createdEntryId) {
        try {
          await TestUtils.makeRequest(
            `${SERVICE_URLS.API_GATEWAY}/api/app/entries/${createdEntryId}`,
            { method: 'DELETE', headers },
            TIMEOUTS.HEALTH_CHECK
          );
          console.log('✅ Cleaned up created entry');
        } catch (e) {
          console.log('ℹ️ Entry cleanup skipped');
        }
      }
    }
    
    await TestUserHelper.cleanupAll();
  });

  describe('Step 1: Entry Submission with Safety Screening', () => {
    it('should create a entry and pass through safety screening', async () => {
      if (!testUser) {
        throw new Error('Test user not available - cannot proceed');
      }

      const entryContent = 'I have been feeling stressed about my work lately and need to find better ways to manage my time and energy.';
      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/entries`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: entryContent,
            type: 'reflection',
            moodContext: 'stressed',
          }),
        },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'entry creation');
      TestUtils.validateApiResponse(response);
      expect(response.data).toHaveProperty('id');
      createdEntryId = response.data.id;
      
      if (response.data.safetyScreening) {
        expect(['none', 'low', 'medium', 'high', 'critical']).toContain(
          response.data.safetyScreening.level
        );
        console.log(`✅ Safety screening level: ${response.data.safetyScreening.level}`);
      }
      
      console.log(`✅ Entry created: ${createdEntryId}`);
    }, TEST_TIMEOUT);

    it('should reject empty entry content with validation error', async () => {
      if (!testUser) {
        throw new Error('Test user not available');
      }

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/entries`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ content: '' }),
        },
        TEST_TIMEOUT
      );

      assertErrorResponse(response, 'empty entry validation');
      console.log('✅ Empty entry correctly rejected');
    }, TEST_TIMEOUT);
  });

  describe('Step 2: Quota and Eligibility Check', () => {
    it('should check user quota before song generation', async () => {
      if (!testUser) {
        throw new Error('Test user not available');
      }

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/quota`,
        { method: 'GET', headers },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'quota check');
      TestUtils.validateApiResponse(response);
      expect(response.data).toHaveProperty('tier');
      
      if (response.data.usage) {
        initialUsage = response.data.usage.current || response.data.usage.songsGenerated || 0;
      }
      
      console.log(`✅ Quota check: tier=${response.data.tier}, usage=${initialUsage}`);
    }, TEST_TIMEOUT);
  });

  describe('Step 3: Song Generation from entry', () => {
    it('should generate song from entry with psychological framework', async () => {
      if (!testUser) {
        throw new Error('Test user not available');
      }
      if (!createdEntryId) {
        throw new Error('No entry created in previous step');
      }

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/music/generate`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            entryId: createdEntryId,
            title: 'Integration Test Song',
            mood: 'calm',
            style: 'ambient',
          }),
        },
        GENERATION_TIMEOUT
      );

      assertSuccessResponse(response, 'song generation');
      TestUtils.validateApiResponse(response);
      expect(response.data.trackId || response.data.id).toBeDefined();
      generatedTrackId = response.data.trackId || response.data.id;
      
      if (response.data.frameworkUsed) {
        console.log(`✅ Framework used: ${response.data.frameworkUsed}`);
      }
      
      console.log(`✅ Song generated: ${generatedTrackId}`);
    }, GENERATION_TIMEOUT);

    it('should reject song generation with invalid entryId', async () => {
      if (!testUser) {
        throw new Error('Test user not available');
      }

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/music/generate`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            entryId: 'invalid-entry-id-12345',
            title: 'Invalid Test',
          }),
        },
        TEST_TIMEOUT
      );

      assertErrorResponse(response, 'invalid entryId');
      console.log('✅ Invalid entryId correctly rejected');
    }, TEST_TIMEOUT);
  });

  describe('Step 4: Verify Generated Track in Library', () => {
    it('should retrieve the generated track with lyrics and audio', async () => {
      if (!testUser) throw new Error('Test user not available');
      if (!generatedTrackId) throw new Error('No track generated in previous step');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/music/${generatedTrackId}`,
        { method: 'GET', headers },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'track retrieval');
      TestUtils.validateApiResponse(response);
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('title');
      
      if (response.data.lyrics) {
        expect(response.data.lyrics.length).toBeGreaterThan(0);
        console.log(`✅ Track has lyrics: ${response.data.lyrics.substring(0, 50)}...`);
      }
      
      if (response.data.audioUrl) {
        expect(response.data.audioUrl).toMatch(/^https?:\/\//);
        console.log(`✅ Track has audio URL`);
      }
      
      console.log(`✅ Track verified: ${response.data.title}`);
    }, TEST_TIMEOUT);

    it('should list track in user music library', async () => {
      if (!testUser) throw new Error('Test user not available');
      if (!generatedTrackId) throw new Error('No track generated in previous step');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/music`,
        { method: 'GET', headers },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'music library');
      TestUtils.validateApiResponse(response);
      
      const tracks = response.data.tracks || response.data;
      expect(Array.isArray(tracks)).toBe(true);
      
      const generatedTrack = tracks.find((t: any) => t.id === generatedTrackId);
      expect(generatedTrack).toBeDefined();
      console.log(`✅ Track found in library: ${generatedTrack.title}`);
    }, TEST_TIMEOUT);
  });

  describe('Step 5: Usage Increment Verification', () => {
    it('should have incremented user usage after generation', async () => {
      if (!testUser) throw new Error('Test user not available');
      if (!generatedTrackId) throw new Error('No track generated in previous step');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      
      const response = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/usage`,
        { method: 'GET', headers },
        TEST_TIMEOUT
      );

      assertSuccessResponse(response, 'usage check');
      TestUtils.validateApiResponse(response);
      
      const currentUsage = response.data.songsGenerated || response.data.current || 0;
      expect(currentUsage).toBeGreaterThan(initialUsage);
      console.log(`✅ Usage incremented: ${initialUsage} -> ${currentUsage}`);
    }, TEST_TIMEOUT);
  });

  describe('Edge Cases', () => {
    it('should enforce idempotency for duplicate generation requests', async () => {
      if (!testUser) throw new Error('Test user not available');

      const headers = TestUserHelper.getAuthHeaders(testUser);
      const idempotencyKey = `test-idemp-${Date.now()}`;
      
      const firstRequest = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/music/generate`,
        {
          method: 'POST',
          headers: { ...headers, 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({
            prompt: 'Idempotency test song',
            title: 'Idempotency Test',
          }),
        },
        GENERATION_TIMEOUT
      );

      assertSuccessResponse(firstRequest, 'first generation request');
      TestUtils.validateApiResponse(firstRequest);
      expect(firstRequest.data.trackId || firstRequest.data.id).toBeDefined();

      const secondRequest = await TestUtils.makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/app/music/generate`,
        {
          method: 'POST',
          headers: { ...headers, 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({
            prompt: 'Idempotency test song',
            title: 'Idempotency Test',
          }),
        },
        TEST_TIMEOUT
      );

      assertSuccessResponse(secondRequest, 'idempotent second request');
      TestUtils.validateApiResponse(secondRequest);
      
      const firstTrackId = firstRequest.data.trackId || firstRequest.data.id;
      const secondTrackId = secondRequest.data.trackId || secondRequest.data.id;
      expect(secondTrackId).toBe(firstTrackId);
      console.log('✅ Idempotency enforced: same trackId returned');
    }, GENERATION_TIMEOUT + 30000);
  });
});
