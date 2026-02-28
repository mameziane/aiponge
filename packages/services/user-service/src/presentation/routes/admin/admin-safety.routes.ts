import { Router } from 'express';
import { serviceAuthMiddleware, serializeError, extractAuthContext } from '@aiponge/platform-core';
import { getCorrelationId } from '@aiponge/shared-contracts';
import { sendSuccess, sendCreated, ServiceErrors } from '../../utils/response-helpers';
import { ServiceFactory } from '../../../infrastructure/composition/ServiceFactory';

export function registerAdminSafetyRoutes(router: Router): void {
  router.get('/admin/safety/risk-stats', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { SafetyRepository } = await import('../../../infrastructure/repositories/SafetyRepository');
    const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
    const db = getDatabase();
    const safetyRepo = new SafetyRepository(db);

    try {
      const stats = await safetyRepo.getRiskStats();
      const responseData = {
        total24h: stats.last24Hours,
        total7d: stats.last7Days,
        total30d: stats.totalFlags,
        bySeverity: {
          low: stats.bySeverity['low'] || 0,
          medium: stats.bySeverity['medium'] || 0,
          high: stats.bySeverity['high'] || 0,
          crisis: stats.bySeverity['crisis'] || 0,
        },
        resourceReferrals: 0,
        escalationEvents: stats.unresolvedFlags,
      };
      sendSuccess(res, responseData);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get risk stats', req);
      return;
    }
  });

  router.get('/admin/safety/risk-flags', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { SafetyRepository } = await import('../../../infrastructure/repositories/SafetyRepository');
    const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
    const db = getDatabase();
    const safetyRepo = new SafetyRepository(db);

    try {
      const resolved = req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined;
      const severity = req.query.severity as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const flags = await safetyRepo.getRiskFlags({
        resolved,
        severity: severity as 'low' | 'medium' | 'high' | 'crisis' | undefined,
        limit,
        offset,
      });
      sendSuccess(res, flags);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get risk flags', req);
      return;
    }
  });

  router.get('/admin/safety/risk-flags/:flagId', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { SafetyRepository } = await import('../../../infrastructure/repositories/SafetyRepository');
    const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
    const db = getDatabase();
    const safetyRepo = new SafetyRepository(db);

    try {
      const flag = await safetyRepo.getRiskFlagById(req.params.flagId as string);
      if (!flag) {
        ServiceErrors.notFound(res, 'Risk flag', req);
        return;
      }
      sendSuccess(res, flag);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get risk flag', req);
      return;
    }
  });

  router.post(
    '/admin/safety/risk-flags/:flagId/resolve',
    serviceAuthMiddleware({ required: true }),
    async (req, res) => {
      const { SafetyRepository } = await import('../../../infrastructure/repositories/SafetyRepository');
      const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
      const db = getDatabase();
      const safetyRepo = new SafetyRepository(db);

      const { userId: adminUserId } = extractAuthContext(req);
      const { resolution, notes } = req.body;

      if (!resolution) {
        ServiceErrors.badRequest(res, 'Resolution is required', req);
        return;
      }

      try {
        const flag = await safetyRepo.resolveRiskFlag(req.params.flagId as string, adminUserId, resolution, notes);
        if (!flag) {
          ServiceErrors.notFound(res, 'Risk flag', req);
          return;
        }
        sendSuccess(res, flag);
      } catch (error) {
        ServiceErrors.fromException(res, error, 'Failed to resolve risk flag', req);
        return;
      }
    }
  );

  router.get('/admin/safety/compliance-stats', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { SafetyRepository } = await import('../../../infrastructure/repositories/SafetyRepository');
    const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
    const db = getDatabase();
    const safetyRepo = new SafetyRepository(db);

    try {
      const stats = await safetyRepo.getComplianceStats();
      const deletionTotal = stats.byType['deletion'] || 0;
      const exportTotal = stats.byType['export'] || 0;
      const pendingTotal = stats.byStatus['pending'] || 0;
      const completedTotal = stats.byStatus['completed'] || 0;

      const responseData = {
        deletionRequests: {
          pending: Math.floor(pendingTotal * (deletionTotal / (stats.totalRequests || 1))),
          completed: Math.floor(completedTotal * (deletionTotal / (stats.totalRequests || 1))),
          total: deletionTotal,
        },
        exportRequests: {
          pending: Math.floor(pendingTotal * (exportTotal / (stats.totalRequests || 1))),
          completed: Math.floor(completedTotal * (exportTotal / (stats.totalRequests || 1))),
          total: exportTotal,
        },
        consentStatus: {
          marketing: 0,
          analytics: 0,
          personalization: 0,
        },
        totalUsersWithConsent: 0,
      };
      sendSuccess(res, responseData);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get compliance stats', req);
      return;
    }
  });

  router.get('/admin/safety/data-requests', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { SafetyRepository } = await import('../../../infrastructure/repositories/SafetyRepository');
    const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
    const db = getDatabase();
    const safetyRepo = new SafetyRepository(db);

    try {
      const type = req.query.type as 'deletion' | 'export' | undefined;
      const status = req.query.status as 'pending' | 'in_progress' | 'completed' | 'rejected' | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const requests = await safetyRepo.getDataRequests({ type, status, limit, offset });
      sendSuccess(res, requests);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get data requests', req);
      return;
    }
  });

  router.get('/admin/safety/data-requests/:requestId', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { SafetyRepository } = await import('../../../infrastructure/repositories/SafetyRepository');
    const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
    const db = getDatabase();
    const safetyRepo = new SafetyRepository(db);

    try {
      const request = await safetyRepo.getDataRequestById(req.params.requestId as string);
      if (!request) {
        ServiceErrors.notFound(res, 'Data request', req);
        return;
      }
      sendSuccess(res, request);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get data request', req);
      return;
    }
  });

  router.post(
    '/admin/safety/data-requests/:requestId/process',
    serviceAuthMiddleware({ required: true }),
    async (req, res) => {
      const { SafetyRepository } = await import('../../../infrastructure/repositories/SafetyRepository');
      const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
      const db = getDatabase();
      const safetyRepo = new SafetyRepository(db);

      const { userId: adminUserId } = extractAuthContext(req);
      const { status, rejectionReason, exportUrl, exportExpiresAt, notes } = req.body;

      if (!status) {
        ServiceErrors.badRequest(res, 'Status is required', req);
        return;
      }

      try {
        const request = await safetyRepo.updateDataRequestStatus(req.params.requestId as string, status, adminUserId, {
          rejectionReason,
          exportUrl,
          exportExpiresAt: exportExpiresAt ? new Date(exportExpiresAt) : undefined,
          notes,
        });
        if (!request) {
          ServiceErrors.notFound(res, 'Data request', req);
          return;
        }
        sendSuccess(res, request);
      } catch (error) {
        ServiceErrors.fromException(res, error, 'Failed to process data request', req);
        return;
      }
    }
  );

  router.post('/admin/safety/risk-flags', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { SafetyRepository } = await import('../../../infrastructure/repositories/SafetyRepository');
    const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
    const db = getDatabase();
    const safetyRepo = new SafetyRepository(db);

    const { userId, severity, type, description, sourceContent, sourceType, sourceId, metadata } = req.body;

    if (!userId || !severity || !type || !description) {
      ServiceErrors.badRequest(res, 'userId, severity, type, and description are required', req);
      return;
    }

    try {
      const flag = await safetyRepo.createRiskFlag({
        userId,
        severity,
        type,
        description,
        sourceContent,
        sourceType,
        sourceId,
        metadata,
      });
      sendCreated(res, flag);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to create risk flag', req);
      return;
    }
  });

  router.post('/admin/safety/analyze', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const riskDetectionService = ServiceFactory.getRiskDetectionService();

    const { content, userId, sourceType, sourceId, skipAI, createFlag } = req.body;

    if (!content || !userId) {
      ServiceErrors.badRequest(res, 'content and userId are required', req);
      return;
    }

    try {
      if (createFlag === false) {
        const { RiskDetectionService } = await import('../../../infrastructure/services/RiskDetectionService');
        const { SafetyRepository } = await import('../../../infrastructure/repositories/SafetyRepository');
        const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
        const db = getDatabase();
        const safetyRepo = new SafetyRepository(db);
        const tempService = new RiskDetectionService(safetyRepo);

        const keywordPatterns = await tempService.getKeywordPatterns();

        const crisisPatterns = [
          /\b(suicid(e|al)|kill\s*(my)?self|end\s*(my\s*)?life|don'?t\s*want\s*to\s*live)\b/i,
          /\b(want\s*to\s*die|better\s*off\s*dead|no\s*reason\s*to\s*live)\b/i,
          /\b(hurt\s*(my)?self|self[\s-]?harm|cutting|burning\s*myself)\b/i,
          /\b(hate\s*(my)?self|worthless|hopeless|nobody\s*cares)\b/i,
          /\b(abuse|violence|assault|hurt\s*by)\b/i,
          /\b(can'?t\s*cope|overwhelmed|breaking\s*down|falling\s*apart)\b/i,
          /\b(panic\s*attack|anxiety\s*attack|can'?t\s*breathe|terrified)\b/i,
          /\b(eating\s*disorder|starving\s*myself|binge|purge)\b/i,
          /\b(addiction|relapse|withdrawal|using\s*again)\b/i,
        ];

        const matchedPatterns: string[] = [];
        for (let i = 0; i < crisisPatterns.length; i++) {
          if (crisisPatterns[i].test(content)) {
            matchedPatterns.push(keywordPatterns[i]?.type || `pattern_${i}`);
          }
        }

        sendSuccess(res, {
          detected: matchedPatterns.length > 0,
          matchedPatterns,
          previewOnly: true,
        });
        return;
      }

      const result = await riskDetectionService.analyzeContent({
        content,
        userId,
        sourceType: sourceType || 'manual_analysis',
        sourceId: sourceId || `manual_${Date.now()}`,
        skipAI: skipAI === true,
      });

      sendSuccess(res, result);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Analysis failed', req);
      return;
    }
  });

  router.get('/admin/safety/patterns', serviceAuthMiddleware({ required: true }), async (_req, res) => {
    const riskDetectionService = ServiceFactory.getRiskDetectionService();
    try {
      const patterns = await riskDetectionService.getKeywordPatterns();
      sendSuccess(res, patterns);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get patterns', _req);
      return;
    }
  });

  router.post(
    '/internal/safety/analyze',
    serviceAuthMiddleware({ required: true, trustGateway: true }),
    async (req, res) => {
      const gatewayService = req.headers['x-gateway-service'] as string;

      if (gatewayService !== 'api-gateway') {
        ServiceErrors.forbidden(res, 'Gateway service access required', req);
        return;
      }

      const riskDetectionService = ServiceFactory.getRiskDetectionService();
      const { content, userId, sourceType, sourceId, skipAI } = req.body;

      if (!content || !userId) {
        ServiceErrors.badRequest(res, 'content and userId are required', req);
        return;
      }

      const { getLogger } = await import('../../../config/service-urls');
      const logger = getLogger('internal-safety');

      logger.info('Internal safety analysis requested', {
        userId,
        sourceType,
        sourceId,
        gatewayService,
        correlationId: getCorrelationId(req),
      });

      try {
        const result = await riskDetectionService.analyzeContent({
          content,
          userId,
          sourceType: sourceType || 'entry',
          sourceId: sourceId || `internal_${Date.now()}`,
          skipAI: skipAI === true,
        });

        logger.info('SAFETY_AUDIT_INTERNAL', {
          type: 'internal_safety_analysis',
          userId,
          sourceType,
          sourceId,
          detected: result.detected,
          severity: result.severity,
          flagId: result.flagId,
          correlationId: getCorrelationId(req),
          timestamp: new Date().toISOString(),
        });

        sendSuccess(res, {
          detected: result.detected,
          severity: result.severity,
          type: result.type,
          description: result.description,
          matchedPatterns: result.matchedPatterns,
          aiConfidence: result.aiConfidence,
          flagId: result.flagId,
        });
      } catch (error) {
        logger.error('Internal safety analysis failed', {
          error: serializeError(error),
          userId,
          correlationId: getCorrelationId(req),
        });
        ServiceErrors.fromException(res, error, 'Analysis failed', req);
        return;
      }
    }
  );
}
