/**
 * AI Analytics Service - Route Aggregator
 * Combines all route modules and mounts them on the Express app.
 */

import type { Express } from 'express';
import { getResponseHelpers } from '@aiponge/platform-core';
import type { AnalyticsServiceRegistry } from '../../infrastructure/ServiceFactory';
import { internalAuthMiddleware } from '../middleware/internalAuthMiddleware';
import { createHealthRoutes } from './health.routes';
import { createAnalyticsRoutes } from './analytics.routes';
import { createTraceRoutes } from './traces.routes';
import { createReportRoutes } from './reports.routes';
import { createGdprRoutes } from './gdpr.routes';
import { createFraudRoutes } from './fraud.routes';
import { createLifecycleRoutes } from './lifecycle.routes';
import { createDashboardAnalyticsRoutes } from './dashboard.routes';

const { sendSuccess, ServiceErrors } = getResponseHelpers();

export function setupRoutes(app: Express, registry: AnalyticsServiceRegistry): void {
  // Health routes remain public for Docker/k8s probes
  app.use('/', createHealthRoutes(registry));
  // All other routes require internal service auth
  app.use('/', internalAuthMiddleware, createAnalyticsRoutes(registry));
  app.use('/', internalAuthMiddleware, createTraceRoutes());
  app.use('/', internalAuthMiddleware, createReportRoutes());
  app.use('/', internalAuthMiddleware, createGdprRoutes(registry));
  app.use('/', internalAuthMiddleware, createFraudRoutes(registry));
  app.use('/', internalAuthMiddleware, createLifecycleRoutes());
  app.use('/', internalAuthMiddleware, createDashboardAnalyticsRoutes());

  // Root endpoint
  app.get('/', (req, res) => {
    sendSuccess(res, {
      service: 'ai-analytics-service',
      version: process.env.npm_package_version || '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        analytics: '/api/analytics',
        metrics: '/api/analytics/metrics',
      },
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    ServiceErrors.notFound(res, `Route ${req.originalUrl}`, req);
  });
}
