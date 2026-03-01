/**
 * Report Controller
 * Handles PDF report generation and download endpoints:
 * therapeutic insights, book export, lyrics collection.
 */

import type { Request, Response } from 'express';
import { serializeError, extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
import { StructuredErrors } from '@aiponge/shared-contracts';
import { GenerateTherapeuticInsightsReportUseCase } from '../../application/use-cases/GenerateTherapeuticInsightsReportUseCase';
import { GenerateBookExportReportUseCase } from '../../application/use-cases/GenerateBookExportReportUseCase';
import { GenerateLyricsCollectionReportUseCase } from '../../application/use-cases/GenerateLyricsCollectionReportUseCase';
import { storeTempPdf, getTempPdf } from '../utils/helpers';
import { getLogger } from '../../config/service-urls';

const { sendSuccess, ServiceErrors } = getResponseHelpers();
const logger = getLogger('ai-analytics-service:report-controller');

export class ReportController {
  private readonly therapeuticInsightsUseCase = new GenerateTherapeuticInsightsReportUseCase();
  private readonly bookExportUseCase = new GenerateBookExportReportUseCase();
  private readonly lyricsCollectionUseCase = new GenerateLyricsCollectionReportUseCase();

  async generateInsightsReport(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';
      const { timeRangeDays = 90, includeSections = {} } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      logger.info('Generating therapeutic insights report', {
        userId,
        timeRangeDays,
        requestId,
      });

      const result = await this.therapeuticInsightsUseCase.execute({
        userId,
        timeRangeDays,
        includeSections,
        requestId,
      });

      if (!result.success) {
        if (result.code === 'INSUFFICIENT_DATA') {
          ServiceErrors.badRequest(res, result.error || 'Insufficient data', req, {
            code: result.code,
            entryCount: result.entryCount,
          });
        } else {
          ServiceErrors.internal(res, result.error || 'Report generation failed', undefined, req);
        }
        return;
      }

      const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      storeTempPdf(result.reportId!, result.pdfBuffer!, expiresAt);

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
      const gatewayUrl = process.env.EXPO_PUBLIC_API_URL || process.env.API_GATEWAY_URL || `${protocol}://${host}`;
      const downloadUrl = `${gatewayUrl}/api/v1/app/reports/download/${result.reportId}`;

      sendSuccess(res, {
        reportId: result.reportId,
        downloadUrl,
        entryCount: result.entryCount,
        timeRangeDays: result.timeRangeDays,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to generate therapeutic insights report', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate report', req);
      return;
    }
  }

  downloadReport(req: Request, res: Response): void {
    const { reportId } = req.params;

    const pdfData = getTempPdf(reportId);
    if (!pdfData) {
      ServiceErrors.notFound(res, 'Report', req);
      return;
    }

    if (pdfData.expiresAt < Date.now()) {
      StructuredErrors.gone(res, 'Report has expired');
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="aiponge-insights-report.pdf"`);
    res.setHeader('Content-Length', pdfData.buffer.length);
    res.send(pdfData.buffer);
  }

  async generateBookExport(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';
      const { format = 'chapters', dateFrom, dateTo } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      logger.info('Generating book export report', {
        userId,
        format,
        dateFrom,
        dateTo,
        requestId,
      });

      const result = await this.bookExportUseCase.execute({
        userId,
        format,
        dateFrom,
        dateTo,
        requestId,
      });

      if (!result.success) {
        if (result.code === 'NO_ENTRIES') {
          ServiceErrors.badRequest(res, result.error || 'No entries found', req, {
            code: result.code,
            entryCount: result.entryCount,
          });
        } else {
          ServiceErrors.internal(res, result.error || 'Report generation failed', undefined, req);
        }
        return;
      }

      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      storeTempPdf(result.reportId!, result.pdfBuffer!, expiresAt);

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
      const gatewayUrl = process.env.EXPO_PUBLIC_API_URL || process.env.API_GATEWAY_URL || `${protocol}://${host}`;
      const downloadUrl = `${gatewayUrl}/api/v1/app/reports/download/${result.reportId}`;

      sendSuccess(res, {
        reportId: result.reportId,
        downloadUrl,
        entryCount: result.entryCount,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to generate book export report', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate report', req);
      return;
    }
  }

  async generateLyricsReport(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = extractAuthContext(req);
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';
      const { includeFavoritesOnly = false, trackId } = req.body;

      if (!userId) {
        ServiceErrors.unauthorized(res, 'User ID required', req);
        return;
      }

      logger.info('Generating lyrics report', {
        userId,
        includeFavoritesOnly,
        trackId,
        requestId,
      });

      const result = await this.lyricsCollectionUseCase.execute({
        userId,
        includeFavoritesOnly,
        trackId,
        requestId,
      });

      if (!result.success) {
        if (result.code === 'NO_LYRICS') {
          ServiceErrors.badRequest(res, result.error || 'No lyrics found', req, {
            code: result.code,
            lyricsCount: result.lyricsCount,
          });
        } else {
          ServiceErrors.internal(res, result.error || 'Report generation failed', undefined, req);
        }
        return;
      }

      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      storeTempPdf(result.reportId!, result.pdfBuffer!, expiresAt);

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
      const gatewayUrl = process.env.EXPO_PUBLIC_API_URL || process.env.API_GATEWAY_URL || `${protocol}://${host}`;
      const downloadUrl = `${gatewayUrl}/api/v1/app/reports/download/${result.reportId}`;

      sendSuccess(res, {
        reportId: result.reportId,
        downloadUrl,
        lyricsCount: result.lyricsCount,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to generate lyrics collection report', {
        error: serializeError(error),
      });
      ServiceErrors.fromException(res, error, 'Failed to generate report', req);
      return;
    }
  }
}
