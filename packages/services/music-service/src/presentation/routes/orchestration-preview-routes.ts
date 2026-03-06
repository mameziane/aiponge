/**
 * Orchestration Preview Routes
 * Handles preview track generation for orchestration flows.
 * Mounted at /api/orchestration in app.ts.
 */

import { Router } from 'express';
import { OrchestrationPreviewController } from '../controllers/OrchestrationPreviewController';
import { safe } from '../middleware/safe';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { serviceAuthMiddleware } from '@aiponge/platform-core';

export function createOrchestrationPreviewRoutes(): Router {
  const router = Router();
  const controller = new OrchestrationPreviewController();

  const internalAuthMiddleware = serviceAuthMiddleware({
    required: !!process.env.INTERNAL_SERVICE_SECRET,
    trustGateway: true,
  });

  // Generate preview track
  router.post(
    '/generate',
    internalAuthMiddleware,
    rateLimitMiddleware('orchestration-preview', { windowMs: 60000, max: 10 }),
    safe((req, res) => controller.generatePreview(req, res))
  );

  // Poll preview status (reuses song-request progress)
  router.get(
    '/generate/:sessionId/status',
    internalAuthMiddleware,
    rateLimitMiddleware('status-check', { windowMs: 60000, max: 120 }),
    safe((req, res) => controller.getPreviewStatus(req, res))
  );

  // Regenerate with feedback
  router.post(
    '/regenerate',
    internalAuthMiddleware,
    rateLimitMiddleware('orchestration-preview', { windowMs: 60000, max: 10 }),
    safe((req, res) => controller.regeneratePreview(req, res))
  );

  return router;
}
