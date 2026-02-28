import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { metricsAggregates, type MetricsAggregate, type NewMetricsAggregate } from '../../../schema/system-schema';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('metrics-aggregate-service');

export type AggregationWindow = '1m' | '5m' | '1h' | '1d';
export type MetricType = 'gauge' | 'counter' | 'histogram';

export interface RecordMetricAggregateParams {
  serviceName: string;
  metricName: string;
  metricType: MetricType;
  value: number;
  labels?: Record<string, unknown>;
  aggregationWindow: AggregationWindow;
}

export interface QueryMetricAggregateParams {
  serviceName?: string;
  metricName?: string;
  metricType?: MetricType;
  aggregationWindow?: AggregationWindow;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

export class MetricsAggregateService {
  constructor(private readonly db: ReturnType<typeof import('drizzle-orm/neon-http').drizzle>) {}

  async recordAggregate(params: RecordMetricAggregateParams): Promise<MetricsAggregate> {
    const [entry] = await this.db
      .insert(metricsAggregates)
      .values({
        id: sql`gen_random_uuid()`,
        serviceName: params.serviceName,
        metricName: params.metricName,
        metricType: params.metricType,
        value: String(params.value),
        labels: params.labels || {},
        aggregationWindow: params.aggregationWindow,
        timestamp: new Date(),
      })
      .returning();

    logger.debug('Metric aggregate recorded', {
      serviceName: params.serviceName,
      metricName: params.metricName,
      value: params.value,
      window: params.aggregationWindow,
    });

    return entry;
  }

  async queryAggregates(params: QueryMetricAggregateParams): Promise<{ metrics: MetricsAggregate[]; total: number }> {
    const conditions = [];

    if (params.serviceName) conditions.push(eq(metricsAggregates.serviceName, params.serviceName));
    if (params.metricName) conditions.push(eq(metricsAggregates.metricName, params.metricName));
    if (params.metricType) conditions.push(eq(metricsAggregates.metricType, params.metricType));
    if (params.aggregationWindow) conditions.push(eq(metricsAggregates.aggregationWindow, params.aggregationWindow));
    if (params.startTime) conditions.push(gte(metricsAggregates.timestamp, params.startTime));
    if (params.endTime) conditions.push(lte(metricsAggregates.timestamp, params.endTime));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [metrics, countResult] = await Promise.all([
      this.db
        .select()
        .from(metricsAggregates)
        .where(whereClause)
        .orderBy(desc(metricsAggregates.timestamp))
        .limit(params.limit || 100)
        .offset(params.offset || 0),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(metricsAggregates)
        .where(whereClause),
    ]);

    return {
      metrics,
      total: Number(countResult[0]?.count) || 0,
    };
  }

  async getLatestByService(serviceName: string, limit: number = 20): Promise<MetricsAggregate[]> {
    return this.db
      .select()
      .from(metricsAggregates)
      .where(eq(metricsAggregates.serviceName, serviceName))
      .orderBy(desc(metricsAggregates.timestamp))
      .limit(limit);
  }

  async getServiceSummary(
    serviceName: string,
    windowHours: number = 1
  ): Promise<{
    serviceName: string;
    metricCount: number;
    metrics: Array<{ metricName: string; latestValue: string; metricType: string }>;
  }> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const results = await this.db
      .select({
        metricName: metricsAggregates.metricName,
        latestValue: sql<string>`(array_agg(${metricsAggregates.value} ORDER BY ${metricsAggregates.timestamp} DESC))[1]`,
        metricType: sql<string>`(array_agg(${metricsAggregates.metricType} ORDER BY ${metricsAggregates.timestamp} DESC))[1]`,
      })
      .from(metricsAggregates)
      .where(and(eq(metricsAggregates.serviceName, serviceName), gte(metricsAggregates.timestamp, since)))
      .groupBy(metricsAggregates.metricName);

    return {
      serviceName,
      metricCount: results.length,
      metrics: results,
    };
  }
}
