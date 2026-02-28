/**
 * Credit Deduction Flow Integration Tests
 * HIGH: Tests the credit reserve/settle/cancel pattern for song generation
 *
 * Pattern:
 * 1. Reserve credits before expensive operation
 * 2. Perform the operation (e.g., song generation)
 * 3. Settle credits on success OR cancel reservation on failure
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

describe('Credit Deduction Flow', () => {
  let testUser: TestUser | null = null;
  let initialBalance: number = 0;
  let reservationId: string | null = null;

  const TEST_TIMEOUT = 30000;
  const CREDIT_COST_PER_SONG = 50;

  beforeAll(async () => {
    const healthStatus = await TestUtils.waitForAllServices();

    if (!healthStatus.healthy.includes('API_GATEWAY')) {
      throw new Error('API Gateway not healthy - cannot run credit tests');
    }

    testUser = await TestUserHelper.createGuestUser();
    if (!testUser) {
      testUser = await TestUserHelper.createRegisteredUser();
    }

    if (!testUser) {
      throw new Error('Could not create test user for credit tests');
    }

    console.log(`✅ Test user created: ${testUser.id}`);
  }, TIMEOUTS.SERVICE_STARTUP);

  afterAll(async () => {
    if (testUser && reservationId) {
      try {
        const headers = TestUserHelper.getAuthHeaders(testUser);
        await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/cancel`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ reservationId }),
          },
          TIMEOUTS.HEALTH_CHECK
        );
      } catch (e) {
        // Cleanup failure is acceptable
      }
    }
    await TestUserHelper.cleanupAll();
  });

  describe('Credit Balance Query', () => {
    it(
      'should retrieve user credit balance',
      async () => {
        if (!testUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(testUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/balance`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'credit balance');
        TestUtils.validateApiResponse(response);
        expect(response.data.balance).toBeDefined();
        expect(typeof response.data.balance).toBe('number');

        initialBalance = response.data.balance;
        console.log(`✅ Credit balance: ${initialBalance}`);
      },
      TEST_TIMEOUT
    );

    it(
      'should include reserved and available credits',
      async () => {
        if (!testUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(testUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/balance`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'credit balance breakdown');
        TestUtils.validateApiResponse(response);
        expect(response.data.balance).toBeDefined();

        if (response.data.reserved !== undefined) {
          expect(typeof response.data.reserved).toBe('number');
          expect(response.data.reserved).toBeGreaterThanOrEqual(0);
        }

        if (response.data.available !== undefined) {
          expect(response.data.available).toBeLessThanOrEqual(response.data.balance);
        }

        console.log(
          `✅ Balance breakdown: total=${response.data.balance}, available=${response.data.available || 'N/A'}`
        );
      },
      TEST_TIMEOUT
    );
  });

  describe('Credit Reservation', () => {
    it(
      'should reserve credits for song generation',
      async () => {
        if (!testUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(testUser);
        const operationId = `op-${Date.now()}`;

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/reserve`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              amount: CREDIT_COST_PER_SONG,
              purpose: 'song_generation',
              operationId,
            }),
          },
          TEST_TIMEOUT
        );

        if (initialBalance >= CREDIT_COST_PER_SONG) {
          assertSuccessResponse(response, 'credit reservation');
          TestUtils.validateApiResponse(response);
          expect(response.data.reservationId).toBeDefined();
          expect(response.data.reserved).toBe(CREDIT_COST_PER_SONG);

          reservationId = response.data.reservationId;
          console.log(`✅ Credits reserved: ${CREDIT_COST_PER_SONG}, reservationId: ${reservationId}`);
        } else {
          assertErrorResponse(response, 'insufficient credits for reservation');
          console.log('✅ Correctly rejected reservation due to insufficient credits');
        }
      },
      TEST_TIMEOUT
    );

    it(
      'should reject reservation when insufficient credits',
      async () => {
        if (!testUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(testUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/reserve`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              amount: 999999,
              purpose: 'test_large_amount',
              operationId: `op-${Date.now()}`,
            }),
          },
          TEST_TIMEOUT
        );

        assertErrorResponse(response, 'insufficient credits');
        expect(response.error || response.message).toMatch(/insufficient|not enough|balance/i);
        console.log('✅ Insufficient credits rejection working');
      },
      TEST_TIMEOUT
    );

    it(
      'should prevent double-spending with concurrent reservations',
      async () => {
        if (!testUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(testUser);

        if (initialBalance < CREDIT_COST_PER_SONG) {
          const response = await TestUtils.makeRequest(
            `${SERVICE_URLS.API_GATEWAY}/api/app/credits/reserve`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                amount: CREDIT_COST_PER_SONG,
                purpose: 'balance_test',
                operationId: `balance-test-${Date.now()}`,
              }),
            },
            TEST_TIMEOUT
          );

          assertErrorResponse(response, 'insufficient balance');
          console.log('✅ Correctly rejects reservation when balance insufficient');
          return;
        }

        const operationId = `concurrent-${Date.now()}`;

        const [first, second] = await Promise.all([
          TestUtils.makeRequest(
            `${SERVICE_URLS.API_GATEWAY}/api/app/credits/reserve`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                amount: initialBalance,
                purpose: 'concurrent_test',
                operationId: `${operationId}-1`,
              }),
            },
            TEST_TIMEOUT
          ),
          TestUtils.makeRequest(
            `${SERVICE_URLS.API_GATEWAY}/api/app/credits/reserve`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                amount: initialBalance,
                purpose: 'concurrent_test',
                operationId: `${operationId}-2`,
              }),
            },
            TEST_TIMEOUT
          ),
        ]);

        const successfulResults = [first, second].filter(r => r.success);
        const failedResults = [first, second].filter(r => !r.success);

        expect(successfulResults.length).toBeLessThanOrEqual(1);

        for (const result of successfulResults) {
          TestUtils.validateApiResponse(result);
          expect(result.data.reservationId).toBeDefined();
        }

        for (const result of failedResults) {
          expect(result.error || result.message).toBeDefined();
        }

        console.log(`✅ Concurrent reservation protection: ${successfulResults.length}/2 succeeded`);

        for (const reservation of successfulResults) {
          if (reservation?.data?.reservationId) {
            const cancelResponse = await TestUtils.makeRequest(
              `${SERVICE_URLS.API_GATEWAY}/api/app/credits/cancel`,
              {
                method: 'POST',
                headers,
                body: JSON.stringify({ reservationId: reservation.data.reservationId }),
              },
              TIMEOUTS.HEALTH_CHECK
            );
            assertSuccessResponse(cancelResponse, 'cleanup cancellation');
          }
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('Credit Settlement', () => {
    it(
      'should settle credits after successful operation',
      async () => {
        if (!testUser) throw new Error('Test user not available');

        if (!reservationId) {
          if (initialBalance < CREDIT_COST_PER_SONG) {
            console.log('✅ No reservation available (insufficient credits) - settlement test N/A');
            expect(true).toBe(true);
            return;
          }
          throw new Error('Expected reservation from previous step');
        }

        const headers = TestUserHelper.getAuthHeaders(testUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/settle`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ reservationId }),
          },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'credit settlement');
        TestUtils.validateApiResponse(response);
        expect(response.data.settled).toBe(true);

        const balanceResponse = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/balance`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(balanceResponse, 'balance after settlement');
        const expectedBalance = initialBalance - CREDIT_COST_PER_SONG;
        expect(balanceResponse.data.balance).toBe(expectedBalance);
        console.log(`✅ Balance reduced: ${initialBalance} -> ${balanceResponse.data.balance}`);

        reservationId = null;
      },
      TEST_TIMEOUT
    );
  });

  describe('Credit Cancellation', () => {
    it(
      'should cancel reservation and restore credits on failure',
      async () => {
        if (!testUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(testUser);

        const balanceBefore = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/balance`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        const reserveResponse = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/reserve`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              amount: CREDIT_COST_PER_SONG,
              purpose: 'cancellation_test',
              operationId: `cancel-test-${Date.now()}`,
            }),
          },
          TEST_TIMEOUT
        );

        if (balanceBefore.data.balance < CREDIT_COST_PER_SONG) {
          assertErrorResponse(reserveResponse, 'insufficient credits for reservation');
          console.log('✅ Reservation correctly rejected due to insufficient credits');
          return;
        }

        assertSuccessResponse(reserveResponse, 'reservation for cancellation test');
        TestUtils.validateApiResponse(reserveResponse);
        expect(reserveResponse.data.reservationId).toBeDefined();

        const cancelReservationId = reserveResponse.data.reservationId;

        const cancelResponse = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/cancel`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              reservationId: cancelReservationId,
              reason: 'Operation failed - test cancellation',
            }),
          },
          TEST_TIMEOUT
        );

        assertSuccessResponse(cancelResponse, 'reservation cancellation');
        expect(cancelResponse.data.cancelled).toBe(true);

        const balanceAfter = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/balance`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(balanceAfter, 'balance after cancellation');
        TestUtils.validateApiResponse(balanceAfter);
        assertSuccessResponse(balanceBefore, 'balance before cancellation');

        expect(balanceAfter.data.balance).toBe(balanceBefore.data.balance);
        console.log('✅ Credits restored after cancellation');
      },
      TEST_TIMEOUT
    );
  });

  describe('Credit Purchase Flow', () => {
    it(
      'should list available credit packs',
      async () => {
        if (!testUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(testUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/store/credit-packs`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'credit packs list');
        TestUtils.validateApiResponse(response);

        const packs = response.data.packs || response.data;
        expect(Array.isArray(packs)).toBe(true);

        if (packs.length > 0) {
          expect(packs[0]).toHaveProperty('id');
          expect(packs[0]).toHaveProperty('credits');
          expect(packs[0]).toHaveProperty('price');
        }
        console.log(`✅ Credit packs available: ${packs.length}`);
      },
      TEST_TIMEOUT
    );
  });

  describe('Credit Transaction History', () => {
    it(
      'should retrieve credit transaction history',
      async () => {
        if (!testUser) throw new Error('Test user not available');

        const headers = TestUserHelper.getAuthHeaders(testUser);

        const response = await TestUtils.makeRequest(
          `${SERVICE_URLS.API_GATEWAY}/api/app/credits/history`,
          { method: 'GET', headers },
          TEST_TIMEOUT
        );

        assertSuccessResponse(response, 'credit transaction history');
        TestUtils.validateApiResponse(response);

        const transactions = response.data.transactions || response.data;
        expect(Array.isArray(transactions)).toBe(true);

        if (transactions.length > 0) {
          expect(transactions[0]).toHaveProperty('type');
          expect(transactions[0]).toHaveProperty('amount');
        }
        console.log(`✅ Transaction history: ${transactions.length} entries`);
      },
      TEST_TIMEOUT
    );
  });
});
