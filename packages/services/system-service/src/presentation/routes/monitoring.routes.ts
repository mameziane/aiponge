import express from 'express';
import { getLogger } from '../../config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { healthChecks, healthCheckResults, alerts, systemConfig, platformMetrics } from '../../schema/system-schema';
import { eq, desc, gte, and, count } from 'drizzle-orm';
import { SchedulerRegistry, serializeError } from '@aiponge/platform-core';
import { getCorrelationId } from '@aiponge/shared-contracts';
import { getLatestHealthResults } from '../../infrastructure/jobs/HealthCheckScheduler';
import {
  MetricsAggregateService,
  type MetricType,
  type AggregationWindow,
} from '../../domains/monitoring/services/MetricsAggregateService';
import { AlertRuleService } from '../../domains/monitoring/services/AlertRuleService';
import { AuditLogService } from '../../domains/audit/AuditLogService';

const db = getDatabase('monitoring-index');

const logger = getLogger('monitoring-index');

const metricsService = new MetricsAggregateService(db);
const alertRuleService = new AlertRuleService(db);
const auditService = new AuditLogService(db);

function getActorFromRequest(req: express.Request): { id: string; type: 'user' | 'admin' | 'system' | 'service' } {
  const user = (req as express.Request & { user?: { id?: string; role?: string } }).user;
  if (user?.id) {
    const type = user.role === 'admin' ? ('admin' as const) : ('user' as const);
    return { id: user.id, type };
  }
  const serviceAuth = req.headers['x-service-auth'] as string;
  if (serviceAuth) return { id: serviceAuth, type: 'service' };
  return { id: 'anonymous', type: 'system' };
}

function auditAsync(
  req: express.Request,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: Record<string, unknown>
): void {
  const actor = getActorFromRequest(req);
  auditService
    .recordAudit({
      actorId: actor.id,
      actorType: actor.type,
      action,
      resourceType,
      resourceId,
      metadata,
      correlationId: getCorrelationId(req),
      severity: 'info',
    })
    .catch(err => logger.warn('Audit log failed', { action, error: serializeError(err) }));
}

const router: express.Router = express.Router();

const SCHEDULER_CONFIG_KEY = 'monitoring_scheduler_enabled';

async function getSchedulerEnabled(): Promise<boolean> {
  try {
    const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, SCHEDULER_CONFIG_KEY));
    if (config && typeof config.value === 'object' && config.value !== null) {
      return (config.value as Record<string, unknown>).enabled === true;
    }
    return false;
  } catch (error) {
    logger.warn('Failed to get scheduler config, defaulting to disabled', {
      error: serializeError(error),
    });
    return false;
  }
}

async function setSchedulerEnabled(enabled: boolean, userId?: string): Promise<void> {
  try {
    const existing = await db.select().from(systemConfig).where(eq(systemConfig.key, SCHEDULER_CONFIG_KEY));

    if (existing.length > 0) {
      await db
        .update(systemConfig)
        .set({
          value: { enabled },
          updatedAt: new Date(),
          updatedBy: userId || null,
        })
        .where(eq(systemConfig.key, SCHEDULER_CONFIG_KEY));
    } else {
      await db.insert(systemConfig).values({
        key: SCHEDULER_CONFIG_KEY,
        value: { enabled },
        description: 'Controls whether the health monitoring scheduler is active',
        updatedBy: userId || null,
      });
    }
  } catch (error) {
    logger.error('Failed to set scheduler config', {
      error: serializeError(error),
    });
    throw error;
  }
}

