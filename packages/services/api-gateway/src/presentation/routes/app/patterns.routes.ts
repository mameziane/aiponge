import { Router } from 'express';
import { createProxyHandler, wrapAsync } from '../helpers/routeHelpers';
import { injectAuthenticatedUserId } from '../../middleware/authorizationMiddleware';

const SERVICE = 'user-service';
const router: Router = Router();

router.get(
  '/:userId',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/patterns/${req.params.userId}`,
    logPrefix: '[PATTERNS]',
    errorMessage: 'Failed to fetch user patterns',
  })
);

router.get(
  '/:userId/analyze',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/patterns/${req.params.userId}/analyze`,
    logPrefix: '[PATTERNS]',
    errorMessage: 'Failed to analyze patterns',
  })
);

router.post(
  '/:userId/analyze',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/patterns/${req.params.userId}/analyze`,
    method: 'POST',
    logPrefix: '[PATTERNS]',
    errorMessage: 'Failed to analyze patterns',
  })
);

router.get(
  '/:userId/insights',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/patterns/${req.params.userId}/insights`,
    logPrefix: '[PATTERNS]',
    errorMessage: 'Failed to fetch pattern insights',
  })
);

router.get(
  '/:userId/themes',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/patterns/${req.params.userId}/themes`,
    logPrefix: '[PATTERNS]',
    errorMessage: 'Failed to fetch theme frequencies',
  })
);

router.post(
  '/:patternId/react',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/patterns/${req.params.patternId}/react`,
    method: 'POST',
    logPrefix: '[PATTERNS]',
    errorMessage: 'Failed to record pattern reaction',
  })
);

router.get(
  '/:patternId/evidence',
  injectAuthenticatedUserId,
  createProxyHandler({
    service: SERVICE,
    path: req => `/api/patterns/${req.params.patternId}/evidence`,
    logPrefix: '[PATTERNS]',
    errorMessage: 'Failed to fetch pattern evidence',
  })
);

export default router;
