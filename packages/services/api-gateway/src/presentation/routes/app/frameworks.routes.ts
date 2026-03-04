/**
 * Frameworks Routes
 * Proxy to ai-config-service for psychological framework data
 */

import { Router } from 'express';
import { wrapAsync } from '../helpers/routeHelpers';
import { proxyToAiConfigService } from '../helpers/proxyHelpers';

const router: Router = Router();

router.get(
  '/',
  wrapAsync(async (req, res) => {
    await proxyToAiConfigService(req, res, '/api/frameworks');
  })
);

router.get(
  '/enabled',
  wrapAsync(async (req, res) => {
    await proxyToAiConfigService(req, res, '/api/frameworks/enabled');
  })
);

router.get(
  '/category/:category',
  wrapAsync(async (req, res) => {
    await proxyToAiConfigService(req, res, `/api/frameworks/category/${req.params.category}`);
  })
);

router.get(
  '/:id',
  wrapAsync(async (req, res) => {
    await proxyToAiConfigService(req, res, `/api/frameworks/${req.params.id}`);
  })
);

export default router;
