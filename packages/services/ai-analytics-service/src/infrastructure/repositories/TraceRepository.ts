import { eq, desc, gte, lte, and, sql, or, like } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  requestTraces,
  traceSpans,
  RequestTrace,
  TraceSpan,
  InsertRequestTrace,
  InsertTraceSpan,
} from '../../schema/analytics-schema';

export interface TraceWithSpans {
  correlationId: string;
  userId: string | null;
  startTime: string;
  endTime: string | null;
  totalDuration: number | null;
  status: string;
  entryService: string | null;
  entryOperation: string | null;
  httpMethod: string | null;
  httpPath: string | null;
  httpStatusCode: number | null;
  errorMessage: string | null;
  spans: {
    spanId: string;
    parentSpanId: string | null;
    service: string;
    operation: string;
    startTime: string;
    duration: number | null;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    riskLevel: string | null;
    metadata: Record<string, unknown> | null;
  }[];
}

export interface SlowRequest {
  correlationId: string;
  userId: string | null;
  startTime: string;
  totalDuration: number;
  httpMethod: string | null;
  httpPath: string | null;
  status: string;
  slowestSpan: {
    service: string;
    operation: string;
    duration: number;
  } | null;
}

export interface TraceSearchParams {
  userId?: string;
  service?: string;
  operation?: string;
  status?: string;
  minDuration?: number;
  maxDuration?: number;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

export class TraceRepository {
  constructor(private db: NodePgDatabase) {}

  async createTrace(trace: InsertRequestTrace): Promise<RequestTrace> {
    const [created] = await this.db
      .insert(requestTraces)
      .values(trace)
      .onConflictDoUpdate({
        target: requestTraces.correlationId,
        set: {
          endTime: trace.endTime,
          totalDuration: trace.totalDuration,
          status: trace.status,
          httpStatusCode: trace.httpStatusCode,
          errorMessage: trace.errorMessage,
          spanCount: trace.spanCount,
        },
      })
      .returning();
    return created;
  }

  async createSpan(span: InsertTraceSpan): Promise<TraceSpan> {
    const [created] = await this.db.insert(traceSpans).values(span).returning();

    await this.db
      .update(requestTraces)
      .set({
        spanCount: sql`COALESCE(${requestTraces.spanCount}, 0) + 1`,
      })
      .where(eq(requestTraces.correlationId, span.correlationId));

    return created;
  }

  async getTraceByCorrelationId(correlationId: string): Promise<TraceWithSpans | null> {
    const trace = await this.db
      .select()
      .from(requestTraces)
      .where(eq(requestTraces.correlationId, correlationId))
      .limit(1);

    if (!trace.length) {
      return null;
    }

    const spans = await this.db
      .select()
      .from(traceSpans)
      .where(eq(traceSpans.correlationId, correlationId))
      .orderBy(traceSpans.startTime);

    return {
      correlationId: trace[0].correlationId,
      userId: trace[0].userId,
      startTime: trace[0].startTime.toISOString(),
      endTime: trace[0].endTime?.toISOString() || null,
      totalDuration: trace[0].totalDuration,
      status: trace[0].status,
      entryService: trace[0].entryService,
      entryOperation: trace[0].entryOperation,
      httpMethod: trace[0].httpMethod,
      httpPath: trace[0].httpPath,
      httpStatusCode: trace[0].httpStatusCode,
      errorMessage: trace[0].errorMessage,
      spans: spans.map((s: TraceSpan) => ({
        spanId: s.spanId,
        parentSpanId: s.parentSpanId,
        service: s.service,
        operation: s.operation,
        startTime: s.startTime.toISOString(),
        duration: s.duration,
        status: s.status,
        errorCode: s.errorCode,
        errorMessage: s.errorMessage,
        riskLevel: s.riskLevel,
        metadata: s.metadata as Record<string, unknown> | null,
      })),
    };
  }

  async searchTraces(params: TraceSearchParams): Promise<RequestTrace[]> {
    const conditions = [];

    if (params.userId) {
      conditions.push(eq(requestTraces.userId, params.userId));
    }
    if (params.status) {
      conditions.push(eq(requestTraces.status, params.status));
    }
    if (params.minDuration) {
      conditions.push(gte(requestTraces.totalDuration, params.minDuration));
    }
    if (params.maxDuration) {
      conditions.push(lte(requestTraces.totalDuration, params.maxDuration));
    }
    if (params.since) {
      conditions.push(gte(requestTraces.startTime, params.since));
    }
    if (params.until) {
      conditions.push(lte(requestTraces.startTime, params.until));
    }
    if (params.service) {
      conditions.push(eq(requestTraces.entryService, params.service));
    }
    if (params.operation) {
      conditions.push(like(requestTraces.entryOperation, `%${params.operation}%`));
    }

    const query = this.db
      .select()
      .from(requestTraces)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(requestTraces.startTime))
      .limit(Math.min(params.limit || 50, 100))
      .offset(params.offset || 0);

