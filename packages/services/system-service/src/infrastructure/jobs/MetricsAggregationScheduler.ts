import { BaseScheduler, SchedulerExecutionResult, createLogger, ServiceLocator } from '@aiponge/platform-core';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { platformMetrics, metricsAggregates } from '../../schema/system-schema';
import { eq, desc, lt, sql } from 'drizzle-orm';

const logger = createLogger('metrics-aggregation-scheduler');
const db = getDatabase('metrics-aggregation');

const METRIC_TYPE = 'product-metrics';
const EXPIRES_IN_MS = 10 * 60 * 1000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchServiceMetrics(serviceName: string, endpoint: string): Promise<Record<string, unknown>> {
  try {
    const serviceUrl = ServiceLocator.getServiceUrl(serviceName);
    const response = await fetchWithTimeout(
      `${serviceUrl}${endpoint}`,
      {
        headers: {
          'x-request-id': `metrics-aggregation-${serviceName}-${Date.now()}`,
          'x-service-auth': 'system-service',
        },
      },
      10000
    );

    if (!response.ok) {
      logger.warn(`Failed to fetch metrics from ${serviceName}`, {
        status: response.status,
        endpoint,
      });
      return {};
    }

    const result = (await response.json()) as { success: boolean; data?: Record<string, unknown> };
    return result.success && result.data ? result.data : {};
  } catch (error) {
    logger.error(`Error fetching metrics from ${serviceName}`, {
      error: error instanceof Error ? error.message : String(error),
      endpoint,
    });
    return {};
  }
}

export class MetricsAggregationScheduler extends BaseScheduler {
  get name(): string {
    return 'metrics-aggregation';
  }

  get serviceName(): string {
    return 'system-service';
  }

  constructor() {
    super({
      cronExpression: '*/5 * * * *',
      enabled: process.env.NODE_ENV === 'production',
      maxRetries: 1,
      timeoutMs: 55000,
    });
    this.initLogger();
  }

  protected async execute(): Promise<SchedulerExecutionResult> {
    const startTime = Date.now();
    const computedAt = new Date();
    const expiresAt = new Date(computedAt.getTime() + EXPIRES_IN_MS);

    const [userMetrics, musicMetrics] = await Promise.all([
      fetchServiceMetrics('user-service', '/api/admin/product-metrics'),
      fetchServiceMetrics('music-service', '/admin/product-metrics'),
    ]);

    const mergedPayload = {
      userService: userMetrics,
      musicService: musicMetrics,
      computedAt: computedAt.toISOString(),
    };

    const [existing] = await db
      .select()
      .from(platformMetrics)
      .where(eq(platformMetrics.metricType, METRIC_TYPE))
      .orderBy(desc(platformMetrics.computedAt))
      .limit(1);

    if (existing) {
      await db
        .update(platformMetrics)
        .set({
          payload: mergedPayload,
          computedAt,
          expiresAt,
          version: (existing.version ?? 0) + 1,
        })
        .where(eq(platformMetrics.id, existing.id));
    } else {
      await db.insert(platformMetrics).values({
        metricType: METRIC_TYPE,
        payload: mergedPayload,
        computedAt,
        expiresAt,
      });
    }

    // Also decompose fetched metrics into sys_metrics rows
    try {
      const metricRows: Array<{ service: string; name: string; value: number }> = [];

      for (const [key, val] of Object.entries(userMetrics)) {
        if (typeof val === 'number') metricRows.push({ service: 'user-service', name: key, value: val });
      }
      for (const [key, val] of Object.entries(musicMetrics)) {
        if (typeof val === 'number') metricRows.push({ service: 'music-service', name: key, value: val });
      }

      if (metricRows.length > 0) {
        await db.insert(metricsAggregates).values(
          metricRows.map(m => ({
            id: sql`gen_random_uuid()`,
            serviceName: m.service,
            metricName: m.name,
            metricType: 'gauge' as const,
            value: String(m.value),
            labels: {},
            aggregationWindow: '5m' as const,
            timestamp: computedAt,
          }))
        );
      }

      // Retention: delete sys_metrics rows older than 30 days (~3% chance per cycle)
      if (Math.random() < 0.03) {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        await db.delete(metricsAggregates).where(lt(metricsAggregates.timestamp, cutoff));
      }
    } catch (error) {
      logger.warn('Failed to write decomposed metrics to sys_metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const durationMs = Date.now() - startTime;

    logger.info('Metrics aggregation completed', {
      durationMs,
      hasUserMetrics: Object.keys(userMetrics).length > 0,
      hasMusicMetrics: Object.keys(musicMetrics).length > 0,
      mode: existing ? 'update' : 'insert',
    });

    return {
      success: true,
      message: `Product metrics aggregated and stored (${existing ? 'updated' : 'inserted'})`,
      data: {
        durationMs,
        metricType: METRIC_TYPE,
        expiresAt: expiresAt.toISOString(),
      },
      durationMs,
    };
  }
}
