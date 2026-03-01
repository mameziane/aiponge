/**
 * Health Routes - Kubernetes-compatible health probes
 * GET /health, /health/live, /health/ready, /health/startup
 */

import { Router } from 'express';
import { HealthController } from '../controllers/HealthController';
import type { AnalyticsServiceRegistry } from '../../infrastructure/ServiceFactory';

export function createHealthRoutes(registry: AnalyticsServiceRegistry): Router {
  const router = Router();
  const controller = new HealthController(registry);

  router.get('/health', (req, res) => controller.getHealth(req, res));
  router.get('/health/live', (req, res) => controller.getLiveness(req, res));
  router.get('/health/ready', (req, res) => controller.getReadiness(req, res));
  router.get('/health/startup', (req, res) => controller.getStartup(req, res));

  return router;
}
