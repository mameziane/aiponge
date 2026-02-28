import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../config/service-urls', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  SERVICE_URLS: { aiConfigService: 'http://localhost:3010' },
  getServiceUrl: vi.fn(() => 'http://localhost:3020'),
  createServiceHttpClient: vi.fn(() => ({
    postWithResponse: vi.fn(),
    deleteWithResponse: vi.fn(),
  })),
}));

const mockLoggerInstance = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

vi.mock('@aiponge/platform-core', () => ({
  serializeError: vi.fn((err: unknown) => err),
  errorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  errorStack: vi.fn((err: unknown) => (err instanceof Error ? err.stack : '')),
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
  signUserIdHeader: vi.fn(() => ({ 'x-user-id': 'user-123' })),
  createLogger: () => mockLoggerInstance,
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  DomainErrorCode: {},
  createDomainServiceError: vi.fn(
    () =>
      class MockDomainError extends Error {
        public readonly statusCode: number;
        public readonly code?: string;
        constructor(message: string, statusCode: number = 500, code?: string, _cause?: Error) {
          super(message);
          this.statusCode = statusCode;
          this.code = code;
        }
      }
  ),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
  TierConfigClient: class MockTierConfigClient {
    hasFeature = vi.fn().mockResolvedValue(true);
    getMaxBookDepth = vi.fn().mockResolvedValue('deep');
    canGenerateBookAtDepth = vi.fn().mockResolvedValue(true);
  },
}));

vi.mock('@aiponge/shared-contracts', async () => {
  const { z } = await import('zod');
  return {
    CONTENT_VISIBILITY: { PUBLIC: 'public', PRIVATE: 'private', PERSONAL: 'personal', SHARED: 'shared' },
    ContentVisibilitySchema: z.enum(['public', 'private', 'personal', 'shared']),
    contextIsPrivileged: vi.fn(() => false),
    contextIsAdmin: vi.fn(() => false),
    isContentPubliclyAccessible: vi.fn(() => false),
    canViewContent: vi.fn(() => true),
    canEditContent: vi.fn(() => true),
    canDeleteContent: vi.fn(() => true),
    isPrivilegedRole: vi.fn(() => false),
    normalizeRole: vi.fn((role: string) => role),
    createAuthContext: vi.fn((userId: string, role: string) => ({ userId, role })),
    buildContentAccessContext: vi.fn((auth: unknown) => auth),
    BOOK_TYPE_IDS: { PERSONAL: 'personal', WISDOM: 'wisdom' },
    SUBSCRIPTION_STATUS: { ACTIVE: 'active' },
    TIER_IDS: { GUEST: 'guest' },
    ENTRY_TYPES: {
      REFLECTION: 'reflection',
      BOOKMARK: 'bookmark',
      QUOTE: 'quote',
      NOTE: 'note',
      INSIGHT: 'insight',
      WISDOM: 'wisdom',
      EXCERPT: 'excerpt',
    },
    ILLUSTRATION_TYPES: {
      COVER: 'cover',
      CHAPTER: 'chapter',
      ENTRY: 'entry',
      INLINE: 'inline',
    },
    ILLUSTRATION_SOURCES: {
      UPLOADED: 'uploaded',
      AI_GENERATED: 'ai_generated',
      STOCK: 'stock',
    },
    REMINDER_TYPES: {
      DAILY_REFLECTION: 'daily_reflection',
      WEEKLY_REVIEW: 'weekly_review',
      BOOK_PROGRESS: 'book_progress',
    },
    UserRole: {},
    BookDepthLevel: {},
  };
});

vi.mock('../../../infrastructure/events/UserEventPublisher', () => ({
  UserEventPublisher: {
    libraryChapterDeleted: vi.fn(),
    libraryEntryDeleted: vi.fn(),
  },
}));

vi.mock('../../../infrastructure/clients/ContentServiceClient', () => ({
  ContentServiceClient: {
    getInstance: vi.fn(() => ({
      generateInsights: vi.fn().mockResolvedValue({
        insights: ['Test insight'],
        confidence: 0.8,
      }),
    })),
  },
}));

class MockAiContentServiceClient {
  generateBookCover = vi.fn().mockResolvedValue({
    success: true,
    artworkUrl: 'https://example.com/cover.jpg',
    templateUsed: 'default',
    processingTimeMs: 1000,
  });
}

vi.mock('../../../infrastructure/clients/AiContentServiceClient', () => ({
  AiContentServiceClient: MockAiContentServiceClient,
}));

vi.mock('../../../infrastructure/clients', () => ({
  AiContentServiceClient: MockAiContentServiceClient,
  ContentServiceClient: {
    getInstance: vi.fn(() => ({
      generateInsights: vi.fn().mockResolvedValue({ insights: [], confidence: 0 }),
    })),
  },
}));

const mockBookGenerationRepo = {
  createRequest: vi.fn().mockResolvedValue({ id: 'req-1', status: 'pending', userId: 'user-123', primaryGoal: 'test', createdAt: new Date() }),
  getActiveRequestForUser: vi.fn().mockResolvedValue(null),
  getRequestByIdAndUser: vi.fn().mockResolvedValue(null),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  getRequestById: vi.fn().mockResolvedValue(null),
};
const mockBookTypeRepoInternal = {
  getById: vi.fn().mockResolvedValue({ id: 'personal', promptTemplateId: 'personal-book', isUserCreatable: true, isEditable: true }),
};
const mockSubscriptionRepo = {
  getSubscriptionByUserId: vi.fn().mockResolvedValue({ status: 'active', subscriptionTier: 'personal' }),
};
const mockAuthRepo = {
  getUserById: vi.fn().mockResolvedValue({ id: 'user-123', role: 'user' }),
};

vi.mock('../../../infrastructure/database/DatabaseConnectionFactory', () => ({
  createDrizzleRepository: vi.fn((RepoClass: any) => {
    const name = RepoClass?.name || '';
    if (name === 'BookGenerationRepository') return mockBookGenerationRepo;
    if (name === 'BookTypeRepository') return mockBookTypeRepoInternal;
    if (name === 'SubscriptionRepository') return mockSubscriptionRepo;
    if (name === 'AuthRepository') return mockAuthRepo;
    return {};
  }),
}));

