import type { Pool } from 'pg';
import {
  ProviderAnalytics,
  ProviderHealthMetrics,
  ProviderPerformanceMetrics,
  ProviderComparison,
  ProviderUsageTrends,
} from '../../../domains/entities/ProviderAnalytics.js';
import { errorMessage } from '@aiponge/platform-core';
import { getLogger } from '../../../config/service-urls';

const logger = getLogger('ai-analytics-service-provider-usage-repository');

interface ProviderUsageFilter {
  providerId?: string;
  operation?: string;
  userId?: string;
  success?: boolean;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

export class ProviderUsageRepository {
  constructor(private readonly pool: Pool) {}

  async recordProviderUsage(usage: ProviderAnalytics): Promise<void> {
    const query = `
      INSERT INTO aia_provider_usage_logs (
        timestamp, provider_id, provider_type, operation, request_id, user_id,
        request_size, response_size, response_time_ms, queue_time_ms, processing_time_ms,
        cost, input_tokens, output_tokens, success, error_type, error_code,
        http_status_code, circuit_breaker_status, rate_limit_remaining, rate_limit_reset, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    `;

    const values = [
      usage.timestamp,
      usage.providerId,
      usage.providerType,
      usage.operation,
      usage.requestId || null,
      usage.userId || null,
      usage.requestSize || null,
      usage.responseSize || null,
      usage.responseTimeMs,
      usage.queueTimeMs || null,
      usage.processingTimeMs || null,
      usage.cost,
      usage.inputTokens || null,
      usage.outputTokens || null,
      usage.success,
      usage.errorType || null,
      usage.errorCode || null,
      usage.httpStatusCode || null,
      usage.circuitBreakerStatus || null,
      usage.rateLimitRemaining || null,
      usage.rateLimitReset || null,
      usage.metadata ? JSON.stringify(usage.metadata) : null,
    ];

    await this.pool.query(query, values);
  }

