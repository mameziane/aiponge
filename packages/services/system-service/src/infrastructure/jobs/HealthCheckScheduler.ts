import { BaseScheduler, SchedulerExecutionResult } from '@aiponge/platform-core';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { healthChecks, healthCheckResults, systemConfig } from '../../schema/system-schema';
import { eq, lt, sql } from 'drizzle-orm';
import { AlertRuleService } from '../../domains/monitoring/services/AlertRuleService';

const db = getDatabase('health-check-scheduler');

interface ServiceToCheck {
  name: string;
  host: string;
  port: number;
  healthEndpoint: string;
}

interface HealthCheckResult {
  serviceName: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  responseTimeMs: number;
  statusCode: number | null;
  message: string | null;
  timestamp: Date;
}

function resolveServiceHost(serviceName: string, defaultPort: number): { host: string; port: number } {
  const envVar = `${serviceName.toUpperCase().replace(/-/g, '_')}_URL`;
  const urlStr = process.env[envVar];
  if (urlStr) {
    try {
      const url = new URL(urlStr);
      return { host: url.hostname, port: parseInt(url.port) || defaultPort };
    } catch {
      /* fall through */
    }
  }
  return { host: 'localhost', port: defaultPort };
}

const SERVICES_TO_CHECK: ServiceToCheck[] = [
  { name: 'system-service', ...resolveServiceHost('system-service', 3001), healthEndpoint: '/health' },
  { name: 'storage-service', ...resolveServiceHost('storage-service', 3002), healthEndpoint: '/health' },
  { name: 'user-service', ...resolveServiceHost('user-service', 3003), healthEndpoint: '/health' },
  { name: 'ai-config-service', ...resolveServiceHost('ai-config-service', 3004), healthEndpoint: '/health' },
  { name: 'ai-content-service', ...resolveServiceHost('ai-content-service', 3005), healthEndpoint: '/health' },
  { name: 'ai-analytics-service', ...resolveServiceHost('ai-analytics-service', 3006), healthEndpoint: '/health' },
  { name: 'music-service', ...resolveServiceHost('music-service', 3007), healthEndpoint: '/health' },
  { name: 'api-gateway', ...resolveServiceHost('api-gateway', 8080), healthEndpoint: '/health' },
];

// Cache: serviceName → sys_health_checks.id
let healthCheckIdCache: Map<string, string> | null = null;

async function getHealthCheckIdMap(): Promise<Map<string, string>> {
  if (healthCheckIdCache) return healthCheckIdCache;
  try {
    const rows = await db.select({ id: healthChecks.id, serviceName: healthChecks.serviceName }).from(healthChecks);
    healthCheckIdCache = new Map(rows.map(r => [r.serviceName, r.id]));
  } catch {
    healthCheckIdCache = new Map();
  }
  return healthCheckIdCache;
}

// Shared state for the /health-summary endpoint
let latestResults: HealthCheckResult[] = [];
let lastCheckTime: Date | null = null;

export function getLatestHealthResults() {
  return { results: latestResults, lastCheckTime };
}

async function checkServiceHealth(service: ServiceToCheck): Promise<HealthCheckResult> {
  const url = `http://${service.host}:${service.port}${service.healthEndpoint}`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);

    const responseTimeMs = Date.now() - startTime;

    if (response.ok) {
      const data = (await response.json().catch(() => ({}))) as { status?: string };
      const status = data.status === 'healthy' ? 'healthy' : data.status === 'degraded' ? 'degraded' : 'healthy';
      return {
        serviceName: service.name,
        status,
        responseTimeMs,
        statusCode: response.status,
        message: null,
        timestamp: new Date(),
      };
    }

    return {
      serviceName: service.name,
      status: 'unhealthy',
      responseTimeMs,
      statusCode: response.status,
      message: `HTTP ${response.status}`,
      timestamp: new Date(),
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      serviceName: service.name,
      status: 'unhealthy',
      responseTimeMs,
      statusCode: null,
      message: msg.includes('abort') ? 'Timeout (5s)' : msg,
      timestamp: new Date(),
    };
  }
}

const SCHEDULER_CONFIG_KEY = 'monitoring_scheduler_enabled';

export class HealthCheckScheduler extends BaseScheduler {
  private alertRuleService = new AlertRuleService(db);

  get name(): string {
    return 'health-check';
  }

  get serviceName(): string {
    return 'system-service';
  }

  constructor() {
    super({
      cronExpression: '* * * * *', // every minute (BaseScheduler minimum)
      enabled: true,
      maxRetries: 0,
      timeoutMs: 25000,
    });
    this.initLogger();
  }

  protected async isEffectivelyEnabled(): Promise<boolean> {
    try {
      const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, SCHEDULER_CONFIG_KEY));
      if (config && typeof config.value === 'object' && config.value !== null) {
        return (config.value as Record<string, unknown>).enabled === true;
      }
    } catch {
      // default disabled
    }
    return false;
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const enabled = await this.isEffectivelyEnabled();
    if (!enabled) {
      return { success: true, message: 'Health check scheduler is disabled', durationMs: 0 };
    }

    const startTime = Date.now();

    const results = await Promise.all(SERVICES_TO_CHECK.map(s => checkServiceHealth(s)));
    latestResults = results;
    lastCheckTime = new Date();

    const healthy = results.filter(r => r.status === 'healthy').length;
    const unhealthy = results.filter(r => r.status === 'unhealthy').length;
    const degraded = results.filter(r => r.status === 'degraded').length;

    // Persist results to sys_health_check_results
    try {
      const idMap = await getHealthCheckIdMap();
      const rowsToInsert = results
        .filter(r => idMap.has(r.serviceName))
        .map(r => ({
          id: sql`gen_random_uuid()`,
          healthCheckId: idMap.get(r.serviceName)!,
          status: r.status,
          responseTimeMs: r.responseTimeMs,
          errorMessage: r.message,
          metadata: { statusCode: r.statusCode },
          timestamp: r.timestamp,
        }));

      if (rowsToInsert.length > 0) {
        await db.insert(healthCheckResults).values(rowsToInsert);
      }

      // Retention: delete results older than 7 days (~3% chance per cycle)
      if (Math.random() < 0.03) {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await db.delete(healthCheckResults).where(lt(healthCheckResults.timestamp, cutoff));
      }
    } catch (error) {
      this.logger.warn('Failed to persist health check results', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Evaluate alert rules for each service
    try {
      for (const result of results) {
        const statusValue = result.status === 'healthy' ? 1 : result.status === 'degraded' ? 0.5 : 0;
        await this.alertRuleService.evaluateRules({
          serviceName: result.serviceName,
          metricName: 'health_status',
          currentValue: statusValue,
          metadata: { responseTimeMs: result.responseTimeMs, statusCode: result.statusCode },
        });
      }
    } catch (error) {
      this.logger.warn('Failed to evaluate alert rules', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      message: `Health checks completed: ${healthy} healthy, ${unhealthy} unhealthy, ${degraded} degraded`,
      data: { total: results.length, healthy, unhealthy, degraded },
      durationMs,
    };
  }
}
