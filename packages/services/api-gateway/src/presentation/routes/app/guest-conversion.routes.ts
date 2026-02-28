import { Router } from 'express';
import { extractAuthContext } from '@aiponge/platform-core';
import { createProxyHandler, createPolicyRoute } from '../helpers/routeHelpers';

const router: Router = Router();

const SERVICE = 'user-service';

router.get(
  '/policy',
  ...createPolicyRoute({
    service: SERVICE,
    path: '/api/guest-conversion/policy',
    logPrefix: '[GUEST-CONVERSION]',
    errorMessage: 'Failed to fetch guest conversion policy',
    policies: {
      auth: false,
    },
  })
);

router.get(
  '/state',
  ...createPolicyRoute({
    service: SERVICE,
    path: req => `/api/guest-conversion/${extractAuthContext(req).userId}/state`,
    logPrefix: '[GUEST-CONVERSION]',
    errorMessage: 'Failed to fetch guest conversion state',
  })
);

router.post(
  '/event',
  ...createPolicyRoute({
    service: SERVICE,
    path: req => `/api/guest-conversion/${extractAuthContext(req).userId}/event`,
    logPrefix: '[GUEST-CONVERSION]',
    errorMessage: 'Failed to track guest event',
  })
);

router.post(
  '/convert',
  ...createPolicyRoute({
    service: SERVICE,
    path: req => `/api/guest-conversion/${extractAuthContext(req).userId}/convert`,
    logPrefix: '[GUEST-CONVERSION]',
    errorMessage: 'Failed to mark guest as converted',
  })
);

export default router;