    return query;
  }

  async getSlowRequests(thresholdMs: number, since: Date): Promise<SlowRequest[]> {
    const traces = await this.db
      .select()
      .from(requestTraces)
      .where(and(gte(requestTraces.totalDuration, thresholdMs), gte(requestTraces.startTime, since)))
      .orderBy(desc(requestTraces.totalDuration))
      .limit(100);

    const results: SlowRequest[] = [];

    for (const trace of traces) {
      const slowestSpan = await this.db
        .select()
        .from(traceSpans)
        .where(eq(traceSpans.correlationId, trace.correlationId))
        .orderBy(desc(traceSpans.duration))
        .limit(1);

      results.push({
        correlationId: trace.correlationId,
        userId: trace.userId,
        startTime: trace.startTime.toISOString(),
        totalDuration: trace.totalDuration || 0,
        httpMethod: trace.httpMethod,
        httpPath: trace.httpPath,
        status: trace.status,
        slowestSpan: slowestSpan.length
          ? {
              service: slowestSpan[0].service,
              operation: slowestSpan[0].operation,
              duration: slowestSpan[0].duration || 0,
            }
          : null,
      });
    }

    return results;
  }

  async getTraceStats(since: Date): Promise<{
    totalTraces: number;
    avgDuration: number;
    p95Duration: number;
    p99Duration: number;
    errorRate: number;
    topSlowServices: { service: string; avgDuration: number; count: number }[];
  }> {
    const stats = await this.db
      .select({
        totalTraces: sql<number>`COUNT(*)`,
        avgDuration: sql<number>`AVG(${requestTraces.totalDuration})`,
        p95Duration: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${requestTraces.totalDuration})`,
        p99Duration: sql<number>`PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${requestTraces.totalDuration})`,
        errorCount: sql<number>`COUNT(*) FILTER (WHERE ${requestTraces.status} = 'error')`,
      })
      .from(requestTraces)
      .where(gte(requestTraces.startTime, since));

    const serviceStats = await this.db
      .select({
        service: traceSpans.service,
        avgDuration: sql<number>`AVG(${traceSpans.duration})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(traceSpans)
      .where(gte(traceSpans.startTime, since))
      .groupBy(traceSpans.service)
      .orderBy(desc(sql`AVG(${traceSpans.duration})`))
      .limit(10);

    const result = stats[0];
    return {
      totalTraces: Number(result?.totalTraces || 0),
      avgDuration: Math.round(Number(result?.avgDuration || 0)),
      p95Duration: Math.round(Number(result?.p95Duration || 0)),
      p99Duration: Math.round(Number(result?.p99Duration || 0)),
      errorRate: result?.totalTraces ? Number(result.errorCount) / Number(result.totalTraces) : 0,
      topSlowServices: serviceStats.map((s: { service: string; avgDuration: number; count: number }) => ({
        service: s.service,
        avgDuration: Math.round(Number(s.avgDuration || 0)),
        count: Number(s.count || 0),
      })),
    };
  }

  async updateTraceEnd(
    correlationId: string,
    endTime: Date,
    status: string,
    httpStatusCode?: number,
    errorMessage?: string
  ): Promise<void> {
    const trace = await this.db
      .select({ startTime: requestTraces.startTime })
      .from(requestTraces)
      .where(eq(requestTraces.correlationId, correlationId))
      .limit(1);

    if (trace.length) {
      const totalDuration = endTime.getTime() - trace[0].startTime.getTime();

      await this.db
        .update(requestTraces)
        .set({
          endTime,
          totalDuration,
          status,
          httpStatusCode,
          errorMessage,
        })
        .where(eq(requestTraces.correlationId, correlationId));
    }
  }

  async cleanupOldTraces(olderThan: Date): Promise<number> {
    await this.db.delete(traceSpans).where(lte(traceSpans.startTime, olderThan));

    const result = await this.db
      .delete(requestTraces)
      .where(lte(requestTraces.startTime, olderThan))
      .returning({ id: requestTraces.id });

    return result.length;
  }
}
