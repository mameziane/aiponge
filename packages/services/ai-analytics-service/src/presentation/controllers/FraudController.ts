/**
 * Fraud Controller
 * Handles fraud detection endpoints: analyze user, analyze IP.
 */

import type { Request, Response } from 'express';
import { serializeError, getResponseHelpers } from '@aiponge/platform-core';
import type { AnalyticsServiceRegistry } from '../../infrastructure/ServiceFactory';
import { getLogger } from '../../config/service-urls';

const { sendSuccess, ServiceErrors } = getResponseHelpers();
const logger = getLogger('ai-analytics-service:fraud-controller');

export class FraudController {
  constructor(private readonly registry: Pick<AnalyticsServiceRegistry, 'fraudDetection'>) {}

  async analyzeUser(req: Request, res: Response): Promise<void> {
    try {
      const lookbackHours = req.query.lookbackHours ? Number(req.query.lookbackHours) : 24;
      const result = await this.registry.fraudDetection.analyzeUser(req.params.userId, lookbackHours);
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Fraud analysis failed for user', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to analyze user for fraud', req);
    }
  }

  async analyzeIp(req: Request, res: Response): Promise<void> {
    try {
      const lookbackHours = req.query.lookbackHours ? Number(req.query.lookbackHours) : 24;
      const result = await this.registry.fraudDetection.analyzeIp(req.params.ipAddress, lookbackHours);
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Fraud analysis failed for IP', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to analyze IP for fraud', req);
    }
  }
}
