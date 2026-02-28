import { Request, Response } from 'express';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';
import { extractAuthContext } from '@aiponge/platform-core';
import { ENTRY_TYPES } from '@infrastructure/database/schemas/library-schema';
import {
  LibEntryCreateSchema as entryCreateSchema,
  LibEntryUpdateSchema as entryUpdateSchema,
  AutoAssignBookmarkSchema as autoAssignBookmarkSchema,
} from '@aiponge/shared-contracts';
import type { LibraryControllerDeps } from './library-helpers';
import {
  handleRequest,
  formatZodErrors,
  buildContext,
  handleUseCaseResult,
  buildEnrichedContext,
} from './library-helpers';

export class EntryController {
  constructor(private readonly deps: LibraryControllerDeps) {}

  async getMyEntries(req: Request, res: Response): Promise<void> {
    const bookId = req.query.bookId as string | undefined;
    const cursor = req.query.cursor as string | undefined;
    const context = bookId ? await buildEnrichedContext(this.deps.db, req) : buildContext(req);
    if (!context.userId && !bookId) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

    const result = bookId
      ? await this.deps.listEntriesUseCase.executeByBook(bookId, context, { limit, cursor })
      : await this.deps.listEntriesUseCase.executeByUser(context, { limit, offset, dateFrom, dateTo });

    if (result.success) {
      const { entries, total, cursorPagination, pagination } = result.data;
      const hasMore = cursorPagination
        ? cursorPagination.hasMore
        : pagination
          ? pagination.offset + pagination.limit < total
          : false;
      const nextCursor = cursorPagination?.nextCursor ?? null;
      const flatEntries = entries.map(e => ({
        ...e.entry,
        images: e.illustrations || [],
      }));
      sendSuccess(res, { items: flatEntries, total, hasMore, nextCursor });
    } else {
      handleUseCaseResult(res, result, 200, req);
    }
  }

  async getEntriesByChapter(req: Request, res: Response): Promise<void> {
    const context = await buildEnrichedContext(this.deps.db, req);
    const chapterId = req.params.chapterId as string;

    const result = await this.deps.listEntriesUseCase.executeByChapter(chapterId, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async getEntryById(req: Request, res: Response): Promise<void> {
    const context = await buildEnrichedContext(this.deps.db, req);
    const entryId = req.params.id as string;

    const result = await this.deps.getEntryUseCase.execute(entryId, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async createEntry(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);

    const parsed = entryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      ServiceErrors.badRequest(res, 'Invalid entry data', req, formatZodErrors(parsed.error.errors));
      return;
    }

    const result = await this.deps.createEntryUseCase.execute(parsed.data, context);
    handleUseCaseResult(res, result, 201, req);
  }

  async updateEntry(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const entryId = req.params.id as string;

    const parsed = entryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      ServiceErrors.badRequest(res, 'Invalid entry data', req, formatZodErrors(parsed.error.errors));
      return;
    }

    const result = await this.deps.updateEntryUseCase.execute(entryId, parsed.data, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async deleteEntry(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const entryId = req.params.id as string;

    const result = await this.deps.deleteEntryUseCase.execute(entryId, context);

    if (result.success) {
      sendSuccess(res, { message: 'Entry deleted' });
    } else {
      handleUseCaseResult(res, result, 200, req);
    }
  }

  async promoteEntry(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const entryId = req.params.id as string;

    const result = await this.deps.promoteEntryUseCase.execute({ entryId }, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async unpromoteEntry(req: Request, res: Response): Promise<void> {
    const context = buildContext(req);
    const entryId = req.params.id as string;

    const result = await this.deps.unpromoteEntryUseCase.execute({ entryId }, context);
    handleUseCaseResult(res, result, 200, req);
  }

  async autoAssignBookmark(req: Request, res: Response): Promise<void> {
    const { userId } = extractAuthContext(req);
    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID required', req);
      return;
    }

    const parsed = autoAssignBookmarkSchema.safeParse(req.body);
    if (!parsed.success) {
      ServiceErrors.badRequest(res, 'Invalid bookmark data', req, formatZodErrors(parsed.error.errors));
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to save bookmark',
      successStatus: 201,
      handler: async () => {
        const bookmarksBook = await this.deps.bookRepo.getOrCreateBookmarksBook(userId);
        const savedChapter = await this.deps.chapterRepo.getOrCreateDefaultChapter(bookmarksBook.id, userId, 'Saved');

        const entry = await this.deps.entryRepo.create({
          chapterId: savedChapter.id,
          bookId: bookmarksBook.id,
          userId,
          content: parsed.data.content,
          entryType: ENTRY_TYPES.BOOKMARK,
          sourceTitle: parsed.data.sourceTitle,
          sourceAuthor: parsed.data.sourceAuthor,
          sourceChapter: parsed.data.sourceChapter,
          tags: parsed.data.tags,
        });

        await this.deps.chapterRepo.updateEntryCount(savedChapter.id);
        await this.deps.bookRepo.updateEntryCount(bookmarksBook.id);

        return entry;
      },
    });
  }
}
