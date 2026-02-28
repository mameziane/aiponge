import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { EmailNotificationProvider } from '../infrastructure/notification/providers/EmailNotificationProvider';
import { NotificationDeliveryRequest } from '../application/use-cases/notification/INotificationProvider';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock logger
vi.mock('@aiponge/platform-core', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
  };
});

describe('EmailNotificationProvider', () => {
  let provider: EmailNotificationProvider;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    provider = new EmailNotificationProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('getType', () => {
    it('should return email as type', () => {
      expect(provider.getType()).toBe('email');
    });
  });

  describe('isAvailable', () => {
    it('should return true when SMTP credentials are configured', () => {
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'password123';

      provider = new EmailNotificationProvider();
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when SMTP credentials are missing', () => {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      provider = new EmailNotificationProvider();
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when only SMTP user is configured', () => {
      process.env.SMTP_USER = 'test@example.com';
      delete process.env.SMTP_PASS;

      provider = new EmailNotificationProvider();
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when only SMTP password is configured', () => {
      delete process.env.SMTP_USER;
      process.env.SMTP_PASS = 'password123';

      provider = new EmailNotificationProvider();
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('send', () => {
    const mockRequest: NotificationDeliveryRequest = {
      to: 'recipient@example.com',
      title: 'Test Notification',
      body: 'This is a test message',
    };

    beforeEach(() => {
      process.env.SMTP_USER = 'sender@example.com';
      process.env.SMTP_PASS = 'password123';
      provider = new EmailNotificationProvider();

      // Mock setTimeout to speed up tests
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should send email successfully when configured', async () => {
      const sendPromise = provider.send(mockRequest);
      vi.advanceTimersByTime(200);
      const result = await sendPromise;

      expect(result.success).toBe(true);
      expect(result.deliveryId).toBeDefined();
      expect(result.deliveryId).toMatch(/^email-/);
    });

    it('should return delivery ID on successful send', async () => {
      const sendPromise = provider.send(mockRequest);
      vi.advanceTimersByTime(200);
      const result = await sendPromise;

      expect(result.success).toBe(true);
      expect(typeof result.deliveryId).toBe('string');
      expect(result.deliveryId?.length).toBeGreaterThan(0);
    });

    it('should fail when SMTP credentials are not configured', async () => {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      provider = new EmailNotificationProvider();

      const result = await provider.send(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Email configuration missing');
    });

    it('should handle different recipient addresses', async () => {
      const requestWithDifferentTo = {
        ...mockRequest,
        to: 'another@example.com',
      };

      const sendPromise = provider.send(requestWithDifferentTo);
      vi.advanceTimersByTime(200);
      const result = await sendPromise;

      expect(result.success).toBe(true);
      expect(result.deliveryId).toBeDefined();
    });

    it('should handle different message content', async () => {
      const requestWithDifferentContent = {
        ...mockRequest,
        title: 'Alert!',
        message: 'Critical system error detected',
      };

      const sendPromise = provider.send(requestWithDifferentContent);
      vi.advanceTimersByTime(200);
      const result = await sendPromise;

      expect(result.success).toBe(true);
    });
  });

  describe('SMTP Configuration', () => {
    it('should use custom SMTP host from environment', () => {
      process.env.SMTP_HOST = 'smtp.custom.com';
      provider = new EmailNotificationProvider();

      const config = (provider as unknown as { smtpConfig: Record<string, unknown> }).smtpConfig;
      expect(config.host).toBe('smtp.custom.com');
    });

    it('should use custom SMTP port from environment', () => {
      process.env.SMTP_PORT = '25';
      provider = new EmailNotificationProvider();

      const config = (provider as unknown as { smtpConfig: Record<string, unknown> }).smtpConfig;
      expect(config.port).toBe(25);
    });

    it('should default to Gmail SMTP host', () => {
      delete process.env.SMTP_HOST;
      provider = new EmailNotificationProvider();

      const config = (provider as unknown as { smtpConfig: Record<string, unknown> }).smtpConfig;
      expect(config.host).toBe('smtp.gmail.com');
    });

    it('should default to port 587', () => {
      delete process.env.SMTP_PORT;
      provider = new EmailNotificationProvider();

      const config = (provider as unknown as { smtpConfig: Record<string, unknown> }).smtpConfig;
      expect(config.port).toBe(587);
    });

    it('should handle secure connection flag', () => {
      process.env.SMTP_SECURE = 'true';
      provider = new EmailNotificationProvider();

      const config = (provider as unknown as { smtpConfig: Record<string, unknown> }).smtpConfig;
      expect(config.secure).toBe(true);
    });
  });
});
