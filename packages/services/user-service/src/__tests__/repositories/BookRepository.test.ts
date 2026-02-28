import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/service-urls', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { BookRepository } from '../../infrastructure/repositories/LibraryRepository';
import { BOOK_TYPE_IDS, CONTENT_VISIBILITY } from '@aiponge/shared-contracts';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID_2 = '22222222-2222-2222-2222-222222222222';
const TEST_BOOK_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEST_BOOK_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function createMockBook(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_BOOK_ID,
    typeId: BOOK_TYPE_IDS.PERSONAL,
    title: 'Test Book',
    subtitle: null,
    description: null,
    author: null,
    userId: TEST_USER_ID,
    isReadOnly: false,
    category: null,
    language: 'en',
    era: null,
    tradition: null,
    visibility: CONTENT_VISIBILITY.PERSONAL,
    status: 'active',
    systemType: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    publishedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function createSelectChainWhereLimit(resolvedValue: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(resolvedValue),
      }),
    }),
  };
}

function createSelectChainOrderByResolved(resolvedValue: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(resolvedValue),
      }),
    }),
  };
}

function createSelectChainWithOrderByAndLimit(resolvedValue: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(resolvedValue),
        }),
      }),
    }),
  };
}

function createMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  } as unknown as Record<string, unknown>;
}

