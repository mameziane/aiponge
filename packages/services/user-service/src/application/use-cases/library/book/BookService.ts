import { z } from 'zod';
import {
  BookRepository,
  BookTypeRepository,
  ChapterRepository,
  EntryRepository,
  IllustrationRepository,
} from '@infrastructure/repositories';
import { Book, Chapter, Entry, Illustration, BOOK_TYPE_IDS } from '@infrastructure/database/schemas/library-schema';
import { BookEntity } from '@domains/library/entities';
import { CONTENT_VISIBILITY, ContentVisibilitySchema } from '@aiponge/shared-contracts';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { contextIsPrivileged } from '@aiponge/shared-contracts';
import {
  LibraryResponse,
  success,
  notFound,
  forbidden,
  validationError,
  operationFailed,
} from '../shared/LibraryErrors';
import { getLogger } from '@config/service-urls';

const logger = getLogger('book-service');

export const createBookInputSchema = z.object({
  typeId: z.string().min(1),
  title: z.string().min(1).max(255),
  subtitle: z.string().max(500).optional(),
  description: z.string().optional(),
  author: z.string().max(255).optional(),
  isReadOnly: z.boolean().optional(),
  category: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  era: z.string().max(100).nullish(),
  tradition: z.string().max(100).nullish(),
  visibility: ContentVisibilitySchema.optional(),
});

export type CreateBookInput = z.infer<typeof createBookInputSchema>;

export const updateBookInputSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  subtitle: z.string().max(500).optional(),
  description: z.string().optional(),
  author: z.string().max(255).optional(),
  isReadOnly: z.boolean().optional(),
  category: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  era: z.string().max(100).nullish(),
  tradition: z.string().max(100).nullish(),
  visibility: ContentVisibilitySchema.optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

export type UpdateBookInput = z.infer<typeof updateBookInputSchema>;

export interface CreateBookResult {
  book: Book;
  entity: BookEntity;
}

export interface UpdateBookResult {
  book: Book;
  entity: BookEntity;
}

export interface DeleteBookResult {
  deleted: boolean;
  bookId: string;
}

export interface ChapterWithEntries extends Chapter {
  entries: Entry[];
}

export interface BookWithChapters extends Book {
  chapters: ChapterWithEntries[];
}

export interface GetBookResult {
  book: BookWithChapters;
  entity: BookEntity;
  coverIllustration?: Illustration;
}

export interface ListBooksFilter {
  typeId?: string;
  category?: string;
  visibility?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
  includePublic?: boolean;
}

export interface BookWithIllustrations {
  book: Book;
  entity: BookEntity;
  coverIllustration?: { url: string; artworkUrl?: string | null };
}

export interface ListUserBooksResult {
  books: BookWithIllustrations[];
  total: number;
  nextCursor?: string | null;
  hasMore?: boolean;
}

export class BookService {
  constructor(
    private bookRepo: BookRepository,
    private bookTypeRepo: BookTypeRepository,
    private illustrationRepo: IllustrationRepository,
    private chapterRepo?: ChapterRepository,
    private entryRepo?: EntryRepository
  ) {}

