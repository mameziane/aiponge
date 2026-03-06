/**
 * Orchestration Flow Routes
 * POST   /orchestration/plan            → plan flow (LLM interpretation + session creation)
 * POST   /orchestration/confirm         → confirm flow (events trigger book + album pipeline)
 * DELETE /orchestration/session/:sessionId → cancel session (soft delete)
 */

import { Router } from 'express';
import type { OrchestrationFlowController } from '../controllers/OrchestrationFlowController';

export function createOrchestrationFlowRoutes(controller: OrchestrationFlowController): Router {
  const router = Router();

  router.post('/plan', controller.planFlow.bind(controller));
  router.post('/confirm', controller.confirmFlow.bind(controller));
  router.delete('/session/:sessionId', controller.cancelFlow.bind(controller));

  return router;
}
