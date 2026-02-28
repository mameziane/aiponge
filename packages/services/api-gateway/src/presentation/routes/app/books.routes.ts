/**
 * Unified Library Books Routes
 * Routes for books and library content via /api/app/library/*
 * Proxies requests to user-service's unified library endpoints
 */

import { Router } from 'express';
import { createProxyHandler, wrapAsync, parseErrorBody } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId, injectOptionalUserId } from '../../middleware/authorizationMiddleware';
import { CreateBookGenerationSchema } from '@aiponge/shared-contracts/api/input-schemas';
import { ServiceLocator, extractAuthContext, getValidation } from '@aiponge/platform-core';
const { validateBody } = getValidation();
import { getLogger } from '../../../config/service-urls';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-books.routes');

const savedLibraryRouter: Router = Router();
const libraryBooksRouter: Router = Router();
const booksGenerateRouter: Router = Router();
const SERVICE = 'user-service';

// ============================================================================
// BOOK GENERATION ROUTES - AI-powered book generation (/api/app/books/generate/*)
// ============================================================================

/**
 * GET /api/app/books/generate/access
 * Check if user has access to book generation (Paid tier feature)
 */
booksGenerateRouter.get(
  '/access',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[BOOKS] Checking book generation access', { userId, requestId });

    const response = await gatewayFetch(`${userServiceUrl}/api/books/generation/access`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': requestId,
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[BOOKS ACCESS]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.error || 'Failed to check access',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

/**
 * POST /api/app/books/generate
 * Generate a new book blueprint via AI
 */
booksGenerateRouter.post(
  '/',
  injectAuthenticatedUserId,
  validateBody(CreateBookGenerationSchema),
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[BOOKS] Generating book structure', { userId, requestId });

    const response = await gatewayFetch(`${userServiceUrl}/api/books/generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[BOOKS GENERATE]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.error || 'Failed to generate book',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.status(201).json(data);
  })
);

/**
 * GET /api/app/books/generate/:requestId
 * Get book generation status
 */
booksGenerateRouter.get(
  '/:requestId',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { requestId: generationRequestId } = req.params;
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[BOOKS] Fetching book generation status', { userId, generationRequestId, requestId });

    const response = await gatewayFetch(`${userServiceUrl}/api/books/generation/${generationRequestId}`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': requestId,
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[BOOKS GENERATION STATUS]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.error || 'Failed to fetch generation status',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

/**
 * GET /api/app/books/generate/:requestId/progress
 * SSE stream for real-time book generation progress
 */
booksGenerateRouter.get(
  '/:requestId/progress',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { requestId: generationRequestId } = req.params;
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[BOOKS] SSE progress stream requested', { userId, generationRequestId, requestId });

    const response = await gatewayFetch(
      `${userServiceUrl}/api/books/generation/${generationRequestId}/progress`,
      {
        headers: {
          'x-user-id': userId,
          'x-request-id': requestId,
          Accept: 'text/event-stream',
        },
      }
    );

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[BOOKS PROGRESS]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.error || 'Failed to start progress stream',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const reader = response.body;
    if (!reader) {
      res.end();
      return;
    }

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    try {
      for await (const chunk of reader as AsyncIterable<Uint8Array>) {
        if (closed) break;
        res.write(chunk);
      }
    } catch (err) {
      if (!closed) {
        logger.warn('[BOOKS] SSE stream error', { generationRequestId, error: err });
      }
    } finally {
      if (!closed) res.end();
    }
  })
);

/**
 * POST /api/app/books/generate/:requestId/regenerate
 * Regenerate a book structure
 */
booksGenerateRouter.post(
  '/:requestId/regenerate',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const { requestId: generationRequestId } = req.params;
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[BOOKS] Regenerating book blueprint', { userId, generationRequestId, requestId });

    const response = await gatewayFetch(`${userServiceUrl}/api/books/generation/${generationRequestId}/regenerate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-request-id': requestId,
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[BOOKS REGENERATE]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.error || 'Failed to regenerate book',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

/**
 * GET /api/app/books/blueprints
 * Get available book blueprints (life focus areas for book creation)
 */
booksGenerateRouter.get(
  '/blueprints',
  injectAuthenticatedUserId,
  wrapAsync(async (req, res) => {
    const { userId } = extractAuthContext(req);
    const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[BOOKS] Fetching book blueprints', { userId, requestId });

    const response = await gatewayFetch(`${userServiceUrl}/api/books/templates`, {
      headers: {
        'x-user-id': userId,
        'x-request-id': requestId,
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorBody(response, '[BOOKS BLUEPRINTS]') as Record<string, unknown>;
      res.status(response.status).json({
        success: false,
        message: errorData.error || 'Failed to fetch blueprints',
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  })
);

// ============================================================================
// SAVED LIBRARY ROUTES - User's saved/followed books (/api/app/library/user/*)
// ============================================================================

/**
 * GET /api/app/library/user
 * Get user's library (all books added to their library)
 */
savedLibraryRouter.get(
  '/',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/saved',
    logPrefix: '[MY LIBRARY]',
    errorMessage: 'Failed to fetch library',
  })
);

/**
 * GET /api/app/library/user/books
 * Get user's books (all types: personal, shared, managed, etc.)
 * Query params: typeId (optional) - filter by book type
 */
savedLibraryRouter.get(
  '/books',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      return `/api/library/user-books${queryString ? `?${queryString}` : ''}`;
    },
    logPrefix: '[MY BOOKS]',
    errorMessage: 'Failed to fetch books',
  })
);

/**
 * GET /api/app/library/user/chapters
 * List all chapters for the authenticated user
 */
savedLibraryRouter.get(
  '/chapters',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/chapters',
    logPrefix: '[LIST CHAPTERS]',
    errorMessage: 'Failed to fetch chapters',
  })
);

/**
 * GET /api/app/library/user/entries
 * Get user's entries with pagination
 */
savedLibraryRouter.get(
  '/entries',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      return `/api/library/user-entries${queryString ? `?${queryString}` : ''}`;
    },
    logPrefix: '[MY ENTRIES]',
    errorMessage: 'Failed to fetch entries',
  })
);