router.get('/health', async (req, res) => {
  try {
    const isEnabled = await getSchedulerEnabled();
    const healthCheckScheduler = SchedulerRegistry.getByName('health-check');
    const isRunning = healthCheckScheduler?.getInfo().status === 'running';

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'monitoring-domain',
      version: '1.0.0',
      checks: {
        database: 'healthy',
        scheduler: isEnabled ? 'active' : 'inactive',
      },
      schedulerStatus: {
        enabled: isEnabled,
        running: isRunning,
        taskCount: isRunning ? 1 : 0,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    res.status(200).json(health);
  } catch (error: unknown) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'monitoring-domain',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get('/config', async (req, res) => {
  try {
    const isEnabled = await getSchedulerEnabled();

    const hcScheduler = SchedulerRegistry.getByName('health-check');
    const hcRunning = hcScheduler?.getInfo().status === 'running';

    sendSuccess(res, {
      schedulerEnabled: isEnabled,
      schedulerRunning: hcRunning,
      taskCount: hcRunning ? 1 : 0,
      intervalSeconds: 60,
    });
  } catch (error: unknown) {
    logger.error('Failed to get monitoring config', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get monitoring config', req);
    return;
  }
});

router.post('/config', async (req, res) => {
  try {
    const { schedulerEnabled } = req.body;

    if (typeof schedulerEnabled !== 'boolean') {
      ServiceErrors.badRequest(res, 'schedulerEnabled must be a boolean', req);
      return;
    }

    const userId = (req as express.Request & { user?: { id?: string } }).user?.id;
    await setSchedulerEnabled(schedulerEnabled, userId);

    // The HealthCheckScheduler reads this config value on each execution
    logger.info(`Health check scheduler config updated: ${schedulerEnabled ? 'enabled' : 'disabled'}`);
    auditAsync(req, schedulerEnabled ? 'scheduler.enable' : 'scheduler.disable', 'config', SCHEDULER_CONFIG_KEY, {
      schedulerEnabled,
    });

    const hcSch = SchedulerRegistry.getByName('health-check');
    const hcRun = hcSch?.getInfo().status === 'running';

    sendSuccess(res, {
      schedulerEnabled,
      schedulerRunning: hcRun,
      taskCount: hcRun ? 1 : 0,
    });
  } catch (error: unknown) {
    logger.error('Failed to update monitoring config', {
      error: serializeError(error),
    });
    ServiceErrors.fromException(res, error, 'Failed to update monitoring config', req);
    return;
  }
});

router.get('/health-checks', async (req, res) => {
  try {
    const results = await db.select().from(healthChecks).orderBy(desc(healthChecks.updatedAt));

    sendSuccess(res, results);
  } catch (error: unknown) {
    logger.error('Failed to get health checks', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get health checks', req);
    return;
  }
});

router.get('/health-check-results', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const hoursAgo = parseInt(req.query.hours as string) || 24;
    const timeThreshold = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    const results = await db
      .select()
      .from(healthCheckResults)
      .where(gte(healthCheckResults.timestamp, timeThreshold))
      .orderBy(desc(healthCheckResults.timestamp))
      .limit(limit);

    sendSuccess(res, {
      items: results,
      meta: {
        count: results.length,
        hoursAgo,
        timeThreshold: timeThreshold.toISOString(),
      },
    });
  } catch (error: unknown) {
    logger.error('Failed to get health check results', {
      error: serializeError(error),
    });
    ServiceErrors.fromException(res, error, 'Failed to get health check results', req);
    return;
  }
});

router.get('/health-summary', async (req, res) => {
  try {
    const { results: liveResults, lastCheckTime: liveCheckTime } = getLatestHealthResults();

    const summary = {
      healthy: 0,
      unhealthy: 0,
      degraded: 0,
      unknown: 0,
      total: liveResults.length,
    };

    liveResults.forEach(result => {
      if (result.status in summary) {
        summary[result.status as keyof typeof summary]++;
      }
    });

    sendSuccess(res, {
      summary,
      recentChecks: liveResults.map(r => ({
        serviceName: r.serviceName,
        status: r.status,
        responseTimeMs: r.responseTimeMs,
        message: r.message,
        timestamp: r.timestamp,
      })),
      lastCheckTime: liveCheckTime?.toISOString() || null,
      hasIssues: summary.unhealthy > 0 || summary.degraded > 0,
    });
  } catch (error: unknown) {
    logger.error('Failed to get health summary', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get health summary', req);
    return;
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const limitNum = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const statusFilter = req.query.status as string;

    let results;
    if (statusFilter) {
      results = await db
        .select()
        .from(alerts)
        .where(eq(alerts.status, statusFilter))
        .orderBy(desc(alerts.triggeredAt))
        .limit(limitNum);
    } else {
      results = await db.select().from(alerts).orderBy(desc(alerts.triggeredAt)).limit(limitNum);
    }

    const activeCount = await db.select({ count: count() }).from(alerts).where(eq(alerts.status, 'active'));

    sendSuccess(res, {
      alerts: results,
      activeCount: Number(activeCount[0]?.count || 0),
    });
  } catch (error: unknown) {
    logger.error('Failed to get alerts', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get alerts', req);
    return;
  }
});

router.get('/issues', async (req, res) => {
  try {
    const hoursAgo = parseInt(req.query.hours as string) || 24;
    const timeThreshold = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    const unhealthyResults = await db
      .select()
      .from(healthCheckResults)
      .where(and(gte(healthCheckResults.timestamp, timeThreshold), eq(healthCheckResults.status, 'unhealthy')))
      .orderBy(desc(healthCheckResults.timestamp))
      .limit(20);

    const activeAlerts = await db
      .select()
      .from(alerts)
      .where(eq(alerts.status, 'active'))
      .orderBy(desc(alerts.triggeredAt))
      .limit(10);

    const issues = [
      ...unhealthyResults.map(r => ({
        type: 'health_check_failure',
        severity: 'warning' as const,
        title: `Health check failed`,
        message: r.errorMessage || 'Service reported unhealthy status',
        timestamp: r.timestamp,
        metadata: r.metadata,
      })),
      ...activeAlerts.map(a => ({
        type: 'alert',
        severity: a.severity as 'critical' | 'warning' | 'info',
        title: a.title,
        message: a.message,
        timestamp: a.triggeredAt,
        metadata: a.metadata,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    sendSuccess(res, {
      issues,
      hasIssues: issues.length > 0,
      criticalCount: issues.filter(i => i.severity === 'critical').length,
      warningCount: issues.filter(i => i.severity === 'warning').length,
    });
  } catch (error: unknown) {
    logger.error('Failed to get issues', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get issues', req);
    return;
  }
});

router.post('/scheduler/start', async (req, res) => {
  try {
    const userId = (req as express.Request & { user?: { id?: string } }).user?.id;
    await setSchedulerEnabled(true, userId);
    auditAsync(req, 'scheduler.start', 'scheduler', 'health-check');

    sendSuccess(res, { message: 'Scheduler enabled (takes effect on next cycle)', status: 'active' });
  } catch (error: unknown) {
    logger.error('Failed to start scheduler', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to start scheduler', req);
    return;
  }
});

router.post('/scheduler/stop', async (req, res) => {
  try {
    const userId = (req as express.Request & { user?: { id?: string } }).user?.id;
    await setSchedulerEnabled(false, userId);
    auditAsync(req, 'scheduler.stop', 'scheduler', 'health-check');

    sendSuccess(res, { message: 'Scheduler disabled (takes effect on next cycle)', status: 'inactive' });
  } catch (error: unknown) {
    logger.error('Failed to stop scheduler', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to stop scheduler', req);
    return;
  }
});

router.post('/scheduler/trigger', async (req, res) => {
  try {
    const scheduler = SchedulerRegistry.getByName('health-check');
    if (!scheduler) {
      ServiceErrors.notFound(res, 'Health check scheduler', req);
      return;
    }
    const result = await scheduler.triggerNow();
    sendSuccess(res, { message: 'Health checks triggered manually', triggered: true, ...result.data });
  } catch (error: unknown) {
    logger.error('Failed to trigger health checks', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to trigger health checks', req);
    return;
  }
});

router.get('/scheduler/status', async (req, res) => {
  try {
    const isEnabled = await getSchedulerEnabled();
    const scheduler = SchedulerRegistry.getByName('health-check');
    const info = scheduler?.getInfo();

    const isRunning = info?.status === 'running';
    sendSuccess(res, {
      enabled: isEnabled,
      running: isRunning,
      taskCount: isRunning ? 1 : 0,
      lastCheck: info?.lastRunAt ?? null,
    });
  } catch (error: unknown) {
    logger.error('Failed to get scheduler status', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get scheduler status', req);
    return;
  }
});

// ============================================================================
// CENTRALIZED SCHEDULER STATUS ENDPOINT
// ============================================================================

router.get('/schedulers', async (req, res) => {
  try {
    const healthReport = SchedulerRegistry.getHealthReport();
    sendSuccess(res, healthReport);
  } catch (error: unknown) {
    logger.error('Failed to get scheduler health report', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get scheduler health report', req);
  }
});

router.get('/schedulers/:name', async (req, res) => {
  try {
    let scheduler = SchedulerRegistry.get(req.params.name);
    if (!scheduler) {
      scheduler = SchedulerRegistry.getByName(req.params.name);
    }
    if (!scheduler) {
      ServiceErrors.notFound(res, `Scheduler '${req.params.name}'`, req);
      return;
    }
    sendSuccess(res, scheduler.getInfo());
  } catch (error: unknown) {
    logger.error('Failed to get scheduler info', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get scheduler info', req);
  }
});

router.post('/schedulers/:name/trigger', async (req, res) => {
  try {
    let scheduler = SchedulerRegistry.get(req.params.name);
    if (!scheduler) {
      scheduler = SchedulerRegistry.getByName(req.params.name);
    }
    if (!scheduler) {
      ServiceErrors.notFound(res, `Scheduler '${req.params.name}'`, req);
      return;
    }
    const result = await scheduler.triggerNow();
    sendSuccess(res, { message: result.message, ...result.data });
  } catch (error: unknown) {
    logger.error('Failed to trigger scheduler', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to trigger scheduler', req);
  }
});

// ===== TIER 4 WS3: PRE-COMPUTED METRICS ENDPOINTS =====

router.get('/precomputed-metrics/:metricType', async (req, res) => {
  try {
    const { metricType } = req.params;
    const [metric] = await db
      .select()
      .from(platformMetrics)
      .where(eq(platformMetrics.metricType, metricType))
      .orderBy(desc(platformMetrics.computedAt))
      .limit(1);

    if (!metric) {
      ServiceErrors.notFound(res, `Pre-computed metric of type '${metricType}'`, req);
      return;
    }

    if (metric.expiresAt && new Date(metric.expiresAt) < new Date()) {
      sendSuccess(res, { ...metric, stale: true, message: 'Metric data is stale and may be outdated' });
      return;
    }

    sendSuccess(res, metric);
  } catch (error: unknown) {
    logger.error('Failed to fetch pre-computed metrics', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to fetch pre-computed metrics', req);
  }
});

router.post('/precomputed-metrics', async (req, res) => {
  try {
    const { metricType, payload, expiresInMs } = req.body;
    if (!metricType || !payload) {
      ServiceErrors.badRequest(res, 'metricType and payload are required', req);
      return;
    }

    const expiresAt = expiresInMs ? new Date(Date.now() + expiresInMs) : null;

    const [inserted] = await db
      .insert(platformMetrics)
      .values({
        metricType,
        payload,
        expiresAt,
        computedAt: new Date(),
      })
      .returning();

    sendCreated(res, inserted);
  } catch (error: unknown) {
    logger.error('Failed to store pre-computed metrics', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to store pre-computed metrics', req);
  }
});

// ===== METRICS AGGREGATES ENDPOINTS =====

router.post('/metrics/aggregate', async (req, res) => {
  try {
    const { serviceName, metricName, metricType, value, labels, aggregationWindow } = req.body;

    if (!serviceName || !metricName || !metricType || value === undefined || !aggregationWindow) {
      ServiceErrors.badRequest(
        res,
        'serviceName, metricName, metricType, value, and aggregationWindow are required',
        req
      );
      return;
    }

    const entry = await metricsService.recordAggregate({
      serviceName,
      metricName,
      metricType,
      value: Number(value),
      labels,
      aggregationWindow,
    });

    const triggeredAlerts = await alertRuleService.evaluateRules({
      serviceName,
      metricName,
      currentValue: Number(value),
      metadata: labels as Record<string, unknown>,
    });

    sendCreated(res, { metric: entry, triggeredAlerts: triggeredAlerts.length > 0 ? triggeredAlerts : undefined });
  } catch (error: unknown) {
    logger.error('Failed to record metric aggregate', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to record metric aggregate', req);
  }
});

router.get('/metrics/aggregate', async (req, res) => {
  try {
    const result = await metricsService.queryAggregates({
      serviceName: req.query.serviceName as string,
      metricName: req.query.metricName as string,
      metricType: req.query.metricType as MetricType,
      aggregationWindow: req.query.aggregationWindow as AggregationWindow,
      startTime: req.query.startTime ? new Date(req.query.startTime as string) : undefined,
      endTime: req.query.endTime ? new Date(req.query.endTime as string) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 100,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });

    sendSuccess(res, result);
  } catch (error: unknown) {
    logger.error('Failed to query metric aggregates', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to query metric aggregates', req);
  }
});

router.get('/metrics/aggregate/service/:serviceName', async (req, res) => {
  try {
    const windowHours = req.query.windowHours ? Number(req.query.windowHours) : 1;
    const summary = await metricsService.getServiceSummary(req.params.serviceName, windowHours);
    sendSuccess(res, summary);
  } catch (error: unknown) {
    logger.error('Failed to get service metrics summary', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get service metrics summary', req);
  }
});

// ===== ALERT RULES CRUD ENDPOINTS =====

router.post('/alert-rules', async (req, res) => {
  try {
    const {
      name,
      description,
      conditionType,
      conditionConfig,
      severity,
      isEnabled,
      notificationChannels,
      cooldownMinutes,
      metadata,
    } = req.body;

    if (!name || !conditionType || !conditionConfig || !severity) {
      ServiceErrors.badRequest(res, 'name, conditionType, conditionConfig, and severity are required', req);
      return;
    }

    const rule = await alertRuleService.createRule({
      name,
      description,
      conditionType,
      conditionConfig,
      severity,
      isEnabled,
      notificationChannels,
      cooldownMinutes,
      metadata,
    });
    auditAsync(req, 'alert_rule.create', 'alert_rule', rule.id, { name, severity, conditionType });

    sendCreated(res, rule);
  } catch (error: unknown) {
    logger.error('Failed to create alert rule', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to create alert rule', req);
  }
});

router.get('/alert-rules', async (req, res) => {
  try {
    const enabledOnly = req.query.enabledOnly === 'true';
    const rules = await alertRuleService.listRules(enabledOnly);
    sendSuccess(res, rules);
  } catch (error: unknown) {
    logger.error('Failed to list alert rules', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to list alert rules', req);
  }
});

router.get('/alert-rules/:id', async (req, res) => {
  try {
    const rule = await alertRuleService.getRule(req.params.id);
    if (!rule) {
      ServiceErrors.notFound(res, 'Alert rule', req);
      return;
    }
    sendSuccess(res, rule);
  } catch (error: unknown) {
    logger.error('Failed to get alert rule', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to get alert rule', req);
  }
});

router.patch('/alert-rules/:id', async (req, res) => {
  try {
    const rule = await alertRuleService.updateRule(req.params.id, req.body);
    if (!rule) {
      ServiceErrors.notFound(res, 'Alert rule', req);
      return;
    }
    auditAsync(req, 'alert_rule.update', 'alert_rule', req.params.id, { updatedFields: Object.keys(req.body) });
    sendSuccess(res, rule);
  } catch (error: unknown) {
    logger.error('Failed to update alert rule', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to update alert rule', req);
  }
});

router.delete('/alert-rules/:id', async (req, res) => {
  try {
    const deleted = await alertRuleService.deleteRule(req.params.id);
    if (!deleted) {
      ServiceErrors.notFound(res, 'Alert rule', req);
      return;
    }
    auditAsync(req, 'alert_rule.delete', 'alert_rule', req.params.id);
    sendSuccess(res, { message: 'Alert rule deleted' });
  } catch (error: unknown) {
    logger.error('Failed to delete alert rule', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to delete alert rule', req);
  }
});

router.post('/alert-rules/evaluate', async (req, res) => {
  try {
    const { serviceName, metricName, currentValue, metadata } = req.body;

    if (!serviceName || !metricName || currentValue === undefined) {
      ServiceErrors.badRequest(res, 'serviceName, metricName, and currentValue are required', req);
      return;
    }

    const triggeredAlerts = await alertRuleService.evaluateRules({
      serviceName,
      metricName,
      currentValue: Number(currentValue),
      metadata,
    });

    sendSuccess(res, {
      evaluated: true,
      triggeredCount: triggeredAlerts.length,
      alerts: triggeredAlerts,
    });
  } catch (error: unknown) {
    logger.error('Failed to evaluate alert rules', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to evaluate alert rules', req);
  }
});

router.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const acknowledgedBy = (req as express.Request & { user?: { id?: string } }).user?.id || req.body.acknowledgedBy;
    const alert = await alertRuleService.acknowledgeAlert(req.params.id, acknowledgedBy);
    if (!alert) {
      ServiceErrors.notFound(res, 'Alert', req);
      return;
    }
    sendSuccess(res, alert);
  } catch (error: unknown) {
    logger.error('Failed to acknowledge alert', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to acknowledge alert', req);
  }
});

router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const alert = await alertRuleService.resolveAlert(req.params.id);
    if (!alert) {
      ServiceErrors.notFound(res, 'Alert', req);
      return;
    }
    sendSuccess(res, alert);
  } catch (error: unknown) {
    logger.error('Failed to resolve alert', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to resolve alert', req);
  }
});

logger.debug('MONITORING Domain configured with scheduler control', {
  module: 'monitoring_index',
  operation: 'domain_initialization',
  domain: 'monitoring',
  phase: 'domain_configured',
});

export default router;
