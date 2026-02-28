import { describe, it, expect, vi } from 'vitest';

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../config/service-urls', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getServiceUrls: () => ({}),
}));

import { GenerationRequest } from '../domains/entities/GenerationRequest';

describe('GenerationRequest', () => {
  const validArgs = ['req-1', 'user-1', 'article' as const, 'Write about AI'] as const;

  describe('constructor validation', () => {
    it('should create a valid request', () => {
      const req = new GenerationRequest(...validArgs);
      expect(req.id).toBe('req-1');
      expect(req.userId).toBe('user-1');
      expect(req.contentType).toBe('article');
      expect(req.prompt).toBe('Write about AI');
      expect(req.status).toBe('pending');
    });

    it('should throw for empty id', () => {
      expect(() => new GenerationRequest('', 'user-1', 'article', 'prompt')).toThrow();
    });

    it('should throw for empty userId', () => {
      expect(() => new GenerationRequest('req-1', '', 'article', 'prompt')).toThrow();
    });

    it('should throw for empty prompt', () => {
      expect(() => new GenerationRequest('req-1', 'user-1', 'article', '')).toThrow();
    });

    it('should throw for prompt exceeding max length', () => {
      const longPrompt = 'a'.repeat(20001);
      expect(() => new GenerationRequest('req-1', 'user-1', 'article', longPrompt)).toThrow();
    });

    it('should throw for maxLength below 50', () => {
      expect(() => new GenerationRequest('req-1', 'user-1', 'article', 'prompt', { maxLength: 10 })).toThrow();
    });

    it('should throw for temperature below 0', () => {
      expect(() => new GenerationRequest('req-1', 'user-1', 'article', 'prompt', { temperature: -0.1 })).toThrow();
    });

    it('should throw for temperature above 1', () => {
      expect(() => new GenerationRequest('req-1', 'user-1', 'article', 'prompt', { temperature: 1.1 })).toThrow();
    });

    it('should allow valid temperature', () => {
      const req = new GenerationRequest('req-1', 'user-1', 'article', 'prompt', { temperature: 0.7 });
      expect(req.parameters.temperature).toBe(0.7);
    });
  });

  describe('state transitions', () => {
    it('should transition from pending to processing', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing('wf-1', 'provider-1', 'gpt-4');

      expect(req.status).toBe('processing');
      expect(req.workflowId).toBe('wf-1');
      expect(req.providerId).toBe('provider-1');
      expect(req.model).toBe('gpt-4');
      expect(req.startedAt).toBeInstanceOf(Date);
    });

    it('should throw when starting processing from non-pending state', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing();
      expect(() => req.startProcessing()).toThrow();
    });

    it('should transition from processing to completed', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing();
      req.complete();

      expect(req.status).toBe('completed');
      expect(req.completedAt).toBeInstanceOf(Date);
    });

    it('should throw when completing from non-processing state', () => {
      const req = new GenerationRequest(...validArgs);
      expect(() => req.complete()).toThrow();
    });

    it('should transition from pending to failed', () => {
      const req = new GenerationRequest(...validArgs);
      req.fail('Something went wrong');

      expect(req.status).toBe('failed');
      expect(req.metadata.error).toBe('Something went wrong');
    });

    it('should transition from processing to failed', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing();
      req.fail('Timeout');

      expect(req.status).toBe('failed');
    });

    it('should throw when failing from completed state', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing();
      req.complete();
      expect(() => req.fail()).toThrow();
    });

    it('should transition from pending to cancelled', () => {
      const req = new GenerationRequest(...validArgs);
      req.cancel('User cancelled');

      expect(req.status).toBe('cancelled');
      expect(req.metadata.cancelReason).toBe('User cancelled');
    });

    it('should throw when cancelling from completed state', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing();
      req.complete();
      expect(() => req.cancel()).toThrow();
    });
  });

  describe('updateParameters', () => {
    it('should update parameters when pending', () => {
      const req = new GenerationRequest(...validArgs);
      req.updateParameters({ temperature: 0.5 });
      expect(req.parameters.temperature).toBe(0.5);
    });

    it('should throw when updating parameters in non-pending state', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing();
      expect(() => req.updateParameters({ temperature: 0.5 })).toThrow();
    });

    it('should validate parameters after update', () => {
      const req = new GenerationRequest(...validArgs);
      expect(() => req.updateParameters({ temperature: 2.0 })).toThrow();
    });
  });

  describe('updateOptions', () => {
    it('should update options when pending', () => {
      const req = new GenerationRequest(...validArgs);
      req.updateOptions({ priority: 'high' });
      expect(req.options.priority).toBe('high');
    });

    it('should throw when updating options in non-pending state', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing();
      expect(() => req.updateOptions({ priority: 'high' })).toThrow();
    });
  });

  describe('duration calculations', () => {
    it('should return null processing duration when not started', () => {
      const req = new GenerationRequest(...validArgs);
      expect(req.getProcessingDuration()).toBeNull();
    });

    it('should return processing duration when started', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing();
      const duration = req.getProcessingDuration();
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should return total duration', () => {
      const req = new GenerationRequest(...validArgs);
      const duration = req.getTotalDuration();
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('status checks', () => {
    it('isInProgress should return true when processing', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing();
      expect(req.isInProgress()).toBe(true);
    });

    it('isInProgress should return false when pending', () => {
      const req = new GenerationRequest(...validArgs);
      expect(req.isInProgress()).toBe(false);
    });

    it('isCompleted should return true for completed/failed/cancelled', () => {
      const req1 = new GenerationRequest('r1', 'u1', 'article', 'p1');
      req1.startProcessing();
      req1.complete();
      expect(req1.isCompleted()).toBe(true);

      const req2 = new GenerationRequest('r2', 'u1', 'article', 'p2');
      req2.fail();
      expect(req2.isCompleted()).toBe(true);

      const req3 = new GenerationRequest('r3', 'u1', 'article', 'p3');
      req3.cancel();
      expect(req3.isCompleted()).toBe(true);
    });

    it('isSuccessful should return true only for completed status', () => {
      const req = new GenerationRequest(...validArgs);
      req.startProcessing();
      req.complete();
      expect(req.isSuccessful()).toBe(true);
    });

    it('isSuccessful should return false for failed', () => {
      const req = new GenerationRequest(...validArgs);
      req.fail();
      expect(req.isSuccessful()).toBe(false);
    });
  });

  describe('getPriority', () => {
    it('should return default priority of normal', () => {
      const req = new GenerationRequest(...validArgs);
      expect(req.getPriority()).toBe('normal');
    });

    it('should return configured priority', () => {
      const req = new GenerationRequest('r1', 'u1', 'article', 'prompt', {}, { priority: 'high' });
      expect(req.getPriority()).toBe('high');
    });
  });

  describe('getExpectedContentLength', () => {
    it('should return maxLength when set', () => {
      const req = new GenerationRequest('r1', 'u1', 'article', 'prompt', { maxLength: 500 });
      expect(req.getExpectedContentLength()).toBe(500);
    });

    it('should return default length based on content type', () => {
      expect(new GenerationRequest('r1', 'u1', 'article', 'p').getExpectedContentLength()).toBe(1000);
      expect(new GenerationRequest('r2', 'u1', 'email', 'p').getExpectedContentLength()).toBe(300);
      expect(new GenerationRequest('r3', 'u1', 'social', 'p').getExpectedContentLength()).toBe(280);
      expect(new GenerationRequest('r4', 'u1', 'technical', 'p').getExpectedContentLength()).toBe(1200);
    });
  });

  describe('getProcessingTimeout', () => {
    it('should calculate timeout based on expected content length', () => {
      const req = new GenerationRequest('r1', 'u1', 'article', 'prompt');
      const timeout = req.getProcessingTimeout();
      expect(timeout).toBe(40000);
    });
  });

  describe('getSummary', () => {
    it('should return request summary', () => {
      const req = new GenerationRequest(...validArgs);
      const summary = req.getSummary();

      expect(summary.id).toBe('req-1');
      expect(summary.userId).toBe('user-1');
      expect(summary.contentType).toBe('article');
      expect(summary.status).toBe('pending');
      expect(summary.priority).toBe('normal');
      expect(summary.promptLength).toBe('Write about AI'.length);
    });
  });

  describe('toJSON', () => {
    it('should serialize to plain object', () => {
      const req = new GenerationRequest(...validArgs);
      const json = req.toJSON();

      expect(json.id).toBe('req-1');
      expect(json.userId).toBe('user-1');
      expect(json.contentType).toBe('article');
      expect(json.prompt).toBe('Write about AI');
      expect(json.status).toBe('pending');
    });
  });
});
