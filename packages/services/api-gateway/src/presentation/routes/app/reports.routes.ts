/**
 * Member Reports Routes
 * PDF report generation endpoints for therapeutic insights
 *
 * This route acts as a thin proxy, delegating business logic to ai-analytics-service.
 * Gateway responsibilities:
 * 1. Authentication and user ID injection
 * 2. Proxy to ai-analytics-service's /api/reports/* endpoints
 */

import { Router } from 'express';
import { ServiceLocator, serializeError } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';
import { wrapAsync, createPolicyRoute } from '../helpers/routeHelpers';
import { ServiceErrors } from '../../utils/response-helpers';
import { gatewayFetch } from '@services/gatewayFetch';

const logger = getLogger('api-gateway-reports.routes');

const router: Router = Router();

/**
 * POST /api/app/reports/insights
 * Generate a comprehensive insights report as PDF
 *
 * Proxies to ai-analytics-service which handles:
 * - Fetching user entries
 * - Generating analytics
 * - AI summary generation
 * - PDF creation
 */
router.post(
  '/insights',
  ...createPolicyRoute({
    service: 'ai-analytics-service',
    path: '/api/reports/insights',
    logPrefix: '[Reports]',
    errorMessage: 'Failed to generate report',
  })
);

/**
 * POST /api/app/reports/book-export
 * Generate a personal book export report as PDF
 *
 * Proxies to ai-analytics-service which handles:
 * - Fetching user entries
 * - Organizing into chapters by date
 * - PDF creation
 */
router.post(
  '/book-export',
  ...createPolicyRoute({
    service: 'ai-analytics-service',
    path: '/api/reports/book-export',
    logPrefix: '[Reports]',
    errorMessage: 'Failed to generate report',
  })
);

/**
 * POST /api/app/reports/lyrics
 * Generate a lyrics collection report as PDF
 *
 * Proxies to ai-analytics-service which handles:
 * - Fetching user lyrics
 * - Organizing and formatting
 * - PDF creation
 */
router.post(
  '/lyrics',
  ...createPolicyRoute({
    service: 'ai-analytics-service',
    path: '/api/reports/lyrics',
    logPrefix: '[Reports]',
    errorMessage: 'Failed to generate report',
  })
);

/**
 * GET /api/app/reports/download/:reportId
 * Download a previously generated report
 *
 * Proxies to ai-analytics-service for PDF retrieval
 */
router.get(
  '/download/:reportId',
  wrapAsync(async (req, res) => {
    const { reportId } = req.params;
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';

    logger.info('[Reports] Downloading report', {
      reportId,
      requestId,
    });

    try {
      const aiAnalyticsServiceUrl = ServiceLocator.getServiceUrl('ai-analytics-service');

      const response = await gatewayFetch(`${aiAnalyticsServiceUrl}/api/reports/download/${reportId}`, {
        headers: {
          'x-request-id': requestId,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        res.status(response.status).json(data);
        return;
      }

      // Forward the PDF response
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="aiponge-insights-report.pdf"');
      res.setHeader('Content-Length', buffer.byteLength);
      res.send(Buffer.from(buffer));
    } catch (error) {
      logger.error('[Reports] Failed to download report', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to download report', req);
      return;
    }
  })
);

export default router;
