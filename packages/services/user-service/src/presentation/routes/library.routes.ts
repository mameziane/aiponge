import { Router, Request, Response } from 'express';
import { serializeError, extractAuthContext } from '@aiponge/platform-core';
import { normalizeRole } from '@aiponge/shared-contracts';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { GenerateBookUseCase } from '../../application/use-cases/library/GenerateBookUseCase';
import { CloneBookUseCase } from '../../application/use-cases/library/CloneBookUseCase';
import { getLogger } from '../../config/service-urls';

import type { LibraryController } from '../controllers/library';

export interface LibraryRouteDeps {
  libraryController: LibraryController;
}

export function registerLibraryRoutes(router: Router, deps: LibraryRouteDeps): void {
  const { libraryController } = deps;
  const generateBookUseCase = new GenerateBookUseCase();
  const cloneBookUseCase = new CloneBookUseCase();
  const logger = getLogger('library-routes');

  const safe = (fn: (req: Request, res: Response) => Promise<void>) => {
    return (req: Request, res: Response) => {
      fn(req, res).catch((error: unknown) => {
        logger.error('Unhandled library controller error', {
          error: serializeError(error),
          method: req.method,
          path: req.path,
        });
        if (!res.headersSent) {
          ServiceErrors.fromException(res, error, 'An unexpected error occurred', req);
        }
      });
    };
  };

  // ==============================================
  // BOOK GENERATION (AI-powered blueprint creation)
  // ==============================================
  // Generates book blueprints (structure with chapters/entries) that can be converted to real Book entities

  router.get('/books/generation/access', async (req, res) => {
    try {
      const { userId, role } = extractAuthContext(req);
      const userRole = normalizeRole(role);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }
      const result = await generateBookUseCase.checkBookAccess(userId, userRole);
      sendSuccess(res, { hasAccess: result.hasAccess, message: result.message });
    } catch (error) {
      logger.error('Error checking book generation access', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to check access', req);
      return;
    }
  });

  router.post('/books/generation', async (req, res) => {
    try {
      const { userId, role } = extractAuthContext(req);
      const userRole = normalizeRole(role);
      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }
      const { primaryGoal, language, tone, generationMode, depthLevel, bookTypeId } = req.body;
      const result = await generateBookUseCase.createRequest({
        userId,
        userRole,
        primaryGoal,
        language,
        tone,
        generationMode,
        depthLevel,
        bookTypeId,
      });
      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Failed to create generation request', req, {
          requestId: result.requestId,
        });
        return;
      }
      sendCreated(res, { requestId: result.requestId, status: result.status });
    } catch (error) {
      logger.error('Error creating book generation request', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to create generation request', req);
      return;
    }
  });

  router.get('/books/generation/:requestId', async (req, res) => {
    try {
      const { userId } = extractAuthContext(req);
      const { requestId } = req.params;
      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }
      const result = await generateBookUseCase.getRequestStatus(requestId, userId);
      if (!result.success) {
        ServiceErrors.notFound(res, 'Book generation request', req);
        return;
      }
      sendSuccess(res, {
        requestId: result.requestId,
        status: result.status,
        blueprint: result.book,
        usedSystemPrompt: result.usedSystemPrompt,
        usedUserPrompt: result.usedUserPrompt,
        error: result.error,
        progress: result.progress,
      });
    } catch (error) {
      logger.error('Error fetching book generation status', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to fetch generation status', req);
      return;
    }
  });

  router.post('/books/generation/:requestId/regenerate', async (req, res) => {
    try {
      const { userId, role } = extractAuthContext(req);
      const userRole = normalizeRole(role);
      const { requestId } = req.params;
      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }
      const result = await generateBookUseCase.regenerate(requestId, userId, userRole);
      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Failed to regenerate blueprint', req);
        return;
      }
      sendSuccess(res, { requestId: result.requestId, status: result.status });
    } catch (error) {
      logger.error('Error regenerating book blueprint', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to regenerate blueprint', req);
      return;
    }
  });

  router.get('/books/generation/:requestId/progress', async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { requestId } = req.params;

    if (!userId) {
      ServiceErrors.unauthorized(res, 'User ID required', req);
      return;
    }

    const request = await generateBookUseCase.getRequestStatus(requestId, userId);
    if (!request.success) {
      ServiceErrors.notFound(res, 'Book generation request', req);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    if (request.status === 'completed') {
      sendEvent({ type: 'completed', status: 'completed', blueprint: request.book });
      res.end();
      return;
    }

    if (request.status === 'failed') {
      sendEvent({ type: 'failed', status: 'failed', error: request.error });
      res.end();
      return;
    }

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    // Request-scoped SSE polling timer — intentionally uses setInterval/setTimeout rather than
    // BaseScheduler because this is a transient, per-request timer that's cleaned up when
    // the SSE connection closes. CLAUDE.md's scheduling rule targets service-level recurring jobs.
    const pollInterval = setInterval(async () => {
      if (closed) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const current = await generateBookUseCase.getRequestStatusWithProgress(requestId, userId);
        if (!current) {
          clearInterval(pollInterval);
          sendEvent({ type: 'error', error: 'Request not found' });
          res.end();
          return;
        }

        if (current.status === 'completed') {
          clearInterval(pollInterval);
          sendEvent({ type: 'completed', status: 'completed', blueprint: current.book });
          res.end();
          return;
        }

        if (current.status === 'failed') {
          clearInterval(pollInterval);
          sendEvent({ type: 'failed', status: 'failed', error: current.error });
          res.end();
          return;
        }

        sendEvent({
          type: 'progress',
          status: current.status,
          progress: current.progress,
        });
      } catch {
        clearInterval(pollInterval);
        sendEvent({ type: 'error', error: 'Internal error' });
        res.end();
      }
    }, 1000);

    setTimeout(() => {
      if (!closed) {
        clearInterval(pollInterval);
        sendEvent({ type: 'timeout', error: 'SSE stream timed out' });
        res.end();
      }
    }, 180000);
  });

  // ==============================================
  // UNIFIED LIBRARY ROUTES (Unified book system)
  // ==============================================

  // Book Types
  router.get(
    '/library/book-types',
    safe((req, res) => libraryController.getBookTypes(req, res))
  );
  router.get(
    '/library/book-types/:id',
    safe((req, res) => libraryController.getBookTypeById(req, res))
  );

  // Books - Public browsing
  router.get(
    '/library/books',
    safe((req, res) => libraryController.getBooks(req, res))
  );
  router.get(
    '/library/books/:id',
    safe((req, res) => libraryController.getBookById(req, res))
  );

  // Books - User's own books (uses x-user-id header for ownership)
  router.get(
    '/library/user-books',
    safe((req, res) => libraryController.getMyBooks(req, res))
  );
  router.post(
    '/library/books',
    safe((req, res) => libraryController.createBook(req, res))
  );
  router.patch(
    '/library/books/:id',
    safe((req, res) => libraryController.updateBook(req, res))
  );
  router.delete(
    '/library/books/:id',
    safe((req, res) => libraryController.deleteBook(req, res))
  );

  // Chapters
  router.get(
    '/library/chapters',
    safe((req, res) => libraryController.getMyChapters(req, res))
  );
  router.get(
    '/library/books/:bookId/chapters',
    safe((req, res) => libraryController.getChaptersByBook(req, res))
  );
  router.get(
    '/library/chapters/:id',
    safe((req, res) => libraryController.getChapterById(req, res))
  );
  router.post(
    '/library/chapters',
    safe((req, res) => libraryController.createChapter(req, res))
  );
  router.patch(
    '/library/chapters/:id',
    safe((req, res) => libraryController.updateChapter(req, res))
  );
  router.delete(
    '/library/chapters/:id',
    safe((req, res) => libraryController.deleteChapter(req, res))
  );

  // Entries
  router.get(
    '/library/chapters/:chapterId/entries',
    safe((req, res) => libraryController.getEntriesByChapter(req, res))
  );
  router.get(
    '/library/entries/:id',
    safe((req, res) => libraryController.getEntryById(req, res))
  );
  router.get(
    '/library/user-entries',
    safe((req, res) => libraryController.getMyEntries(req, res))
  );
  router.post(
    '/library/entries',
    safe((req, res) => libraryController.createEntry(req, res))
  );
  router.patch(
    '/library/entries/:id',
    safe((req, res) => libraryController.updateEntry(req, res))
  );
  router.delete(
    '/library/entries/:id',
    safe((req, res) => libraryController.deleteEntry(req, res))
  );
  router.post(
    '/library/entries/:id/promote',
    safe((req, res) => libraryController.promoteEntry(req, res))
  );
  router.delete(
    '/library/entries/:id/promote',
    safe((req, res) => libraryController.unpromoteEntry(req, res))
  );

  // Bookmarks (auto-assign to Bookmarks book)
  router.post(
    '/library/bookmarks',
    safe((req, res) => libraryController.autoAssignBookmark(req, res))
  );

  // Illustrations
  router.post(
    '/library/illustrations',
    safe((req, res) => libraryController.createIllustration(req, res))
  );
  router.delete(
    '/library/illustrations/:id',
    safe((req, res) => libraryController.deleteIllustration(req, res))
  );
  router.patch(
    '/library/entries/:entryId/illustrations/reorder',
    safe((req, res) => libraryController.reorderIllustrations(req, res))
  );
  router.post(
    '/library/books/:bookId/generate-cover',
    safe((req, res) => libraryController.generateBookCover(req, res))
  );
  router.put(
    '/library/books/:bookId/cover',
    safe((req, res) => libraryController.updateBookCover(req, res))
  );

  // User Library (saved books from public library)
  router.get(
    '/library/saved',
    safe((req, res) => libraryController.getMyLibrary(req, res))
  );
  router.post(
    '/library/saved/:bookId',
    safe((req, res) => libraryController.addToLibrary(req, res))
  );
  router.get(
    '/library/saved/:bookId/progress',
    safe((req, res) => libraryController.getLibraryProgress(req, res))
  );
  router.patch(
    '/library/saved/:bookId/progress',
    safe((req, res) => libraryController.updateLibraryProgress(req, res))
  );
  router.delete(
    '/library/saved/:bookId',
    safe((req, res) => libraryController.removeFromLibrary(req, res))
  );

  // Share Links (token-based content sharing)
  router.post(
    '/library/share-links',
    safe((req, res) => libraryController.createShareLink(req, res))
  );
  router.get(
    '/library/share-links/resolve/:token',
    safe((req, res) => libraryController.resolveShareLink(req, res))
  );
  router.get(
    '/library/share-links/content/:contentId',
    safe((req, res) => libraryController.getShareLinks(req, res))
  );
  router.delete(
    '/library/share-links/:linkId',
    safe((req, res) => libraryController.revokeShareLink(req, res))
  );

  // Clone Book
  router.post('/library/books/:bookId/clone', async (req, res) => {
    try {
      const { userId, role } = extractAuthContext(req);
      const { bookId } = req.params;
      const userRole = normalizeRole(role);

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      const { modificationPrompt, language, depthLevel } = req.body as {
        modificationPrompt?: unknown;
        language?: unknown;
        depthLevel?: unknown;
      };

      if (typeof modificationPrompt !== 'string' || modificationPrompt.trim().length < 10) {
        ServiceErrors.badRequest(res, 'modificationPrompt must be at least 10 characters', req);
        return;
      }

      if (modificationPrompt.length > 500) {
        ServiceErrors.badRequest(res, 'modificationPrompt must be 500 characters or less', req);
        return;
      }

      const validDepthLevels = ['brief', 'standard', 'deep'];
      const resolvedDepth =
        typeof depthLevel === 'string' && validDepthLevels.includes(depthLevel)
          ? (depthLevel as 'brief' | 'standard' | 'deep')
          : 'standard';

      const result = await cloneBookUseCase.execute({
        userId,
        userRole,
        sourceBookId: bookId,
        modificationPrompt,
        language: typeof language === 'string' ? language : undefined,
        depthLevel: resolvedDepth,
      });

      if (!result.success) {
        if (result.error?.includes('not found')) {
          ServiceErrors.notFound(res, 'Source book', req);
          return;
        }
        if (
          result.error?.includes('subscription') ||
          result.error?.includes('tier') ||
          result.error?.includes('Personal')
        ) {
          res.status(402).json({ success: false, error: result.error });
          return;
        }
        if (result.error?.includes('access')) {
          ServiceErrors.forbidden(res, result.error, req);
          return;
        }
        ServiceErrors.badRequest(res, result.error || 'Failed to clone book', req);
        return;
      }

      res.status(202).json({ success: true, data: { requestId: result.requestId, status: result.status } });
    } catch (error) {
      logger.error('Error cloning book', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to clone book', req);
    }
  });
}
