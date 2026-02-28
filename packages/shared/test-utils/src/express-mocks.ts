import { vi } from 'vitest';

export function createMockRequest(overrides: Record<string, unknown> = {}) {
  const req: Record<string, unknown> = {
    headers: {},
    params: {},
    query: {},
    body: {},
    user: undefined,
    cookies: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/',
    get: vi.fn((header: string) => (req.headers as Record<string, unknown>)[header.toLowerCase()]),
    header: vi.fn((header: string) => (req.headers as Record<string, unknown>)[header.toLowerCase()]),
    ...overrides,
  };
  return req;
}

export function createMockResponse() {
  const res: Record<string, unknown> = {
    _statusCode: 200,
    _data: undefined,
    _headers: {} as Record<string, string>,

    status: vi.fn(function (this: Record<string, unknown>, code: number) {
      this._statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: Record<string, unknown>, data: unknown) {
      this._data = data;
      return this;
    }),
    send: vi.fn(function (this: Record<string, unknown>, data: unknown) {
      this._data = data;
      return this;
    }),
    set: vi.fn(function (this: Record<string, unknown>, key: string, value: string) {
      (this._headers as Record<string, string>)[key] = value;
      return this;
    }),
    setHeader: vi.fn(function (this: Record<string, unknown>, key: string, value: string) {
      (this._headers as Record<string, string>)[key] = value;
      return this;
    }),
    header: vi.fn(function (this: Record<string, unknown>, key: string, value: string) {
      (this._headers as Record<string, string>)[key] = value;
      return this;
    }),
    cookie: vi.fn(function (this: Record<string, unknown>) {
      return this;
    }),
    redirect: vi.fn(function (this: Record<string, unknown>) {
      return this;
    }),
    end: vi.fn(function (this: Record<string, unknown>) {
      return this;
    }),
    getHeader: vi.fn(function (this: Record<string, unknown>, key: string) {
      return (this._headers as Record<string, string>)[key];
    }),
    removeHeader: vi.fn(function (this: Record<string, unknown>) {
      return this;
    }),
    type: vi.fn(function (this: Record<string, unknown>) {
      return this;
    }),
    get statusCode() {
      return res._statusCode;
    },
    getData() {
      return res._data;
    },
  };
  return res;
}

export function createMockNext() {
  return vi.fn();
}
