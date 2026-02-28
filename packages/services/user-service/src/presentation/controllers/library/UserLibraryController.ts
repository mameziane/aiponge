import { Request, Response } from 'express';
import { sendSuccess, sendCreated, ServiceErrors } from '../../utils/response-helpers';
import { extractAuthContext } from '@aiponge/platform-core';
import type { LibraryControllerDeps } from './library-helpers';
import {
  logger,
  handleRequest,
} from './library-helpers';

export class UserLibraryController {
  constructor(private readonly deps: LibraryControllerDeps) {}

  async getMyLibrary(req: Request, res: Response): Promise<void> {
    const { userId } = extractAuthContext(req);
    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to retrieve library',
      handler: async () => this.deps.userLibraryRepo.getByUser(userId),
    });
  }

  async addToLibrary(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const { bookId } = req.body;

      if (!userId || !bookId) {
        ServiceErrors.badRequest(res, 'User ID and Book ID required', req);
        return;
      }

      const book = await this.deps.bookRepo.getById(bookId);
      if (!book) {
        ServiceErrors.notFound(res, 'Book not found', req);
        return;
      }

      const libraryEntry = await this.deps.userLibraryRepo.addToLibrary({ userId, bookId });
      sendCreated(res, libraryEntry);
    } catch (error) {
      logger.error('Failed to add to library', { error });
      ServiceErrors.internal(res, 'Failed to add book to library', undefined, req);
    }
  }

  async getLibraryProgress(req: Request, res: Response): Promise<void> {
    const { userId } = extractAuthContext(req);
    const bookId = req.params.bookId as string;

    if (!userId) {
      ServiceErrors.badRequest(res, 'User ID required', req);
      return;
    }

    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get reading progress',
      handler: async () => {
        const entry = await this.deps.userLibraryRepo.getByUserAndBook(userId, bookId);

        const defaultProgress = {
          lastChapterId: null,
          lastEntryId: null,
          currentPageIndex: 0,
          fontSize: 'm',
          lastAccessedAt: null,
        };

        return entry
          ? {
              lastChapterId: entry.lastChapterId ?? null,
              lastEntryId: entry.lastEntryId ?? null,
              currentPageIndex: entry.currentPageIndex ?? 0,
              fontSize: entry.fontSize ?? 'm',
              lastAccessedAt: entry.lastAccessedAt ? entry.lastAccessedAt.toISOString() : null,
            }
          : defaultProgress;
      },
    });
  }

  async updateLibraryProgress(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const bookId = req.params.bookId as string;
      const { lastChapterId, lastEntryId, currentPageIndex, readingProgress, fontSize } = req.body;

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID required', req);
        return;
      }

      const updated = await this.deps.userLibraryRepo.updateProgress(userId, bookId, {
        lastChapterId,
        lastEntryId,
        currentPageIndex,
        readingProgress,
        fontSize,
      });

      if (!updated) {
        ServiceErrors.notFound(res, 'Book not in library', req);
        return;
      }

      sendSuccess(res, updated);
    } catch (error) {
      logger.error('Failed to update library progress', { error });
      ServiceErrors.internal(res, 'Failed to update reading progress', undefined, req);
    }
  }

  async removeFromLibrary(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const bookId = req.params.bookId as string;

      if (!userId) {
        ServiceErrors.badRequest(res, 'User ID required', req);
        return;
      }

      const removed = await this.deps.userLibraryRepo.removeFromLibrary(userId, bookId);
      if (!removed) {
        ServiceErrors.notFound(res, 'Book not in library', req);
        return;
      }

      sendSuccess(res, { message: 'Book removed from library' });
    } catch (error) {
      logger.error('Failed to remove from library', { error });
      ServiceErrors.internal(res, 'Failed to remove book from library', undefined, req);
    }
  }
}
