import { Router } from 'express';
import { extractAuthContext } from '@aiponge/platform-core';
import { createPolicyRoute } from '../helpers/routeHelpers';

const router: Router = Router();

router.get(
  '/',
  ...createPolicyRoute({
    service: 'user-service',
    path: (req) => `/api/users/${extractAuthContext(req).userId}/init`,
    logPrefix: '[INIT]',
    policies: {
      auth: { required: true, injectUserId: true },
      cache: {
        enabled: true,
        ttlMs: 30000,
        staleWhileRevalidateMs: 60000,
        varyByHeaders: ['authorization', 'accept-language'],
      },
    },
  })
);

export default router;