  async recordProviderUsagesBatch(usages: ProviderAnalytics[]): Promise<void> {
    if (usages.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO aia_provider_usage_logs (
          timestamp, provider_id, provider_type, operation, request_id, user_id,
          request_size, response_size, response_time_ms, queue_time_ms, processing_time_ms,
          cost, input_tokens, output_tokens, success, error_type, error_code,
          http_status_code, circuit_breaker_status, rate_limit_remaining, rate_limit_reset, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      `;

      for (const usage of usages) {
        const values = [
          usage.timestamp,
          usage.providerId,
          usage.providerType,
          usage.operation,
          usage.requestId || null,
          usage.userId || null,
          usage.requestSize || null,
          usage.responseSize || null,
          usage.responseTimeMs,
          usage.queueTimeMs || null,
          usage.processingTimeMs || null,
          usage.cost,
          usage.inputTokens || null,
          usage.outputTokens || null,
          usage.success,
          usage.errorType || null,
          usage.errorCode || null,
          usage.httpStatusCode || null,
          usage.circuitBreakerStatus || null,
          usage.rateLimitRemaining || null,
          usage.rateLimitReset || null,
          usage.metadata ? JSON.stringify(usage.metadata) : null,
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

  async getProviderUsage(filter: ProviderUsageFilter): Promise<ProviderAnalytics[]> {
    try {
      let query = `
        SELECT 
          id, timestamp, provider_id, provider_type, operation,
          request_id, user_id, request_size, response_size,
          response_time_ms, queue_time_ms, processing_time_ms,
          cost, input_tokens, output_tokens, success,
          error_type, error_code, http_status_code,
          circuit_breaker_status, metadata
        FROM aia_provider_usage_logs
        WHERE 1=1
      `;
      const values: (string | number | Date | boolean | null)[] = [];
      let paramIndex = 1;

      if (filter.providerId) {
        query += ` AND provider_id = $${paramIndex++}`;
        values.push(filter.providerId);
      }
      if (filter.operation) {
        query += ` AND operation = $${paramIndex++}`;
        values.push(filter.operation);
      }
      if (filter.userId) {
        query += ` AND user_id = $${paramIndex++}`;
        values.push(filter.userId);
      }
      if (filter.success !== undefined) {
        query += ` AND success = $${paramIndex++}`;
        values.push(filter.success);
      }
      if (filter.startTime) {
        query += ` AND timestamp >= $${paramIndex++}`;
        values.push(filter.startTime);
      }
      if (filter.endTime) {
        query += ` AND timestamp <= $${paramIndex++}`;
        values.push(filter.endTime);
      }

      query += ` ORDER BY timestamp DESC LIMIT ${filter.limit || 100}`;
      if (filter.offset) {
        query += ` OFFSET ${filter.offset}`;
      }

      const result = await this.pool.query(query, values);

      return result.rows.map(row => ({
        providerId: row.provider_id,
        providerType: row.provider_type,
        operation: row.operation,
        requestId: row.request_id,
        userId: row.user_id,
        timestamp: new Date(row.timestamp),
        success: row.success,
        responseTimeMs: row.response_time_ms,
        queueTimeMs: row.queue_time_ms,
        processingTimeMs: row.processing_time_ms,
        cost: parseFloat(row.cost) || 0,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        errorType: row.error_type,
        errorCode: row.error_code,
        httpStatusCode: row.http_status_code,
        circuitBreakerStatus: row.circuit_breaker_status,
        metadata: row.metadata,
      }));
    } catch (error) {
      logger.error('Failed to get provider usage', {
        error: error instanceof Error ? error.message : String(error),
        filter,
        method: 'getProviderUsage',
      });
      return [];
    }
  }

  async getProviderPerformanceMetrics(
    providerId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ProviderPerformanceMetrics> {
    logger.warn('getProviderPerformanceMetrics not implemented - returning empty metrics', {
      providerId,
      method: 'getProviderPerformanceMetrics',
    });
    return {
      providerId,
      timeRange: { start: startTime, end: endTime },
      requestCount: 0,
      successRate: 0,
      averageLatency: 0,
      medianLatency: 0,
      p95Latency: 0,
      totalCost: 0,
      averageRequestCost: 0,
      errorRate: 0,
      topErrors: [],
      operationBreakdown: {},
      costTrends: [],
    };
  }

  async getProviderComparison(operation: string, startTime: Date, endTime: Date): Promise<ProviderComparison> {
    logger.warn('getProviderComparison not implemented - returning empty comparison', {
      operation,
      method: 'getProviderComparison',
    });
    return {
      operation,
      timeRange: { start: startTime, end: endTime },
      providers: [],
      recommendations: [],
    };
  }

  async getProviderUsageTrends(
    providerId: string,
    timePeriod: 'hour' | 'day' | 'week' | 'month',
    startTime: Date,
    endTime: Date
  ): Promise<ProviderUsageTrends> {
    logger.warn('getProviderUsageTrends not implemented - returning empty trends', {
      providerId,
      timePeriod,
      method: 'getProviderUsageTrends',
    });
    return {
      providerId,
      timePeriod,
      data: [],
    };
  }

  async recordProviderHealth(health: ProviderHealthMetrics): Promise<void> {
    logger.warn('recordProviderHealth not implemented - provider health table dropped post-launch', {
      providerId: health.providerId,
      method: 'recordProviderHealth',
    });
  }

  async getProviderHealth(providerId?: string): Promise<ProviderHealthMetrics[]> {
    logger.warn('getProviderHealth not implemented - use provider configs health status instead', {
      providerId,
      method: 'getProviderHealth',
    });
    return [];
  }

  async getProviderCostAnalytics(
    startTime: Date,
    endTime: Date,
    groupBy: 'provider' | 'operation' | 'user'
  ): Promise<Array<{ group: string; totalCost: number; requestCount: number; averageCost: number }>> {
    try {
      const groupColumn = groupBy === 'provider' ? 'provider_id' : groupBy === 'operation' ? 'operation' : 'user_id';

      const query = `
        SELECT 
          COALESCE(${groupColumn}, 'unknown') as "group",
          COALESCE(SUM(cost), 0)::decimal as "totalCost",
          COUNT(*)::integer as "requestCount",
          COALESCE(AVG(cost), 0)::decimal as "averageCost"
        FROM aia_provider_usage_logs
        WHERE timestamp >= $1 AND timestamp <= $2
        GROUP BY ${groupColumn}
        ORDER BY "totalCost" DESC
        LIMIT 100
      `;

      const result = await this.pool.query(query, [startTime, endTime]);

      return result.rows.map(row => ({
        group: row.group,
        totalCost: parseFloat(row.totalCost) || 0,
        requestCount: parseInt(row.requestCount) || 0,
        averageCost: parseFloat(row.averageCost) || 0,
      }));
    } catch (error) {
      logger.error('Failed to get provider cost analytics', {
        error: error instanceof Error ? error.message : String(error),
        groupBy,
        method: 'getProviderCostAnalytics',
      });
      return [];
    }
  }

  async getTopProvidersByUsage(
    startTime: Date,
    endTime: Date,
    limit: number
  ): Promise<
    Array<{ providerId: string; requestCount: number; totalCost: number; averageLatency: number; successRate: number }>
  > {
    try {
      const query = `
        SELECT 
          provider_id as "providerId",
          COUNT(*)::integer as "requestCount",
          COALESCE(SUM(cost), 0)::decimal as "totalCost",
          COALESCE(AVG(response_time_ms), 0)::decimal as "averageLatency",
          (COUNT(*) FILTER (WHERE success = true)::decimal / NULLIF(COUNT(*), 0) * 100)::decimal as "successRate"
        FROM aia_provider_usage_logs
        WHERE timestamp >= $1 AND timestamp <= $2
        GROUP BY provider_id
        ORDER BY "requestCount" DESC
        LIMIT $3
      `;

      const result = await this.pool.query(query, [startTime, endTime, limit]);

      return result.rows.map(row => ({
        providerId: row.providerId || 'unknown',
        requestCount: parseInt(row.requestCount) || 0,
        totalCost: parseFloat(row.totalCost) || 0,
        averageLatency: parseFloat(row.averageLatency) || 0,
        successRate: parseFloat(row.successRate) || 0,
      }));
    } catch (error) {
      logger.error('Failed to get top providers by usage', {
        error: error instanceof Error ? error.message : String(error),
        limit,
        method: 'getTopProvidersByUsage',
      });
      return [];
    }
  }

  async getTopProvidersByError(
    startTime: Date,
    endTime: Date,
    limit: number
  ): Promise<
    Array<{
      providerId: string;
      errorCount: number;
      errorRate: number;
      topErrors: Array<{ errorType: string; count: number }>;
    }>
  > {
    logger.warn('getTopProvidersByError not implemented - returning empty array', {
      limit,
      method: 'getTopProvidersByError',
    });
    return [];
  }

  async getProviderUsageSummary(): Promise<{
    totalRequests: number;
    successRate: number;
    totalCost: number;
    byProvider: Record<string, { requests: number; cost: number; avgLatency: number }>;
  }> {
    try {
      const result = await this.pool.query(`
        SELECT 
          provider_id,
          COUNT(*) as total_requests,
          SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as success_count,
          SUM(COALESCE(cost, 0)) as total_cost,
          AVG(response_time_ms) as avg_latency
        FROM aia_provider_usage_logs
        WHERE timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY provider_id
      `);

      const byProvider: Record<string, { requests: number; cost: number; avgLatency: number }> = {};
      let totalRequests = 0;
      let totalSuccess = 0;
      let totalCost = 0;

      for (const row of result.rows) {
        const providerId = row.provider_id || 'unknown';
        const requests = parseInt(row.total_requests) || 0;
        const successCount = parseInt(row.success_count) || 0;
        const cost = parseFloat(row.total_cost) || 0;
        const avgLatency = parseFloat(row.avg_latency) || 0;

        byProvider[providerId] = { requests, cost, avgLatency };
        totalRequests += requests;
        totalSuccess += successCount;
        totalCost += cost;
      }

      return {
        totalRequests,
        successRate: totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0,
        totalCost,
        byProvider,
      };
    } catch (error) {
      logger.warn('Failed to get provider usage summary', { error: errorMessage(error) });
      return { totalRequests: 0, successRate: 0, totalCost: 0, byProvider: {} };
    }
  }
}
