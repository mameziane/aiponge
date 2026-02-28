/**
 * Library API Contract Tests
 *
 * These tests validate that backend responses match the contract schemas.
 * This would have caught the frontend-backend mismatch where:
 * - Backend returns: { success: true, data: { books: [...], total: N } }
 * - Frontend expected: { success: true, data: [...] }
 */

import { describe, it, expect } from 'vitest';

import {
  LibBookSchema,
  LibChapterSchema,
  LibEntrySchema,
  ListBooksResponseSchema,
  ListBooksResponseDataSchema,
  ListChaptersResponseSchema,
  ListEntriesResponseSchema,
  validateListBooksResponse,
  extractBooksFromResponse,
  safeExtractBooksFromApiResponse,
  ServiceResponseSchema,
  BOOK_TYPE_IDS,
  CONTENT_VISIBILITY,
} from '@aiponge/shared-contracts';

describe('Library API Contract Tests', () => {
  describe('Schema Definitions', () => {
    it('should validate LibBookSchema with valid data', () => {
      const validBook = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        typeId: BOOK_TYPE_IDS.PERSONAL,
        userId: '550e8400-e29b-41d4-a716-446655440001',
        title: 'My Personal Book',
        language: 'en',
        visibility: CONTENT_VISIBILITY.PERSONAL,
        status: 'active',
        isReadOnly: false,
        sortOrder: 0,
        chapterCount: 2,
        entryCount: 10,
        tags: ['personal'],
        themes: ['growth'],
        metadata: {},
        createdAt: '2025-01-30T12:00:00Z',
        updatedAt: '2025-01-30T12:00:00Z',
      };

      const result = LibBookSchema.safeParse(validBook);
      expect(result.success).toBe(true);
    });

    it('should validate LibChapterSchema with valid data', () => {
      const validChapter = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        bookId: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Chapter 1',
        sortOrder: 0,
        isLocked: false,
        entryCount: 5,
        metadata: {},
        createdAt: '2025-01-30T12:00:00Z',
        updatedAt: '2025-01-30T12:00:00Z',
      };

      const result = LibChapterSchema.safeParse(validChapter);
      expect(result.success).toBe(true);
    });

    it('should validate LibEntrySchema with valid data', () => {
      const validEntry = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        chapterId: '550e8400-e29b-41d4-a716-446655440002',
        content: 'Today was a good day.',
        entryType: 'reflection',
        sortOrder: 0,
        tags: [],
        themes: [],
        musicHints: {},
        metadata: {},
        createdAt: '2025-01-30T12:00:00Z',
        updatedAt: '2025-01-30T12:00:00Z',
      };

      const result = LibEntrySchema.safeParse(validEntry);
      expect(result.success).toBe(true);
    });
  });

  describe('Response Contract Validation', () => {
    it('should validate ListBooksResponse with paginated data structure', () => {
      const backendResponse = {
        success: true,
        data: {
          books: [
            {
              book: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                typeId: BOOK_TYPE_IDS.PERSONAL,
                userId: '550e8400-e29b-41d4-a716-446655440001',
                title: 'My Personal Book',
                language: 'en',
                visibility: CONTENT_VISIBILITY.PERSONAL,
                status: 'active',
                isReadOnly: false,
                sortOrder: 0,
                chapterCount: 2,
                entryCount: 10,
                tags: [],
                themes: [],
                metadata: {},
                createdAt: '2025-01-30T12:00:00Z',
                updatedAt: '2025-01-30T12:00:00Z',
              },
              entity: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                typeId: BOOK_TYPE_IDS.PERSONAL,
                userId: '550e8400-e29b-41d4-a716-446655440001',
                title: 'My Personal Book',
              },
              coverIllustration: null,
            },
          ],
          total: 1,
        },
      };

      const result = ListBooksResponseSchema.safeParse(backendResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data?.books).toHaveLength(1);
        expect(result.data.data?.total).toBe(1);
      }
    });

    it('should FAIL if backend returns array directly instead of { books, total }', () => {
      const incorrectResponse = {
        success: true,
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            typeId: BOOK_TYPE_IDS.PERSONAL,
            title: 'My Personal Book',
          },
        ],
      };

      const result = ListBooksResponseSchema.safeParse(incorrectResponse);
      expect(result.success).toBe(false);
    });

    it('should validate extractBooksFromResponse handles both formats', () => {
      const arrayFormat = [{ book: {}, entity: {} }];
      const objectFormat = { books: [{ book: {}, entity: {} }], total: 1 };

      const fromArray = extractBooksFromResponse(arrayFormat);
      const fromObject = extractBooksFromResponse(objectFormat);

      expect(fromArray).toHaveLength(1);
      expect(fromObject).toHaveLength(1);
    });

    it('should validate safeExtractBooksFromApiResponse handles full API response', () => {
      const fullSuccessResponse = {
        success: true,
        data: { books: [{ book: { id: 'test' }, entity: {} }], total: 1 },
      };
      const fullFailureResponse = {
        success: false,
        error: { code: 'ERROR', message: 'Failed' },
      };
      const invalidResponse = null;

      const fromSuccess = safeExtractBooksFromApiResponse(fullSuccessResponse);
      const fromFailure = safeExtractBooksFromApiResponse(fullFailureResponse);
      const fromInvalid = safeExtractBooksFromApiResponse(invalidResponse);

      expect(fromSuccess).toHaveLength(1);
      expect(fromFailure).toHaveLength(0);
      expect(fromInvalid).toHaveLength(0);
    });
  });

  describe('Contract Mismatch Detection (Regression Prevention)', () => {
    it('should detect the exact mismatch that caused TypeError in useUnifiedLibrary', () => {
      const backendActualResponse = {
        success: true,
        data: {
          books: [
            {
              book: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                typeId: BOOK_TYPE_IDS.PERSONAL,
                userId: '550e8400-e29b-41d4-a716-446655440001',
                title: 'My Personal Book',
                language: 'en',
                visibility: CONTENT_VISIBILITY.PERSONAL,
                status: 'active',
                isReadOnly: false,
                sortOrder: 0,
                chapterCount: 0,
                entryCount: 0,
                tags: [],
                themes: [],
                metadata: {},
                createdAt: '2025-01-30T12:00:00Z',
                updatedAt: '2025-01-30T12:00:00Z',
              },
              entity: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                typeId: BOOK_TYPE_IDS.PERSONAL,
                userId: '550e8400-e29b-41d4-a716-446655440001',
                title: 'My Personal Book',
              },
              coverIllustration: null,
            },
          ],
          total: 1,
        },
      };

      const whatFrontendExpectedBefore = ServiceResponseSchema(LibBookSchema.array());

      const whatFrontendShouldExpectNow = ListBooksResponseSchema;

      const oldFrontendValidation = whatFrontendExpectedBefore.safeParse(backendActualResponse);
      const newFrontendValidation = whatFrontendShouldExpectNow.safeParse(backendActualResponse);

      expect(oldFrontendValidation.success).toBe(false);
      expect(newFrontendValidation.success).toBe(true);
    });
  });

  describe('Error Response Validation', () => {
    it('should validate error response structure', () => {
      const errorResponse = {
        success: false,
        error: {
          type: 'NOT_FOUND',
          code: 'NOT_FOUND',
          message: 'Book not found',
        },
      };

      const result = ListBooksResponseSchema.safeParse(errorResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(false);
        expect(result.data.error?.code).toBe('NOT_FOUND');
      }
    });
  });
});

