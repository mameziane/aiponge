/**
 * Trace Routes - Request tracing and slow request analysis
 * GET /api/traces/:correlationId, GET /api/traces, GET /api/traces/slow, GET /api/traces/stats
 *
 * Note: Route order matters. /api/traces/slow and /api/traces/stats must be
 * registered before /api/traces/:correlationId to avoid being treated as params.
 */

import { Router } from 'express';
import { TraceController } from '../controllers/TraceController';

export function createTraceRoutes(): Router {
  const router = Router();
  const controller = new TraceController();

  // Static routes first (before parameterized route)
  router.get('/api/traces/slow', (req, res) => controller.getSlowRequests(req, res));
  router.get('/api/traces/stats', (req, res) => controller.getTraceStats(req, res));

  // Search traces (query params only, no path param)
  router.get('/api/traces', (req, res) => controller.searchTraces(req, res));

  // Parameterized route last
  router.get('/api/traces/:correlationId', (req, res) => controller.getTrace(req, res));

  return router;
}
