/**
 * GDPR Controller
 * Handles GDPR Article 17 (data deletion) and Article 20 (data export) endpoints.
 */

import type { Request, Response } from 'express';
import { serializeError, extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
import type { AnalyticsServiceRegistry } from '../../infrastructure/ServiceFactory';
import { getLogger } from '../../config/service-urls';

const { sendSuccess, ServiceErrors } = getResponseHelpers();
const logger = getLogger('ai-analytics-service:gdpr-controller');

export class GdprController {
  constructor(private readonly registry: Pick<AnalyticsServiceRegistry, 'repository'>) {}

  async deleteUserData(req: Request, res: Response): Promise<void> {
    const { userId } = req.params;
    const { userId: requestedBy } = extractAuthContext(req);

    logger.info('GDPR: User data deletion request received', { userId, requestedBy });

    try {
      if (this.registry.repository.deleteUserData) {
        const result = await this.registry.repository.deleteUserData(userId);
        logger.info('GDPR: User analytics data deletion completed', { userId, deletedRecords: result.deletedRecords });
      } else {
        logger.info('GDPR: No analytics data to delete (mock repository)', { userId });
      }

      sendSuccess(res, { userId, deletedAt: new Date().toISOString() });
    } catch (error) {
      logger.error('GDPR: User data deletion failed', {
        userId,
        error: serializeError(error),
      });
      ServiceErrors.internal(res, 'Failed to delete user analytics data', error, req);
    }
  }

  async exportUserData(req: Request, res: Response): Promise<void> {
    const { userId } = req.params;

    logger.info('GDPR: User analytics data export request received', { userId });

    try {
      let activityLogs: { eventType: string; timestamp: string }[] = [];

      if (this.registry.repository.exportUserData) {
        const exportData = await this.registry.repository.exportUserData(userId);
        activityLogs = exportData.activityLogs;
      } else {
        logger.info('GDPR: No analytics data to export (mock repository)', { userId });
      }

      logger.info('GDPR: User analytics data export completed', {
        userId,
        activityLogCount: activityLogs.length,
      });

      sendSuccess(res, {
        analyticsData: {
          activityLogs,
        },
      });
    } catch (error) {
      logger.error('GDPR: User analytics data export failed', {
        userId,
        error: serializeError(error),
      });
      ServiceErrors.internal(res, 'Failed to export user analytics data', error, req);
    }
  }
}