vi.mock('../../../infrastructure/services', () => ({
  RiskDetectionService: vi.fn(),
}));

const TEST_USER_ID = 'user-123';
const OTHER_USER_ID = 'user-456';
const TEST_BOOK_ID = 'b0000000-0000-0000-0000-000000000001';
const TEST_CHAPTER_ID = 'c0000000-0000-0000-0000-000000000001';
const TEST_ENTRY_ID = 'e0000000-0000-0000-0000-000000000001';
const TEST_ILLUSTRATION_ID = 'i0000000-0000-0000-0000-000000000001';

function createContext(userId = TEST_USER_ID, role = 'user') {
  return { userId, role, accessibleCreatorIds: [], tier: 'guest', sharedContentIds: [] };
}

function makeBook(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_BOOK_ID,
    typeId: 'personal',
    title: 'Test Book',
    subtitle: null,
    description: null,
    author: null,
    userId: TEST_USER_ID,
    isReadOnly: false,
    category: null,
    language: null,
    era: null,
    tradition: null,
    visibility: 'personal',
    status: 'active',
    systemType: null,
    chapterCount: 0,
    entryCount: 0,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeChapter(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_CHAPTER_ID,
    bookId: TEST_BOOK_ID,
    userId: TEST_USER_ID,
    title: 'Test Chapter',
    description: null,
    sortOrder: 0,
    isLocked: false,
    unlockTrigger: null,
    unlockedAt: null,
    entryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_ENTRY_ID,
    chapterId: TEST_CHAPTER_ID,
    bookId: TEST_BOOK_ID,
    userId: TEST_USER_ID,
    content: 'Test entry content',
    entryType: 'reflection',
    processingStatus: null,
    illustrationUrl: null,
    chapterSortOrder: null,
    sortOrder: 0,
    sourceTitle: null,
    sourceAuthor: null,
    sourceChapter: null,
    attribution: null,
    moodContext: null,
    sentiment: null,
    emotionalIntensity: null,
    tags: null,
    themes: null,
    musicHints: null,
    depthLevel: null,
    metadata: null,
    userDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeIllustration(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_ILLUSTRATION_ID,
    bookId: TEST_BOOK_ID,
    chapterId: null,
    entryId: null,
    url: 'https://example.com/image.jpg',
    artworkUrl: null,
    altText: null,
    illustrationType: 'cover',
    source: 'uploaded',
    sortOrder: 0,
    generationPrompt: null,
    generationMetadata: null,
    width: null,
    height: null,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('Library Use Cases', () => {
  describe('Book', () => {
    describe('BookService', () => {
      let bookService: any;
      let mockBookRepo: any;
      let mockBookTypeRepo: any;
      let mockIllustrationRepo: any;
      let mockChapterRepo: any;
      let mockEntryRepo: any;

      beforeEach(async () => {
        mockBookRepo = {
          create: vi.fn().mockResolvedValue(makeBook()),
          getById: vi.fn().mockResolvedValue(makeBook()),
          update: vi.fn().mockResolvedValue(makeBook()),
          delete: vi.fn().mockResolvedValue(undefined),
          getBooksByUserAndType: vi.fn().mockResolvedValue([makeBook()]),
          getOrCreateDefaultPersonalBook: vi.fn().mockResolvedValue(makeBook()),
          getBooksByFilters: vi.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
          updateChapterCount: vi.fn().mockResolvedValue(undefined),
          updateEntryCount: vi.fn().mockResolvedValue(undefined),
        };
        mockBookTypeRepo = {
          getById: vi.fn().mockResolvedValue({ id: 'personal', isUserCreatable: true, isEditable: true }),
        };
        mockIllustrationRepo = {
          getBookCover: vi.fn().mockResolvedValue(null),
          getBookCoversBatch: vi.fn().mockResolvedValue(new Map()),
        };
        mockChapterRepo = {
          getByBook: vi.fn().mockResolvedValue([]),
        };
        mockEntryRepo = {
          getByBook: vi.fn().mockResolvedValue([]),
        };

        const { BookService } = await import(
          '../../../application/use-cases/library/book/BookService'
        );
        bookService = new BookService(
          mockBookRepo,
          mockBookTypeRepo,
          mockIllustrationRepo,
          mockChapterRepo,
          mockEntryRepo
        );
      });

      it('should create a book successfully', async () => {
        const result = await bookService.create(
          { typeId: 'personal', title: 'My Book' },
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.book.title).toBe('Test Book');
        }
        expect(mockBookRepo.create).toHaveBeenCalled();
      });

      it('should return validation error for empty title', async () => {
        const result = await bookService.create(
          { typeId: 'personal', title: '' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });

      it('should return not found when book type does not exist', async () => {
        mockBookTypeRepo.getById.mockResolvedValue(null);
        const result = await bookService.create(
          { typeId: 'nonexistent', title: 'My Book' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });

      it('should get a book with chapters', async () => {
        const result = await bookService.get(TEST_BOOK_ID, createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.book.id).toBe(TEST_BOOK_ID);
        }
      });

      it('should return not found when book does not exist', async () => {
        mockBookRepo.getById.mockResolvedValue(null);
        const result = await bookService.get('nonexistent', createContext());
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });

      it('should update a book successfully', async () => {
        const result = await bookService.update(
          TEST_BOOK_ID,
          { title: 'Updated Title' },
          createContext()
        );
        expect(result.success).toBe(true);
        expect(mockBookRepo.update).toHaveBeenCalledWith(TEST_BOOK_ID, { title: 'Updated Title' });
      });

      it('should return not found on update for missing book', async () => {
        mockBookRepo.getById.mockResolvedValue(null);
        const result = await bookService.update(
          'missing-id',
          { title: 'Updated' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });

      it('should return forbidden when updating read-only book', async () => {
        mockBookRepo.getById.mockResolvedValue(makeBook({ isReadOnly: true }));
        const result = await bookService.update(
          TEST_BOOK_ID,
          { title: 'Updated' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('FORBIDDEN');
        }
      });

      it('should delete a book successfully', async () => {
        const result = await bookService.delete(TEST_BOOK_ID, createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.deleted).toBe(true);
        }
      });

      it('should return not found on delete for missing book', async () => {
        mockBookRepo.getById.mockResolvedValue(null);
        const result = await bookService.delete('missing-id', createContext());
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });

      it('should list books for a user', async () => {
        const result = await bookService.list(createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.books.length).toBeGreaterThanOrEqual(1);
        }
      });
    });

    describe('GenerateBookUseCase', () => {
      let useCase: any;

      beforeEach(async () => {
        mockBookGenerationRepo.createRequest.mockResolvedValue({
          id: 'req-1',
          status: 'pending',
          userId: TEST_USER_ID,
          primaryGoal: 'Test goal description that is long enough',
          createdAt: new Date(),
        });
        mockBookGenerationRepo.getActiveRequestForUser.mockResolvedValue(null);
        mockBookGenerationRepo.getRequestByIdAndUser.mockResolvedValue(null);
        mockSubscriptionRepo.getSubscriptionByUserId.mockResolvedValue({
          status: 'active',
          subscriptionTier: 'personal',
        });
        mockAuthRepo.getUserById.mockResolvedValue({ id: TEST_USER_ID, role: 'user' });

        const { GenerateBookUseCase } = await import(
          '../../../application/use-cases/library/GenerateBookUseCase'
        );
        useCase = new GenerateBookUseCase();
      });

      it('should create a generation request successfully', async () => {
        const result = await useCase.createRequest({
          userId: TEST_USER_ID,
          primaryGoal: 'A personal reflection journal about mindfulness and gratitude',
        });
        expect(result.success).toBe(true);
        expect(result.requestId).toBe('req-1');
        expect(result.status).toBe('pending');
      });

      it('should reject short descriptions', async () => {
        const result = await useCase.createRequest({
          userId: TEST_USER_ID,
          primaryGoal: 'short',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('at least 10 characters');
      });

      it('should return existing active request instead of creating duplicate', async () => {
        mockBookGenerationRepo.getActiveRequestForUser.mockResolvedValue({
          id: 'existing-req',
          status: 'processing',
          createdAt: new Date(),
        });
        const result = await useCase.createRequest({
          userId: TEST_USER_ID,
          primaryGoal: 'A personal reflection journal about mindfulness',
        });
        expect(result.success).toBe(true);
        expect(result.requestId).toBe('existing-req');
        expect(result.status).toBe('processing');
      });

      it('should deny access when no subscription found', async () => {
        mockSubscriptionRepo.getSubscriptionByUserId.mockResolvedValue(null);
        const result = await useCase.createRequest({
          userId: TEST_USER_ID,
          primaryGoal: 'A personal reflection journal about mindfulness',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('subscription');
      });

      it('should return not found for missing request status', async () => {
        mockBookGenerationRepo.getRequestByIdAndUser.mockResolvedValue(null);
        const result = await useCase.getRequestStatus('nonexistent-id', TEST_USER_ID);
        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });

      it('should return completed request with book data', async () => {
        mockBookGenerationRepo.getRequestByIdAndUser.mockResolvedValue({
          id: 'req-1',
          status: 'completed',
          generatedBlueprint: { title: 'My Book', chapters: [] },
          usedSystemPrompt: 'system prompt',
          usedUserPrompt: 'user prompt',
          progress: null,
          createdAt: new Date(),
        });
        const result = await useCase.getRequestStatus('req-1', TEST_USER_ID);
        expect(result.success).toBe(true);
        expect(result.book).toBeDefined();
        expect(result.book.title).toBe('My Book');
      });

      it('should return null for missing request in getRequestStatusWithProgress', async () => {
        mockBookGenerationRepo.getRequestByIdAndUser.mockResolvedValue(null);
        const result = await useCase.getRequestStatusWithProgress('nonexistent', TEST_USER_ID);
        expect(result).toBeNull();
      });
    });
  });

  describe('Chapter', () => {
    describe('CreateChapterUseCase', () => {
      let useCase: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;

      beforeEach(async () => {
        mockChapterRepo = {
          create: vi.fn().mockResolvedValue(makeChapter()),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
          updateChapterCount: vi.fn().mockResolvedValue(undefined),
        };

        const { CreateChapterUseCase } = await import(
          '../../../application/use-cases/library/chapter/CreateChapterUseCase'
        );
        useCase = new CreateChapterUseCase(mockChapterRepo, mockBookRepo);
      });

      it('should create a chapter successfully', async () => {
        const result = await useCase.execute(
          { bookId: TEST_BOOK_ID, title: 'Chapter 1' },
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.chapter.title).toBe('Test Chapter');
        }
        expect(mockBookRepo.updateChapterCount).toHaveBeenCalled();
      });

      it('should return validation error for invalid bookId', async () => {
        const result = await useCase.execute(
          { bookId: 'not-a-uuid', title: 'Chapter 1' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });

      it('should return not found when book does not exist', async () => {
        mockBookRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute(
          { bookId: TEST_BOOK_ID, title: 'Chapter 1' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });

    describe('DeleteChapterUseCase', () => {
      let useCase: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;

      beforeEach(async () => {
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
          delete: vi.fn().mockResolvedValue(undefined),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
          updateChapterCount: vi.fn().mockResolvedValue(undefined),
        };

        const { DeleteChapterUseCase } = await import(
          '../../../application/use-cases/library/chapter/DeleteChapterUseCase'
        );
        useCase = new DeleteChapterUseCase(mockChapterRepo, mockBookRepo);
      });

      it('should delete a chapter successfully', async () => {
        const result = await useCase.execute(TEST_CHAPTER_ID, createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.deleted).toBe(true);
        }
        expect(mockChapterRepo.delete).toHaveBeenCalledWith(TEST_CHAPTER_ID);
      });

      it('should return not found for missing chapter', async () => {
        mockChapterRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute('missing-id', createContext());
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });

    describe('GetChapterUseCase', () => {
      let useCase: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;
      let mockIllustrationRepo: any;

      beforeEach(async () => {
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
        };
        mockIllustrationRepo = {
          getByChapter: vi.fn().mockResolvedValue([]),
        };

        const { GetChapterUseCase } = await import(
          '../../../application/use-cases/library/chapter/GetChapterUseCase'
        );
        useCase = new GetChapterUseCase(mockChapterRepo, mockBookRepo, mockIllustrationRepo);
      });

      it('should get a chapter with illustrations', async () => {
        const result = await useCase.execute(TEST_CHAPTER_ID, createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.chapter.id).toBe(TEST_CHAPTER_ID);
          expect(result.data.illustrations).toEqual([]);
        }
      });

      it('should return not found for missing chapter', async () => {
        mockChapterRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute('missing-id', createContext());
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });
  });

  describe('Entry', () => {
    describe('CreateEntryUseCase', () => {
      let useCase: any;
      let mockEntryRepo: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;

      beforeEach(async () => {
        mockEntryRepo = {
          create: vi.fn().mockResolvedValue(makeEntry()),
        };
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
          updateEntryCount: vi.fn().mockResolvedValue(undefined),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
          updateEntryCount: vi.fn().mockResolvedValue(undefined),
        };

        const { CreateEntryUseCase } = await import(
          '../../../application/use-cases/library/entry/CreateEntryUseCase'
        );
        useCase = new CreateEntryUseCase(mockEntryRepo, mockChapterRepo, mockBookRepo);
      });

      it('should create an entry successfully', async () => {
        const result = await useCase.execute(
          { chapterId: TEST_CHAPTER_ID, content: 'My reflection', entryType: 'reflection' },
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.entry.content).toBe('Test entry content');
        }
        expect(mockChapterRepo.updateEntryCount).toHaveBeenCalled();
        expect(mockBookRepo.updateEntryCount).toHaveBeenCalled();
      });

      it('should return validation error for missing content', async () => {
        const result = await useCase.execute(
          { chapterId: TEST_CHAPTER_ID, content: '', entryType: 'reflection' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });

      it('should return not found when chapter does not exist', async () => {
        mockChapterRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute(
          { chapterId: TEST_CHAPTER_ID, content: 'Content', entryType: 'reflection' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });

    describe('GetEntryUseCase', () => {
      let useCase: any;
      let mockEntryRepo: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;
      let mockIllustrationRepo: any;

      beforeEach(async () => {
        mockEntryRepo = {
          getById: vi.fn().mockResolvedValue(makeEntry()),
        };
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
        };
        mockIllustrationRepo = {
          getByEntry: vi.fn().mockResolvedValue([]),
        };

        const { GetEntryUseCase } = await import(
          '../../../application/use-cases/library/entry/GetEntryUseCase'
        );
        useCase = new GetEntryUseCase(mockEntryRepo, mockChapterRepo, mockBookRepo, mockIllustrationRepo);
      });

      it('should get an entry with illustrations', async () => {
        const result = await useCase.execute(TEST_ENTRY_ID, createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.entry.id).toBe(TEST_ENTRY_ID);
          expect(result.data.illustrations).toEqual([]);
        }
      });

      it('should return not found for missing entry', async () => {
        mockEntryRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute('missing-id', createContext());
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });

    describe('UpdateEntryUseCase', () => {
      let useCase: any;
      let mockEntryRepo: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;

      beforeEach(async () => {
        mockEntryRepo = {
          getById: vi.fn().mockResolvedValue(makeEntry()),
          update: vi.fn().mockResolvedValue(makeEntry({ content: 'Updated content' })),
        };
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
        };

        const { UpdateEntryUseCase } = await import(
          '../../../application/use-cases/library/entry/UpdateEntryUseCase'
        );
        useCase = new UpdateEntryUseCase(mockEntryRepo, mockChapterRepo, mockBookRepo);
      });

      it('should update an entry successfully', async () => {
        const result = await useCase.execute(
          TEST_ENTRY_ID,
          { content: 'Updated content' },
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.changes.fieldsUpdated).toContain('content');
          expect(result.data.impact.requiresReanalysis).toBe(true);
        }
      });

      it('should return not found for missing entry', async () => {
        mockEntryRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute(
          'missing-id',
          { content: 'Updated' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });

      it('should track field changes in the result', async () => {
        const result = await useCase.execute(
          TEST_ENTRY_ID,
          { content: 'New content', moodContext: 'happy' },
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.changes.fieldsUpdated).toContain('content');
          expect(result.data.changes.fieldsUpdated).toContain('moodContext');
        }
      });
    });

    describe('DeleteEntryUseCase', () => {
      let useCase: any;
      let mockEntryRepo: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;
      let mockIllustrationRepo: any;

      beforeEach(async () => {
        mockEntryRepo = {
          getById: vi.fn().mockResolvedValue(makeEntry()),
          delete: vi.fn().mockResolvedValue(undefined),
          clearSourceEntryIdReferences: vi.fn().mockResolvedValue(0),
        };
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
          updateEntryCount: vi.fn().mockResolvedValue(undefined),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
          updateEntryCount: vi.fn().mockResolvedValue(undefined),
        };
        mockIllustrationRepo = {
          getByEntry: vi.fn().mockResolvedValue([]),
        };

        const { DeleteEntryUseCase } = await import(
          '../../../application/use-cases/library/entry/DeleteEntryUseCase'
        );
        useCase = new DeleteEntryUseCase(
          mockEntryRepo,
          mockChapterRepo,
          mockBookRepo,
          mockIllustrationRepo
        );
      });

      it('should delete an entry successfully', async () => {
        const result = await useCase.execute(TEST_ENTRY_ID, createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.deleted).toBe(true);
          expect(result.data.entryId).toBe(TEST_ENTRY_ID);
        }
        expect(mockEntryRepo.delete).toHaveBeenCalledWith(TEST_ENTRY_ID);
      });

      it('should return not found for missing entry', async () => {
        mockEntryRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute('missing-id', createContext());
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });

      it('should clean up illustrations when deleting entry', async () => {
        mockIllustrationRepo.getByEntry.mockResolvedValue([
          makeIllustration({ entryId: TEST_ENTRY_ID, url: 'https://example.com/img.jpg' }),
        ]);
        const result = await useCase.execute(TEST_ENTRY_ID, createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.deletedImages).toBeGreaterThanOrEqual(1);
        }
      });
    });

    describe('ListEntriesUseCase', () => {
      let useCase: any;
      let mockEntryRepo: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;
      let mockIllustrationRepo: any;

      beforeEach(async () => {
        mockEntryRepo = {
          getByChapter: vi.fn().mockResolvedValue([makeEntry()]),
          getByUser: vi.fn().mockResolvedValue([makeEntry()]),
          getByFilters: vi.fn().mockResolvedValue({ items: [makeEntry()], hasMore: false, nextCursor: null }),
          countByBook: vi.fn().mockResolvedValue(1),
        };
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
        };
        mockIllustrationRepo = {
          getByEntry: vi.fn().mockResolvedValue([]),
        };

        const { ListEntriesUseCase } = await import(
          '../../../application/use-cases/library/entry/ListEntriesUseCase'
        );
        useCase = new ListEntriesUseCase(mockEntryRepo, mockChapterRepo, mockBookRepo, mockIllustrationRepo);
      });

      it('should list entries by chapter', async () => {
        const result = await useCase.executeByChapter(TEST_CHAPTER_ID, createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.entries.length).toBe(1);
        }
      });

      it('should return not found for missing chapter', async () => {
        mockChapterRepo.getById.mockResolvedValue(null);
        const result = await useCase.executeByChapter('missing-id', createContext());
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });

      it('should list entries by user with pagination', async () => {
        const result = await useCase.executeByUser(createContext(), { limit: 10, offset: 0 });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.pagination).toBeDefined();
          expect(result.data.analytics).toBeDefined();
        }
      });

      it('should list entries by book', async () => {
        const result = await useCase.executeByBook(TEST_BOOK_ID, createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.cursorPagination).toBeDefined();
        }
      });
    });

    describe('ArchiveEntryUseCase', () => {
      let useCase: any;
      let mockIntelligenceRepo: any;

      beforeEach(async () => {
        mockIntelligenceRepo = {
          findEntryById: vi.fn().mockResolvedValue(makeEntry()),
          updateEntry: vi.fn().mockResolvedValue(makeEntry()),
        };

        const { ArchiveEntryUseCase } = await import(
          '../../../application/use-cases/library/entry/ArchiveEntryUseCase'
        );
        useCase = new ArchiveEntryUseCase(mockIntelligenceRepo);
      });

      it('should archive an entry successfully', async () => {
        const result = await useCase.execute({
          entryId: TEST_ENTRY_ID,
          userId: TEST_USER_ID,
          archive: true,
        });
        expect(result.operation).toBe('archived');
        expect(mockIntelligenceRepo.updateEntry).toHaveBeenCalled();
      });

      it('should unarchive an entry successfully', async () => {
        const result = await useCase.execute({
          entryId: TEST_ENTRY_ID,
          userId: TEST_USER_ID,
          archive: false,
        });
        expect(result.operation).toBe('unarchived');
      });

      it('should throw when entry not found', async () => {
        mockIntelligenceRepo.findEntryById.mockResolvedValue(null);
        await expect(
          useCase.execute({ entryId: 'missing-id', userId: TEST_USER_ID, archive: true })
        ).rejects.toThrow();
      });

      it('should throw when user does not own the entry', async () => {
        mockIntelligenceRepo.findEntryById.mockResolvedValue(makeEntry({ userId: OTHER_USER_ID }));
        await expect(
          useCase.execute({ entryId: TEST_ENTRY_ID, userId: TEST_USER_ID, archive: true })
        ).rejects.toThrow();
      });

      it('should throw when entryId is empty', async () => {
        await expect(
          useCase.execute({ entryId: '', userId: TEST_USER_ID, archive: true })
        ).rejects.toThrow();
      });
    });

    describe('PromoteEntryUseCase', () => {
      let useCase: any;
      let mockEntryRepo: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;

      beforeEach(async () => {
        mockEntryRepo = {
          getById: vi.fn().mockResolvedValue(makeEntry()),
          getByChapter: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue(makeEntry({ id: 'promoted-entry-id', bookId: 'shared-book-id' })),
        };
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
          getByBook: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue(makeChapter({ id: 'shared-chapter-id' })),
          updateEntryCount: vi.fn().mockResolvedValue(undefined),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
          getBySystemType: vi.fn().mockResolvedValue(null),
          getOrCreateSharedNotesBook: vi.fn().mockResolvedValue(makeBook({ id: 'shared-book-id', visibility: 'shared' })),
          updateEntryCount: vi.fn().mockResolvedValue(undefined),
        };

        const { PromoteEntryUseCase } = await import(
          '../../../application/use-cases/library/entry/PromoteEntryUseCase'
        );
        useCase = new PromoteEntryUseCase(mockEntryRepo, mockChapterRepo, mockBookRepo);
      });

      it('should promote an entry to shared library', async () => {
        const result = await useCase.execute(
          { entryId: TEST_ENTRY_ID },
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.originalEntryId).toBe(TEST_ENTRY_ID);
          expect(result.data.promotedEntryId).toBeDefined();
        }
      });

      it('should return not found for missing entry', async () => {
        mockEntryRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute(
          { entryId: TEST_ENTRY_ID },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });

      it('should return validation error for invalid entryId format', async () => {
        const result = await useCase.execute(
          { entryId: 'not-a-uuid' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });
    });

    describe('UnpromoteEntryUseCase', () => {
      let useCase: any;
      let mockEntryRepo: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;

      beforeEach(async () => {
        mockEntryRepo = {
          getById: vi.fn().mockResolvedValue(makeEntry()),
          getByChapter: vi.fn().mockResolvedValue([
            makeEntry({ id: 'promoted-copy', metadata: { sourceEntryId: TEST_ENTRY_ID } }),
          ]),
          delete: vi.fn().mockResolvedValue(undefined),
        };
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
          getByBook: vi.fn().mockResolvedValue([makeChapter()]),
          updateEntryCount: vi.fn().mockResolvedValue(undefined),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
          getBySystemType: vi.fn().mockResolvedValue(makeBook({ id: 'shared-book-id' })),
          updateEntryCount: vi.fn().mockResolvedValue(undefined),
        };

        const { UnpromoteEntryUseCase } = await import(
          '../../../application/use-cases/library/entry/UnpromoteEntryUseCase'
        );
        useCase = new UnpromoteEntryUseCase(mockEntryRepo, mockChapterRepo, mockBookRepo);
      });

      it('should unpromote an entry successfully', async () => {
        const result = await useCase.execute(
          { entryId: TEST_ENTRY_ID },
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.originalEntryId).toBe(TEST_ENTRY_ID);
          expect(result.data.deletedPromotedEntryId).toBeDefined();
        }
      });

      it('should return not found for missing entry', async () => {
        mockEntryRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute(
          { entryId: TEST_ENTRY_ID },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });

      it('should return validation error when entry not promoted', async () => {
        mockBookRepo.getBySystemType.mockResolvedValue(null);
        const result = await useCase.execute(
          { entryId: TEST_ENTRY_ID },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });
    });

    describe('DetectEntryPatternsUseCase', () => {
      let useCase: any;
      let mockAnalysisRepo: any;

      beforeEach(async () => {
        mockAnalysisRepo = {
          getEntriesByUser: vi.fn().mockResolvedValue([
            { id: '1', content: 'I wonder because I am curious about the future', createdAt: new Date() },
            { id: '2', content: 'Today I will plan to start something new', createdAt: new Date() },
            { id: '3', content: 'I feel happy and grateful for what I have therefore', createdAt: new Date() },
            { id: '4', content: 'Tomorrow I hope to begin a new routine always', createdAt: new Date() },
          ]),
          recordAnalyticsEvent: vi.fn().mockResolvedValue(undefined),
        };

        const { DetectEntryPatternsUseCase } = await import(
          '../../../application/use-cases/library/entry/DetectEntryPatternsUseCase'
        );
        useCase = new DetectEntryPatternsUseCase(mockAnalysisRepo);
      });

      it('should detect patterns from entry history', async () => {
        const result = await useCase.execute({ userId: TEST_USER_ID });
        expect(result.userId).toBe(TEST_USER_ID);
        expect(result.patternSummary).toBeDefined();
        expect(result.recommendations).toBeDefined();
        expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      });

      it('should throw when userId is empty', async () => {
        await expect(useCase.execute({ userId: '' })).rejects.toThrow();
      });

      it('should throw when less than 3 entries', async () => {
        mockAnalysisRepo.getEntriesByUser.mockResolvedValue([
          { id: '1', content: 'Short', createdAt: new Date() },
        ]);
        await expect(useCase.execute({ userId: TEST_USER_ID })).rejects.toThrow();
      });

      it('should throw for invalid minConfidence', async () => {
        await expect(
          useCase.execute({ userId: TEST_USER_ID, minConfidence: 2 })
        ).rejects.toThrow();
      });
    });

    describe('BatchAnalyzeEntriesUseCase', () => {
      let useCase: any;
      let mockIntelligenceRepo: any;

      beforeEach(async () => {
        mockIntelligenceRepo = {
          findEntriesByUserId: vi.fn().mockResolvedValue([
            makeEntry({ id: 'e1', content: 'Entry one content for analysis' }),
          ]),
          findEntriesByIds: vi.fn().mockResolvedValue([]),
          createInsightsBulk: vi.fn().mockResolvedValue([]),
          updateEntriesBatch: vi.fn().mockResolvedValue(1),
          findInsightsByEntryId: vi.fn().mockResolvedValue([]),
        };

        const { BatchAnalyzeEntriesUseCase } = await import(
          '../../../application/use-cases/library/entry/BatchAnalyzeEntriesUseCase'
        );
        useCase = new BatchAnalyzeEntriesUseCase(mockIntelligenceRepo);
      });

      it('should analyze entries in batch', async () => {
        const result = await useCase.execute({
          userId: TEST_USER_ID,
          analysisTypes: ['sentiment'],
        });
        expect(result.userId).toBe(TEST_USER_ID);
        expect(result.processingStats).toBeDefined();
        expect(result.processingStats.totalEntries).toBeGreaterThanOrEqual(1);
      });

      it('should throw when userId is empty', async () => {
        await expect(
          useCase.execute({ userId: '', analysisTypes: ['sentiment'] })
        ).rejects.toThrow();
      });

      it('should throw when analysisTypes is empty', async () => {
        await expect(
          useCase.execute({ userId: TEST_USER_ID, analysisTypes: [] })
        ).rejects.toThrow();
      });

      it('should throw when no entries found', async () => {
        mockIntelligenceRepo.findEntriesByUserId.mockResolvedValue([]);
        await expect(
          useCase.execute({ userId: TEST_USER_ID, analysisTypes: ['sentiment'] })
        ).rejects.toThrow();
      });
    });

    describe('EntryImagesUseCase - AddEntryImage', () => {
      let useCase: any;
      let mockIntelligenceRepo: any;

      beforeEach(async () => {
        mockIntelligenceRepo = {
          findEntryById: vi.fn().mockResolvedValue(makeEntry()),
          findEntryIllustrations: vi.fn().mockResolvedValue([]),
          addEntryIllustration: vi.fn().mockResolvedValue({ id: 'img-1', url: 'https://example.com/img.jpg' }),
        };

        const { AddEntryImageUseCase } = await import(
          '../../../application/use-cases/library/entry/EntryImagesUseCase'
        );
        useCase = new AddEntryImageUseCase(mockIntelligenceRepo);
      });

      it('should add an image to an entry', async () => {
        const result = await useCase.execute({
          entryId: TEST_ENTRY_ID,
          userId: TEST_USER_ID,
          url: 'https://example.com/image.jpg',
        });
        expect(result.message).toBe('Illustration added successfully');
        expect(mockIntelligenceRepo.addEntryIllustration).toHaveBeenCalled();
      });

      it('should throw when entry not found', async () => {
        mockIntelligenceRepo.findEntryById.mockResolvedValue(null);
        await expect(
          useCase.execute({ entryId: 'missing', userId: TEST_USER_ID, url: 'https://example.com/img.jpg' })
        ).rejects.toThrow();
      });

      it('should throw when user does not own entry', async () => {
        mockIntelligenceRepo.findEntryById.mockResolvedValue(makeEntry({ userId: OTHER_USER_ID }));
        await expect(
          useCase.execute({ entryId: TEST_ENTRY_ID, userId: TEST_USER_ID, url: 'https://example.com/img.jpg' })
        ).rejects.toThrow();
      });

      it('should throw when max images exceeded', async () => {
        mockIntelligenceRepo.findEntryIllustrations.mockResolvedValue([
          { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' },
        ]);
        await expect(
          useCase.execute({ entryId: TEST_ENTRY_ID, userId: TEST_USER_ID, url: 'https://example.com/img.jpg' })
        ).rejects.toThrow();
      });
    });

    describe('EntryImagesUseCase - RemoveEntryImage', () => {
      let useCase: any;
      let mockIntelligenceRepo: any;

      beforeEach(async () => {
        mockIntelligenceRepo = {
          findEntryById: vi.fn().mockResolvedValue(makeEntry()),
          removeEntryIllustration: vi.fn().mockResolvedValue(undefined),
          findEntryIllustrations: vi.fn().mockResolvedValue([]),
        };

        const { RemoveEntryImageUseCase } = await import(
          '../../../application/use-cases/library/entry/EntryImagesUseCase'
        );
        useCase = new RemoveEntryImageUseCase(mockIntelligenceRepo);
      });

      it('should remove an image from an entry', async () => {
        const result = await useCase.execute({
          imageId: 'img-1',
          entryId: TEST_ENTRY_ID,
          userId: TEST_USER_ID,
        });
        expect(result.message).toBe('Image removed successfully');
      });

      it('should throw when user does not own entry', async () => {
        mockIntelligenceRepo.findEntryById.mockResolvedValue(makeEntry({ userId: OTHER_USER_ID }));
        await expect(
          useCase.execute({ imageId: 'img-1', entryId: TEST_ENTRY_ID, userId: TEST_USER_ID })
        ).rejects.toThrow();
      });
    });

    describe('EntryImagesUseCase - GetEntryImages', () => {
      let useCase: any;
      let mockIntelligenceRepo: any;

      beforeEach(async () => {
        mockIntelligenceRepo = {
          findEntryById: vi.fn().mockResolvedValue(makeEntry()),
          findEntryIllustrations: vi.fn().mockResolvedValue([{ id: 'img-1' }]),
        };

        const { GetEntryImagesUseCase } = await import(
          '../../../application/use-cases/library/entry/EntryImagesUseCase'
        );
        useCase = new GetEntryImagesUseCase(mockIntelligenceRepo);
      });

      it('should get images for an entry', async () => {
        const result = await useCase.execute({
          entryId: TEST_ENTRY_ID,
          userId: TEST_USER_ID,
        });
        expect(result.count).toBe(1);
        expect(result.maxAllowed).toBe(4);
      });

      it('should throw when entry not found', async () => {
        mockIntelligenceRepo.findEntryById.mockResolvedValue(null);
        await expect(
          useCase.execute({ entryId: 'missing', userId: TEST_USER_ID })
        ).rejects.toThrow();
      });

      it('should throw when user does not own entry', async () => {
        mockIntelligenceRepo.findEntryById.mockResolvedValue(makeEntry({ userId: OTHER_USER_ID }));
        await expect(
          useCase.execute({ entryId: TEST_ENTRY_ID, userId: TEST_USER_ID })
        ).rejects.toThrow();
      });
    });

    describe('EntryImagesUseCase - ReorderEntryImages', () => {
      let useCase: any;
      let mockIntelligenceRepo: any;

      beforeEach(async () => {
        mockIntelligenceRepo = {
          findEntryById: vi.fn().mockResolvedValue(makeEntry()),
          reorderEntryIllustrations: vi.fn().mockResolvedValue([{ id: 'img-2' }, { id: 'img-1' }]),
        };

        const { ReorderEntryImagesUseCase } = await import(
          '../../../application/use-cases/library/entry/EntryImagesUseCase'
        );
        useCase = new ReorderEntryImagesUseCase(mockIntelligenceRepo);
      });

      it('should reorder images for an entry', async () => {
        const result = await useCase.execute({
          entryId: TEST_ENTRY_ID,
          userId: TEST_USER_ID,
          imageIds: ['img-2', 'img-1'],
        });
        expect(result.message).toBe('Images reordered successfully');
      });

      it('should throw when imageIds is empty', async () => {
        await expect(
          useCase.execute({ entryId: TEST_ENTRY_ID, userId: TEST_USER_ID, imageIds: [] })
        ).rejects.toThrow();
      });

      it('should throw when user does not own entry', async () => {
        mockIntelligenceRepo.findEntryById.mockResolvedValue(makeEntry({ userId: OTHER_USER_ID }));
        await expect(
          useCase.execute({ entryId: TEST_ENTRY_ID, userId: TEST_USER_ID, imageIds: ['img-1'] })
        ).rejects.toThrow();
      });
    });
  });

  describe('Illustration', () => {
    describe('AddIllustrationUseCase', () => {
      let useCase: any;
      let mockIllustrationRepo: any;
      let mockBookRepo: any;
      let mockChapterRepo: any;
      let mockEntryRepo: any;

      beforeEach(async () => {
        mockIllustrationRepo = {
          create: vi.fn().mockResolvedValue(makeIllustration()),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
        };
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
        };
        mockEntryRepo = {
          getById: vi.fn().mockResolvedValue(makeEntry()),
        };

        const { AddIllustrationUseCase } = await import(
          '../../../application/use-cases/library/illustration/AddIllustrationUseCase'
        );
        useCase = new AddIllustrationUseCase(
          mockIllustrationRepo,
          mockBookRepo,
          mockChapterRepo,
          mockEntryRepo
        );
      });

      it('should add an illustration to a book', async () => {
        const result = await useCase.execute(
          {
            bookId: TEST_BOOK_ID,
            url: 'https://example.com/image.jpg',
            illustrationType: 'cover',
            source: 'uploaded',
          },
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.illustration.id).toBe(TEST_ILLUSTRATION_ID);
        }
      });

      it('should return validation error when no parent specified', async () => {
        const result = await useCase.execute(
          {
            url: 'https://example.com/image.jpg',
            illustrationType: 'cover',
            source: 'uploaded',
          },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });

      it('should return not found when book does not exist', async () => {
        mockBookRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute(
          {
            bookId: TEST_BOOK_ID,
            url: 'https://example.com/image.jpg',
            illustrationType: 'cover',
            source: 'uploaded',
          },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });

      it('should return validation error for invalid URL', async () => {
        const result = await useCase.execute(
          {
            bookId: TEST_BOOK_ID,
            url: 'not-a-url',
            illustrationType: 'cover',
            source: 'uploaded',
          },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });
    });

    describe('RemoveIllustrationUseCase', () => {
      let useCase: any;
      let mockIllustrationRepo: any;
      let mockBookRepo: any;
      let mockChapterRepo: any;
      let mockEntryRepo: any;

      beforeEach(async () => {
        mockIllustrationRepo = {
          getById: vi.fn().mockResolvedValue(makeIllustration()),
          delete: vi.fn().mockResolvedValue(undefined),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
        };
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
        };
        mockEntryRepo = {
          getById: vi.fn().mockResolvedValue(makeEntry()),
        };

        const { RemoveIllustrationUseCase } = await import(
          '../../../application/use-cases/library/illustration/RemoveIllustrationUseCase'
        );
        useCase = new RemoveIllustrationUseCase(
          mockIllustrationRepo,
          mockBookRepo,
          mockChapterRepo,
          mockEntryRepo
        );
      });

      it('should remove an illustration', async () => {
        const result = await useCase.execute(TEST_ILLUSTRATION_ID, createContext());
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.deleted).toBe(true);
        }
        expect(mockIllustrationRepo.delete).toHaveBeenCalledWith(TEST_ILLUSTRATION_ID);
      });

      it('should return not found for missing illustration', async () => {
        mockIllustrationRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute('missing-id', createContext());
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });

    describe('ReorderIllustrationsUseCase', () => {
      let useCase: any;
      let mockIllustrationRepo: any;
      let mockEntryRepo: any;
      let mockChapterRepo: any;
      let mockBookRepo: any;

      beforeEach(async () => {
        mockIllustrationRepo = {
          updateSortOrder: vi.fn().mockResolvedValue(undefined),
          getByEntry: vi.fn().mockResolvedValue([
            makeIllustration({ id: 'ill-1', sortOrder: 0 }),
            makeIllustration({ id: 'ill-2', sortOrder: 1 }),
          ]),
        };
        mockEntryRepo = {
          getById: vi.fn().mockResolvedValue(makeEntry()),
        };
        mockChapterRepo = {
          getById: vi.fn().mockResolvedValue(makeChapter()),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
        };

        const { ReorderIllustrationsUseCase } = await import(
          '../../../application/use-cases/library/illustration/ReorderIllustrationsUseCase'
        );
        useCase = new ReorderIllustrationsUseCase(
          mockIllustrationRepo,
          mockEntryRepo,
          mockChapterRepo,
          mockBookRepo
        );
      });

      it('should reorder illustrations', async () => {
        const result = await useCase.execute(
          TEST_ENTRY_ID,
          ['ill-2', 'ill-1'],
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.illustrations.length).toBe(2);
        }
        expect(mockIllustrationRepo.updateSortOrder).toHaveBeenCalledTimes(2);
      });

      it('should return validation error for empty illustration IDs', async () => {
        const result = await useCase.execute(TEST_ENTRY_ID, [], createContext());
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });

      it('should return not found for missing entry', async () => {
        mockEntryRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute(
          'missing-entry',
          ['ill-1'],
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });

    describe('GenerateBookCoverUseCase', () => {
      let useCase: any;
      let mockIllustrationRepo: any;
      let mockBookRepo: any;
      let mockBookTypeRepo: any;
      let mockEntryRepo: any;

      beforeEach(async () => {
        mockIllustrationRepo = {
          getBookCover: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(makeIllustration({ url: 'https://example.com/cover.jpg', artworkUrl: 'https://example.com/cover.jpg' })),
        };
        mockBookRepo = {
          getById: vi.fn().mockResolvedValue(makeBook()),
        };
        mockBookTypeRepo = {
          getById: vi.fn().mockResolvedValue({ id: 'personal', defaultSettings: {} }),
        };
        mockEntryRepo = {
          getByBook: vi.fn().mockResolvedValue([]),
        };

        const { GenerateBookCoverUseCase } = await import(
          '../../../application/use-cases/library/illustration/GenerateBookCoverUseCase'
        );
        useCase = new GenerateBookCoverUseCase(
          mockIllustrationRepo,
          mockBookRepo,
          mockBookTypeRepo,
          mockEntryRepo
        );
      });

      it('should generate a book cover', async () => {
        const result = await useCase.execute(
          { bookId: TEST_BOOK_ID, title: 'My Book' },
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.artworkUrl).toBeDefined();
        }
      });

      it('should return existing cover if one exists', async () => {
        const existingCover = makeIllustration();
        mockIllustrationRepo.getBookCover.mockResolvedValue(existingCover);
        const result = await useCase.execute(
          { bookId: TEST_BOOK_ID, title: 'My Book' },
          createContext()
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.illustration.id).toBe(existingCover.id);
        }
        expect(mockIllustrationRepo.create).not.toHaveBeenCalled();
      });

      it('should return not found for missing book', async () => {
        mockBookRepo.getById.mockResolvedValue(null);
        const result = await useCase.execute(
          { bookId: 'missing', title: 'My Book' },
          createContext()
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });
  });
});
