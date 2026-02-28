import { Router } from 'express';
import type { AdminMetricsController } from '../../controllers/AdminMetricsController';
import { registerAdminManagementRoutes } from './admin-management.routes';
import { registerAdminValidationRoutes } from './admin-validation.routes';
import { registerAdminDevRoutes } from './admin-dev.routes';
import { registerAdminSafetyRoutes } from './admin-safety.routes';

interface AdminRouteDeps {
  adminMetricsController: AdminMetricsController;
}

export function registerAdminRoutes(router: Router, deps: AdminRouteDeps): void {
  registerAdminManagementRoutes(router, { adminMetricsController: deps.adminMetricsController });
  registerAdminValidationRoutes(router);
  registerAdminDevRoutes(router);
  registerAdminSafetyRoutes(router);
}
