import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { z } from 'zod';

import { createValidation } from '@aiponge/platform-core';
const { validateBody, validateQuery } = createValidation('api-gateway');

function createMockReq(overrides = {}) {
  return {
    headers: {} as Record<string, string>,
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    method: 'POST',
    path: '/',
    get: vi.fn(),
    ...overrides,
  } as unknown as Request;
}
function createMockRes() {
  const res = {
    statusCode: 200,
    _data: undefined as unknown,
    status: vi.fn(function (this: Record<string, unknown>, c: number) {
      this.statusCode = c;
      return this;
    }),
    json: vi.fn(function (this: Record<string, unknown>, d: unknown) {
      this._data = d;
      return this;
    }),
    send: vi.fn(function (this: Record<string, unknown>, d: unknown) {
      this._data = d;
      return this;
    }),
    set: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    on: vi.fn(),
  } as unknown as Response & { _data: Record<string, unknown> };
  return res;
}

describe('validation middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateBody', () => {
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      age: z.number().min(0, 'Age must be positive'),
    });

    it('should call next for valid body', () => {
      const middleware = validateBody(schema);
      const req = createMockReq({ body: { name: 'Alice', age: 30 } });
      const res = createMockRes();
      const next = vi.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body.name).toBe('Alice');
    });

    it('should return 400 for invalid body', () => {
      const middleware = validateBody(schema);
      const req = createMockReq({ body: { name: '', age: -1 } });
      const res = createMockRes();
      const next = vi.fn();
      middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._data.success).toBe(false);
    });

    it('should include error details', () => {
      const middleware = validateBody(schema);
      const req = createMockReq({ body: {} });
      const res = createMockRes();
      const next = vi.fn();
      middleware(req, res, next);
      expect(res._data.error.details.errors).toBeDefined();
      expect(res._data.error.details.errors.length).toBeGreaterThan(0);
      expect(res._data.error.details.errors[0].field).toBeDefined();
      expect(res._data.error.details.errors[0].message).toBeDefined();
    });

    it('should include timestamp and requestId in error response', () => {
      const middleware = validateBody(schema);
      const req = createMockReq({
        body: {},
        headers: { 'x-request-id': 'req-123' },
      });
      const res = createMockRes();
      const next = vi.fn();
      middleware(req, res, next);
      expect(res._data.timestamp).toBeDefined();
      expect(res._data.error.correlationId).toBe('req-123');
    });

    it('should forward non-Zod errors to next', () => {
      const throwingSchema = {
        parse: () => {
          throw new Error('unexpected');
        },
      } as unknown as z.ZodSchema;
      const middleware = validateBody(throwingSchema);
      const req = createMockReq({ body: {} });
      const res = createMockRes();
      const next = vi.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('validateQuery', () => {
    const schema = z.object({
      page: z.string().optional(),
      limit: z.string().optional(),
    });

    it('should call next for valid query', () => {
      const middleware = validateQuery(schema);
      const req = createMockReq({ query: { page: '1', limit: '10' } });
      const res = createMockRes();
      const next = vi.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 400 for invalid query', () => {
      const strictSchema = z
        .object({
          page: z.string(),
        })
        .strict();
      const middleware = validateQuery(strictSchema);
      const req = createMockReq({ query: { invalid: 'field' } });
      const res = createMockRes();
      const next = vi.fn();
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
