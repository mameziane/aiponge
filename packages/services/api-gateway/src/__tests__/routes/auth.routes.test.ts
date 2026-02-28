import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  ServiceLocator: {
    getServiceUrl: vi.fn(() => 'http://localhost:3020'),
  },
}));

vi.mock('../../config/service-urls', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

vi.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: vi.fn(() => {
    return (req: Request, res: Response) => {
      res.status(200).json({ success: true, proxied: true, path: req.path, method: req.method });
    };
  }),
}));

describe('Auth Routes', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { authRoutes } = await import('../../presentation/routes/auth.routes');
    app = express();
    app.use(express.json());
    app.use('/auth', authRoutes);
  });

  describe('Proxy configuration', () => {
    it('should create proxy middleware with changeOrigin', async () => {
      const { createProxyMiddleware } = await import('http-proxy-middleware');
      expect(createProxyMiddleware).toHaveBeenCalledWith(expect.objectContaining({ changeOrigin: true }));
    });
  });

  describe('POST /auth/register', () => {
    it('should proxy registration requests', async () => {
      const res = await request(app).post('/auth/register').send({ email: 'test@example.com', password: 'pass123' });
      expect(res.status).toBe(200);
      expect(res.body.proxied).toBe(true);
    });
  });

  describe('POST /auth/login', () => {
    it('should proxy login requests', async () => {
      const res = await request(app).post('/auth/login').send({ email: 'test@example.com', password: 'pass123' });
      expect(res.status).toBe(200);
      expect(res.body.proxied).toBe(true);
    });
  });

  describe('POST /auth/guest', () => {
    it('should proxy guest session creation', async () => {
      const res = await request(app).post('/auth/guest');
      expect(res.status).toBe(200);
      expect(res.body.proxied).toBe(true);
    });
  });

  describe('POST /auth/authenticate', () => {
    it('should proxy token authentication', async () => {
      const res = await request(app).post('/auth/authenticate').send({ token: 'jwt-token' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /auth/logout', () => {
    it('should proxy logout', async () => {
      const res = await request(app).post('/auth/logout');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /auth/me', () => {
    it('should proxy user info request', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /auth/sms/send-code', () => {
    it('should proxy SMS code sending', async () => {
      const res = await request(app).post('/auth/sms/send-code').send({ phone: '+1234567890' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /auth/sms/verify-code', () => {
    it('should proxy SMS code verification', async () => {
      const res = await request(app).post('/auth/sms/verify-code').send({ phone: '+1234567890', code: '123456' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /auth/password/request-reset', () => {
    it('should proxy password reset request', async () => {
      const res = await request(app).post('/auth/password/request-reset').send({ email: 'test@example.com' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /auth/password/reset', () => {
    it('should proxy password reset', async () => {
      const res = await request(app)
        .post('/auth/password/reset')
        .send({ token: 'reset-token', newPassword: 'newpass' });
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /auth/delete-account', () => {
    it('should proxy account deletion', async () => {
      const res = await request(app).delete('/auth/delete-account');
      expect(res.status).toBe(200);
    });
  });
});
