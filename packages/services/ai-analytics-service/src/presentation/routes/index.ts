/**
 * AI Analytics Service - Route Aggregator
 * Combines all route modules and mounts them on the Express app.
 */

import type { Express } from 'express';
import { getResponseHelpers } from '@aiponge/platform-core';
import type { AnalyticsServiceRegistry } from '../../infrastructure/ServiceFactory';
import { createHealthRoutes } from './health.routes';
import { createAnalyticsRoutes } from './analytics.routes';
import { createTraceRoutes } from './traces.routes';
import { createReportRoutes } from './reports.routes';
import { createGdprRoutes } from './gdpr.routes';
import { createFraudRoutes } from './fraud.routes';

const { sendSuccess, ServiceErrors } = getResponseHelpers();

export function setupRoutes(app: Express, registry: AnalyticsServiceRegistry): void {
  app.use('/', createHealthRoutes(registry));
  app.use('/', createAnalyticsRoutes(registry));
  app.use('/', createTraceRoutes());
  app.use('/', createReportRoutes());
  app.use('/', createGdprRoutes(registry));
  app.use('/', createFraudRoutes(registry));

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
