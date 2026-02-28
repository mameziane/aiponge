/**
 * Integration tests for BookRepository
 * Tests actual database interactions for library book operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BOOK_TYPE_IDS, CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { BookRepository } from '../../infrastructure/repositories/LibraryRepository';
import { getTestDatabase, closeTestDatabase, createTestUser, shouldRunIntegrationTests, TestDatabaseConnection } from './test-helpers';
import { libBooks } from '../../infrastructure/database/schemas/library-schema';
import { users } from '../../infrastructure/database/schemas/user-schema';
import { eq } from 'drizzle-orm';

const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('BookRepository Integration', () => {
  let db: TestDatabaseConnection;
  let repo: BookRepository;
  let testUserIds: string[] = [];
  let testBookIds: string[] = [];

  beforeAll(async () => {
    db = await getTestDatabase();
    repo = new BookRepository(db);
  });

  afterAll(async () => {
    for (const bookId of testBookIds) {
      try {
        await db.delete(libBooks).where(eq(libBooks.id, bookId));
      } catch {
        // Ignore cleanup errors
      }
    }
    for (const userId of testUserIds) {
      try {
        await db.delete(users).where(eq(users.id, userId));
      } catch {
        // Ignore cleanup errors
      }
    }
    await closeTestDatabase();
  });

  beforeEach(() => {
    testUserIds = [];
    testBookIds = [];
  });

  async function createTestBook(userId: string, overrides: Partial<{
    title: string;
    typeId: string;
    visibility: string;
    status: string;
    category: string;
  }> = {}): Promise<{ id: string }> {
    const bookId = crypto.randomUUID();
    const [book] = await db.insert(libBooks).values({
      id: bookId,
      userId,
      typeId: overrides.typeId || BOOK_TYPE_IDS.PERSONAL,
      title: overrides.title || `Test Book ${Date.now()}`,
      visibility: overrides.visibility || CONTENT_VISIBILITY.PERSONAL,
      status: overrides.status || 'active',
      category: overrides.category,
    }).returning();
    testBookIds.push(book.id);
    return book;
  }

  describe('getById', () => {
    it('should find book by ID', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      const book = await createTestBook(user.id, { title: 'My Test Book' });

      const found = await repo.getById(book.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(book.id);
      expect(found!.title).toBe('My Test Book');
    });

    it('should return null for non-existent book', async () => {
      const nonExistentId = crypto.randomUUID();
      const found = await repo.getById(nonExistentId);

      expect(found).toBeNull();
    });
  });

  describe('getBooksByUserAndType', () => {
    it('should return all books for user', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      await createTestBook(user.id, { title: 'Book 1' });
      await createTestBook(user.id, { title: 'Book 2' });

      const books = await repo.getBooksByUserAndType(user.id);

      expect(books.length).toBe(2);
      expect(books.every(b => b.userId === user.id)).toBe(true);
    });

    it('should filter by typeId when provided', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      await createTestBook(user.id, { title: 'Personal Book', typeId: BOOK_TYPE_IDS.PERSONAL });
      await createTestBook(user.id, { title: 'Shared Book', typeId: 'wisdom' });
      await createTestBook(user.id, { title: 'Quotes Book', typeId: 'quotes' });

      const personalBooks = await repo.getBooksByUserAndType(user.id, BOOK_TYPE_IDS.PERSONAL);

      expect(personalBooks.length).toBe(1);
      expect(personalBooks[0].title).toBe('Personal Book');
    });

    it('should return empty array for user with no books', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      const books = await repo.getBooksByUserAndType(user.id);

      expect(books).toEqual([]);
    });
  });

  describe('getBooksByUser', () => {
    it('should return all books regardless of type', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      await createTestBook(user.id, { typeId: BOOK_TYPE_IDS.PERSONAL });
      await createTestBook(user.id, { typeId: 'wisdom' });
      await createTestBook(user.id, { typeId: 'quotes' });

      const books = await repo.getBooksByUser(user.id);

      expect(books.length).toBe(3);
    });
  });

  describe('create', () => {
    it('should create a new book', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      const bookData = {
        typeId: BOOK_TYPE_IDS.PERSONAL,
        title: 'New Created Book',
        userId: user.id,
        visibility: CONTENT_VISIBILITY.PERSONAL,
      };

      const book = await repo.create(bookData);
      testBookIds.push(book.id);

      expect(book).toBeDefined();
      expect(book.id).toBeDefined();
      expect(book.title).toBe('New Created Book');
      expect(book.userId).toBe(user.id);
      expect(book.visibility).toBe(CONTENT_VISIBILITY.PERSONAL);
    });

    it('should create book with optional fields', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      const bookData = {
        typeId: BOOK_TYPE_IDS.PERSONAL,
        title: 'Book With Details',
        subtitle: 'A Subtitle',
        description: 'A description of the book',
        author: 'Test Author',
        userId: user.id,
        category: 'spirituality',
        visibility: CONTENT_VISIBILITY.SHARED,
      };

      const book = await repo.create(bookData);
      testBookIds.push(book.id);

      expect(book.subtitle).toBe('A Subtitle');
      expect(book.description).toBe('A description of the book');
      expect(book.author).toBe('Test Author');
      expect(book.category).toBe('spirituality');
      expect(book.visibility).toBe(CONTENT_VISIBILITY.SHARED);
    });
  });

  describe('update', () => {
    it('should update book fields', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      const book = await createTestBook(user.id, { title: 'Original Title' });

      const updated = await repo.update(book.id, { title: 'Updated Title' });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe('Updated Title');
    });

    it('should update visibility', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      const book = await createTestBook(user.id, { visibility: CONTENT_VISIBILITY.PERSONAL });

      const updated = await repo.update(book.id, { visibility: CONTENT_VISIBILITY.SHARED });

      expect(updated!.visibility).toBe(CONTENT_VISIBILITY.SHARED);
    });

    it('should return null for non-existent book', async () => {
      const nonExistentId = crypto.randomUUID();
      const updated = await repo.update(nonExistentId, { title: 'New Title' });

      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete book', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      const book = await createTestBook(user.id, { title: 'To Be Deleted' });

      await repo.delete(book.id);

      const found = await repo.getById(book.id);
      expect(found).toBeNull();

      const bookIndex = testBookIds.indexOf(book.id);
      if (bookIndex > -1) {
        testBookIds.splice(bookIndex, 1);
      }
    });
  });

  describe('getAccessibleBooks', () => {
    it('should return user own books when authenticated', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      await createTestBook(user.id, { title: 'My Personal Book', visibility: CONTENT_VISIBILITY.PERSONAL });
      await createTestBook(user.id, { title: 'My Shared Book', visibility: CONTENT_VISIBILITY.SHARED });

      const result = await repo.getAccessibleBooks(user.id, [user.id]);

      expect(result.items.length).toBe(2);
    });

    it('should include followed creators shared books', async () => {
      const creator = await createTestUser(db, {});
      const follower = await createTestUser(db, {});
      testUserIds.push(creator.id, follower.id);

      await createTestBook(creator.id, { title: 'Creator Shared Book', visibility: CONTENT_VISIBILITY.SHARED });
      await createTestBook(creator.id, { title: 'Creator Personal Book', visibility: CONTENT_VISIBILITY.PERSONAL });

      const result = await repo.getAccessibleBooks(follower.id, [follower.id, creator.id]);

      const creatorBooks = result.items.filter(b => b.userId === creator.id);
      expect(creatorBooks.length).toBe(1);
      expect(creatorBooks[0].visibility).toBe(CONTENT_VISIBILITY.SHARED);
    });

    it('should return only shared books for unauthenticated users', async () => {
      const librarian = await createTestUser(db, { role: 'librarian' });
      testUserIds.push(librarian.id);

      await createTestBook(librarian.id, { title: 'Librarian Shared', visibility: CONTENT_VISIBILITY.SHARED });
      await createTestBook(librarian.id, { title: 'Librarian Personal', visibility: CONTENT_VISIBILITY.PERSONAL });

      const result = await repo.getAccessibleBooks('', [librarian.id]);

      expect(result.items.every(b => b.visibility === CONTENT_VISIBILITY.SHARED)).toBe(true);
    });
  });

  describe('getBooksByFilters', () => {
    it('should return books matching visibility filter', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      await createTestBook(user.id, { title: 'Shared Book 1', visibility: CONTENT_VISIBILITY.SHARED });
      await createTestBook(user.id, { title: 'Shared Book 2', visibility: CONTENT_VISIBILITY.SHARED });
      await createTestBook(user.id, { title: 'Personal Book', visibility: CONTENT_VISIBILITY.PERSONAL });

      const result = await repo.getBooksByFilters({ visibility: CONTENT_VISIBILITY.SHARED });

      const ourSharedBooks = result.items.filter(b => b.userId === user.id);
      expect(ourSharedBooks.length).toBe(2);
      expect(ourSharedBooks.every(b => b.visibility === CONTENT_VISIBILITY.SHARED)).toBe(true);
    });

    it('should filter by category', async () => {
      const user = await createTestUser(db, {});
      testUserIds.push(user.id);

      await createTestBook(user.id, { title: 'Spirituality Book', visibility: CONTENT_VISIBILITY.SHARED, category: 'spirituality' });
      await createTestBook(user.id, { title: 'Wisdom Book', visibility: CONTENT_VISIBILITY.SHARED, category: 'philosophy' });

      const result = await repo.getBooksByFilters({ category: 'spirituality' });

      const ourBooks = result.items.filter(b => b.userId === user.id);
      expect(ourBooks.length).toBe(1);
      expect(ourBooks[0].category).toBe('spirituality');
    });
  });
});