describe('Frontend-Backend Contract Alignment', () => {
  it('should document the correct API response format for GET books', () => {
    const documentedFormat = {
      endpoint: '/api/app/library/books',
      method: 'GET',
      successResponse: {
        success: true,
        data: {
          books: 'LibBookWithCover[]',
          total: 'number',
        },
      },
      errorResponse: {
        success: false,
        error: {
          type: 'string',
          code: 'string',
          message: 'string',
        },
      },
    };

    expect(documentedFormat.successResponse.data.books).toBe('LibBookWithCover[]');
    expect(documentedFormat.successResponse.data.total).toBe('number');
  });

  it('should document mutation endpoints (POST/PATCH/DELETE)', () => {
    const mutationEndpoints = [
      {
        endpoint: '/api/app/library/books',
        method: 'POST',
        description: 'Create a new book',
        body: { typeId: 'string', title: 'string' },
        successResponse: { success: true, data: 'LibBook' },
      },
      {
        endpoint: '/api/app/library/books/:id',
        method: 'PATCH',
        description: 'Update an existing book',
        body: { title: 'string (optional)', description: 'string (optional)' },
        successResponse: { success: true, data: 'LibBook' },
      },
      {
        endpoint: '/api/app/library/books/:id',
        method: 'DELETE',
        description: 'Delete a book',
        successResponse: { success: true },
      },
    ];

    expect(mutationEndpoints).toHaveLength(3);
    expect(mutationEndpoints[0].method).toBe('POST');
    expect(mutationEndpoints[1].method).toBe('PATCH');
    expect(mutationEndpoints[2].method).toBe('DELETE');
  });

  it('should document that /api/app/library/books is the canonical frontend path', () => {
    const canonicalPaths = {
      listBooks: '/api/app/library/books',
      getBook: '/api/app/library/books/:id',
      createBook: '/api/app/library/books',
      updateBook: '/api/app/library/books/:id',
      deleteBook: '/api/app/library/books/:id',
      getChapters: '/api/app/library/books/:id/chapters',
    };

    Object.values(canonicalPaths).forEach(path => {
      expect(path).not.toContain('/my/');
    });
  });
});
