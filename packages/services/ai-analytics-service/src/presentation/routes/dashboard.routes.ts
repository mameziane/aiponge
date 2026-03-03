/**
 * Dashboard Analytics Routes — Admin API for business KPIs
 * All endpoints require admin or librarian role.
 */

import { Router } from 'express';
import { getResponseHelpers, serializeError, createLogger } from '@aiponge/platform-core';
import { LifecycleRepository } from '../../infrastructure/repositories/LifecycleRepository';
import { GetDashboardOverviewUseCase } from '../../application/use-cases/lifecycle/GetDashboardOverviewUseCase';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';

const { sendSuccess, ServiceErrors } = getResponseHelpers();
const logger = createLogger('ai-analytics-service:dashboard-routes');

export function createDashboardAnalyticsRoutes(): Router {
  const router = Router();

  const db = getDatabase();
  const repository = new LifecycleRepository(db);
  const overviewUseCase = new GetDashboardOverviewUseCase(repository);

  // GET /api/v1/analytics/dashboard/overview
  router.get('/api/v1/analytics/dashboard/overview', async (req, res) => {
    try {
      const data = await overviewUseCase.execute();
      sendSuccess(res, data);
    } catch (error) {
      logger.error('Dashboard overview failed', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get dashboard overview', req);
    }
  });

  // GET /api/v1/analytics/dashboard/revenue
  router.get('/api/v1/analytics/dashboard/revenue', async (req, res) => {
    try {
      const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 86400000);
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
      const granularity = (req.query.granularity as 'daily' | 'weekly' | 'monthly') || 'daily';
      const data = await repository.getRevenueByTierAndPeriod(from, to, granularity);
      sendSuccess(res, data);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get revenue data', req);
    }
  });

  // GET /api/v1/analytics/dashboard/users
  router.get('/api/v1/analytics/dashboard/users', async (req, res) => {
    try {
      const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 86400000);
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
      const tier = req.query.tier as string | undefined;
      const platform = req.query.platform as string | undefined;
      const data = await repository.getDailyMetrics(from, to, tier, platform);
      sendSuccess(res, data);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get user data', req);
    }
  });

  // GET /api/v1/analytics/dashboard/churn
  router.get('/api/v1/analytics/dashboard/churn', async (req, res) => {
    try {
      const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 86400000);
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
      const data = await repository.getChurnRateByTier(from, to);
      sendSuccess(res, data);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get churn data', req);
    }
  });

  // GET /api/v1/analytics/dashboard/cohorts
  router.get('/api/v1/analytics/dashboard/cohorts', async (req, res) => {
    try {
      const cohortMonth = req.query.cohortMonth ? new Date(req.query.cohortMonth as string) : undefined;
      const data = await repository.getCohortSnapshots(cohortMonth);
      sendSuccess(res, data);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get cohort data', req);
    }
  });

  // GET /api/v1/analytics/dashboard/funnel
  router.get('/api/v1/analytics/dashboard/funnel', async (req, res) => {
    try {
      const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 86400000);
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
      const data = await repository.getConversionFunnel(from, to);
      sendSuccess(res, data);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get funnel data', req);
    }
  });

  // GET /api/v1/analytics/dashboard/acquisition
  router.get('/api/v1/analytics/dashboard/acquisition', async (req, res) => {
    try {
      const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 86400000);
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
      const data = await repository.getAcquisitionBreakdown(from, to);
      sendSuccess(res, data);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get acquisition data', req);
    }
  });

  // GET /api/v1/analytics/dashboard/subscriptions/:userId
  router.get('/api/v1/analytics/dashboard/subscriptions/:userId', async (req, res) => {
    try {
      const data = await repository.getSubscriptionHistory(req.params.userId);
      sendSuccess(res, data);
    } catch (error) {
      ServiceErrors.fromException(res, error, 'Failed to get subscription history', req);
    }
  });

  return router;
}
