import { DomainErrorCode, createDomainServiceError } from '@aiponge/platform-core';

const AnalyticsDomainCodes = {
  TRACE_NOT_FOUND: 'TRACE_NOT_FOUND',
  SPAN_NOT_FOUND: 'SPAN_NOT_FOUND',
  METRIC_NOT_FOUND: 'METRIC_NOT_FOUND',
  LOG_NOT_FOUND: 'LOG_NOT_FOUND',
  INVALID_TRACE_DATA: 'INVALID_TRACE_DATA',
  INVALID_SPAN_DATA: 'INVALID_SPAN_DATA',
  INVALID_METRIC_DATA: 'INVALID_METRIC_DATA',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  AGGREGATION_FAILED: 'AGGREGATION_FAILED',
  QUERY_FAILED: 'QUERY_FAILED',
  QUEUE_ERROR: 'QUEUE_ERROR',
} as const;

export const AnalyticsErrorCode = { ...DomainErrorCode, ...AnalyticsDomainCodes } as const;
export type AnalyticsErrorCodeType = (typeof AnalyticsErrorCode)[keyof typeof AnalyticsErrorCode];

const AnalyticsErrorBase = createDomainServiceError('Analytics', AnalyticsErrorCode);

export class AnalyticsError extends AnalyticsErrorBase {
  static traceNotFound(traceId: string) {
    return new AnalyticsError(`Trace not found: ${traceId}`, 404, AnalyticsErrorCode.TRACE_NOT_FOUND);
  }

  static spanNotFound(spanId: string) {
    return new AnalyticsError(`Span not found: ${spanId}`, 404, AnalyticsErrorCode.SPAN_NOT_FOUND);
  }

  static metricNotFound(metricId: string) {
    return new AnalyticsError(`Metric not found: ${metricId}`, 404, AnalyticsErrorCode.METRIC_NOT_FOUND);
  }

  static logNotFound(logId: string) {
    return new AnalyticsError(`Log not found: ${logId}`, 404, AnalyticsErrorCode.LOG_NOT_FOUND);
  }

  static invalidTraceData(reason: string) {
    return new AnalyticsError(`Invalid trace data: ${reason}`, 400, AnalyticsErrorCode.INVALID_TRACE_DATA);
  }

  static invalidSpanData(reason: string) {
    return new AnalyticsError(`Invalid span data: ${reason}`, 400, AnalyticsErrorCode.INVALID_SPAN_DATA);
  }

  static invalidMetricData(reason: string) {
    return new AnalyticsError(`Invalid metric data: ${reason}`, 400, AnalyticsErrorCode.INVALID_METRIC_DATA);
  }

  static invalidDateRange(reason: string) {
    return new AnalyticsError(`Invalid date range: ${reason}`, 400, AnalyticsErrorCode.INVALID_DATE_RANGE);
  }

  static aggregationFailed(operation: string, reason: string, cause?: Error) {
    return new AnalyticsError(
      `Aggregation failed for ${operation}: ${reason}`,
      500,
      AnalyticsErrorCode.AGGREGATION_FAILED,
      cause
    );
  }

  static queryFailed(query: string, reason: string, cause?: Error) {
    return new AnalyticsError(`Query failed for ${query}: ${reason}`, 500, AnalyticsErrorCode.QUERY_FAILED, cause);
  }

  static databaseError(operation: string, reason: string, cause?: Error) {
    return new AnalyticsError(
      `Database error during ${operation}: ${reason}`,
      500,
      AnalyticsErrorCode.DATABASE_ERROR,
      cause
    );
  }

  static queueError(operation: string, reason: string, cause?: Error) {
    return new AnalyticsError(`Queue error during ${operation}: ${reason}`, 500, AnalyticsErrorCode.QUEUE_ERROR, cause);
  }
}
