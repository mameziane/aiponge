import { Router, Request, Response, NextFunction } from 'express';
import { tierConfigController } from '../controllers/TierConfigController';
import { isPrivilegedRole, normalizeRole } from '@aiponge/shared-contracts';
import { extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors } = getResponseHelpers();

function requireServiceAuth(req: Request, res: Response, next: NextFunction): void {
  const serviceKey = req.headers['x-service-key'];
  const expectedKey = process.env.SERVICE_AUTH_KEY;

  if (expectedKey && serviceKey === expectedKey) {
    next();
    return;
  }

  const { role } = extractAuthContext(req);
  if (isPrivilegedRole(normalizeRole(String(role || '')))) {
    next();
    return;
  }

  ServiceErrors.forbidden(res, 'Service or admin authentication required', req);
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const { role } = extractAuthContext(req);
  if (isPrivilegedRole(normalizeRole(String(role || '')))) {
    next();
    return;
  }
  ServiceErrors.forbidden(res, 'Admin access required', req);
}

export function createTierConfigRoutes(): Router {
  const router = Router();

  router.get('/tiers', requireAdmin, tierConfigController.getAllConfigs.bind(tierConfigController));
  router.get('/tiers/:tier', requireServiceAuth, tierConfigController.getConfig.bind(tierConfigController));
  router.get('/tiers/:tier/features', requireServiceAuth, tierConfigController.getFeatures.bind(tierConfigController));
  router.get('/tiers/:tier/limits', requireServiceAuth, tierConfigController.getLimits.bind(tierConfigController));
  router.get(
    '/tiers/:tier/features/:feature',
    requireServiceAuth,
    tierConfigController.checkFeature.bind(tierConfigController)
  );
  router.get(
    '/tiers/:tier/limits/:action',
    requireServiceAuth,
    tierConfigController.checkLimit.bind(tierConfigController)
  );
  router.get(
    '/tiers/:tier/book-depth',
    requireServiceAuth,
    tierConfigController.checkBookDepth.bind(tierConfigController)
  );

  router.patch('/tiers/:tier', requireAdmin, tierConfigController.updateConfig.bind(tierConfigController));
  router.put('/tiers/:tier', requireAdmin, tierConfigController.upsertConfig.bind(tierConfigController));
  router.post('/tiers/cache/invalidate', requireAdmin, tierConfigController.invalidateCache.bind(tierConfigController));

  return router;
}
