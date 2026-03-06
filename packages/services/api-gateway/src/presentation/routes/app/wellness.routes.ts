/**
 * Wellness Flow Routes
 * Split routing: plan/confirm → ai-content-service, generate/regenerate → music-service
 */

import { Router } from 'express';
import { createPolicyRoute } from '../helpers/routeHelpers';

const router: Router = Router();

/**
 * POST /api/app/wellness/plan
 * Plan a wellness flow from transcript → ai-content-service
 */
router.post(
  '/plan',
  ...createPolicyRoute({
    service: 'ai-content-service',
    path: '/api/orchestration/plan',
    logPrefix: '[WELLNESS PLAN]',
    errorMessage: 'Failed to plan wellness flow',
    policies: { rateLimit: { preset: 'strict', segment: 'wellness-flow' } },
  })
);

/**
 * POST /api/app/wellness/generate
 * Generate preview track → music-service
 */
router.post(
  '/generate',
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/orchestration/generate',
    logPrefix: '[WELLNESS GENERATE]',
    errorMessage: 'Failed to generate preview track',
    policies: { rateLimit: { preset: 'strict', segment: 'wellness-flow' } },
  })
);

/**
 * GET /api/app/wellness/status/:sessionId
 * Poll preview track generation status → music-service
 */
router.get(
  '/status/:sessionId',
  ...createPolicyRoute({
    service: 'music-service',
    path: req => `/api/orchestration/generate/${req.params.sessionId}/status`,
    logPrefix: '[WELLNESS STATUS]',
    errorMessage: 'Failed to get wellness status',
  })
);

/**
 * POST /api/app/wellness/confirm
 * Confirm flow → ai-content-service → events trigger book + album generation
 */
router.post(
  '/confirm',
  ...createPolicyRoute({
    service: 'ai-content-service',
    path: '/api/orchestration/confirm',
    logPrefix: '[WELLNESS CONFIRM]',
    errorMessage: 'Failed to confirm wellness flow',
    policies: { rateLimit: { preset: 'strict', segment: 'wellness-flow' } },
  })
);

/**
 * POST /api/app/wellness/regenerate
 * Regenerate preview track with feedback → music-service
 */
router.post(
  '/regenerate',
  ...createPolicyRoute({
    service: 'music-service',
    path: '/api/orchestration/regenerate',
    logPrefix: '[WELLNESS REGENERATE]',
    errorMessage: 'Failed to regenerate preview track',
    policies: { rateLimit: { preset: 'strict', segment: 'wellness-flow' } },
  })
);

/**
 * DELETE /api/app/wellness/session/:sessionId
 * Cancel session → ai-content-service
 */
router.delete(
  '/session/:sessionId',
  ...createPolicyRoute({
    service: 'ai-content-service',
    path: req => `/api/orchestration/session/${req.params.sessionId}`,
    logPrefix: '[WELLNESS CANCEL]',
    errorMessage: 'Failed to cancel wellness session',
  })
);

export default router;
