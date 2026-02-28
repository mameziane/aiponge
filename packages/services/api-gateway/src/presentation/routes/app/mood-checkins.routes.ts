import { Router } from 'express';
import { createProxyHandler } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';

const SERVICE = 'user-service';
const router: Router = Router();

router.get(
  '/:userId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/mood-checkins/${req.params.userId}`,
    logPrefix: '[MOOD-CHECKINS]',
    errorMessage: 'Failed to fetch mood check-ins',
  })
);

router.patch(
  '/:id/respond',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/mood-checkins/${req.params.id}/respond`,
    method: 'PATCH',
    logPrefix: '[MOOD-CHECKINS]',
    errorMessage: 'Failed to respond to mood micro-question',
  })
);

export default router;
