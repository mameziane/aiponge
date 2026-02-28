import { Router } from 'express';
import { serviceAuthMiddleware, serializeError, extractAuthContext } from '@aiponge/platform-core';
import { normalizeRole, USER_ROLES } from '@aiponge/shared-contracts';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';
import { ServiceFactory } from '../../../infrastructure/composition/ServiceFactory';
import { getLogger } from '../../../config/service-urls';
import type { AdminMetricsController } from '../../controllers/AdminMetricsController';

export interface AdminManagementRouteDeps {
  adminMetricsController: AdminMetricsController;
}

const logger = getLogger('user-service-routes');

export function registerAdminManagementRoutes(router: Router, deps: AdminManagementRouteDeps): void {
  const { adminMetricsController } = deps;

  router.get('/admin/product-metrics', serviceAuthMiddleware({ required: true }), (req, res) =>
    adminMetricsController.getProductMetrics(req, res)
  );

  router.post('/admin/users/:userId/assign-librarian', serviceAuthMiddleware({ required: true }), async (req, res) => {
    try {
      const { userId } = req.params;
      const assignedByUserId = req.body.assignedByUserId || 'admin';
      const reason = req.body.reason || 'Admin assignment';

      const assignLibrarianRoleUseCase = ServiceFactory.createAssignLibrarianRoleUseCase();
      const result = await assignLibrarianRoleUseCase.execute({
        userId: userId as string,
        assignedByUserId,
        reason,
      });

      if (!result.success) {
        ServiceErrors.badRequest(res, result.error || 'Failed to assign librarian role', req);
        return;
      }

      sendSuccess(res, result);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to assign librarian role', req);
      return;
    }
  });

  router.post(
    '/admin/migrate/creator-member-relationships',
    serviceAuthMiddleware({ required: true }),
    async (req, res) => {
      try {
        const userRole = normalizeRole(extractAuthContext(req).role);
        if (userRole !== USER_ROLES.ADMIN) {
          ServiceErrors.forbidden(res, 'Admin role required', req);
          return;
        }

        const { CreatorMemberRepository } = await import('../../../infrastructure/repositories/CreatorMemberRepository');
        const { getDatabase } = await import('../../../infrastructure/database/DatabaseConnectionFactory');
        const repo = new CreatorMemberRepository(getDatabase());

        const selfCount = await repo.backfillSelfRelationships();
        const librarianCount = await repo.backfillLibrarianRelationships();

        logger.info('Creator-member relationship backfill completed', { selfCount, librarianCount });
        sendSuccess(res, {
          selfRelationshipsCreated: selfCount,
          librarianRelationshipsCreated: librarianCount,
        });
      } catch (error) {
        logger.error('Creator-member relationship backfill failed', { error: serializeError(error) });
        ServiceErrors.fromException(res, error, 'Backfill failed', req);
        return;
      }
    }
  );

  router.post('/admin/orphan-scan', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { OrphanedRecordCleanupService } = await import('../../../application/services/OrphanedRecordCleanupService');
    const cleanupService = new OrphanedRecordCleanupService();
    const dryRun = req.body.dryRun !== false;

    try {
      const report = await cleanupService.runCleanup(dryRun);
      sendSuccess(res, { dryRun, report });
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Cleanup failed', req);
      return;
    }
  });

  router.get('/admin/verify-user-deleted/:userId', serviceAuthMiddleware({ required: true }), async (req, res) => {
    const { OrphanedRecordCleanupService } = await import('../../../application/services/OrphanedRecordCleanupService');
    const cleanupService = new OrphanedRecordCleanupService();
    const { userId } = req.params;

    try {
      const result = await cleanupService.verifyUserDataDeleted(userId as string);
      sendSuccess(res, { userId, ...result });
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Verification failed', req);
      return;
    }
  });
}
