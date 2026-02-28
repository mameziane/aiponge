import { Request, Response } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { sendSuccess, sendCreated, ServiceErrors } from '../../utils/response-helpers';
import { serializeError, extractAuthContext } from '@aiponge/platform-core';
import { BOOK_TYPE_IDS, ENTRY_TYPES } from '@infrastructure/database/schemas/library-schema';
import {
  contextIsPrivileged,
  isContentPubliclyAccessible,
  LibBookCreateSchema as bookCreateSchema,
  LibBookUpdateSchema as bookUpdateSchema,
  LibTemplateChapterSchema as templateChapterSchema,
} from '@aiponge/shared-contracts';
import type { ContentAccessContext } from '@aiponge/shared-contracts';
import { GENERATION_STATUS } from '@aiponge/shared-contracts';
import { CreatorMemberRepository } from '@infrastructure/repositories/CreatorMemberRepository';
import type { LibraryControllerDeps } from './library-helpers';
import { logger, formatZodErrors, buildContext, handleUseCaseResult, buildEnrichedContext } from './library-helpers';

export class BookController {
  constructor(private readonly deps: LibraryControllerDeps) {}

  async getBookTypes(req: Request, res: Response): Promise<void> {
    const { handleRequest } = await import('./library-helpers');
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to retrieve book types',
      handler: async () => this.deps.bookTypeRepo.getAll(),
    });
  }

  async getBookTypeById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const type = await this.deps.bookTypeRepo.getById(id);

      if (!type) {
        ServiceErrors.notFound(res, 'Book type not found', req);
        return;
      }

      sendSuccess(res, type);
    } catch (error) {
      logger.error('Failed to get book type', { error, id: req.params.id });
      ServiceErrors.internal(res, 'Failed to retrieve book type', undefined, req);
    }
  }

  async getBooks(req: Request, res: Response): Promise<void> {
    try {
      const { typeId, category, language, visibility, status, search, limit, cursor, scope } = req.query;
      const context = buildContext(req);

      const filters = {
        typeId: typeId as string,
        category: category as string,
        language: language as string,
        visibility: visibility as string,
        status: status as string,
        search: search as string,
        limit: limit ? parseInt(limit as string) : undefined,
        cursor: cursor as string | undefined,
      };

      if (isContentPubliclyAccessible(scope as string) && context.userId && contextIsPrivileged(context)) {
        const result = await this.deps.bookRepo.getBooksByFilters({
          ...filters,
          visibility: 'publicly_accessible',
        });

        sendSuccess(res, { items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore });
        return;
      }

      let result;

      const creatorMemberRepo = new CreatorMemberRepository(this.deps.db);
      const librarianIds = await creatorMemberRepo.getLibrarianIds();

      if (!context.userId) {
        if (librarianIds.length === 0) {
          logger.warn('No librarians found - unauthenticated users will see empty library');
        }
        result = await this.deps.bookRepo.getAccessibleBooks('', librarianIds, filters);
      } else {
        const creatorIds = await creatorMemberRepo.getAccessibleCreatorIds(context.userId);
        const allCreatorIds = [...new Set([...creatorIds, context.userId, ...librarianIds])];
        result = await this.deps.bookRepo.getAccessibleBooks(context.userId, allCreatorIds, filters);
      }

      const coverMap = await this.deps.illustrationRepo.getBookCoversBatch(result.items.map(b => b.id));
      const booksWithCovers = result.items.map(book => ({
        ...book,
        coverIllustrationUrl: coverMap.get(book.id)?.url || null,
      }));

      sendSuccess(res, { items: booksWithCovers, nextCursor: result.nextCursor, hasMore: result.hasMore });
    } catch (error) {
      logger.error('Failed to get books', {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        userId: extractAuthContext(req).userId,
        query: req.query,
      });
      ServiceErrors.fromException(res, error, 'Failed to retrieve books', req);
    }
  }

  async getMyBooks(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    if (!context.userId) {
      ServiceErrors.badRequest(res, 'User ID required', req);
      return;
    }

    const typeId = req.query.typeId as string | undefined;
    const result = await this.deps.bookService.list(context, typeId ? { typeId } : undefined);
    handleUseCaseResult(res, result, 200, req);
  }

  async getBookById(req: Request, res: Response): Promise<void> {
    const bookId = req.params.id as string;

    const uuidResult = z.string().uuid().safeParse(bookId);
    if (!uuidResult.success) {
      ServiceErrors.badRequest(res, 'Invalid book ID format', req);
      return;
    }

    const context = await buildEnrichedContext(this.deps.db, req);
    const result = await this.deps.bookService.get(bookId, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async createBook(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    if (!context.userId) {
      ServiceErrors.badRequest(res, 'User ID required', req);
      return;
    }

    const parsed = bookCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      ServiceErrors.badRequest(res, 'Invalid book data', req, formatZodErrors(parsed.error.errors));
      return;
    }

    const { chapters, ...bookData } = parsed.data;

    if (bookData.typeId !== BOOK_TYPE_IDS.PERSONAL && !bookData.author) {
      try {
        const [row] = await this.deps.db.execute<{ display_name: string | null }>(
          sql`SELECT profile->>'displayName' as display_name FROM usr_accounts WHERE id = ${context.userId} LIMIT 1`
        );
        bookData.author = row?.display_name || '';
      } catch (dbError) {
        logger.warn('Failed to fetch user display name for book author', { userId: context.userId, error: dbError });
        bookData.author = '';
      }
    }

    const hasChapters = chapters && chapters.length > 0;
    const originalIsReadOnly = bookData.isReadOnly;
    if (hasChapters && originalIsReadOnly !== false) {
      bookData.isReadOnly = false;
    }

    const result = await this.deps.bookService.create(bookData, context);

    if (!result.success || !result.data) {
      handleUseCaseResult(res, result, 201, req);
      return;
    }

    const { book } = result.data;

    const chaptersResult = await this.createChaptersAndEntries(book, chapters, context);
    if (chaptersResult.success === false) {
      ServiceErrors.internal(res, chaptersResult.errorMessage, undefined, req);
      return;
    }

    if (hasChapters && originalIsReadOnly !== false) {
      await this.deps.bookService.update(book.id, { isReadOnly: true }, context);
      book.isReadOnly = true;
    }

    await this.generateCoverIfReadOnly(book, bookData, context);

    sendCreated(res, {
      ...book,
      chaptersCreated: chaptersResult.totalChapters,
      entriesCreated: chaptersResult.totalEntries,
    });
  }

  private async createChaptersAndEntries(
    book: { id: string; isReadOnly: boolean | null },
    chapters: z.infer<typeof templateChapterSchema>[] | undefined,
    context: ContentAccessContext
  ): Promise<
    { success: true; totalChapters: number; totalEntries: number } | { success: false; errorMessage: string }
  > {
    if (!chapters || chapters.length === 0) {
      return { success: true, totalChapters: 0, totalEntries: 0 };
    }

    const isReadOnly = book.isReadOnly;
    let totalChapters = 0;
    let totalEntries = 0;

    logger.info('Creating chapters from template', { bookId: book.id, chapterCount: chapters.length });

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const chapterResult = await this.deps.createChapterUseCase.execute(
        {
          bookId: book.id,
          title: chapter.title,
          description: chapter.description,
          sortOrder: chapter.order ?? i,
        },
        context
      );

      if (!chapterResult.success || !chapterResult.data) {
        const errorMsg = 'error' in chapterResult ? chapterResult.error.message : 'Unknown error';
        logger.error('Failed to create chapter - aborting book creation', {
          bookId: book.id,
          chapterTitle: chapter.title,
          chapterIndex: i,
          error: errorMsg,
        });
        await this.deps.bookService.delete(book.id, context);
        return { success: false, errorMessage: `Failed to create chapter "${chapter.title}": ${errorMsg}` };
      }

      totalChapters++;
      const { chapter: createdChapter } = chapterResult.data;

      if (chapter.entries && chapter.entries.length > 0) {
        const entriesResult = await this.createEntriesForChapter(book, chapter, createdChapter, i, isReadOnly, context);
        if (entriesResult.success === false) {
          return entriesResult;
        }
        totalEntries += entriesResult.totalEntries;
      }
    }

    logger.info('Template book created with content', {
      bookId: book.id,
      chaptersCreated: totalChapters,
      entriesCreated: totalEntries,
    });

    return { success: true, totalChapters, totalEntries };
  }

  private buildAttribution(
    sources?: Array<{ author?: string; work?: string; [key: string]: unknown }>
  ): string | undefined {
    if (!sources || sources.length === 0) return undefined;
    return sources.map(s => (s.work ? `${s.author}, "${s.work}"` : s.author)).join('; ');
  }

  private async createEntriesForChapter(
    book: { id: string },
    chapter: z.infer<typeof templateChapterSchema>,
    createdChapter: { id: string },
    chapterIndex: number,
    isReadOnly: boolean | null,
    context: ContentAccessContext
  ): Promise<{ success: true; totalEntries: number } | { success: false; errorMessage: string }> {
    const entries = chapter.entries!;
    const chapterOrder = chapter.order ?? chapterIndex;

    const entryPromises = entries.map((entry, j) => {
      const primarySource = entry.sources?.[0];
      const attribution = this.buildAttribution(entry.sources);

      return this.deps.createEntryUseCase.execute(
        {
          chapterId: createdChapter.id,
          content: entry.content || entry.prompt || '',
          entryType: entry.type || (isReadOnly ? ENTRY_TYPES.EXCERPT : 'reflection'),
          sortOrder: j,
          chapterSortOrder: chapterOrder * 1000 + j,
          processingStatus: isReadOnly ? GENERATION_STATUS.COMPLETED : GENERATION_STATUS.PENDING,
          sourceAuthor: primarySource?.author,
          sourceTitle: primarySource?.work,
          attribution,
          tags: entry.tags,
          themes: entry.themes,
          metadata: isReadOnly && entry.sources ? { sources: entry.sources } : undefined,
        },
        context
      );
    });

    const results = await Promise.all(entryPromises);

    for (let j = 0; j < results.length; j++) {
      const entryResult = results[j];
      if (!entryResult.success) {
        const errorMsg = 'error' in entryResult ? entryResult.error.message : 'Unknown error';
        logger.error('Failed to create entry - aborting book creation', {
          bookId: book.id,
          chapterId: createdChapter.id,
          entryIndex: j,
          error: errorMsg,
        });
        await this.deps.bookService.delete(book.id, context);
        return { success: false, errorMessage: `Failed to create entry in chapter "${chapter.title}": ${errorMsg}` };
      }
    }

    return { success: true, totalEntries: entries.length };
  }

  private async generateCoverIfReadOnly(
    book: { id: string; isReadOnly: boolean | null; title: string; description: string | null },
    bookData: { typeId?: string },
    context: ContentAccessContext
  ): Promise<void> {
    if (!book.isReadOnly) {
      return;
    }

    try {
      const coverResult = await this.deps.generateBookCoverUseCase.execute(
        {
          bookId: book.id,
          title: book.title,
          description: book.description || undefined,
          style: 'artistic',
          bookType: bookData.typeId || undefined,
        },
        context
      );
      if (coverResult.success) {
        logger.info('Book cover generated successfully', {
          bookId: book.id,
          illustrationId: coverResult.data?.illustration.id,
        });
      } else {
        const errorMsg = 'error' in coverResult ? coverResult.error.message : 'Unknown error';
        logger.warn('Book cover generation failed (non-blocking)', {
          bookId: book.id,
          error: errorMsg,
        });
      }
    } catch (err) {
      logger.warn('Book cover generation error (non-blocking)', {
        bookId: book.id,
        error: serializeError(err),
      });
    }
  }

  async updateBook(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const bookId = req.params.id as string;

    const parsed = bookUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      ServiceErrors.badRequest(res, 'Invalid book data', req, formatZodErrors(parsed.error.errors));
      return;
    }

    const result = await this.deps.bookService.update(bookId, parsed.data, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async updateBookCover(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const bookId = (req.params.bookId || req.params.id) as string;

    if (!context.userId) {
      ServiceErrors.badRequest(res, 'User ID required', req);
      return;
    }

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      ServiceErrors.badRequest(res, 'Image URL is required', req);
      return;
    }

    try {
      const existingCover = await this.deps.illustrationRepo.getBookCover(bookId);
      if (existingCover) {
        await this.deps.illustrationRepo.delete(existingCover.id);
        logger.info('Deleted existing book cover', { bookId, illustrationId: existingCover.id });
      }

      const result = await this.deps.addIllustrationUseCase.execute(
        {
          bookId,
          url,
          illustrationType: 'cover',
          source: 'uploaded',
        },
        context
      );

      handleUseCaseResult(res, result, 200, req);
    } catch (error) {
      logger.error('Failed to update book cover', { bookId, error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to update book cover', req);
    }
  }

  async deleteBook(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const bookId = req.params.id as string;

    const result = await this.deps.bookService.delete(bookId, context);

    if (result.success) {
      sendSuccess(res, { message: 'Book deleted' });
    } else {
      handleUseCaseResult(res, result, 200, req);
    }
  }
}
