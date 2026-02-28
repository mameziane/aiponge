/**
 * Framework Routes - HTTP route definitions for psychological framework operations
 */

import { Router } from 'express';
import { FrameworkController } from '../controllers/FrameworkController';
import { loggingMiddleware } from '../middleware/logging';

const router: Router = Router();

router.use(loggingMiddleware);

/**
 * GET /api/frameworks
 * Get all psychological frameworks
 * Query parameters:
 * - category?: string - Filter by category
 * - enabled?: boolean - Filter by enabled status
 */
router.get('/', FrameworkController.getAllFrameworks);

/**
 * GET /api/frameworks/enabled
 * Get all enabled psychological frameworks (optimized for service consumption)
 */
router.get('/enabled', FrameworkController.getEnabledFrameworks);

/**
 * GET /api/frameworks/category/:category
 * Get frameworks by category
 */
router.get('/category/:category', FrameworkController.getFrameworksByCategory);

/**
 * GET /api/frameworks/:id
 * Get a specific framework by ID
 */
router.get('/:id', FrameworkController.getFrameworkById);

export default router;