describe('BookRepository Unit Tests', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let repo: BookRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new BookRepository(mockDb);
    vi.clearAllMocks();
  });

  describe('getById', () => {
    it('should find book by ID', async () => {
      const mockBook = createMockBook({ title: 'My Test Book' });
      const chain = createSelectChainWhereLimit([mockBook]);
      mockDb.select.mockReturnValue(chain);

      const found = await repo.getById(TEST_BOOK_ID);

      expect(found).toBeDefined();
      expect(found!.id).toBe(TEST_BOOK_ID);
      expect(found!.title).toBe('My Test Book');
      expect(chain.from).toHaveBeenCalledWith(expect.anything());
    });

    it('should return null for non-existent book', async () => {
      const chain = createSelectChainWhereLimit([]);
      mockDb.select.mockReturnValue(chain);

      const found = await repo.getById('nonexistent-id');

      expect(found).toBeNull();
    });
  });

  describe('getBooksByUserAndType', () => {
    it('should return all books for user', async () => {
      const book1 = createMockBook({ id: TEST_BOOK_ID, title: 'Book 1' });
      const book2 = createMockBook({ id: TEST_BOOK_ID_2, title: 'Book 2' });
      const chain = createSelectChainOrderByResolved([book1, book2]);
      mockDb.select.mockReturnValue(chain);

      const books = await repo.getBooksByUserAndType(TEST_USER_ID);

      expect(books.length).toBe(2);
      expect(books.every(b => b.userId === TEST_USER_ID)).toBe(true);
    });

    it('should filter by typeId when provided', async () => {
      const personalBook = createMockBook({
        title: 'Personal Book',
        typeId: BOOK_TYPE_IDS.PERSONAL,
      });
      const chain = createSelectChainOrderByResolved([personalBook]);
      mockDb.select.mockReturnValue(chain);

      const personalBooks = await repo.getBooksByUserAndType(TEST_USER_ID, BOOK_TYPE_IDS.PERSONAL);

      expect(personalBooks.length).toBe(1);
      expect(personalBooks[0].title).toBe('Personal Book');
    });

    it('should return empty array for user with no books', async () => {
      const chain = createSelectChainOrderByResolved([]);
      mockDb.select.mockReturnValue(chain);

      const books = await repo.getBooksByUserAndType(TEST_USER_ID);

      expect(books).toEqual([]);
    });
  });

  describe('getBooksByUser', () => {
    it('should return all books regardless of type', async () => {
      const book1 = createMockBook({ typeId: BOOK_TYPE_IDS.PERSONAL });
      const book2 = createMockBook({ id: TEST_BOOK_ID_2, typeId: 'wisdom' });
      const book3 = createMockBook({ id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', typeId: 'quotes' });
      const chain = createSelectChainOrderByResolved([book1, book2, book3]);
      mockDb.select.mockReturnValue(chain);

      const books = await repo.getBooksByUser(TEST_USER_ID);

      expect(books.length).toBe(3);
    });
  });

  describe('create', () => {
    it('should create a new book', async () => {
      const mockBook = createMockBook({
        title: 'New Created Book',
        visibility: CONTENT_VISIBILITY.PERSONAL,
      });
      const insertChain = {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockBook]),
        }),
      };
      mockDb.insert.mockReturnValue(insertChain);

      const bookData = {
        typeId: BOOK_TYPE_IDS.PERSONAL,
        title: 'New Created Book',
        userId: TEST_USER_ID,
        visibility: CONTENT_VISIBILITY.PERSONAL,
      };

      const book = await repo.create(bookData);

      expect(book).toBeDefined();
      expect(book.id).toBeDefined();
      expect(book.title).toBe('New Created Book');
      expect(book.userId).toBe(TEST_USER_ID);
      expect(book.visibility).toBe(CONTENT_VISIBILITY.PERSONAL);
      const valuesArg = insertChain.values.mock.calls[0][0];
      expect(valuesArg.title).toBe('New Created Book');
      expect(valuesArg.userId).toBe(TEST_USER_ID);
      expect(valuesArg.typeId).toBe(BOOK_TYPE_IDS.PERSONAL);
      expect(valuesArg.visibility).toBe(CONTENT_VISIBILITY.PERSONAL);
    });

    it('should create book with optional fields', async () => {
      const mockBook = createMockBook({
        title: 'Book With Details',
        subtitle: 'A Subtitle',
        description: 'A description of the book',
        author: 'Test Author',
        category: 'spirituality',
        visibility: CONTENT_VISIBILITY.SHARED,
      });
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockBook]),
        }),
      });

      const bookData = {
        typeId: BOOK_TYPE_IDS.PERSONAL,
        title: 'Book With Details',
        subtitle: 'A Subtitle',
        description: 'A description of the book',
        author: 'Test Author',
        userId: TEST_USER_ID,
        category: 'spirituality',
        visibility: CONTENT_VISIBILITY.SHARED,
      };

      const book = await repo.create(bookData);

      expect(book.subtitle).toBe('A Subtitle');
      expect(book.description).toBe('A description of the book');
      expect(book.author).toBe('Test Author');
      expect(book.category).toBe('spirituality');
      expect(book.visibility).toBe(CONTENT_VISIBILITY.SHARED);
    });
  });

  describe('update', () => {
    it('should update book fields', async () => {
      const updatedBook = createMockBook({ title: 'Updated Title' });
      const updateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedBook]),
          }),
        }),
      };
      mockDb.update.mockReturnValue(updateChain);

      const updated = await repo.update(TEST_BOOK_ID, { title: 'Updated Title' });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe('Updated Title');
      const setArg = updateChain.set.mock.calls[0][0];
      expect(setArg.title).toBe('Updated Title');
      expect(setArg.updatedAt).toBeInstanceOf(Date);
    });

    it('should update visibility', async () => {
      const updatedBook = createMockBook({ visibility: CONTENT_VISIBILITY.SHARED });
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedBook]),
          }),
        }),
      });

      const updated = await repo.update(TEST_BOOK_ID, { visibility: CONTENT_VISIBILITY.SHARED });

      expect(updated!.visibility).toBe(CONTENT_VISIBILITY.SHARED);
    });

    it('should return null for non-existent book', async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const updated = await repo.update('nonexistent-id', { title: 'New Title' });

      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete book and return true', async () => {
      const deleteChain = {
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: TEST_BOOK_ID }]),
        }),
      };
      mockDb.delete.mockReturnValue(deleteChain);

      const result = await repo.delete(TEST_BOOK_ID);

      expect(result).toBe(true);
      expect(deleteChain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should return false when book does not exist', async () => {
      mockDb.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await repo.delete('nonexistent-id');

      expect(result).toBe(false);
    });
  });

  describe('getAccessibleBooks', () => {
    it('should return user own books when authenticated', async () => {
      const personalBook = createMockBook({
        id: TEST_BOOK_ID,
        title: 'My Personal Book',
        visibility: CONTENT_VISIBILITY.PERSONAL,
      });
      const sharedBook = createMockBook({
        id: TEST_BOOK_ID_2,
        title: 'My Shared Book',
        visibility: CONTENT_VISIBILITY.SHARED,
      });
      const chain = createSelectChainWithOrderByAndLimit([personalBook, sharedBook]);
      mockDb.select.mockReturnValue(chain);

      const result = await repo.getAccessibleBooks(TEST_USER_ID, [TEST_USER_ID]);

      expect(result.items.length).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should include followed creators shared books', async () => {
      const creatorSharedBook = createMockBook({
        id: TEST_BOOK_ID,
        title: 'Creator Shared Book',
        userId: TEST_USER_ID_2,
        visibility: CONTENT_VISIBILITY.SHARED,
      });
      const chain = createSelectChainWithOrderByAndLimit([creatorSharedBook]);
      mockDb.select.mockReturnValue(chain);

      const result = await repo.getAccessibleBooks(TEST_USER_ID, [TEST_USER_ID, TEST_USER_ID_2]);

      const creatorBooks = result.items.filter(b => b.userId === TEST_USER_ID_2);
      expect(creatorBooks.length).toBe(1);
      expect(creatorBooks[0].visibility).toBe(CONTENT_VISIBILITY.SHARED);
    });

    it('should return only shared books for unauthenticated users', async () => {
      const sharedBook = createMockBook({
        id: TEST_BOOK_ID,
        title: 'Librarian Shared',
        userId: TEST_USER_ID_2,
        visibility: CONTENT_VISIBILITY.SHARED,
      });
      const chain = createSelectChainWithOrderByAndLimit([sharedBook]);
      mockDb.select.mockReturnValue(chain);

      const result = await repo.getAccessibleBooks('', [TEST_USER_ID_2]);

      expect(result.items.every(b => b.visibility === CONTENT_VISIBILITY.SHARED)).toBe(true);
    });

    it('should handle cursor pagination with hasMore', async () => {
      const books = Array.from({ length: 51 }, (_, i) => {
        const date = new Date('2025-01-01T00:00:00Z');
        date.setHours(date.getHours() + i);
        return createMockBook({
          id: `book-${String(i).padStart(4, '0')}`,
          title: `Book ${i}`,
          createdAt: date,
        });
      });
      const chain = createSelectChainWithOrderByAndLimit(books);
      mockDb.select.mockReturnValue(chain);

      const result = await repo.getAccessibleBooks(TEST_USER_ID, [TEST_USER_ID]);

      expect(result.items.length).toBe(50);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });
  });

  describe('getBooksByFilters', () => {
    it('should return books matching visibility filter', async () => {
      const sharedBook1 = createMockBook({
        id: TEST_BOOK_ID,
        title: 'Shared Book 1',
        visibility: CONTENT_VISIBILITY.SHARED,
        chapterCount: 0,
        entryCount: 0,
        cover_illustration_url: null,
      });
      const sharedBook2 = createMockBook({
        id: TEST_BOOK_ID_2,
        title: 'Shared Book 2',
        visibility: CONTENT_VISIBILITY.SHARED,
        chapterCount: 0,
        entryCount: 0,
        cover_illustration_url: null,
      });

      const selectFields = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([sharedBook1, sharedBook2]),
            }),
          }),
        }),
      };
      mockDb.select.mockReturnValue(selectFields);

      const result = await repo.getBooksByFilters({ visibility: CONTENT_VISIBILITY.SHARED });

      expect(result.items.length).toBe(2);
      expect(result.items.every(b => b.visibility === CONTENT_VISIBILITY.SHARED)).toBe(true);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by category', async () => {
      const spiritBook = createMockBook({
        id: TEST_BOOK_ID,
        title: 'Spirituality Book',
        visibility: CONTENT_VISIBILITY.SHARED,
        category: 'spirituality',
        chapterCount: 2,
        entryCount: 5,
        cover_illustration_url: null,
      });

      const selectFields = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([spiritBook]),
            }),
          }),
        }),
      };
      mockDb.select.mockReturnValue(selectFields);

      const result = await repo.getBooksByFilters({ category: 'spirituality' });

      expect(result.items.length).toBe(1);
      expect(result.items[0].category).toBe('spirituality');
    });

    it('should map chapterCount and entryCount correctly', async () => {
      const bookRow = createMockBook({
        title: 'With Counts',
        chapterCount: 3,
        entryCount: 10,
        cover_illustration_url: 'https://example.com/cover.jpg',
      });

      const selectFields = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([bookRow]),
            }),
          }),
        }),
      };
      mockDb.select.mockReturnValue(selectFields);

      const result = await repo.getBooksByFilters({});

      expect(result.items[0].chapterCount).toBe(3);
      expect(result.items[0].entryCount).toBe(10);
      expect(result.items[0].coverIllustrationUrl).toBe('https://example.com/cover.jpg');
    });
  });
});