// ============================================================================
// LIBRARY BOOKS ROUTES - Public/shared library (/api/app/library/books/*)
// ============================================================================

/**
 * GET /api/app/library/books
 * Get all books (public library) - allows guest/unauthenticated access
 */
libraryBooksRouter.get(
  '/',
  injectOptionalUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      return `/api/library/books${queryString ? `?${queryString}` : ''}`;
    },
    logPrefix: '[LIBRARY BOOKS]',
    errorMessage: 'Failed to fetch books',
  })
);

/**
 * GET /api/app/library/books/:id
 * Get a specific book by ID - allows guest/unauthenticated access
 */
libraryBooksRouter.get(
  '/:id',
  injectOptionalUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      return `/api/library/books/${req.params.id}${queryString ? `?${queryString}` : ''}`;
    },
    logPrefix: '[GET BOOK]',
    errorMessage: 'Failed to fetch book',
  })
);

/**
 * GET /api/app/library/books/:bookId/chapters
 * Get chapters for a book - allows guest/unauthenticated access
 */
libraryBooksRouter.get(
  '/:bookId/chapters',
  injectOptionalUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/books/${req.params.bookId}/chapters`,
    logPrefix: '[BOOK CHAPTERS]',
    errorMessage: 'Failed to fetch chapters',
  })
);

/**
 * POST /api/app/library/books
 * Create a new book
 * Note: Proxies to /api/library/books on user-service (internal path)
 */
libraryBooksRouter.post(
  '/',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/books',
    logPrefix: '[CREATE BOOK]',
    errorMessage: 'Failed to create book',
  })
);

/**
 * PATCH /api/app/library/books/:id
 * Update a book
 */
libraryBooksRouter.patch(
  '/:id',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      return `/api/library/books/${req.params.id}${queryString ? `?${queryString}` : ''}`;
    },
    logPrefix: '[UPDATE BOOK]',
    errorMessage: 'Failed to update book',
  })
);

/**
 * DELETE /api/app/library/books/:id
 * Delete a book
 */
libraryBooksRouter.delete(
  '/:id',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      return `/api/library/books/${req.params.id}${queryString ? `?${queryString}` : ''}`;
    },
    logPrefix: '[DELETE BOOK]',
    errorMessage: 'Failed to delete book',
  })
);

/**
 * POST /api/app/library/books/:id/generate-cover
 * Generate AI cover image for a book
 */
libraryBooksRouter.post(
  '/:id/generate-cover',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/books/${req.params.id}/generate-cover`,
    logPrefix: '[GENERATE BOOK COVER]',
    errorMessage: 'Failed to generate book cover',
  })
);

