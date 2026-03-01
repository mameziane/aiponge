/**
 * Analytics Routes - Dashboard, event tracking, summary, metrics
 * GET /api/analytics/dashboard, POST /api/analytics/track,
 * GET /api/analytics/summary, GET /api/analytics/metrics
 */

import { Router } from 'express';
import { AnalyticsDashboardController } from '../controllers/AnalyticsDashboardController';
import type { AnalyticsServiceRegistry } from '../../infrastructure/ServiceFactory';

export function createAnalyticsRoutes(registry: AnalyticsServiceRegistry): Router {
  const router = Router();
  const controller = new AnalyticsDashboardController(registry);

  router.get('/api/analytics/dashboard', (req, res) => controller.getDashboard(req, res));
  router.post('/api/analytics/track', (req, res) => controller.trackEvent(req, res));
  router.get('/api/analytics/summary', (req, res) => controller.getSummary(req, res));
  router.get('/api/analytics/metrics', (req, res) => controller.getMetrics(req, res));

  return router;
}
