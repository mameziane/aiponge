import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500, cause?: Error) {
      super(message);
      this.statusCode = statusCode;
      if (cause) this.cause = cause;
    }
  },
}));

vi.mock('@config/service-urls', () => ({
  getLogger: () => mockLogger,
  getServiceUrls: () => ({}),
}));

import { CacheService } from '../domains/templates/application/services/CacheService';
import { Template, ExecuteTemplateResponse } from '../domains/templates/application/types';

function createMockTemplate(id = 'tpl-1', name = 'Test Template') {
  return {
    id,
    name,
    description: 'A test template',
    category: 'test',
    content: 'Hello {{name}}',
    variables: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    version: '1.0',
  };
}

function createMockExecutionResponse(templateId = 'tpl-1', success = true) {
  return {
    success,
    result: 'Hello World',
    executionTime: 50,
    templateUsed: {
      id: templateId,
      name: 'Test Template',
      version: '1.0',
    },
  };
}

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheService = new CacheService();
  });

  describe('cacheTemplate / getTemplate', () => {
    it('should cache and retrieve a template', () => {
      const template = createMockTemplate();
      cacheService.cacheTemplate(template as unknown as Template);

      const result = cacheService.getTemplate('tpl-1');
      expect(result).toEqual(template);
    });

    it('should return null for uncached template', () => {
      const result = cacheService.getTemplate('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null for expired template', () => {
      vi.useFakeTimers();
      const template = createMockTemplate();
      cacheService.cacheTemplate(template as unknown as Template);

      vi.advanceTimersByTime(31 * 60 * 1000);

      const result = cacheService.getTemplate('tpl-1');
      expect(result).toBeNull();
      vi.useRealTimers();
    });

    it('should increment hit count on cache hit', () => {
      const template = createMockTemplate();
      cacheService.cacheTemplate(template as unknown as Template);

      cacheService.getTemplate('tpl-1');
      cacheService.getTemplate('tpl-1');

      const stats = cacheService.getStats();
      expect(stats.hitCount).toBe(2);
    });

    it('should increment miss count on cache miss', () => {
      cacheService.getTemplate('nonexistent');

      const stats = cacheService.getStats();
      expect(stats.missCount).toBe(1);
    });
  });

  describe('cacheExecution / getExecution', () => {
    it('should cache and retrieve execution result', () => {
      const response = createMockExecutionResponse();
      cacheService.cacheExecution('key-1', response as unknown as ExecuteTemplateResponse);

      const result = cacheService.getExecution('key-1');
      expect(result).toEqual(response);
    });

    it('should not cache failed executions', () => {
      const response = createMockExecutionResponse('tpl-1', false);
      cacheService.cacheExecution('key-1', response as unknown as ExecuteTemplateResponse);

      const result = cacheService.getExecution('key-1');
      expect(result).toBeNull();
    });

    it('should return null for expired execution', () => {
      vi.useFakeTimers();
      const response = createMockExecutionResponse();
      cacheService.cacheExecution('key-1', response as unknown as ExecuteTemplateResponse);

      vi.advanceTimersByTime(6 * 60 * 1000);

      const result = cacheService.getExecution('key-1');
      expect(result).toBeNull();
      vi.useRealTimers();
    });
  });

  describe('generateExecutionKey', () => {
    it('should generate deterministic key for same inputs', () => {
      const key1 = cacheService.generateExecutionKey('tpl-1', { name: 'World' });
      const key2 = cacheService.generateExecutionKey('tpl-1', { name: 'World' });
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different variables', () => {
      const key1 = cacheService.generateExecutionKey('tpl-1', { name: 'World' });
      const key2 = cacheService.generateExecutionKey('tpl-1', { name: 'Alice' });
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different templates', () => {
      const key1 = cacheService.generateExecutionKey('tpl-1', { name: 'World' });
      const key2 = cacheService.generateExecutionKey('tpl-2', { name: 'World' });
      expect(key1).not.toBe(key2);
    });

    it('should produce consistent keys regardless of object key order', () => {
      const key1 = cacheService.generateExecutionKey('tpl-1', { a: '1', b: '2' });
      const key2 = cacheService.generateExecutionKey('tpl-1', { b: '2', a: '1' });
      expect(key1).toBe(key2);
    });
  });

  describe('invalidateTemplate', () => {
    it('should remove template from cache', () => {
      const template = createMockTemplate();
      cacheService.cacheTemplate(template as unknown as Template);

      cacheService.invalidateTemplate('tpl-1');

      const result = cacheService.getTemplate('tpl-1');
      expect(result).toBeNull();
    });

    it('should also invalidate related execution cache entries', () => {
      const template = createMockTemplate();
      cacheService.cacheTemplate(template as unknown as Template);

      const response = createMockExecutionResponse('tpl-1');
      cacheService.cacheExecution('exec-key-1', response as unknown as ExecuteTemplateResponse);

      cacheService.invalidateTemplate('tpl-1');

      const result = cacheService.getExecution('exec-key-1');
      expect(result).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('should clear all caches', () => {
      cacheService.cacheTemplate(createMockTemplate() as unknown as Template);
      cacheService.cacheExecution('key-1', createMockExecutionResponse() as unknown as ExecuteTemplateResponse);

      cacheService.clearAll();

      expect(cacheService.getTemplate('tpl-1')).toBeNull();
      expect(cacheService.getExecution('key-1')).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      vi.useFakeTimers();
      cacheService.cacheTemplate(createMockTemplate('tpl-1') as unknown as Template);

      vi.advanceTimersByTime(31 * 60 * 1000);

      cacheService.cacheTemplate(createMockTemplate('tpl-2', 'Fresh') as unknown as Template);
      cacheService.cleanup();

      expect(cacheService.getTemplate('tpl-1')).toBeNull();
      expect(cacheService.getTemplate('tpl-2')).not.toBeNull();
      vi.useRealTimers();
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      cacheService.cacheTemplate(createMockTemplate() as unknown as Template);
      cacheService.getTemplate('tpl-1');
      cacheService.getTemplate('nonexistent');

      const stats = cacheService.getStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBe(0.5);
      expect(stats.evictions).toBe(0);
    });

    it('should return zero hit rate when no requests', () => {
      const stats = cacheService.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      for (let i = 0; i < 501; i++) {
        cacheService.cacheTemplate(createMockTemplate(`tpl-${i}`, `Template ${i}`) as unknown as Template);
      }

      expect(cacheService.getTemplate('tpl-0')).toBeNull();
      expect(cacheService.getTemplate('tpl-500')).not.toBeNull();

      const stats = cacheService.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });
  });
});