/**
 * PUT /api/app/library/books/:id/cover
 * Update book cover with an uploaded image URL
 */
libraryBooksRouter.put(
  '/:id/cover',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/books/${req.params.id}/cover`,
    logPrefix: '[UPDATE BOOK COVER]',
    errorMessage: 'Failed to update book cover',
  })
);

/**
 * POST /api/app/library/books/:id/clone
 * Clone a shared/public book with AI-powered adaptation
 */
libraryBooksRouter.post(
  '/:id/clone',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/books/${req.params.id}/clone`,
    logPrefix: '[CLONE BOOK]',
    errorMessage: 'Failed to clone book',
  })
);

// ============================================================================
// CONTENT LIBRARY ROUTES - Library content operations (/api/app/library/*)
// ============================================================================

const contentLibraryRouter: Router = Router();

/**
 * GET /api/app/library/book-types
 * Get all book types
 */
contentLibraryRouter.get(
  '/book-types',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/book-types',
    logPrefix: '[BOOK TYPES]',
    errorMessage: 'Failed to fetch book types',
  })
);

/**
 * GET /api/app/library/chapters
 * List all chapters for the authenticated user
 */
contentLibraryRouter.get(
  '/chapters',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/chapters',
    logPrefix: '[LIST CHAPTERS]',
    errorMessage: 'Failed to fetch chapters',
  })
);

/**
 * GET /api/app/library/chapters/:chapterId
 * Get a specific chapter by ID
 */
contentLibraryRouter.get(
  '/chapters/:chapterId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/chapters/${req.params.chapterId}`,
    logPrefix: '[GET CHAPTER]',
    errorMessage: 'Failed to fetch chapter',
  })
);

/**
 * GET /api/app/library/chapters/:chapterId/entries
 * Get all entries for a chapter
 */
contentLibraryRouter.get(
  '/chapters/:chapterId/entries',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/chapters/${req.params.chapterId}/entries`,
    logPrefix: '[CHAPTER ENTRIES]',
    errorMessage: 'Failed to fetch chapter entries',
  })
);

/**
 * GET /api/app/library/entries
 * Get user's entries with pagination
 */
contentLibraryRouter.get(
  '/entries',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => {
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      return `/api/library/user-entries${queryString ? `?${queryString}` : ''}`;
    },
    logPrefix: '[MY ENTRIES]',
    errorMessage: 'Failed to fetch entries',
  })
);

/**
 * GET /api/app/library/entries/:entryId
 * Get a specific entry by ID
 */
contentLibraryRouter.get(
  '/entries/:entryId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/entries/${req.params.entryId}`,
    logPrefix: '[GET ENTRY]',
    errorMessage: 'Failed to fetch entry',
  })
);

/**
 * POST /api/app/library/chapters
 * Create a new chapter
 */
contentLibraryRouter.post(
  '/chapters',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/chapters',
    logPrefix: '[CREATE CHAPTER]',
    errorMessage: 'Failed to create chapter',
  })
);

/**
 * PATCH /api/app/library/chapters/:id
 * Update a chapter
 */
