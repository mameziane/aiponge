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
    path: req => `/api/narratives/${req.params.userId}`,
    logPrefix: '[NARRATIVES]',
    errorMessage: 'Failed to fetch narrative history',
  })
);

router.post(
  '/:id/respond',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/narratives/${req.params.id}/respond`,
    method: 'POST',
    logPrefix: '[NARRATIVES]',
    errorMessage: 'Failed to respond to narrative',
  })
);

export default router;