  async create(input: CreateBookInput, context: ContentAccessContext): Promise<LibraryResponse<CreateBookResult>> {
    try {
      const parsed = createBookInputSchema.safeParse(input);
      if (!parsed.success) {
        return validationError('Invalid book data', {
          errors: parsed.error.errors.map(e => ({ path: e.path, message: e.message })),
        });
      }

      const bookType = await this.bookTypeRepo.getById(parsed.data.typeId);
      if (!bookType) {
        return notFound('Book type', parsed.data.typeId);
      }

      if (!bookType.isUserCreatable && !contextIsPrivileged(context)) {
        return validationError(`Book type '${parsed.data.typeId}' cannot be created by users`);
      }

      const resolvedVisibility = parsed.data.visibility ?? CONTENT_VISIBILITY.PERSONAL;
      const resolvedIsReadOnly = parsed.data.isReadOnly ?? !bookType.isEditable;

      const book = await this.bookRepo.create({
        typeId: parsed.data.typeId,
        title: parsed.data.title,
        subtitle: parsed.data.subtitle,
        description: parsed.data.description,
        author: parsed.data.author,
        category: parsed.data.category,
        language: parsed.data.language,
        era: parsed.data.era,
        tradition: parsed.data.tradition,
        visibility: resolvedVisibility,
        userId: context.userId,
        isReadOnly: resolvedIsReadOnly,
      });

      return success({ book, entity: new BookEntity(book) });
    } catch (error) {
      logger.error('Failed to create book', { error, input, userId: context.userId });
      return operationFailed('create book', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async get(bookId: string, context: ContentAccessContext): Promise<LibraryResponse<GetBookResult>> {
    try {
      const book = await this.bookRepo.getById(bookId);
      if (!book) {
        return notFound('Book', bookId);
      }

      const entity = new BookEntity(book);
      if (!entity.canBeViewedBy(context)) {
        return forbidden('view this book', 'You do not have permission to view this book');
      }

      const [coverIllustration, chapters] = await Promise.all([
        this.illustrationRepo.getBookCover(bookId),
        this.chapterRepo ? this.chapterRepo.getByBook(bookId) : Promise.resolve([]),
      ]);

      let chaptersWithEntries: ChapterWithEntries[] = [];
      if (chapters.length > 0 && this.entryRepo) {
        const allEntries = await this.entryRepo.getByBook(bookId);
        const entriesByChapter = new Map<string, Entry[]>();
        for (const entry of allEntries) {
          const list = entriesByChapter.get(entry.chapterId) || [];
          list.push(entry);
          entriesByChapter.set(entry.chapterId, list);
        }
        chaptersWithEntries = chapters.map(ch => ({
          ...ch,
          entries: (entriesByChapter.get(ch.id) || []).sort((a, b) => a.sortOrder - b.sortOrder),
        }));
      } else {
        chaptersWithEntries = chapters.map(ch => ({ ...ch, entries: [] }));
      }

      return success({
        book: { ...book, chapters: chaptersWithEntries },
        entity,
        coverIllustration: coverIllustration ?? undefined,
      });
    } catch (error) {
      logger.error('Failed to get book', { error, bookId, userId: context.userId });
      return operationFailed('retrieve book', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async update(
    bookId: string,
    input: UpdateBookInput,
    context: ContentAccessContext
  ): Promise<LibraryResponse<UpdateBookResult>> {
    try {
      const parsed = updateBookInputSchema.safeParse(input);
      if (!parsed.success) {
        return validationError('Invalid book data', {
          errors: parsed.error.errors.map(e => ({ path: e.path, message: e.message })),
        });
      }

      const existingBook = await this.bookRepo.getById(bookId);
      if (!existingBook) {
        return notFound('Book', bookId);
      }

      const existingEntity = new BookEntity(existingBook);
      if (!existingEntity.canBeEditedBy(context)) {
        return forbidden('update this book', 'You do not have permission to update this book');
      }

      const updatedBook = await this.bookRepo.update(bookId, parsed.data);
      logger.info('Book updated', { bookId, userId: context.userId, changes: Object.keys(parsed.data) });

      return success({ book: updatedBook, entity: new BookEntity(updatedBook) });
    } catch (error) {
      logger.error('Failed to update book', { error, bookId, userId: context.userId });
      return operationFailed('update book', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async delete(bookId: string, context: ContentAccessContext): Promise<LibraryResponse<DeleteBookResult>> {
    try {
      const book = await this.bookRepo.getById(bookId);
      if (!book) {
        return notFound('Book', bookId);
      }

      const entity = new BookEntity(book);
      if (!entity.canBeDeletedBy(context)) {
        return forbidden('delete this book', 'You do not have permission to delete this book');
      }

      await this.bookRepo.delete(bookId);
      logger.info('Book deleted', { bookId, userId: context.userId, bookTitle: book.title });

      return success({ deleted: true, bookId });
    } catch (error) {
      logger.error('Failed to delete book', { error, bookId, userId: context.userId });
      return operationFailed('delete book', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async list(context: ContentAccessContext, filter?: ListBooksFilter): Promise<LibraryResponse<ListUserBooksResult>> {
    try {
      let books: Book[];
      let nextCursor: string | null | undefined;
      let hasMore: boolean | undefined;

      if (filter?.includePublic && contextIsPrivileged(context)) {
        const result = await this.bookRepo.getBooksByFilters({
          typeId: filter.typeId,
          category: filter.category,
          visibility: filter.visibility,
          status: filter.status,
          search: filter.search,
          limit: filter.limit,
          cursor: filter.cursor,
        });
        books = result.items;
        nextCursor = result.nextCursor;
        hasMore = result.hasMore;
      } else {
        books = await this.bookRepo.getBooksByUserAndType(context.userId, filter?.typeId);

        if (books.length === 0 && (!filter?.typeId || filter.typeId === BOOK_TYPE_IDS.PERSONAL)) {
          try {
            const defaultBook = await this.bookRepo.getOrCreateDefaultPersonalBook(context.userId);
            books = [defaultBook];
            logger.info('Auto-created default personal book for user', {
              userId: context.userId,
              bookId: defaultBook.id,
            });
          } catch (autoCreateError) {
            logger.warn('Failed to auto-create default personal book', {
              userId: context.userId,
              error: autoCreateError instanceof Error ? autoCreateError.message : String(autoCreateError),
            });
          }
        }
      }

      const coverMap = await this.illustrationRepo.getBookCoversBatch(books.map(b => b.id));

      const booksWithIllustrations: BookWithIllustrations[] = books.map(book => {
        const cover = coverMap.get(book.id);
        return {
          book,
          entity: new BookEntity(book),
          coverIllustration: cover ? { url: cover.url, artworkUrl: cover.artworkUrl } : undefined,
        };
      });

      return success({
        books: booksWithIllustrations,
        total: booksWithIllustrations.length,
        nextCursor,
        hasMore,
      });
    } catch (error) {
      logger.error('Failed to list books', { error, userId: context.userId });
      return operationFailed('list books', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}
