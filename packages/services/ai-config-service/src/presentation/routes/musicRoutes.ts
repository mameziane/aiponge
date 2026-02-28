/**
 * Music Generation Routes
 * Dedicated routes for music generation operations
 */

import { Router } from 'express';
import { ProviderController } from '../controllers/ProviderController';
import { authenticationMiddleware } from '../middleware/authentication';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { loggingMiddleware } from '../middleware/logging';

const router: Router = Router();

// Apply middleware
router.use(loggingMiddleware);
router.use(authenticationMiddleware);
router.use(rateLimitMiddleware);

/**
 * POST /api/music/generate
 * Generate music using MusicAPI.ai provider
 * Special endpoint for music generation that polls for completion and returns final audio URL
 */
router.post('/generate', ProviderController.generateMusic);

export { router as musicRoutes };
