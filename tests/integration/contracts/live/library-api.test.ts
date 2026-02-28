/**
 * Library API Live Contract Tests
 *
 * Validates that actual Library API responses match our Zod contracts.
 *
 * REQUIREMENTS:
 * - API Gateway and user-service must be running
 * - Tests will FAIL if services are unavailable (not skip)
 *
 * IMPORTANT: Tests use /api/v1/app/* paths (frontend-facing) NOT /api/* (internal).
 * This ensures contract tests catch routing mismatches between frontend and API Gateway.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { ContractValidator } from './contract-validator';
import { SERVICE_URLS, createGuestUser, makeRequest, makeRequestWithStatus, TIMEOUTS } from './test-setup';
import {
  ListBooksResponseSchema,
  BookResponseSchema,
  CreateBookResponseSchema,
  ListChaptersResponseSchema,
  ListEntriesResponseSchema,
  BOOK_TYPE_IDS,
} from '@aiponge/shared-contracts';
import { z } from 'zod';

const DeleteResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .passthrough();

async function checkServiceHealth(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

describe('Library API Live Contract Tests', () => {
  let validator: ContractValidator;
  let authHeaders: Record<string, string> = {};
  let testUserId: string = '';
  let createdBookIds: string[] = [];
  let servicesAvailable = false;

  beforeAll(async () => {
    validator = new ContractValidator(SERVICE_URLS.API_GATEWAY);

    servicesAvailable = await checkServiceHealth(SERVICE_URLS.API_GATEWAY);
    if (!servicesAvailable) {
      throw new Error(
        `API Gateway is not available at ${SERVICE_URLS.API_GATEWAY}. ` +
          `Start services with 'npm run dev' before running contract tests.`
      );
    }

    const testUser = await createGuestUser();
    if (!testUser) {
      throw new Error('Failed to create test user - auth service may be unavailable');
    }

    testUserId = testUser.id;
    authHeaders = {
      Authorization: `Bearer ${testUser.accessToken}`,
      'x-user-id': testUser.id,
      'Content-Type': 'application/json',
    };
  });

  afterAll(async () => {
    for (const bookId of createdBookIds) {
      try {
        await makeRequest(`${SERVICE_URLS.API_GATEWAY}/api/v1/app/library/books/${bookId}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
      } catch (e) {}
    }
    createdBookIds = [];
    validator.printSummary();
  });

  async function createTestBook(title: string): Promise<string> {
    const response = await makeRequest(`${SERVICE_URLS.API_GATEWAY}/api/v1/app/library/books`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ typeId: BOOK_TYPE_IDS.PERSONAL, title }),
    });
    if (!response?.data?.id) {
      throw new Error(`Failed to create test book: ${JSON.stringify(response)}`);
    }
    createdBookIds.push(response.data.id);
    return response.data.id;
  }

  async function deleteTestBook(bookId: string): Promise<void> {
    await makeRequest(`${SERVICE_URLS.API_GATEWAY}/api/v1/app/library/books/${bookId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    createdBookIds = createdBookIds.filter(id => id !== bookId);
  }

  describe('Books GET Endpoints (Frontend Path: /api/v1/app/library/books)', () => {
    it('GET /api/v1/app/library/books should match ListBooksResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/v1/app/library/books',
        method: 'GET',
        schema: ListBooksResponseSchema,
        headers: authHeaders,
        description: 'List all books for user',
      });

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('GET /api/v1/app/library/books?typeId=personal should match ListBooksResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: `/api/v1/app/library/books?typeId=${BOOK_TYPE_IDS.PERSONAL}`,
        method: 'GET',
        schema: ListBooksResponseSchema,
        headers: authHeaders,
        description: 'List personal books only',
      });

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('GET /api/v1/app/library/books/:id should match BookResponseSchema for non-existent ID', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/v1/app/library/books/non-existent-id',
        method: 'GET',
        schema: BookResponseSchema,
        headers: authHeaders,
        description: 'Get single book (error case)',
      });

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });
  });

  describe('Books Mutation Endpoints (POST/PATCH/DELETE)', () => {
    let testBookId: string;

    it('POST /api/v1/app/library/books should create a book and match CreateBookResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/v1/app/library/books',
        method: 'POST',
        schema: CreateBookResponseSchema,
        headers: authHeaders,
        body: {
          typeId: BOOK_TYPE_IDS.PERSONAL,
          title: 'Contract Test Book - Mutation Suite',
        },
        description: 'Create a new book',
      });

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');

      const response = await makeRequest(
        `${SERVICE_URLS.API_GATEWAY}/api/v1/app/library/books?typeId=${BOOK_TYPE_IDS.PERSONAL}`,
        { method: 'GET', headers: authHeaders }
      );
      const books = Array.isArray(response?.data) ? response.data : response?.data?.books || [];
      const createdBook = books.find((b: any) => {
        const title = b?.title || b?.book?.title;
        return title === 'Contract Test Book - Mutation Suite';
      });
      const bookId = createdBook?.id || createdBook?.book?.id;
      if (bookId) {
        testBookId = bookId as string;
        createdBookIds.push(bookId as string);
      }
    });

    it('PATCH /api/v1/app/library/books/:id should update book and match BookResponseSchema', async () => {
      expect(testBookId).toBeDefined();

      const result = await validator.validateEndpoint({
        endpoint: `/api/v1/app/library/books/${testBookId}`,
        method: 'PATCH',
        schema: BookResponseSchema,
        headers: authHeaders,
        body: {
          title: 'Updated Contract Test Book',
        },
        description: 'Update an existing book',
      });

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('DELETE /api/v1/app/library/books/:id should delete book and match DeleteResponseSchema', async () => {
      expect(testBookId).toBeDefined();

      const result = await validator.validateEndpoint({
        endpoint: `/api/v1/app/library/books/${testBookId}`,
        method: 'DELETE',
        schema: DeleteResponseSchema,
        headers: authHeaders,
        description: 'Delete an existing book',
      });

      if (result.status === 'pass') {
        createdBookIds = createdBookIds.filter(id => id !== testBookId);
      }

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });
  });

  describe('Endpoint Existence Tests (Routing Contract - HTTP Status Validation)', () => {
    it('POST /api/v1/app/library/books should NOT return HTTP 404', async () => {
      const result = await makeRequestWithStatus(`${SERVICE_URLS.API_GATEWAY}/api/v1/app/library/books`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ typeId: BOOK_TYPE_IDS.PERSONAL, title: 'Routing Test POST' }),
      });

      expect(result.status).not.toBe(404);
      if (result.data.error?.message) {
        expect(result.data.error.message).not.toContain('endpoint not found');
      }

      if (result.ok && result.data?.data?.id) {
        await deleteTestBook(result.data.data.id);
      }
    });

    it('PATCH /api/v1/app/library/books/:id should NOT return HTTP 404 for valid book', async () => {
      const bookId = await createTestBook('Routing Test PATCH');

      try {
        const result = await makeRequestWithStatus(`${SERVICE_URLS.API_GATEWAY}/api/v1/app/library/books/${bookId}`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ title: 'Updated Routing Test' }),
        });

        expect(result.status).not.toBe(404);
        if (result.data.error?.message) {
          expect(result.data.error.message).not.toContain('endpoint not found');
        }
      } finally {
        await deleteTestBook(bookId);
      }
    });

    it('DELETE /api/v1/app/library/books/:id should NOT return HTTP 404 for valid book', async () => {
      const bookId = await createTestBook('Routing Test DELETE');

      const result = await makeRequestWithStatus(`${SERVICE_URLS.API_GATEWAY}/api/v1/app/library/books/${bookId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(result.status).not.toBe(404);
      if (result.data.error?.message) {
        expect(result.data.error.message).not.toContain('endpoint not found');
      }

      if (result.ok) {
        createdBookIds = createdBookIds.filter(id => id !== bookId);
      }
    });
  });

  describe('Chapters Endpoints (Frontend Path: /api/v1/app/library/books/:bookId/chapters)', () => {
    it('GET /api/v1/app/library/books/:bookId/chapters should match ListChaptersResponseSchema', async () => {
      const bookId = await createTestBook('Chapters Test Book');

      try {
        const result = await validator.validateEndpoint({
          endpoint: `/api/v1/app/library/books/${bookId}/chapters`,
          method: 'GET',
          schema: ListChaptersResponseSchema,
          headers: authHeaders,
          description: 'List chapters for a book',
        });

        if (result.validationErrors?.length) {
          console.error('Contract violations:', result.validationErrors);
        }
        expect(result.status).toBe('pass');
      } finally {
        await deleteTestBook(bookId);
      }
    });
  });

  describe('Entries Endpoints (Frontend Path: /api/v1/app/library/chapters/:chapterId/entries)', () => {
    it('GET /api/v1/app/library/chapters/:chapterId/entries should match ListEntriesResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/v1/app/library/chapters/test-chapter-id/entries',
        method: 'GET',
        schema: ListEntriesResponseSchema,
        headers: authHeaders,
        description: 'List entries for a chapter',
      });

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });
  });

  describe('Contract Compliance Summary', () => {
    it('should have zero contract violations', () => {
      const summary = validator.getSummary();

      console.log('\n📊 Library API Contract Compliance:');
      console.log(`   Endpoints tested: ${summary.total}`);
      console.log(`   Contracts valid:  ${summary.passed}`);
      console.log(`   Violations:       ${summary.failed}`);

      if (summary.failures.length > 0) {
        console.log('\n🔴 Contract Violations Detected:');
        for (const failure of summary.failures) {
          console.log(`   ${failure.method} ${failure.endpoint}`);
          failure.validationErrors?.forEach(e => console.log(`     - ${e}`));
          if (failure.error) {
            console.log(`     - Error: ${failure.error}`);
          }
        }
      }

      expect(summary.failed).toBe(0);
    });
  });
});
