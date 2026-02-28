import type express from 'express';
import { ServiceLocator } from '@aiponge/platform-core';
import { debugStatusHandler } from '../presentation/controllers/DebugStatusController';
import { gatewayFetch } from '@services/gatewayFetch';
import type { GatewayAppContext } from './context';
import { ServiceErrors } from '../presentation/utils/response-helpers';

export function setupDevEndpoints(app: express.Application, ctx: GatewayAppContext): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  app.get('/debug/status', debugStatusHandler);

  app.post('/api/v1/dev/reset', async (req, res) => {
    const { category } = req.body;
    ctx.logger.info(`[DEV-RESET] Received request for category: ${category}`);
    if (!category) {
      ServiceErrors.badRequest(res, 'Category is required', req);
      return;
    }
    try {
      const userServiceUrl = ServiceLocator.getServiceUrl('user-service');
      ctx.logger.info(`[DEV-RESET] Proxying to user-service: ${userServiceUrl}/api/admin/dev-reset`);
      const response = await gatewayFetch(`${userServiceUrl}/api/admin/dev-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      const data = await response.json();
      ctx.logger.info(`[DEV-RESET] User-service response: ${response.status} - ${JSON.stringify(data)}`);
      res.status(response.status).json(data);
    } catch (error) {
      ctx.logger.error(`[DEV-RESET] Error: ${error}`);
      ServiceErrors.internal(res, 'Failed to contact user-service', undefined, req);
    }
  });

  ctx.logger.debug('✅ Dev reset endpoint mounted (development mode)');
}
