import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

import { metricsMiddleware, MetricsCollector } from '../../presentation/middleware/MetricsMiddleware';

function createMockReq(overrides = {}) {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/test',
    get: vi.fn(),
    ...overrides,
  } as unknown as Request;
}
function createMockRes() {
  const res = {
    statusCode: 200,
    _data: undefined as unknown,
    send: vi.fn(function (this: Record<string, unknown>, d: unknown) { this._data = d; return this; }),
    json: vi.fn(function (this: Record<string, unknown>, d: unknown) { this._data = d; return this; }),
    set: vi.fn().mockReturnThis(),
    on: vi.fn(),
  } as unknown as Response;
  return res;
}

describe('MetricsMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call next', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();
    metricsMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should record metric on response send', () => {
    const req = createMockReq({ method: 'GET', path: '/api/test' });
    const res = createMockRes();
    const next = vi.fn();
    metricsMiddleware(req, res, next);

    res.statusCode = 200;
    res.send({ data: 'test' });

    const metrics = MetricsCollector.getInstance().getMetrics();
    const lastMetric = metrics[metrics.length - 1];
    expect(lastMetric.path).toBe('/api/test');
    expect(lastMetric.method).toBe('GET');
    expect(lastMetric.statusCode).toBe(200);
    expect(lastMetric.duration).toBeGreaterThanOrEqual(0);
  });

  it('should record duration between request and response', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();
    metricsMiddleware(req, res, next);
    res.send('ok');

    const metrics = MetricsCollector.getInstance().getMetrics();
    const lastMetric = metrics[metrics.length - 1];
    expect(typeof lastMetric.duration).toBe('number');
  });

  it('should count metrics by status code in aggregation', () => {
    const collector = MetricsCollector.getInstance();

    const req200 = createMockReq({ method: 'GET', path: '/ok' });
    const res200 = createMockRes();
    metricsMiddleware(req200, res200, vi.fn());
    res200.statusCode = 200;
    res200.send('ok');

    const req404 = createMockReq({ method: 'GET', path: '/missing' });
    const res404 = createMockRes();
    metricsMiddleware(req404, res404, vi.fn());
    res404.statusCode = 404;
    res404.send('not found');

    const aggregated = collector.getAggregatedMetrics();
    expect(aggregated.totalRequests).toBeGreaterThanOrEqual(2);
    expect(aggregated.statusCodes[200]).toBeGreaterThanOrEqual(1);
    expect(aggregated.statusCodes[404]).toBeGreaterThanOrEqual(1);
  });
});
