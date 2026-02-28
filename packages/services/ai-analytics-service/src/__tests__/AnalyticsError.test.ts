import { describe, it, expect } from 'vitest';
import { AnalyticsError, AnalyticsErrorCode } from '../application/errors';

describe('AnalyticsError', () => {
  describe('constructor', () => {
    it('should create error with default values', () => {
      const error = new AnalyticsError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(AnalyticsErrorCode.INTERNAL_ERROR);
      expect(error.name).toBe('AnalyticsError');
    });

    it('should create error with custom status code', () => {
      const error = new AnalyticsError('Not found', 404, AnalyticsErrorCode.TRACE_NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(AnalyticsErrorCode.TRACE_NOT_FOUND);
    });

    it('should preserve cause error', () => {
      const cause = new Error('Original error');
      const error = new AnalyticsError('Wrapped error', 500, AnalyticsErrorCode.DATABASE_ERROR, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('static factory methods', () => {
    it('traceNotFound should return 404 error', () => {
      const error = AnalyticsError.traceNotFound('trace-123');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(AnalyticsErrorCode.TRACE_NOT_FOUND);
      expect(error.message).toContain('trace-123');
    });

    it('spanNotFound should return 404 error', () => {
      const error = AnalyticsError.spanNotFound('span-456');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(AnalyticsErrorCode.SPAN_NOT_FOUND);
      expect(error.message).toContain('span-456');
    });

    it('metricNotFound should return 404 error', () => {
      const error = AnalyticsError.metricNotFound('metric-789');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(AnalyticsErrorCode.METRIC_NOT_FOUND);
    });

    it('logNotFound should return 404 error', () => {
      const error = AnalyticsError.logNotFound('log-abc');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(AnalyticsErrorCode.LOG_NOT_FOUND);
    });

    it('invalidTraceData should return 400 error', () => {
      const error = AnalyticsError.invalidTraceData('missing required field');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(AnalyticsErrorCode.INVALID_TRACE_DATA);
    });

    it('invalidSpanData should return 400 error', () => {
      const error = AnalyticsError.invalidSpanData('invalid duration');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(AnalyticsErrorCode.INVALID_SPAN_DATA);
    });

    it('invalidMetricData should return 400 error', () => {
      const error = AnalyticsError.invalidMetricData('value must be number');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(AnalyticsErrorCode.INVALID_METRIC_DATA);
    });

    it('invalidDateRange should return 400 error', () => {
      const error = AnalyticsError.invalidDateRange('start after end');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(AnalyticsErrorCode.INVALID_DATE_RANGE);
    });

    it('aggregationFailed should return 500 error with cause', () => {
      const cause = new Error('DB timeout');
      const error = AnalyticsError.aggregationFailed('sum', 'timeout', cause);
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(AnalyticsErrorCode.AGGREGATION_FAILED);
      expect(error.cause).toBe(cause);
    });

    it('queryFailed should return 500 error', () => {
      const error = AnalyticsError.queryFailed('SELECT metrics', 'connection lost');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(AnalyticsErrorCode.QUERY_FAILED);
    });

    it('databaseError should return 500 error', () => {
      const error = AnalyticsError.databaseError('insert', 'constraint violation');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(AnalyticsErrorCode.DATABASE_ERROR);
    });

    it('queueError should return 500 error', () => {
      const error = AnalyticsError.queueError('publish', 'queue full');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(AnalyticsErrorCode.QUEUE_ERROR);
    });

    it('validationError should return 400 error', () => {
      const error = AnalyticsError.validationError('eventType', 'is required');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(AnalyticsErrorCode.VALIDATION_ERROR);
      expect(error.message).toContain('eventType');
    });

    it('internalError should return 500 error', () => {
      const error = AnalyticsError.internalError('unexpected failure');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(AnalyticsErrorCode.INTERNAL_ERROR);
    });

    it('serviceUnavailable should return 503 error', () => {
      const error = AnalyticsError.serviceUnavailable('TimescaleDB');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(AnalyticsErrorCode.SERVICE_UNAVAILABLE);
    });
  });

  describe('AnalyticsErrorCode enum', () => {
    it('should have all expected error codes', () => {
      expect(AnalyticsErrorCode.TRACE_NOT_FOUND).toBe('TRACE_NOT_FOUND');
      expect(AnalyticsErrorCode.SPAN_NOT_FOUND).toBe('SPAN_NOT_FOUND');
      expect(AnalyticsErrorCode.METRIC_NOT_FOUND).toBe('METRIC_NOT_FOUND');
      expect(AnalyticsErrorCode.LOG_NOT_FOUND).toBe('LOG_NOT_FOUND');
      expect(AnalyticsErrorCode.INVALID_TRACE_DATA).toBe('INVALID_TRACE_DATA');
      expect(AnalyticsErrorCode.INVALID_SPAN_DATA).toBe('INVALID_SPAN_DATA');
      expect(AnalyticsErrorCode.INVALID_METRIC_DATA).toBe('INVALID_METRIC_DATA');
      expect(AnalyticsErrorCode.INVALID_DATE_RANGE).toBe('INVALID_DATE_RANGE');
      expect(AnalyticsErrorCode.AGGREGATION_FAILED).toBe('AGGREGATION_FAILED');
      expect(AnalyticsErrorCode.QUERY_FAILED).toBe('QUERY_FAILED');
      expect(AnalyticsErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(AnalyticsErrorCode.QUEUE_ERROR).toBe('QUEUE_ERROR');
      expect(AnalyticsErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(AnalyticsErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(AnalyticsErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
