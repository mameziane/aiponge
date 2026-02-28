import { describe, it, expect, vi } from 'vitest';

vi.mock('@aiponge/platform-core', () => ({
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500, cause?: Error) {
      super(message, cause ? { cause } : undefined);
      this.statusCode = statusCode;
    }
  },
}));

import { ContentError, ContentErrorCode } from '../application/errors/errors';

describe('ContentError', () => {
  describe('constructor', () => {
    it('should create with default status code 500', () => {
      const error = new ContentError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('ContentError');
    });

    it('should create with custom status code', () => {
      const error = new ContentError('Not found', 404);
      expect(error.statusCode).toBe(404);
    });

    it('should preserve cause', () => {
      const cause = new Error('Root cause');
      const error = new ContentError('Wrapped', 500, ContentErrorCode.INTERNAL_ERROR, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('static factory methods', () => {
    it('validationError should return 400', () => {
      const error = ContentError.validationError('prompt', 'is required');
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('prompt');
      expect(error.message).toContain('is required');
    });

    it('notFound should return 404', () => {
      const error = ContentError.notFound('Template', 'tmpl-1');
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('Template');
      expect(error.message).toContain('tmpl-1');
    });

    it('contentNotFound should return 404', () => {
      const error = ContentError.contentNotFound('content-123');
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('content-123');
    });

    it('userIdRequired should return 400', () => {
      const error = ContentError.userIdRequired();
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('User ID');
    });

    it('generationFailed should return 500', () => {
      const error = ContentError.generationFailed('provider timeout');
      expect(error.statusCode).toBe(500);
      expect(error.message).toContain('provider timeout');
    });

    it('invalidContentType should return 400', () => {
      const error = ContentError.invalidContentType('unknown');
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('unknown');
    });

    it('invalidQuality should return 400', () => {
      const error = ContentError.invalidQuality('score out of range');
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('score out of range');
    });

    it('forbidden should return 403', () => {
      const error = ContentError.forbidden('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
    });

    it('insufficientData should return 422', () => {
      const error = ContentError.insufficientData('Need more context');
      expect(error.statusCode).toBe(422);
      expect(error.message).toContain('Need more context');
    });

    it('invalidStateTransition should return 422', () => {
      const error = ContentError.invalidStateTransition('draft', 'published');
      expect(error.statusCode).toBe(422);
      expect(error.message).toContain('draft');
      expect(error.message).toContain('published');
    });

    it('internalError should return 500 with cause', () => {
      const cause = new Error('DB error');
      const error = ContentError.internalError('Something broke', cause);
      expect(error.statusCode).toBe(500);
      expect(error.cause).toBe(cause);
    });
  });
});
