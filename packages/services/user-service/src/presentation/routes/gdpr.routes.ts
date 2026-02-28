import { Router, Request, Response } from 'express';
import { extractAuthContext } from '@aiponge/platform-core';
import { normalizeRole, StructuredErrors, getCorrelationId } from '@aiponge/shared-contracts';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';

export function registerGdprRoutes(router: Router): void {
  // GDPR Article 7: Record user consent
  router.post('/consent', async (req, res) => {
    const { usrConsentRecords } = await import('../../infrastructure/database/schemas/profile-schema');
    const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
    const db = getDatabase();

    const { userId } = extractAuthContext(req);
    if (!userId) {
      ServiceErrors.unauthorized(res, 'User ID required', req);
      return;
    }

    const { purpose, consentGiven, policyVersion, source, consentText, locale } = req.body;

    if (!purpose || consentGiven === undefined || !policyVersion || !source) {
      ServiceErrors.badRequest(res, 'Missing required fields: purpose, consentGiven, policyVersion, source', req);
      return;
    }

    try {
      const [record] = await db
        .insert(usrConsentRecords)
        .values({
          userId,
          purpose,
          consentGiven,
          policyVersion,
          source,
          consentText,
          locale,
          ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip,
          userAgent: req.headers['user-agent'],
        })
        .returning();

      sendCreated(res, record);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to record consent', req);
      return;
    }
  });

  // GDPR Article 7: Get user consent history
  router.get('/consent/:userId', async (req, res) => {
    const { usrConsentRecords } = await import('../../infrastructure/database/schemas/profile-schema');
    const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
    const { eq, desc } = await import('drizzle-orm');
    const db = getDatabase();

    const { userId } = req.params;

    try {
      const records = await db
        .select()
        .from(usrConsentRecords)
        .where(eq(usrConsentRecords.userId, userId))
        .orderBy(desc(usrConsentRecords.createdAt));

      sendSuccess(res, records);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to fetch consent history', req);
      return;
    }
  });

  // GDPR Article 7: Withdraw consent
  router.post('/consent/:userId/withdraw', async (req, res) => {
    const { usrConsentRecords } = await import('../../infrastructure/database/schemas/profile-schema');
    const { getDatabase } = await import('../../infrastructure/database/DatabaseConnectionFactory');
    const { eq, and, isNull } = await import('drizzle-orm');
    const db = getDatabase();

    const { userId } = req.params;
    const { purpose, policyVersion, source } = req.body;

    if (!purpose) {
      ServiceErrors.badRequest(res, 'Missing required field: purpose', req);
      return;
    }

    try {
      const [existingConsent] = await db
        .select()
        .from(usrConsentRecords)
        .where(
          and(
            eq(usrConsentRecords.userId, userId),
            eq(usrConsentRecords.purpose, purpose),
            eq(usrConsentRecords.consentGiven, true),
            isNull(usrConsentRecords.withdrawnAt)
          )
        )
        .limit(1);

      if (existingConsent) {
        await db
          .update(usrConsentRecords)
          .set({ withdrawnAt: new Date() })
          .where(eq(usrConsentRecords.id, existingConsent.id));
      }

      const [record] = await db
        .insert(usrConsentRecords)
        .values({
          userId,
          purpose,
          consentGiven: false,
          policyVersion: policyVersion || existingConsent?.policyVersion || 'unknown',
          source: source || 'withdrawal',
          ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip,
          userAgent: req.headers['user-agent'],
        })
        .returning();

      sendSuccess(res, { message: 'Consent withdrawn', ...record });
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to withdraw consent', req);
      return;
    }
  });

  // GDPR Article 20: Data Export — rate limited to 1 request per user per hour
  const exportRateLimits = new Map<string, number>();

  function exportRateLimit(req: Request, res: Response, next: () => void) {
    const userId = req.params.userId as string;
    const now = Date.now();
    const lastExport = exportRateLimits.get(userId);
    const ONE_HOUR = 60 * 60 * 1000;

    if (lastExport && now - lastExport < ONE_HOUR) {
      const retryAfter = Math.ceil((ONE_HOUR - (now - lastExport)) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      StructuredErrors.rateLimited(
        res,
        `Data export can only be requested once per hour. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        {
          service: 'user-service',
          correlationId: getCorrelationId(req),
          details: { retryAfter },
        }
      );
      return;
    }

    exportRateLimits.set(userId, now);

    if (exportRateLimits.size > 1000) {
      for (const [key, timestamp] of exportRateLimits) {
        if (now - timestamp > ONE_HOUR) exportRateLimits.delete(key);
      }
    }

    next();
  }

  router.get('/users/:userId/export', exportRateLimit, async (req, res) => {
    const { ExportUserDataUseCase } = await import('../../application/use-cases/user/ExportUserDataUseCase');
    const exportUseCase = new ExportUserDataUseCase();
    const userId = req.params.userId as string;
    const requestingUserId = extractAuthContext(req).userId || userId;

    try {
      const result = await exportUseCase.execute({
        userId,
        requestingUserId,
        format: (req.query.format as 'json' | 'csv') || 'json',
        includeMusic: req.query.includeMusic !== 'false',
        includeAnalytics: req.query.includeAnalytics !== 'false',
      });

      if (result.success) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="user-data-export-${userId}.json"`);
        res.json(result.data);
      } else {
        ServiceErrors.internal(res, result.error || 'Export failed', undefined, req);
        return;
      }
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Export failed', req);
      return;
    }
  });

  // GDPR Article 17: Data Deletion (Right to Erasure)
  router.delete('/users/:userId/data', async (req, res) => {
    const { ServiceFactory } = await import('../../infrastructure/composition/ServiceFactory');
    const deleteUseCase = ServiceFactory.createDeleteUserDataUseCase();
    const userId = req.params.userId;
    const { userId: authUserId, role } = extractAuthContext(req);
    const requestingUserId = authUserId || userId;
    const userRole = normalizeRole(role);

    try {
      const result = await deleteUseCase.execute({
        userId,
        requestingUserId,
        requestingUserRole: userRole,
      });

      if (result.success) {
        sendSuccess(res, { message: 'User data deleted successfully', details: result });
      } else {
        ServiceErrors.internal(res, 'Deletion failed', undefined, req);
        return;
      }
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Deletion failed', req);
      return;
    }
  });
}
