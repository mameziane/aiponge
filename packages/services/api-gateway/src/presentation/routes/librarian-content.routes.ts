/**
 * Librarian API Routes
 * Endpoints accessible by both admin and librarian roles
 * Focused on content management: templates, prompts, library content
 */

import { Router } from 'express';
import { wrapAsync } from './helpers/routeHelpers';
import { proxyToUserService, proxyToSystemService, proxyToAiContentService } from './helpers/proxyHelpers';

const router: Router = Router();

router.get(
  '/config/defaults',
  wrapAsync(async (req, res) => {
    await proxyToSystemService(req, res, '/api/config/librarian-defaults');
  })
);

router.put(
  '/config/defaults',
  wrapAsync(async (req, res) => {
    await proxyToSystemService(req, res, '/api/config/librarian-defaults', 'PUT');
  })
);

router.post(
  '/config/defaults/reset',
  wrapAsync(async (req, res) => {
    await proxyToSystemService(req, res, '/api/config/librarian-defaults/reset', 'POST');
  })
);

router.get(
  '/config/available-options',
  wrapAsync(async (req, res) => {
    await proxyToSystemService(req, res, '/api/config/available-options');
  })
);

router.get(
  '/config/content-limits',
  wrapAsync(async (req, res) => {
    await proxyToSystemService(req, res, '/api/config/content-limits');
  })
);

router.get(
  '/templates',
  wrapAsync(async (req, res) => {
    await proxyToAiContentService(req, res, '/api/templates');
  })
);

router.get(
  '/templates/:templateId',
  wrapAsync(async (req, res) => {
    await proxyToAiContentService(req, res, `/api/templates/${req.params.templateId}`);
  })
);

router.post(
  '/templates',
  wrapAsync(async (req, res) => {
    await proxyToAiContentService(req, res, '/api/templates', 'POST');
  })
);

router.patch(
  '/templates/:templateId',
  wrapAsync(async (req, res) => {
    await proxyToAiContentService(req, res, `/api/templates/${req.params.templateId}`, 'PATCH');
  })
);

router.delete(
  '/templates/:templateId',
  wrapAsync(async (req, res) => {
    await proxyToAiContentService(req, res, `/api/templates/${req.params.templateId}`, 'DELETE');
  })
);

router.get(
  '/templates/:templateId/translations',
  wrapAsync(async (req, res) => {
    await proxyToAiContentService(req, res, `/api/templates/${req.params.templateId}/translations`);
  })
);

router.put(
  '/templates/:templateId/translations',
  wrapAsync(async (req, res) => {
    await proxyToAiContentService(req, res, `/api/templates/${req.params.templateId}/translations`, 'PUT');
  })
);

router.delete(
  '/templates/:templateId/translations/:locale',
  wrapAsync(async (req, res) => {
    await proxyToAiContentService(
      req,
      res,
      `/api/templates/${req.params.templateId}/translations/${req.params.locale}`,
      'DELETE'
    );
  })
);

// ============================================================================
// BOOKS MANAGEMENT (Librarian-accessible)
// ============================================================================

router.get(
  '/books',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/library/books');
  })
);

router.get(
  '/books/:bookId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}`);
  })
);

router.post(
  '/books',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/library/books', 'POST');
  })
);

router.post(
  '/books/from-template',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, '/api/library/books/from-template', 'POST');
  })
);

router.patch(
  '/books/:bookId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}`, 'PATCH');
  })
);

router.delete(
  '/books/:bookId',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}`, 'DELETE');
  })
);

router.post(
  '/books/:bookId/publish',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}/publish`, 'POST');
  })
);

router.post(
  '/books/:bookId/generate-cover',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}/generate-cover`, 'POST');
  })
);

router.get(
  '/books/:bookId/chapters',
  wrapAsync(async (req, res) => {
    await proxyToUserService(req, res, `/api/library/books/${req.params.bookId}/chapters`);
  })
);

export { router as librarianContentRoutes };