contentLibraryRouter.patch(
  '/chapters/:id',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/chapters/${req.params.id}`,
    logPrefix: '[UPDATE CHAPTER]',
    errorMessage: 'Failed to update chapter',
  })
);

/**
 * DELETE /api/app/library/chapters/:id
 * Delete a chapter
 */
contentLibraryRouter.delete(
  '/chapters/:id',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/chapters/${req.params.id}`,
    logPrefix: '[DELETE CHAPTER]',
    errorMessage: 'Failed to delete chapter',
  })
);

/**
 * POST /api/app/library/entries
 * Create a new entry
 */
contentLibraryRouter.post(
  '/entries',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/entries',
    logPrefix: '[CREATE ENTRY]',
    errorMessage: 'Failed to create entry',
  })
);

/**
 * PATCH /api/app/library/entries/:id
 * Update an entry
 */
contentLibraryRouter.patch(
  '/entries/:id',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/entries/${req.params.id}`,
    logPrefix: '[UPDATE ENTRY]',
    errorMessage: 'Failed to update entry',
  })
);

/**
 * DELETE /api/app/library/entries/:id
 * Delete an entry
 */
contentLibraryRouter.delete(
  '/entries/:id',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/entries/${req.params.id}`,
    logPrefix: '[DELETE ENTRY]',
    errorMessage: 'Failed to delete entry',
  })
);

/**
 * POST /api/app/library/entries/assign
 * Assign entries to a chapter
 */
contentLibraryRouter.post(
  '/entries/assign',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/entries/assign',
    logPrefix: '[ASSIGN ENTRIES]',
    errorMessage: 'Failed to assign entries',
  })
);

/**
 * POST /api/app/library/bookmarks
 * Add a bookmark entry
 */
contentLibraryRouter.post(
  '/bookmarks',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/bookmarks',
    logPrefix: '[ADD BOOKMARK]',
    errorMessage: 'Failed to add bookmark',
  })
);

/**
 * POST /api/app/library/illustrations
 * Create an illustration
 */
contentLibraryRouter.post(
  '/illustrations',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: '/api/library/illustrations',
    logPrefix: '[CREATE ILLUSTRATION]',
    errorMessage: 'Failed to create illustration',
  })
);

/**
 * DELETE /api/app/library/illustrations/:id
 * Delete an illustration
 */
contentLibraryRouter.delete(
  '/illustrations/:id',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/illustrations/${req.params.id}`,
    logPrefix: '[DELETE ILLUSTRATION]',
    errorMessage: 'Failed to delete illustration',
  })
);

/**
 * POST /api/app/library/:bookId
 * Add a book to user's library
 */
contentLibraryRouter.post(
  '/:bookId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/saved/${req.params.bookId}`,
    logPrefix: '[ADD TO LIBRARY]',
    errorMessage: 'Failed to add to library',
  })
);

/**
 * DELETE /api/app/library/:bookId
 * Remove a book from user's library
 */
contentLibraryRouter.delete(
  '/:bookId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/saved/${req.params.bookId}`,
    logPrefix: '[REMOVE FROM LIBRARY]',
    errorMessage: 'Failed to remove from library',
  })
);

/**
 * GET /api/app/library/:bookId/progress
 * Get reading progress
 */
contentLibraryRouter.get(
  '/:bookId/progress',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/saved/${req.params.bookId}/progress`,
    logPrefix: '[GET PROGRESS]',
    errorMessage: 'Failed to get progress',
  })
);

/**
 * PATCH /api/app/library/:bookId/progress
 * Update reading progress
 */
contentLibraryRouter.patch(
  '/:bookId/progress',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/library/saved/${req.params.bookId}/progress`,
    logPrefix: '[UPDATE PROGRESS]',
    errorMessage: 'Failed to update progress',
  })
);

export { savedLibraryRouter, libraryBooksRouter, contentLibraryRouter, booksGenerateRouter };
export default savedLibraryRouter;
