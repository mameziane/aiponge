import { describe, it, expect, vi, beforeEach } from 'vitest';
import { USER_LIFECYCLE_EVENT_TYPES } from '@aiponge/shared-contracts';

// ─── Shared mock references ────────────────────────────────────────────────────

const mockRegister = vi.hoisted(() => vi.fn());
const mockStart = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

const mockCreateEventSubscriber = vi.hoisted(() =>
  vi.fn(() => ({
    register: mockRegister,
    start: mockStart,
    shutdown: mockShutdown,
  }))
);

// ─── Top-level vi.mock ──────────────────────────────────────────────────────────

vi.mock('@aiponge/platform-core', () => ({
  createLogger: vi.fn(() => mockLogger),
  createEventSubscriber: mockCreateEventSubscriber,
  errorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}));

vi.mock('../../infrastructure/database/DatabaseConnectionFactory', () => ({
  getDatabase: vi.fn(() => ({})),
}));

vi.mock('../../infrastructure/repositories/LifecycleRepository', () => {
  // Must use function (not arrow) so it's callable with `new`
  function MockLifecycleRepository() {
    return {
      insertLifecycleEvent: vi.fn().mockResolvedValue('evt-1'),
      insertLifecycleEventsBatch: vi.fn().mockResolvedValue({ accepted: 0, rejected: 0 }),
      insertSubscriptionChange: vi.fn().mockResolvedValue('sub-1'),
      upsertAcquisitionAttribution: vi.fn().mockResolvedValue('acq-1'),
    };
  }
  return { LifecycleRepository: MockLifecycleRepository };
});

// ─── Static import (no resetModules) ─────────────────────────────────────────────

import {
  startUserLifecycleSubscriber,
  stopUserLifecycleSubscriber,
} from '../../infrastructure/events/UserLifecycleSubscriber';

describe('UserLifecycleSubscriber', () => {
  beforeEach(async () => {
    // Stop any running subscriber to reset module-level state
    await stopUserLifecycleSubscriber();

    mockRegister.mockClear();
    mockStart.mockClear().mockResolvedValue(undefined);
    mockShutdown.mockClear().mockResolvedValue(undefined);
    mockCreateEventSubscriber.mockClear().mockImplementation(() => ({
      register: mockRegister,
      start: mockStart,
      shutdown: mockShutdown,
    }));
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockLogger.debug.mockClear();
  });

  describe('startUserLifecycleSubscriber', () => {
    it('should register handlers for all USER_LIFECYCLE_EVENT_TYPES and start the subscriber', async () => {
      await startUserLifecycleSubscriber();

      const allEventTypes = Object.values(USER_LIFECYCLE_EVENT_TYPES);

      // Verify register was called once for each event type
      expect(mockRegister).toHaveBeenCalledTimes(allEventTypes.length);

      // Verify each event type was registered with the correct structure
      for (const eventType of allEventTypes) {
        expect(mockRegister).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType,
            handler: expect.any(Function),
            maxRetries: 3,
            retryDelayMs: 1000,
          })
        );
      }

      // Verify the subscriber was started
      expect(mockStart).toHaveBeenCalledOnce();
    });

    it('should not start a second subscriber if already running', async () => {
      await startUserLifecycleSubscriber();

      // Clear to track second call
      mockStart.mockClear();
      mockRegister.mockClear();

      await startUserLifecycleSubscriber(); // Second call

      // start and register should NOT have been called again
      expect(mockStart).not.toHaveBeenCalled();
      expect(mockRegister).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('User lifecycle subscriber already started');
    });

    it('should handle errors during startup gracefully', async () => {
      mockCreateEventSubscriber.mockImplementationOnce(() => {
        throw new Error('Redis connection failed');
      });

      // Should not throw
      await expect(startUserLifecycleSubscriber()).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to start user lifecycle subscriber',
        expect.objectContaining({ error: expect.any(String) })
      );
    });
  });

  describe('stopUserLifecycleSubscriber', () => {
    it('should call shutdown on the subscriber instance', async () => {
      await startUserLifecycleSubscriber();
      mockShutdown.mockClear();
      mockLogger.info.mockClear();

      await stopUserLifecycleSubscriber();

      expect(mockShutdown).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith('User lifecycle subscriber stopped');
    });

    it('should be a no-op when no subscriber is running', async () => {
      // No subscriber started in this test (beforeEach already stopped it)
      await expect(stopUserLifecycleSubscriber()).resolves.toBeUndefined();
      expect(mockShutdown).not.toHaveBeenCalled();
    });

    it('should handle shutdown errors gracefully (best-effort cleanup)', async () => {
      await startUserLifecycleSubscriber();
      mockShutdown.mockRejectedValueOnce(new Error('Shutdown failed'));

      // Should not throw even when shutdown fails
      await expect(stopUserLifecycleSubscriber()).resolves.toBeUndefined();
    });

    it('should allow restarting after stop', async () => {
      await startUserLifecycleSubscriber();
      await stopUserLifecycleSubscriber();

      // Clear mocks to verify the second start registers again
      mockRegister.mockClear();
      mockStart.mockClear().mockResolvedValue(undefined);
      mockShutdown.mockClear().mockResolvedValue(undefined);

      await startUserLifecycleSubscriber();

      const allEventTypes = Object.values(USER_LIFECYCLE_EVENT_TYPES);
      expect(mockRegister).toHaveBeenCalledTimes(allEventTypes.length);
      expect(mockStart).toHaveBeenCalledOnce();
    });
  });

  describe('event handler integration', () => {
    it('should register handlers that are callable functions', async () => {
      await startUserLifecycleSubscriber();

      // Each register call should have a handler that is a function
      const registerCalls = mockRegister.mock.calls;
      for (const [config] of registerCalls) {
        expect(typeof config.handler).toBe('function');
      }
    });

    it('should register exactly 18 event types', async () => {
      await startUserLifecycleSubscriber();

      const allEventTypes = Object.values(USER_LIFECYCLE_EVENT_TYPES);
      expect(allEventTypes).toHaveLength(18);
      expect(mockRegister).toHaveBeenCalledTimes(18);
    });
  });
});
