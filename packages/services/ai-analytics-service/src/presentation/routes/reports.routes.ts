/**
 * Report Routes - PDF report generation and download
 * POST /api/reports/insights, GET /api/reports/download/:reportId,
 * POST /api/reports/book-export, POST /api/reports/lyrics
 */

import { Router } from 'express';
import { ReportController } from '../controllers/ReportController';

export function createReportRoutes(): Router {
  const router = Router();
  const controller = new ReportController();

  router.post('/api/reports/insights', (req, res) => controller.generateInsightsReport(req, res));
  router.get('/api/reports/download/:reportId', (req, res) => controller.downloadReport(req, res));
  router.post('/api/reports/book-export', (req, res) => controller.generateBookExport(req, res));
  router.post('/api/reports/lyrics', (req, res) => controller.generateLyricsReport(req, res));

  return router;
}
