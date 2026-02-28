import express from 'express';
import { AuditLogService } from '../../domains/audit/AuditLogService';
import { getLogger } from '../../config/service-urls';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { serializeError } from '@aiponge/platform-core';
import { getCorrelationId } from '@aiponge/shared-contracts';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import type { ActorType, SeverityLevel } from '../../domains/audit/AuditLogService';

const db = getDatabase('audit-routes');
const logger = getLogger('system-audit-routes');
const router: express.Router = express.Router();

const auditService = new AuditLogService(db);

router.post('/record', async (req, res) => {
  const { actorId, actorType, action, resourceType, resourceId, metadata, correlationId, severity } = req.body;

  if (!actorId || !action) {
    ServiceErrors.badRequest(res, 'actorId and action are required', req);
    return;
  }

  try {
    const entry = await auditService.recordAudit({
      actorId,
      actorType: actorType || 'user',
      action,
      resourceType,
      resourceId,
      metadata,
      correlationId: correlationId || getCorrelationId(req),
      severity: severity || 'info',
    });

    sendSuccess(res, { id: entry.id });
  } catch (error) {
    logger.error('Failed to record audit entry', { error: serializeError(error) });
    ServiceErrors.internal(res, 'Failed to record audit entry', undefined, req);
  }
});

router.get('/query', async (req, res) => {
  try {
    const result = await auditService.queryAuditLog({
      actorId: req.query.actorId as string,
      actorType: req.query.actorType as ActorType | undefined,
      resourceType: req.query.resourceType as string,
      resourceId: req.query.resourceId as string,
      action: req.query.action as string,
      severity: req.query.severity as SeverityLevel | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });

    sendSuccess(res, result);
  } catch (error) {
    logger.error('Failed to query audit log', { error: serializeError(error) });
    ServiceErrors.internal(res, 'Failed to query audit log', undefined, req);
  }
});

router.get('/resource/:resourceType/:resourceId', async (req, res) => {
  try {
    const entries = await auditService.getResourceHistory(
      req.params.resourceType,
      req.params.resourceId,
      req.query.limit ? Number(req.query.limit) : 50
    );

    sendSuccess(res, entries);
  } catch (error) {
    logger.error('Failed to get resource history', { error: serializeError(error) });
    ServiceErrors.internal(res, 'Failed to get resource history', undefined, req);
  }
});

router.get('/actor/:actorId', async (req, res) => {
  try {
    const entries = await auditService.getActorActivity(
      req.params.actorId,
      req.query.days ? Number(req.query.days) : 30,
      req.query.limit ? Number(req.query.limit) : 100
    );

    sendSuccess(res, entries);
  } catch (error) {
    logger.error('Failed to get actor activity', { error: serializeError(error) });
    ServiceErrors.internal(res, 'Failed to get actor activity', undefined, req);
  }
});

export default router;
