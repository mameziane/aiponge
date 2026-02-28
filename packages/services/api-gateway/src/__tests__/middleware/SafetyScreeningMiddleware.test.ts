import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
}));
vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  ServiceLocator: {
    getServiceUrl: vi.fn().mockReturnValue('http://localhost:4000'),
  },
  signUserIdHeader: vi.fn().mockReturnValue({ 'x-signed-user-id': 'signed' }),
  serializeError: (e: unknown) => ({ message: (e as Error)?.message }),
  extractAuthContext: (req: Request) => ({ userId: req?.headers?.['x-user-id'] || undefined }),
}));
vi.mock('../../config/service-urls', () => ({
  getLogger: () => mockLogger,
  createLogger: () => mockLogger,
}));

const mockGatewayFetch = vi.hoisted(() => vi.fn());
vi.mock('@services/gatewayFetch', () => ({
  gatewayFetch: mockGatewayFetch,
}));

const mockGetEmergencyMessage = vi.hoisted(() => vi.fn().mockReturnValue('Please seek help.'));
vi.mock('@aiponge/shared-contracts/safety', () => ({
  CRISIS_RESOURCES: {
    us: { name: 'US Hotline', number: '988' },
    global: { name: 'Global', url: 'https://findahelpline.com' },
  },
  getEmergencyMessage: mockGetEmergencyMessage,
}));

import { safetyScreeningMiddleware } from '../../presentation/middleware/SafetyScreeningMiddleware';

function createMockReq(overrides = {}) {
  return {
    headers: {} as Record<string, string>,
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    method: 'POST',
    path: '/api/app/entries',
    originalUrl: '/api/app/entries',
    get: vi.fn(),
    ...overrides,
  } as unknown as Request;
}
function createMockRes() {
  const res = {
    statusCode: 200,
    _data: undefined as unknown,
    _headers: {} as Record<string, string>,
    status: vi.fn(function (this: Record<string, unknown>, c: number) { this.statusCode = c; return this; }),
    json: vi.fn(function (this: Record<string, unknown>, d: unknown) { this._data = d; return this; }),
    send: vi.fn(function (this: Record<string, unknown>, d: unknown) { this._data = d; return this; }),
    set: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    on: vi.fn(),
  } as unknown as Response & { _data: unknown };
  return res;
}

describe('SafetyScreeningMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip when no content in body', async () => {
    const middleware = safetyScreeningMiddleware();
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should skip when content is too short', async () => {
    const middleware = safetyScreeningMiddleware();
    const req = createMockReq({ body: { content: 'hi' } });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should skip when no userId', async () => {
    const middleware = safetyScreeningMiddleware();
    const req = createMockReq({
      body: { content: 'This is a long enough content to be screened' },
      headers: {},
    });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should proceed when safety service returns safe content', async () => {
    mockGatewayFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ severity: 'low', detected: false }),
    });

    const middleware = safetyScreeningMiddleware();
    const req = createMockReq({
      body: { content: 'This is a long enough content to be screened' },
      headers: { 'x-user-id': 'user-1', 'x-correlation-id': 'corr-1' },
    });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.safetyScreening).toBeDefined();
    expect(req.safetyScreening.level).toBe('low');
  });

  it('should block critical content when blockOnCrisis is true', async () => {
    mockGatewayFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ severity: 'crisis', detected: true, flagId: 'flag-1' }),
    });

    const middleware = safetyScreeningMiddleware({ blockOnCrisis: true });
    const req = createMockReq({
      body: { content: 'This is a long enough content to be screened' },
      headers: { 'x-user-id': 'user-1' },
    });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._data.blocked).toBe(true);
    expect(res._data.safetyIntervention).toBe(true);
  });

  it('should request acknowledgment for high risk when configured', async () => {
    mockGatewayFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ severity: 'high', detected: true }),
    });

    const middleware = safetyScreeningMiddleware({ requireAcknowledgmentOnHigh: true });
    const req = createMockReq({
      body: { content: 'This is a long enough content to be screened' },
      headers: { 'x-user-id': 'user-1' },
    });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._data.requiresAcknowledgment).toBe(true);
  });

  it('should proceed when safety service is unavailable', async () => {
    mockGatewayFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const middleware = safetyScreeningMiddleware();
    const req = createMockReq({
      body: { content: 'This is a long enough content to be screened' },
      headers: { 'x-user-id': 'user-1' },
    });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should proceed when safety screening throws an error', async () => {
    mockGatewayFetch.mockRejectedValue(new Error('Network error'));

    const middleware = safetyScreeningMiddleware();
    const req = createMockReq({
      body: { content: 'This is a long enough content to be screened' },
      headers: { 'x-user-id': 'user-1' },
    });
    const res = createMockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
