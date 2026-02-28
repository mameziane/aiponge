import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@aiponge/platform-core', () => ({
  resilience: {
    getAllStats: vi.fn().mockReturnValue([]),
    getAllBulkheadStats: vi.fn().mockReturnValue([]),
  },
  getSharedEventBusClient: vi.fn().mockReturnValue({
    getConnectionStatus: vi.fn().mockReturnValue(false),
    getProviderType: vi.fn().mockReturnValue('memory'),
    getMetrics: vi.fn().mockReturnValue(null),
    getHealthDetail: vi.fn().mockReturnValue({
      provider: 'memory',
      connected: false,
      producerConnected: false,
      consumerConnected: false,
      consumerRunning: false,
      pendingEventCount: 0,
      subscriptionCount: 0,
      reconnectAttempts: 0,
      lastReconnectAt: null,
      lastError: null,
      dlqPublishedCount: 0,
      shuttingDown: false,
    }),
  }),
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { debugStatusHandler } from '../presentation/controllers/DebugStatusController';

describe('GET /debug/status', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.get('/debug/status', debugStatusHandler);
  });

  it('returns 200 with expected JSON structure', async () => {
    const res = await request(app).get('/debug/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('healthy');
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('circuitBreakers');
    expect(res.body).toHaveProperty('bulkheads');
    expect(res.body).toHaveProperty('eventBus');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('process');
  });

  it('reports healthy when no circuit breakers are open', async () => {
    const res = await request(app).get('/debug/status');
    expect(res.body.healthy).toBe(true);
  });
});
