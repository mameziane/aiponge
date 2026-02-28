import type { Pool } from 'pg';
import { MetricEntry, AggregatedMetric, MetricFilter } from '../../../domains/entities/MetricEntry.js';
import { getLogger } from '../../../config/service-urls';
import { safeJsonParse } from './utils';

const logger = getLogger('ai-analytics-service-metrics-repository');

export class MetricsRepository {
  constructor(private readonly pool: Pool) {}

  async recordMetric(entry: MetricEntry): Promise<void> {
    const query = `
      INSERT INTO aia_system_metrics (
        timestamp, service_name, metric_name, metric_value, 
        metric_type, unit, tags, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    const values = [
      entry.timestamp,
      entry.serviceName,
      entry.name,
      entry.value,
      entry.metricType,
      entry.unit || null,
      entry.tags ? JSON.stringify(entry.tags) : null,
      entry.source,
    ];

    await this.pool.query(query, values);
  }

  async recordMetrics(entries: MetricEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO aia_system_metrics (
          timestamp, service_name, metric_name, metric_value, 
          metric_type, unit, tags, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      for (const entry of entries) {
        const values = [
          entry.timestamp,
          entry.serviceName,
          entry.name,
          entry.value,
          entry.metricType,
          entry.unit || null,
          entry.tags ? JSON.stringify(entry.tags) : null,
          entry.source,
        ];

        await client.query(query, values);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getMetrics(filter: MetricFilter): Promise<MetricEntry[]> {
    let query = `
      SELECT timestamp, service_name, metric_name, metric_value, 
             metric_type, unit, tags, source
      FROM aia_system_metrics
      WHERE 1=1
    `;

    const values: (string | number | Date | boolean | null)[] = [];
    let paramIndex = 1;

    if (filter.serviceName) {
      query += ` AND service_name = $${paramIndex++}`;
      values.push(filter.serviceName);
    }

    if (filter.metricName) {
      query += ` AND metric_name = $${paramIndex++}`;
      values.push(filter.metricName);
    }

    if (filter.startTime) {
      query += ` AND timestamp >= $${paramIndex++}`;
      values.push(filter.startTime);
    }

    if (filter.endTime) {
      query += ` AND timestamp <= $${paramIndex++}`;
      values.push(filter.endTime);
    }

    if (filter.metricType) {
      query += ` AND metric_type = $${paramIndex++}`;
      values.push(filter.metricType);
    }

    if (filter.source) {
      query += ` AND source = $${paramIndex++}`;
      values.push(filter.source);
    }

    query += ` ORDER BY timestamp DESC LIMIT 10000`;

    const result = await this.pool.query(query, values);

    return result.rows.map(row => ({
      name: row.metric_name,
      value: parseFloat(row.metric_value),
      timestamp: new Date(row.timestamp),
      tags: row.tags ? safeJsonParse(row.tags, undefined) : undefined,
      serviceName: row.service_name,
      source: row.source,
      metricType: row.metric_type as 'counter' | 'gauge' | 'histogram' | 'summary',
      unit: row.unit,
    }));
  }

  async getAggregatedMetrics(
    metricName: string,
    serviceName: string,
    startTime: Date,
    endTime: Date,
    aggregationWindow: 'minute' | 'hour' | 'day'
  ): Promise<AggregatedMetric[]> {
    const timeGroup = aggregationWindow === 'minute' ? '1 minute' : aggregationWindow === 'hour' ? '1 hour' : '1 day';

    const query = `
      SELECT 
        time_bucket($1::interval, timestamp) AS time_bucket,
        COUNT(*) as count,
        SUM(metric_value) as sum,
        MIN(metric_value) as min,
        MAX(metric_value) as max,
        AVG(metric_value) as avg,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value) as p50,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) as p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY metric_value) as p99,
        MAX(timestamp) as last_updated
      FROM aia_system_metrics
      WHERE metric_name = $2 
        AND service_name = $3
        AND timestamp >= $4 
        AND timestamp <= $5
      GROUP BY time_bucket
      ORDER BY time_bucket
    `;

    const result = await this.pool.query(query, [timeGroup, metricName, serviceName, startTime, endTime]);

    return result.rows.map(row => ({
      count: parseInt(row.count),
      sum: parseFloat(row.sum),
      min: parseFloat(row.min),
      max: parseFloat(row.max),
      avg: parseFloat(row.avg),
      lastUpdated: new Date(row.last_updated),
      p50: row.p50 ? parseFloat(row.p50) : undefined,
      p95: row.p95 ? parseFloat(row.p95) : undefined,
      p99: row.p99 ? parseFloat(row.p99) : undefined,
    }));
  }

  async getMetricTimeSeries(
    metricName: string,
    startTime: Date,
    endTime: Date,
    intervalMinutes: number,
    tags?: Record<string, string>
  ): Promise<Array<{ timestamp: Date; value: number }>> {
    let query = `
      SELECT 
        time_bucket($1::interval, timestamp) AS time_bucket,
        AVG(metric_value) as value
      FROM aia_system_metrics
      WHERE metric_name = $2 
        AND timestamp >= $3 
        AND timestamp <= $4
    `;

    const values: (string | number | Date | boolean | null)[] = [
      `${intervalMinutes} minutes`,
      metricName,
      startTime,
      endTime,
    ];
    let paramIndex = 5;

    if (tags) {
      for (const [key, value] of Object.entries(tags)) {
        query += ` AND tags ->> $${paramIndex++} = $${paramIndex++}`;
        values.push(key, value);
      }
    }

    query += ` GROUP BY time_bucket ORDER BY time_bucket`;

    const result = await this.pool.query(query, values);

    return result.rows.map(row => ({
      timestamp: new Date(row.time_bucket),
      value: parseFloat(row.value),
    }));
  }

  async deleteOldMetrics(olderThan: Date): Promise<number> {
    const query = 'DELETE FROM aia_system_metrics WHERE timestamp < $1';
    const result = await this.pool.query(query, [olderThan]);
    return result.rowCount || 0;
  }

  async getMetricNames(serviceName?: string): Promise<string[]> {
    let query = 'SELECT DISTINCT metric_name FROM aia_system_metrics';
    const values: (string | number | Date | boolean | null)[] = [];

    if (serviceName) {
      query += ' WHERE service_name = $1';
      values.push(serviceName);
    }

    query += ' ORDER BY metric_name';

    const result = await this.pool.query(query, values);
    return result.rows.map(row => row.metric_name);
  }

  async getServiceNames(): Promise<string[]> {
    const query = 'SELECT DISTINCT service_name FROM aia_system_metrics ORDER BY service_name';
    const result = await this.pool.query(query);
    return result.rows.map(row => row.service_name);
  }

  async exportPrometheusMetrics(serviceName?: string): Promise<string> {
    let query = `
      SELECT metric_name, metric_value, tags, service_name, metric_type, unit
      FROM aia_system_metrics
      WHERE timestamp >= NOW() - INTERVAL '5 minutes'
    `;

    const values: (string | number | Date | boolean | null)[] = [];

    if (serviceName) {
      query += ' AND service_name = $1';
      values.push(serviceName);
    }

    query += ' ORDER BY metric_name';

    const result = await this.pool.query(query, values);

    let output = '';
    let currentMetric = '';

    for (const row of result.rows) {
      if (row.metric_name !== currentMetric) {
        if (row.unit) {
          output += `# HELP ${row.metric_name} ${row.metric_name} (${row.unit})\n`;
        } else {
          output += `# HELP ${row.metric_name} ${row.metric_name}\n`;
        }
        output += `# TYPE ${row.metric_name} ${row.metric_type}\n`;
        currentMetric = row.metric_name;
      }

      const tags = row.tags ? safeJsonParse(row.tags, {} as Record<string, string>) : ({} as Record<string, string>);
      tags['service'] = row.service_name;

      const tagString = Object.entries(tags)
        .map(([key, value]) => `${key}="${value}"`)
        .join(',');

      output += `${row.metric_name}{${tagString}} ${row.metric_value}\n`;
    }

    return output;
  }
}
