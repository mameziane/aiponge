import { Router } from 'express';
import { serviceAuthMiddleware } from '@aiponge/platform-core';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';

export function registerAdminValidationRoutes(router: Router): void {
  router.post('/admin/cross-reference-check', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { OrphanedRecordCleanupService } = await import('../../../application/services/OrphanedRecordCleanupService');
    const cleanupService = new OrphanedRecordCleanupService();

    try {
      const result = await cleanupService.verifyCrossServiceReferences();
      sendSuccess(res, result);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Cross-reference check failed', req);
      return;
    }
  });

  router.post('/admin/verify-reference', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { referenceType, referenceId } = req.body;

    if (!referenceType || !referenceId) {
      ServiceErrors.badRequest(res, 'Missing referenceType or referenceId', req, { valid: false, exists: false });
      return;
    }

    try {
      const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
      const { eq } = await import('drizzle-orm');
      const db = getDatabase();

      let exists = false;

      switch (referenceType) {
        case 'user': {
          const { users } = await import('../../../infrastructure/database/schemas/user-schema');
          const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, referenceId)).limit(1);
          exists = !!user;
          break;
        }
        case 'entry': {
          const { libEntries } = await import('../../../infrastructure/database/schemas/library-schema');
          const [entry] = await db
            .select({ id: libEntries.id })
            .from(libEntries)
            .where(eq(libEntries.id, referenceId))
            .limit(1);
          exists = !!entry;
          break;
        }
        case 'chapter': {
          const { libChapters } = await import('../../../infrastructure/database/schemas/library-schema');
          const [chapter] = await db
            .select({ id: libChapters.id })
            .from(libChapters)
            .where(eq(libChapters.id, referenceId))
            .limit(1);
          exists = !!chapter;
          break;
        }
        case 'book': {
          const { libBooks } = await import('../../../infrastructure/database/schemas/library-schema');
          const [book] = await db
            .select({ id: libBooks.id })
            .from(libBooks)
            .where(eq(libBooks.id, referenceId))
            .limit(1);
          exists = !!book;
          break;
        }
        default:
          ServiceErrors.badRequest(res, `Unknown reference type: ${referenceType}`, req, {
            valid: false,
            exists: false,
            referenceType,
            referenceId,
          });
          return;
      }

      sendSuccess(res, { valid: exists, exists, referenceType, referenceId });
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Validation failed', req);
      return;
    }
  });

  router.post('/admin/verify-references/batch', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { references } = req.body as { references: Array<{ referenceType: string; referenceId: string }> };

    if (!Array.isArray(references) || references.length === 0) {
      ServiceErrors.badRequest(res, 'References array is required and must not be empty', req);
      return;
    }

    try {
      const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
      const { inArray } = await import('drizzle-orm');
      const db = getDatabase();

      const referencesByType = new Map<string, string[]>();
      for (const ref of references) {
        if (!referencesByType.has(ref.referenceType)) {
          referencesByType.set(ref.referenceType, []);
        }
        referencesByType.get(ref.referenceType)!.push(ref.referenceId);
      }

      const existingIds = new Map<string, Set<string>>();

      for (const [refType, ids] of referencesByType.entries()) {
        const existingSet = new Set<string>();

        switch (refType) {
          case 'user': {
            const { users } = await import('../../../infrastructure/database/schemas/user-schema');
            const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
            found.forEach(r => existingSet.add(r.id));
            break;
          }
          case 'entry': {
            const { libEntries } = await import('../../../infrastructure/database/schemas/library-schema');
            const found = await db.select({ id: libEntries.id }).from(libEntries).where(inArray(libEntries.id, ids));
            found.forEach(r => existingSet.add(r.id));
            break;
          }
          case 'chapter': {
            const { libChapters } = await import('../../../infrastructure/database/schemas/library-schema');
            const found = await db.select({ id: libChapters.id }).from(libChapters).where(inArray(libChapters.id, ids));
            found.forEach(r => existingSet.add(r.id));
            break;
          }
          case 'book': {
            const { libBooks } = await import('../../../infrastructure/database/schemas/library-schema');
            const found = await db.select({ id: libBooks.id }).from(libBooks).where(inArray(libBooks.id, ids));
            found.forEach(r => existingSet.add(r.id));
            break;
          }
        }

        existingIds.set(refType, existingSet);
      }

      const results = references.map(ref => {
        const exists = existingIds.get(ref.referenceType)?.has(ref.referenceId) ?? false;
        return { valid: exists, exists, referenceType: ref.referenceType, referenceId: ref.referenceId };
      });

      const failedCount = results.filter(r => !r.valid).length;

      sendSuccess(res, { results, allValid: failedCount === 0, failedCount });
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Batch validation failed', req);
      return;
    }
  });
}
