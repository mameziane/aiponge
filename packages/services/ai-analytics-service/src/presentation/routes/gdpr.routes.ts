/**
 * GDPR Routes - User data deletion and export
 * DELETE /api/users/:userId/data, GET /api/users/:userId/export
 */

import { Router } from 'express';
import { GdprController } from '../controllers/GdprController';
import type { AnalyticsServiceRegistry } from '../../infrastructure/ServiceFactory';

export function createGdprRoutes(registry: AnalyticsServiceRegistry): Router {
  const router = Router();
  const controller = new GdprController(registry);

  router.delete('/api/users/:userId/data', (req, res) => controller.deleteUserData(req, res));
  router.get('/api/users/:userId/export', (req, res) => controller.exportUserData(req, res));

  return router;
}
