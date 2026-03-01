/**
 * Fraud Detection Routes - User and IP fraud analysis
 * GET /api/analytics/fraud/user/:userId, GET /api/analytics/fraud/ip/:ipAddress
 */

import { Router } from 'express';
import { FraudController } from '../controllers/FraudController';
import type { AnalyticsServiceRegistry } from '../../infrastructure/ServiceFactory';

export function createFraudRoutes(registry: AnalyticsServiceRegistry): Router {
  const router = Router();
  const controller = new FraudController(registry);

  router.get('/api/analytics/fraud/user/:userId', (req, res) => controller.analyzeUser(req, res));
  router.get('/api/analytics/fraud/ip/:ipAddress', (req, res) => controller.analyzeIp(req, res));

  return router;
}
