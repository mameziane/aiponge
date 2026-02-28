/**
 * App Config Routes
 * Public config endpoints for mobile app consumption
 */

import { Router } from 'express';
import { wrapAsync } from '../helpers/routeHelpers';
import { proxyToSystemService } from '../helpers/proxyHelpers';
import { createResponseCacheMiddleware, CACHE_PRESETS } from '../../middleware/ResponseCacheMiddleware';

const router: Router = Router();

const configCacheMiddleware = createResponseCacheMiddleware({
  ...CACHE_PRESETS.staticMetadata,
  ttlMs: 600_000,
});

router.get(
  '/defaults',
  configCacheMiddleware,
  wrapAsync(async (req, res) => {
    await proxyToSystemService(req, res, '/api/config/librarian-defaults');
  })
);

router.get(
  '/available-options',
  configCacheMiddleware,
  wrapAsync(async (req, res) => {
    await proxyToSystemService(req, res, '/api/config/available-options');
  })
);

router.get(
  '/content-limits',
  configCacheMiddleware,
  wrapAsync(async (req, res) => {
    await proxyToSystemService(req, res, '/api/config/content-limits');
  })
);

export default router;
