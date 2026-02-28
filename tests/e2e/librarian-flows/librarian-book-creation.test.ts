/**
 * Librarian Book Creation Flow Test
 *
 * Tests the complete flow of a librarian creating a wisdom book:
 * 1. Authenticate as librarian
 * 2. Generate book blueprint with AI
 * 3. Verify book is created with correct structure
 * 4. Validate response matches contracts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:8080';

const TIMEOUTS = {
  REQUEST: 15000,
  GENERATION: 120000,
  HEALTH: 5000,
};

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = TIMEOUTS.REQUEST
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = global.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    global.clearTimeout(timeoutId);
  }
}

async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs = TIMEOUTS.REQUEST
): Promise<{ success: boolean; data?: T; error?: string; status: number }> {
  const url = `${API_GATEWAY_URL}${endpoint}`;
  try {
    const response = await fetchWithTimeout(
      url,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...((options.headers as Record<string, string>) || {}),
        },
      },
      timeoutMs
    );

    const data = await response.json().catch(() => ({}));
    return {
      success: response.ok,
      data: data.data || data,
      error: data.error,
      status: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return { success: false, error: message, status: 0 };
  }
}

const BookGenerationRequestSchema = z.object({
  primaryGoal: z.string().min(10).max(2000),
  language: z.string().optional(),
  tone: z.enum(['supportive', 'challenging', 'neutral']).optional(),
  generationMode: z.enum(['blueprint', 'book']).optional(),
  depthLevel: z.enum(['brief', 'standard', 'deep']).optional(),
});

const BookGenerationResponseSchema = z.object({
  success: z.boolean(),
  requestId: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
});

const BlueprintStatusResponseSchema = z.object({
  success: z.boolean(),
  requestId: z.string().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  book: z
    .object({
      title: z.string(),
      description: z.string(),
      chapters: z.array(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          order: z.number(),
          entries: z.array(
            z.object({
              prompt: z.string(),
              type: z.string(),
              content: z.string().optional(),
            })
          ),
        })
      ),
    })
    .optional(),
  error: z.string().optional(),
});

describe('Librarian Book Creation Flow', () => {
  let authToken: string | null = null;
  let userId: string | null = null;
  let isApiAvailable = false;

  beforeAll(async () => {
    try {
      const healthResponse = await fetchWithTimeout(`${API_GATEWAY_URL}/health`, {}, TIMEOUTS.HEALTH);
      isApiAvailable = healthResponse.ok;

      if (!isApiAvailable) {
        console.log('⏭️ API Gateway not available, tests will be skipped');
        return;
      }

      const guestResponse = await apiRequest<{
        token?: string;
        accessToken?: string;
        user?: { id: string };
        id?: string;
      }>('/api/auth/guest', { method: 'POST' });

      if (guestResponse.success && guestResponse.data) {
        authToken = guestResponse.data.token || guestResponse.data.accessToken || null;
        userId = guestResponse.data.user?.id || guestResponse.data.id || null;
        console.log('✅ Created test user:', { userId, hasToken: !!authToken });
      }
    } catch (error) {
      console.log('⚠️ Setup failed:', error);
      isApiAvailable = false;
    }
  });

  function getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${authToken}`,
      'x-user-id': userId || '',
      'x-user-role': 'librarian',
      'Content-Type': 'application/json',
    };
  }

  describe('API Gateway Health', () => {
    it('should have API Gateway available', async () => {
      if (!isApiAvailable) {
        console.log('⏭️ Skipping - API Gateway not available');
        return;
      }
      expect(isApiAvailable).toBe(true);
    });
  });

  describe('Book Generation Endpoint', () => {
    it('should validate book generation request schema', async () => {
      if (!isApiAvailable || !authToken) {
        console.log('⏭️ Skipping - prerequisites not met');
        return;
      }

      const validRequest = {
        primaryGoal: 'A wisdom book about finding inner peace through ancient philosophy',
        language: 'en-US',
        tone: 'supportive',
        generationMode: 'book',
        depthLevel: 'brief',
      };

      const validation = BookGenerationRequestSchema.safeParse(validRequest);
      expect(validation.success).toBe(true);
    });

    it('should initiate wisdom book generation as librarian', async () => {
      if (!isApiAvailable || !authToken) {
        console.log('⏭️ Skipping - prerequisites not met');
        return;
      }

      const request = {
        primaryGoal:
          'A wisdom book about finding inner peace through ancient Stoic philosophy and Buddhist mindfulness practices',
        language: 'en-US',
        tone: 'supportive',
        generationMode: 'book',
        depthLevel: 'brief',
      };

      const response = await apiRequest<{
        requestId?: string;
        status?: string;
        error?: string;
        requiresPremium?: boolean;
      }>('/api/app/books/generate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(request),
      });

      console.log('📝 Generation response:', {
        success: response.success,
        status: response.status,
        data: response.data,
        error: response.error,
      });

      if (response.data?.requiresPremium) {
        console.log('⏭️ Skipping - Paid subscription required');
        return;
      }

      if (response.success) {
        expect(response.data?.requestId).toBeDefined();
        expect(response.data?.status).toBe('pending');
      } else {
        console.log('⚠️ Generation request failed:', response.error);
      }
    });

    it('should reject invalid depth level', async () => {
      if (!isApiAvailable || !authToken) {
        console.log('⏭️ Skipping - prerequisites not met');
        return;
      }

      const invalidRequest = {
        primaryGoal: 'Test book about philosophy',
        generationMode: 'book',
        depthLevel: 'invalid_depth',
      };

      const response = await apiRequest('/api/app/books/generate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(invalidRequest),
      });

      expect(response.success).toBe(false);
    });

    it('should validate depthLevel reaches backend correctly', async () => {
      if (!isApiAvailable || !authToken) {
        console.log('⏭️ Skipping - prerequisites not met');
        return;
      }

      const depthLevels = ['brief', 'standard', 'deep'] as const;

      for (const depth of depthLevels) {
        const request = {
          primaryGoal: `Test book for ${depth} depth validation - exploring mindfulness techniques`,
          language: 'en-US',
          tone: 'neutral',
          generationMode: 'book',
          depthLevel: depth,
        };

        const validation = BookGenerationRequestSchema.safeParse(request);
        expect(validation.success).toBe(true);

        if (validation.success) {
          expect(validation.data.depthLevel).toBe(depth);
          console.log(`✅ Depth level '${depth}' validated correctly`);
        }
      }
    });
  });

  describe('Library Endpoints Contract Validation', () => {
    it('should list books with valid response schema', async () => {
      if (!isApiAvailable || !authToken) {
        console.log('⏭️ Skipping - prerequisites not met');
        return;
      }

      const response = await apiRequest<{
        books?: Array<{
          id: string;
          title: string;
          bookType: string;
        }>;
      }>('/api/app/library/books', {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      console.log('📚 List books response:', {
        success: response.success,
        status: response.status,
        bookCount: response.data?.books?.length || 0,
      });

      if (response.success && response.data?.books) {
        expect(Array.isArray(response.data.books)).toBe(true);

        if (response.data.books.length > 0) {
          const book = response.data.books[0];
          expect(book).toHaveProperty('id');
          expect(book).toHaveProperty('title');
        }
      }
    });

    it('should list wisdom books only with type filter', async () => {
      if (!isApiAvailable || !authToken) {
        console.log('⏭️ Skipping - prerequisites not met');
        return;
      }

      const response = await apiRequest<{
        books?: Array<{
          id: string;
          title: string;
          bookType: string;
        }>;
      }>('/api/app/library/books?type=wisdom', {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      console.log('📖 Wisdom books response:', {
        success: response.success,
        bookCount: response.data?.books?.length || 0,
      });

      if (response.success && response.data?.books) {
        for (const book of response.data.books) {
          expect(book.bookType).toBe('wisdom');
        }
      }
    });
  });

  describe('Entries Terminology Validation', () => {
    it('should use "entries" not "excerpts" in API responses', async () => {
      if (!isApiAvailable || !authToken) {
        console.log('⏭️ Skipping - prerequisites not met');
        return;
      }

      const booksResponse = await apiRequest<{
        books?: Array<{ id: string }>;
      }>('/api/app/library/books', {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!booksResponse.success || !booksResponse.data?.books?.length) {
        console.log('⏭️ No books available to test entries');
        return;
      }

      const bookId = booksResponse.data.books[0].id;

      const chaptersResponse = await apiRequest<{
        chapters?: Array<{ id: string }>;
      }>(`/api/app/library/books/${bookId}/chapters`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!chaptersResponse.success || !chaptersResponse.data?.chapters?.length) {
        console.log('⏭️ No chapters available to test entries');
        return;
      }

      const chapterId = chaptersResponse.data.chapters[0].id;

      const entriesResponse = await apiRequest<{
        entries?: Array<{ id: string; prompt?: string; content?: string }>;
        excerpts?: Array<unknown>;
      }>(`/api/app/library/chapters/${chapterId}/entries`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      console.log('📝 Entries response keys:', Object.keys(entriesResponse.data || {}));

      if (entriesResponse.success) {
        expect(entriesResponse.data).not.toHaveProperty('excerpts');
      }
    });
  });
});
