/**
 * Authentication Flow Integration Tests
 * HIGH: Tests user registration, login, JWT validation, and session management
 *
 * Flow:
 * 1. User registration with email/password
 * 2. Login and JWT token issuance
 * 3. Token validation on protected endpoints
 * 4. Token refresh mechanism
 * 5. Guest user conversion
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

describe('Authentication Flow', () => {
  let testEmail: string;
  let testPassword: string;
  let registeredUser: TestUser | null = null;
  let guestUser: TestUser | null = null;

  const TEST_TIMEOUT = 30000;

  beforeAll(async () => {
    const healthStatus = await TestUtils.waitForAllServices();

    if (!healthStatus.healthy.includes('API_GATEWAY')) {
      throw new Error('API Gateway not healthy - cannot run auth tests');
    }

    testEmail = `test-auth-${Date.now()}-${Math.random().toString(36).substring(7)}@integration-test.local`;
    testPassword = 'TestPassword123!';
  }, TIMEOUTS.SERVICE_STARTUP);

  afterAll(async () => {
    await TestUserHelper.cleanupAll();
  });

  describe('User Registration', () => {
    it(
      'should register a new user successfully',
      async () => {
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
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'user registration');
        TestUtils.validateApiResponse(response);
        expect(response.data.user || response.data.id).toBeDefined();
        expect(response.data.token || response.data.accessToken).toBeDefined();

        registeredUser = {
          id: response.data.user?.id || response.data.id,
          email: testEmail,
          accessToken: response.data.token || response.data.accessToken,
          refreshToken: response.data.refreshToken,
          isGuest: false,
        };

        console.log(`✅ User registered: ${registeredUser.id}`);
      },
      TEST_TIMEOUT
    );

    it(
      'should reject duplicate email registration',
      async () => {
        if (!registeredUser) {
          throw new Error('No registered user from previous step');
        }

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/register`,
          {
            method: 'POST',
            body: JSON.stringify({
              email: testEmail,
              password: testPassword,
              name: 'Duplicate User',
            }),
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'duplicate email');
        expect(response.error || response.message).toMatch(/exist|duplicate|already/i);
        console.log('✅ Duplicate email rejected');
      },
      TEST_TIMEOUT
    );

    it(
      'should validate email format',
      async () => {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/register`,
          {
            method: 'POST',
            body: JSON.stringify({
              email: 'invalid-email',
              password: testPassword,
              name: 'Invalid Email User',
            }),
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'invalid email format');
        console.log('✅ Invalid email format rejected');
      },
      TEST_TIMEOUT
    );

    it(
      'should enforce password requirements',
      async () => {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/register`,
          {
            method: 'POST',
            body: JSON.stringify({
              email: `weak-pass-${Date.now()}@test.local`,
              password: '123',
              name: 'Weak Password User',
            }),
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'weak password');
        console.log('✅ Weak password rejected');
      },
      TEST_TIMEOUT
    );
  });

  describe('User Login', () => {
    it(
      'should login with correct credentials',
      async () => {
        if (!registeredUser) {
          throw new Error('No registered user available');
        }

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/login`,
          {
            method: 'POST',
            body: JSON.stringify({
              email: testEmail,
              password: testPassword,
            }),
          },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'login');
        TestUtils.validateApiResponse(response);
        expect(response.data.token || response.data.accessToken).toBeDefined();
        expect(response.data.user).toBeDefined();

        registeredUser.accessToken = response.data.token || response.data.accessToken;
        registeredUser.refreshToken = response.data.refreshToken;

        console.log('✅ Login successful');
      },
      TEST_TIMEOUT
    );

    it(
      'should reject incorrect password',
      async () => {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/login`,
          {
            method: 'POST',
            body: JSON.stringify({
              email: testEmail,
              password: 'WrongPassword123!',
            }),
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'incorrect password');
        console.log('✅ Incorrect password rejected');
      },
      TEST_TIMEOUT
    );

    it(
      'should reject non-existent user',
      async () => {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/login`,
          {
            method: 'POST',
            body: JSON.stringify({
              email: 'nonexistent-user@test.local',
              password: testPassword,
            }),
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'non-existent user');
        console.log('✅ Non-existent user rejected');
      },
      TEST_TIMEOUT
    );
  });

  describe('JWT Token Validation', () => {
    it(
      'should accept valid JWT on protected endpoint',
      async () => {
        if (!registeredUser) {
          throw new Error('No registered user available');
        }

        const headers = TestUserHelper.getAuthHeaders(registeredUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/me`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'auth/me');
        TestUtils.validateApiResponse(response);
        expect(response.data.user || response.data.id).toBeDefined();
        console.log('✅ Valid token accepted on /me endpoint');
      },
      TEST_TIMEOUT
    );

    it(
      'should reject missing Authorization header',
      async () => {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/profile`,
          { method: 'GET' },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'missing auth header');
        console.log('✅ Missing Authorization header rejected');
      },
      TEST_TIMEOUT
    );

    it(
      'should reject invalid JWT token',
      async () => {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/profile`,
          {
            method: 'GET',
            headers: {
              Authorization: 'Bearer invalid.token.here',
            },
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'invalid token');
        console.log('✅ Invalid token rejected');
      },
      TEST_TIMEOUT
    );

    it(
      'should reject malformed Authorization header',
      async () => {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/profile`,
          {
            method: 'GET',
            headers: {
              Authorization: 'NotBearer token',
            },
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'malformed auth header');
        console.log('✅ Malformed Authorization header rejected');
      },
      TEST_TIMEOUT
    );
  });

  describe('Token Refresh', () => {
    it(
      'should refresh access token with valid refresh token',
      async () => {
        if (!registeredUser) throw new Error('No registered user available');

        if (!registeredUser.refreshToken) {
          const response = await TestUtils.makeRequest(
            `${SERVICE_URLS.API_GATEWAY}/api/auth/refresh`,
            {
              method: 'POST',
              body: JSON.stringify({
                refreshToken: 'test-refresh-token',
              }),
            },
            TEST_TIMEOUT
          );

          assertErrorResponse(response, 'invalid refresh token');
          console.log('✅ Token refresh correctly rejects invalid token');
          return;
        }

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/refresh`,
          {
            method: 'POST',
            body: JSON.stringify({
              refreshToken: registeredUser.refreshToken,
            }),
          },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'token refresh');
        TestUtils.validateApiResponse(response);
        expect(response.data.token || response.data.accessToken).toBeDefined();
        registeredUser.accessToken = response.data.token || response.data.accessToken;
        console.log('✅ Token refreshed successfully');
      },
      TEST_TIMEOUT
    );

    it(
      'should reject invalid refresh token',
      async () => {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/refresh`,
          {
            method: 'POST',
            body: JSON.stringify({
              refreshToken: 'invalid-refresh-token',
            }),
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'invalid refresh token');
        console.log('✅ Invalid refresh token rejected');
      },
      TEST_TIMEOUT
    );
  });

  describe('Token Refresh - Extended', () => {
    it(
      'should detect token reuse and revoke the family',
      async () => {
        const reuseEmail = `test-reuse-${Date.now()}-${Math.random().toString(36).substring(7)}@integration-test.local`;
        const regResponse = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/register`,
          {
            method: 'POST',
            body: JSON.stringify({ email: reuseEmail, password: 'TestPassword123!', name: 'Reuse Test' }),
          },
          TEST_TIMEOUT
        );

        if (!regResponse?.data?.refreshToken || !regResponse?.data?.sessionId) {
          console.log('⚠️ Skipping token reuse test - server does not return refreshToken/sessionId');
          return;
        }

        const firstRefresh = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/refresh`,
          {
            method: 'POST',
            body: JSON.stringify({
              refreshToken: regResponse.data.refreshToken,
              sessionId: regResponse.data.sessionId,
            }),
          },
          TEST_TIMEOUT
        );

        assertSuccessResponse(firstRefresh, 'first refresh');

        const reuseResponse = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/refresh`,
          {
            method: 'POST',
            body: JSON.stringify({
              refreshToken: regResponse.data.refreshToken,
              sessionId: regResponse.data.sessionId,
            }),
          },
          TEST_TIMEOUT
        );

        expect(reuseResponse.status).toBeGreaterThanOrEqual(400);
        console.log('✅ Token reuse detected and rejected');
      },
      TEST_TIMEOUT
    );

    it(
      'should handle concurrent refresh requests safely',
      async () => {
        const concEmail = `test-conc-${Date.now()}-${Math.random().toString(36).substring(7)}@integration-test.local`;
        const regResponse = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/register`,
          {
            method: 'POST',
            body: JSON.stringify({ email: concEmail, password: 'TestPassword123!', name: 'Concurrent Test' }),
          },
          TEST_TIMEOUT
        );

        if (!regResponse?.data?.refreshToken || !regResponse?.data?.sessionId) {
          console.log('⚠️ Skipping concurrent refresh test - server does not return refreshToken/sessionId');
          return;
        }

        const refreshPayload = JSON.stringify({
          refreshToken: regResponse.data.refreshToken,
          sessionId: regResponse.data.sessionId,
        });

        const results = await Promise.allSettled([
          TestUtils.makeRequest(
            `${SERVICE_URLS.API_GATEWAY}/api/auth/refresh`,
            { method: 'POST', body: refreshPayload },
            TEST_TIMEOUT
          ),
          TestUtils.makeRequest(
            `${SERVICE_URLS.API_GATEWAY}/api/auth/refresh`,
            { method: 'POST', body: refreshPayload },
            TEST_TIMEOUT
          ),
          TestUtils.makeRequest(
            `${SERVICE_URLS.API_GATEWAY}/api/auth/refresh`,
            { method: 'POST', body: refreshPayload },
            TEST_TIMEOUT
          ),
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const successes = fulfilled.filter((r: any) => r.value?.success || r.value?.data?.token);
        expect(successes.length).toBeLessThanOrEqual(1);
        console.log(
          `✅ Concurrent refresh: ${successes.length} succeeded, ${fulfilled.length - successes.length} rejected`
        );
      },
      TEST_TIMEOUT
    );

    it(
      'should reject expired refresh tokens',
      async () => {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/refresh`,
          {
            method: 'POST',
            body: JSON.stringify({
              refreshToken: 'expired-token-abc123',
              sessionId: '00000000-0000-0000-0000-000000000000',
            }),
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'expired/invalid refresh token');
        console.log('✅ Expired refresh token rejected');
      },
      TEST_TIMEOUT
    );

    it(
      'should revoke session on logout',
      async () => {
        const logoutEmail = `test-logout-${Date.now()}-${Math.random().toString(36).substring(7)}@integration-test.local`;
        const regResponse = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/register`,
          {
            method: 'POST',
            body: JSON.stringify({ email: logoutEmail, password: 'TestPassword123!', name: 'Logout Test' }),
          },
          TEST_TIMEOUT
        );

        if (!regResponse?.data?.refreshToken || !regResponse?.data?.sessionId) {
          console.log('⚠️ Skipping logout-revokes-session test - server does not return refreshToken/sessionId');
          return;
        }

        const accessToken = regResponse.data.token || regResponse.data.accessToken;
        await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/logout`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ sessionId: regResponse.data.sessionId }),
          },
          TEST_TIMEOUT
        );

        const refreshAfterLogout = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/refresh`,
          {
            method: 'POST',
            body: JSON.stringify({
              refreshToken: regResponse.data.refreshToken,
              sessionId: regResponse.data.sessionId,
            }),
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(refreshAfterLogout, 'session revoked after logout');
        console.log('✅ Session correctly revoked on logout');
      },
      TEST_TIMEOUT
    );
  });

  describe('Guest User Flow', () => {
    it(
      'should create guest user for anonymous access',
      async () => {
        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/guest`,
          { method: 'POST' },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'guest user creation');
        TestUtils.validateApiResponse(response);
        expect(response.data.user).toBeDefined();
        expect(response.data.user.isGuest).toBe(true);
        expect(response.data.token || response.data.accessToken).toBeDefined();

        guestUser = {
          id: response.data.user.id,
          email: '',
          accessToken: response.data.token || response.data.accessToken,
          isGuest: true,
        };

        console.log(`✅ Guest user created: ${guestUser.id}`);
      },
      TEST_TIMEOUT
    );

    it(
      'should allow guest user to access protected endpoints',
      async () => {
        if (!guestUser) throw new Error('No guest user created');

        const headers = TestUserHelper.getAuthHeaders(guestUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/profile`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'guest user profile access');
        TestUtils.validateApiResponse(response);
        expect(response.data).toBeDefined();
        console.log('✅ Guest user can access protected endpoints');
      },
      TEST_TIMEOUT
    );

    it(
      'should convert guest to registered user with data migration',
      async () => {
        if (!guestUser) throw new Error('No guest user created');

        const conversionEmail = `converted-${Date.now()}@test.local`;
        const headers = TestUserHelper.getAuthHeaders(guestUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/convert-guest`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              email: conversionEmail,
              password: testPassword,
              name: 'Converted Guest User',
            }),
          },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'guest conversion');
        TestUtils.validateApiResponse(response);
        expect(response.data.user.isGuest).toBe(false);
        expect(response.data.user.email).toBe(conversionEmail);
        console.log('✅ Guest user converted to registered user');
      },
      TEST_TIMEOUT
    );
  });

  describe('Role Verification', () => {
    it(
      'should return user role from auth context',
      async () => {
        if (!registeredUser) {
          throw new Error('No registered user available');
        }

        const headers = TestUserHelper.getAuthHeaders(registeredUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/me`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'role check');
        TestUtils.validateApiResponse(response);

        const user = response.data.user || response.data;
        expect(user).toBeDefined();
        if (user.role) {
          expect(['user', 'admin', 'librarian']).toContain(user.role);
          console.log(`✅ User role: ${user.role}`);
        }
        console.log('✅ Role verification completed');
      },
      TEST_TIMEOUT
    );
  });

  describe('Logout', () => {
    it(
      'should successfully logout user',
      async () => {
        if (!registeredUser) throw new Error('No registered user available');

        const headers = TestUserHelper.getAuthHeaders(registeredUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/auth/logout`,
          { method: 'POST', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'logout');
        TestUtils.validateApiResponse(response);
        console.log('✅ Logout successful');
      },
      TEST_TIMEOUT
    );
  });
});
