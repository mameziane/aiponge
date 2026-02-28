import type express from 'express';
import { metricsMiddleware, startSystemMetricsCollection } from '../utils/metrics';
import type { GatewayAppContext } from './context';

export function setupMetrics(app: express.Application, _ctx: GatewayAppContext): void {
  app.use(metricsMiddleware);

  if (process.env.NODE_ENV === 'production') {
    startSystemMetricsCollection(30000);
  }
}
