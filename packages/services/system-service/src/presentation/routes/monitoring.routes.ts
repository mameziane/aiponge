import express from 'express';
import { getLogger } from '../../config/service-urls';
import { sendSuccess, sendCreated, ServiceErrors } from '../utils/response-helpers';
import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { healthChecks, healthCheckResults, alerts, systemConfig, platformMetrics } from '../../schema/system-schema';
import { eq, desc, gte, and, count } from 'drizzle-orm';
import { SchedulerRegistry, serializeError, createIntervalScheduler } from '@aiponge/platform-core';
import type { IntervalScheduler } from '@aiponge/platform-core';
import { MetricsAggregateService, type MetricType, type AggregationWindow } from '../../domains/monitoring/services/MetricsAggregateService';
import { AlertRuleService } from '../../domains/monitoring/services/AlertRuleService';

const db = getDatabase('monitoring-index');

const logger = getLogger('monitoring-index');

const metricsService = new MetricsAggregateService(db);
const alertRuleService = new AlertRuleService(db);

const router: express.Router = express.Router();

const SCHEDULER_CONFIG_KEY = 'monitoring_scheduler_enabled';

let schedulerRunning = false;
let schedulerInstance: IntervalScheduler | null = null;

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

const SERVICES_TO_CHECK = [
  { name: 'system-service', host: 'localhost', port: 3001, healthEndpoint: '/health' },
  { name: 'storage-service', host: 'localhost', port: 3002, healthEndpoint: '/health' },
  { name: 'user-service', host: 'localhost', port: 3003, healthEndpoint: '/health' },
  { name: 'ai-config-service', host: 'localhost', port: 3004, healthEndpoint: '/health' },
  { name: 'ai-content-service', host: 'localhost', port: 3005, healthEndpoint: '/health' },
  { name: 'ai-analytics-service', host: 'localhost', port: 3006, healthEndpoint: '/health' },
  { name: 'music-service', host: 'localhost', port: 3007, healthEndpoint: '/health' },
  { name: 'api-gateway', host: 'localhost', port: 8080, healthEndpoint: '/health' },
];

interface HealthCheckResult {
  serviceName: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  responseTimeMs: number;
  statusCode: number | null;
  message: string | null;
  timestamp: Date;
}

let latestHealthResults: HealthCheckResult[] = [];
let lastCheckTime: Date | null = null;

function getLatestHealthResults() {
  return { results: latestHealthResults, lastCheckTime };
}

async function checkServiceHealth(service: (typeof SERVICES_TO_CHECK)[0]): Promise<HealthCheckResult> {
  const url = `http://${service.host}:${service.port}${service.healthEndpoint}`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseTimeMs = Date.now() - startTime;

    if (response.ok) {
      const data = (await response.json().catch((e: unknown) => {
        logger.warn('[HEALTH CHECK] Failed to parse health response body', {
          service: service.name,
          error: e instanceof Error ? e.message : String(e),
        });
        return {};
      })) as { status?: string };
      const status = data.status === 'healthy' ? 'healthy' : data.status === 'degraded' ? 'degraded' : 'healthy';
      return {
        serviceName: service.name,
        status,
        responseTimeMs,
        statusCode: response.status,
        message: null,
        timestamp: new Date(),
      };
    } else {
      return {
        serviceName: service.name,
        status: 'unhealthy',
        responseTimeMs,
        statusCode: response.status,
        message: `HTTP ${response.status}`,
        timestamp: new Date(),
      };
    }
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      serviceName: service.name,
      status: 'unhealthy',
      responseTimeMs,
      statusCode: null,
      message: errorMessage.includes('abort') ? 'Timeout (5s)' : errorMessage,
      timestamp: new Date(),
    };
  }
}

async function executeHealthChecks(): Promise<void> {
  logger.debug('Executing scheduled health checks...');

  const checkPromises = SERVICES_TO_CHECK.map(service => checkServiceHealth(service));
  const results = await Promise.all(checkPromises);

  latestHealthResults = results;
  lastCheckTime = new Date();

  const healthy = results.filter(r => r.status === 'healthy').length;
  const unhealthy = results.filter(r => r.status === 'unhealthy').length;

  for (const result of results) {
    if (result.status === 'unhealthy') {
      logger.warn(`Service ${result.serviceName} is unhealthy`, {
        statusCode: result.statusCode,
        message: result.message,
        responseTimeMs: result.responseTimeMs,
      });
    }
  }

  const degraded = results.filter(r => r.status === 'degraded').length;
  const hasIssues = unhealthy > 0 || degraded > 0;
  logger[hasIssues ? 'info' : 'debug']('Health check cycle completed', {
    total: results.length,
    healthy,
    unhealthy,
    degraded,
  });
}

export { getLatestHealthResults };

function startScheduler(): void {
  if (schedulerRunning) return;

  schedulerInstance = createIntervalScheduler({
    name: 'monitoring-health-check',
    serviceName: 'system-service',
    intervalMs: 30000,
    handler: () => executeHealthChecks(),
  });
  schedulerInstance.start();

  schedulerRunning = true;
  logger.debug('Health check scheduler started');
}

function stopScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
  schedulerRunning = false;
  logger.info('Health check scheduler stopped');
}

async function initializeScheduler(): Promise<void> {
  try {
    const isEnabled = await getSchedulerEnabled();
    if (isEnabled) {
      startScheduler();
    } else {
      logger.info('Health check scheduler is disabled, not starting');
    }
  } catch (error) {
    logger.error('Failed to initialize scheduler', {
      error: serializeError(error),
    });
  }
}

void initializeScheduler();

router.get('/health', async (req, res) => {
  try {
    const isEnabled = await getSchedulerEnabled();

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
        running: schedulerRunning,
        taskCount: schedulerRunning ? 1 : 0,
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

    sendSuccess(res, {
      schedulerEnabled: isEnabled,
      schedulerRunning,
      taskCount: schedulerRunning ? 1 : 0,
      intervalSeconds: 30,
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

    if (schedulerEnabled) {
      startScheduler();
      logger.info('Health check scheduler started via API');
    } else {
      stopScheduler();
      logger.info('Health check scheduler stopped via API');
    }

    sendSuccess(res, {
      schedulerEnabled,
      schedulerRunning,
      taskCount: schedulerRunning ? 1 : 0,
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
    startScheduler();

    sendSuccess(res, { message: 'Scheduler started', status: 'active' });
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
    stopScheduler();

    sendSuccess(res, { message: 'Scheduler stopped', status: 'inactive' });
  } catch (error: unknown) {
    logger.error('Failed to stop scheduler', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to stop scheduler', req);
    return;
  }
});

router.post('/scheduler/trigger', async (req, res) => {
  try {
    await executeHealthChecks();
    sendSuccess(res, { message: 'Health checks triggered manually', triggered: true });
  } catch (error: unknown) {
    logger.error('Failed to trigger health checks', { error: serializeError(error) });
    ServiceErrors.fromException(res, error, 'Failed to trigger health checks', req);
    return;
  }
});

router.get('/scheduler/status', async (req, res) => {
  try {
    const isEnabled = await getSchedulerEnabled();

    sendSuccess(res, {
      enabled: isEnabled,
      running: schedulerRunning,
      taskCount: schedulerRunning ? 1 : 0,
      lastCheck: new Date().toISOString(),
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
