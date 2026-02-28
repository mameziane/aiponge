/**
 * Subscription Gating Integration Tests
 * MEDIUM: Tests tier-based access control and feature gating
 *
 * Tiers:
 * - Guest/Explorer: Limited features and generation quota
 * - Personal/Practice/Studio: Full access with tier-specific limits
 * - Admin/Librarian: Bypass quotas, manage shared content
 */

import { describe, it, expect, beforeAll, afterAll, vi, Mock } from 'vitest';
import {
  TestUtils,
  SERVICE_URLS,
  TIMEOUTS,
  TestUserHelper,
  TestUser,
  assertSuccessResponse,
  assertErrorResponse,
} from './setup';

describe('Subscription Gating', () => {
  let freeUser: TestUser | null = null;

  const TEST_TIMEOUT = 30000;

  beforeAll(async () => {
    const healthStatus = await TestUtils.waitForAllServices();

    if (!healthStatus.healthy.includes('API_GATEWAY')) {
      throw new Error('API Gateway not healthy - cannot run subscription tests');
    }

    freeUser = await TestUserHelper.createGuestUser();
    if (!freeUser) {
      freeUser = await TestUserHelper.createRegisteredUser();
    }

    if (!freeUser) {
      throw new Error('Could not create test user for subscription tests');
    }

    console.log(`✅ Explorer tier test user created: ${freeUser.id}`);
  }, TIMEOUTS.SERVICE_STARTUP);

  afterAll(async () => {
    await TestUserHelper.cleanupAll();
  });

  describe('Subscription Configuration', () => {
    it(
      'should retrieve subscription tier configuration',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/config`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'subscription config');
        TestUtils.validateApiResponse(response);
        expect(response.data.tiers).toBeDefined();
        expect(response.data.tiers.explorer).toBeDefined();
        expect(response.data.tiers.practice).toBeDefined();

        const freeTier = response.data.tiers.explorer;
        expect(freeTier.limits).toBeDefined();
        expect(freeTier.features).toBeDefined();

        console.log(`✅ Subscription config: explorer=${freeTier.limits.songsPerMonth} songs/month`);
      },
      TEST_TIMEOUT
    );
  });

  describe('User Subscription Status', () => {
    it(
      'should retrieve user subscription status',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/status`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'subscription status');
        TestUtils.validateApiResponse(response);
        expect(response.data.tier).toBeDefined();
        expect(['guest', 'explorer', 'personal', 'practice', 'studio']).toContain(response.data.tier);

        console.log(`✅ Subscription status: tier=${response.data.tier}`);
      },
      TEST_TIMEOUT
    );
  });

  describe('Explorer Tier Limitations', () => {
    it(
      'should return quota information for free users',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/quota`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'explorer tier quota');
        TestUtils.validateApiResponse(response);
        expect(response.data.tier).toBeDefined();
        expect(response.data.usage).toBeDefined();
        expect(response.data.limits).toBeDefined();

        const { usage, limits } = response.data;
        expect(usage.current).toBeLessThanOrEqual(limits.songsPerMonth || Infinity);

        console.log(`✅ Explorer tier quota: ${usage.current}/${limits.songsPerMonth || 'unlimited'}`);
      },
      TEST_TIMEOUT
    );

    it(
      'should restrict access to paid tier features',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/insights/advanced-report`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'paid tier feature restriction');
        expect(response.error || response.message).toMatch(/paid|upgrade|subscription|forbidden|unauthorized/i);
        console.log('✅ Paid feature gated for free users');
      },
      TEST_TIMEOUT
    );

    it(
      'should return correct canGenerate flag based on quota usage',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/quota`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'canGenerate check');
        TestUtils.validateApiResponse(response);

        const { usage, limits, canGenerate } = response.data;
        expect(typeof canGenerate).toBe('boolean');

        if (usage.current >= limits.songsPerMonth) {
          expect(canGenerate).toBe(false);
          console.log('✅ canGenerate=false when quota exceeded');
        } else {
          expect(canGenerate).toBe(true);
          console.log(`✅ canGenerate=true (usage: ${usage.current}/${limits.songsPerMonth})`);
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('Role-Based Access (Admin/Librarian)', () => {
    it(
      'should deny librarian routes to regular users',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/librarian/library`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'librarian access');
        console.log('✅ Librarian routes protected from regular users');
      },
      TEST_TIMEOUT
    );

    it(
      'should deny admin routes to regular users',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/admin/users`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'admin access');
        console.log('✅ Admin routes protected from regular users');
      },
      TEST_TIMEOUT
    );
  });

  describe('Usage Tracking', () => {
    it(
      'should track generation usage correctly',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/usage`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'usage tracking');
        TestUtils.validateApiResponse(response);
        expect(response.data.songsGenerated || response.data.current).toBeDefined();
        console.log(`✅ Usage tracking: ${response.data.songsGenerated || response.data.current} songs`);
      },
      TEST_TIMEOUT
    );

    it(
      'should include billing period information',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/usage`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'billing period info');
        TestUtils.validateApiResponse(response);

        if (response.data.resetAt) {
          const resetDate = new Date(response.data.resetAt);
          expect(resetDate.getTime()).toBeGreaterThan(Date.now());
          console.log(`✅ Usage reset scheduled: ${resetDate.toISOString()}`);
        }

        if (response.data.periodStart) {
          const periodStart = new Date(response.data.periodStart);
          expect(periodStart.getTime()).toBeLessThan(Date.now());
          console.log(`✅ Current period started: ${periodStart.toISOString()}`);
        }

        console.log('✅ Billing period information retrieved');
      },
      TEST_TIMEOUT
    );
  });

  describe('Feature Flags', () => {
    it(
      'should return correct feature flags based on tier',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/features`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'feature flags');
        TestUtils.validateApiResponse(response);
        const features = response.data.features || response.data;

        expect(typeof features.canGenerateMusic).toBe('boolean');
        expect(typeof features.canAccessLibrary).toBe('boolean');

        const enabledFeatures = Object.keys(features).filter(k => features[k]);
        console.log(`✅ Features for explorer tier: ${enabledFeatures.join(', ')}`);
      },
      TEST_TIMEOUT
    );
  });

  describe('Upgrade Prompts', () => {
    it(
      'should provide upgrade information when needed',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/upgrade-prompt`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'upgrade prompt');
        TestUtils.validateApiResponse(response);

        expect(typeof response.data.shouldPrompt).toBe('boolean');

        if (response.data.shouldPrompt) {
          expect(response.data.reason).toBeDefined();
          console.log(`✅ Upgrade prompt: ${response.data.reason}`);
        } else {
          console.log('✅ No upgrade prompt needed currently');
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('Quota Enforcement on Generation', () => {
    it(
      'should verify quota enforcement for generation',
      async () => {
        if (!freeUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(freeUser);

        const quotaBefore = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/subscriptions/quota`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(quotaBefore, 'quota before generation');
        TestUtils.validateApiResponse(quotaBefore);

        const { usage, limits, canGenerate } = quotaBefore.data;
        expect(typeof canGenerate).toBe('boolean');

        if (!canGenerate || usage.current >= limits.songsPerMonth) {
          const generateResponse = await TestUtils.makeRequest(
            `${SERVICE_URLS.API_GATEWAY}/api/app/music/generate`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                prompt: 'Test song',
                title: 'Quota Test',
              }),
            },
            TEST_TIMEOUT
          );

          assertErrorResponse(generateResponse, 'quota exceeded');
          console.log('✅ Generation blocked when quota exceeded');
        } else {
          console.log(`✅ Quota available for generation: ${usage.current}/${limits.songsPerMonth}`);
        }
      },
      TEST_TIMEOUT
    );
  });
});
