import { Router, Request, Response } from 'express';
import {
  AuthenticatedRequest,
  serviceAuthMiddleware,
  batchLimitMiddleware,
  extractAuthContext,
} from '@aiponge/platform-core';
import { sendSuccess, ServiceErrors } from '../utils/response-helpers';

import type { IntelligenceController } from '../controllers/intelligence';
import type { PatternController } from '../controllers/PatternController';

export interface IntelligenceRouteDeps {
  intelligenceController: IntelligenceController;
  patternController: PatternController;
}

export function registerIntelligenceRoutes(router: Router, deps: IntelligenceRouteDeps): void {
  const { intelligenceController, patternController } = deps;

  // ==============================================
  // ENTRIES ROUTES (unified library content)
  // ==============================================
  // Primary API for library entries (unified content management)

  // Entries management - batch routes must come before parameterized :id routes
  router.patch('/entries/batch', batchLimitMiddleware(100), (req, res) =>
    intelligenceController.batchUpdateEntries(req, res)
  );
  router.delete('/entries/batch', batchLimitMiddleware(100), (req, res) =>
    intelligenceController.batchDeleteEntries(req, res)
  );
  router.post('/entries', (req, res) => intelligenceController.createEntry(req, res));
  router.get('/entries/:userId', (req, res) => intelligenceController.getEntries(req, res));
  router.get('/entries/id/:id', (req, res) => intelligenceController.getEntryById(req, res));
  router.patch('/entries/:id', (req, res) => intelligenceController.updateEntry(req, res));
  router.delete('/entries/:id', (req, res) => intelligenceController.deleteEntry(req, res));
  router.post('/entries/:id/archive', (req, res) => intelligenceController.archiveEntry(req, res));
  router.post('/entries/:id/analyze', (req, res) => intelligenceController.analyzeEntry(req, res));
  router.post('/entries/analyze/batch', (req, res) => intelligenceController.batchAnalyzeEntries(req, res));
  router.get('/entries/:userId/patterns', (req, res) => intelligenceController.detectEntryPatterns(req, res));

  // Illustrations management (max 4 per entry)
  router.get('/entries/:entryId/illustrations', (req, res) => intelligenceController.getIllustrations(req, res));
  router.post('/entries/:entryId/illustrations', (req, res) => intelligenceController.addIllustration(req, res));
  router.delete('/entries/:entryId/illustrations/:illustrationId', (req, res) =>
    intelligenceController.removeIllustration(req, res)
  );
  router.patch('/entries/:entryId/illustrations/reorder', (req, res) =>
    intelligenceController.reorderIllustrations(req, res)
  );

  // Insights by entry
  router.get('/insights/entry/:entryId', (req, res) => intelligenceController.getInsightsByEntry(req, res));

  // Entry Chapters management
  router.post('/chapters', (req, res) => intelligenceController.createChapter(req, res));
  router.get('/chapters/:userId', (req, res) => intelligenceController.getChapters(req, res));
  // Chapter snapshot - accessible via service auth (music-service) or user auth (api-gateway)
  // Uses optional service auth to support both internal and external callers
  router.get('/chapters/snapshot/:chapterId', serviceAuthMiddleware({ required: false }), (req, res) => {
    // Validate caller: either authenticated user OR internal service
    const { userId } = extractAuthContext(req);
    const internalService = req.headers['x-internal-service'] as string;

    if (!userId && !internalService) {
      ServiceErrors.unauthorized(res, 'Authentication required', req);
      return;
    }

    // Log internal service calls for auditing
    if (internalService) {
      const allowedCallers = ['music-service', 'api-gateway'];
      if (!allowedCallers.includes(internalService)) {
        const { getLogger } = require('../../config/service-urls');
        getLogger('intelligence-controller').warn('Unexpected internal service caller', {
          internalService,
          path: req.path,
        });
      }
    }
    void intelligenceController.getChapterSnapshot(req, res);
  });
  router.patch('/chapters/:id', (req, res) => {
    void intelligenceController.updateChapter(req, res);
  });
  router.delete('/chapters/:id', (req, res) => {
    void intelligenceController.deleteChapter(req, res);
  });
  router.post('/chapters/assign', (req, res) => {
    void intelligenceController.assignEntriesToChapter(req, res);
  });

  // Insights management
  router.post('/insights', (req, res) => intelligenceController.createInsight(req, res));
  router.get('/insights/:userId', (req, res) => intelligenceController.getInsights(req, res));
  router.patch('/insights/:userId/update-goals', (req, res) =>
    intelligenceController.updateUserGoalsFromInsights(req, res)
  );

  // Reflections management
  router.post('/reflections', (req, res) => intelligenceController.createReflection(req, res));
  router.get('/reflections/:userId', (req, res) => intelligenceController.getReflections(req, res));
  router.get('/reflections/id/:id', (req, res) => intelligenceController.getReflectionById(req, res));
  router.patch('/reflections/:id', (req, res) => intelligenceController.updateReflection(req, res));
  router.delete('/reflections/:id', (req, res) => intelligenceController.deleteReflectionById(req, res));
  router.post('/reflections/:id/continue', (req, res) => intelligenceController.continueReflectionDialogue(req, res));
  router.get('/reflections/:id/thread', (req, res) => intelligenceController.getReflectionThread(req, res));

  // Mood Check-in management
  router.post('/profile/mood-checkin', (req, res) => intelligenceController.recordMoodCheckin(req, res));
  router.get('/mood-checkins/:userId', (req, res) => intelligenceController.getMoodCheckins(req, res));
  router.patch('/mood-checkins/:id/respond', (req, res) => intelligenceController.respondToMoodMicroQuestion(req, res));

  // Personal Narrative management
  router.get('/profile/narrative/:userId', (req, res) => intelligenceController.getLatestNarrative(req, res));
  router.get('/narratives/:userId', (req, res) => intelligenceController.getNarrativeHistory(req, res));
  router.post('/narratives/:id/respond', (req, res) => intelligenceController.respondToNarrative(req, res));

  // ==============================================
  // PATTERN RECOGNITION ROUTES (6 endpoints)
  // ==============================================

  // Pattern analysis (authenticated)
  // POST and GET both supported - GET added as workaround for Replit proxy POST issue
  router.post('/patterns/:userId/analyze', (req, res) =>
    patternController.analyzePatterns(req as unknown as AuthenticatedRequest, res)
  );
  router.get('/patterns/:userId/analyze', (req, res) =>
    patternController.analyzePatterns(req as unknown as AuthenticatedRequest, res)
  );
  router.get('/patterns/:userId', (req, res) =>
    patternController.getUserPatterns(req as unknown as AuthenticatedRequest, res)
  );
  router.get('/patterns/:userId/type/:patternType', (req, res) =>
    patternController.getPatternsByType(req as unknown as AuthenticatedRequest, res)
  );
  router.get('/patterns/:userId/themes', (req, res) =>
    patternController.getThemeFrequencies(req as unknown as AuthenticatedRequest, res)
  );
  router.get('/patterns/:userId/insights', (req, res) =>
    patternController.getPatternInsights(req as unknown as AuthenticatedRequest, res)
  );
  router.post('/patterns/:patternId/react', (req, res) =>
    patternController.reactToPattern(req as unknown as AuthenticatedRequest, res)
  );
  router.get('/patterns/:patternId/evidence', (req, res) =>
    patternController.getPatternEvidence(req as unknown as AuthenticatedRequest, res)
  );

  // Admin - Batch pattern analysis
  router.post('/admin/patterns/batch-analyze', serviceAuthMiddleware({ required: true }), (req, res) =>
    patternController.runBatchAnalysis(req as unknown as AuthenticatedRequest, res)
  );
}
