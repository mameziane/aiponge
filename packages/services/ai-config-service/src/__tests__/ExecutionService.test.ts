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

import { ExecutionService } from '../domains/templates/application/services/ExecutionService';

function createMockTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    name: 'Test Template',
    description: 'A test template',
    category: 'test',
    content: 'Hello {{name}}!',
    variables: [{ name: 'name', type: 'string', required: true }],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    version: '1.0',
    ...overrides,
  };
}

describe('ExecutionService', () => {
  let service: ExecutionService;
  let mockTemplateService: { getTemplate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTemplateService = {
      getTemplate: vi.fn(),
    };

    service = new ExecutionService(mockTemplateService);
  });

  describe('executeTemplate', () => {
    it('should execute template with variable substitution', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(createMockTemplate());

      const result = await service.executeTemplate({
        templateId: 'tpl-1',
        variables: { name: 'World' },
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('Hello World!');
      expect(result.templateUsed.id).toBe('tpl-1');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should return error for inactive template', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(createMockTemplate({ isActive: false }));

      const result = await service.executeTemplate({
        templateId: 'tpl-1',
        variables: { name: 'World' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
    });

    it('should return error for missing required variables', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(createMockTemplate());

      const result = await service.executeTemplate({
        templateId: 'tpl-1',
        variables: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required variables');
      expect(result.error).toContain('name');
    });

    it('should handle ${variable} syntax', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(
        createMockTemplate({ content: 'Hello ${name}!', variables: [{ name: 'name', type: 'string', required: true }] })
      );

      const result = await service.executeTemplate({
        templateId: 'tpl-1',
        variables: { name: 'Alice' },
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('Hello Alice!');
    });

    it('should process system and user prompts', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(
        createMockTemplate({
          content: 'Result: {{topic}}',
          systemPrompt: 'You are a {{role}}.',
          userPrompt: 'Tell me about {{topic}}.',
          variables: [
            { name: 'role', type: 'string', required: true },
            { name: 'topic', type: 'string', required: true },
          ],
        })
      );

      const result = await service.executeTemplate({
        templateId: 'tpl-1',
        variables: { role: 'teacher', topic: 'science' },
      });

      expect(result.success).toBe(true);
      expect(result.systemPrompt).toBe('You are a teacher.');
      expect(result.userPrompt).toBe('Tell me about science.');
      expect(result.messages).toHaveLength(2);
      expect(result.messages![0]).toEqual({ role: 'system', content: 'You are a teacher.' });
      expect(result.messages![1]).toEqual({ role: 'user', content: 'Tell me about science.' });
    });

    it('should handle template not found', async () => {
      mockTemplateService.getTemplate.mockRejectedValue(new Error('Template not found'));

      const result = await service.executeTemplate({
        templateId: 'nonexistent',
        variables: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template not found');
      expect(result.templateUsed.name).toBe('Unknown');
    });

    it('should handle template with no variables required', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(
        createMockTemplate({
          content: 'Static content',
          variables: [],
        })
      );

      const result = await service.executeTemplate({
        templateId: 'tpl-1',
        variables: {},
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('Static content');
    });

    it('should handle default helper syntax', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(
        createMockTemplate({
          content: 'Hello {{default name "Guest"}}!',
          variables: [{ name: 'name', type: 'string', required: false }],
        })
      );

      const result = await service.executeTemplate({
        templateId: 'tpl-1',
        variables: {},
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('Hello Guest!');
    });

    it('should handle default helper with provided value', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(
        createMockTemplate({
          content: 'Hello {{default name "Guest"}}!',
          variables: [{ name: 'name', type: 'string', required: false }],
        })
      );

      const result = await service.executeTemplate({
        templateId: 'tpl-1',
        variables: { name: 'Alice' },
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('Hello Alice!');
    });
  });

  describe('batchExecute', () => {
    it('should execute multiple templates', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(createMockTemplate());

      const result = await service.batchExecute({
        executions: [
          { templateId: 'tpl-1', variables: { name: 'Alice' }, executionId: 'exec-1' },
          { templateId: 'tpl-1', variables: { name: 'Bob' }, executionId: 'exec-2' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.summary.successful).toBe(2);
      expect(result.summary.failed).toBe(0);
    });

    it('should handle mixed success and failure', async () => {
      mockTemplateService.getTemplate
        .mockResolvedValueOnce(createMockTemplate())
        .mockRejectedValueOnce(new Error('Template not found'));

      const result = await service.batchExecute({
        executions: [
          { templateId: 'tpl-1', variables: { name: 'Alice' }, executionId: 'exec-1' },
          { templateId: 'tpl-2', variables: { name: 'Bob' }, executionId: 'exec-2' },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.summary.successful).toBe(1);
      expect(result.summary.failed).toBe(1);
    });

    it('should stop on first error when option is set', async () => {
      mockTemplateService.getTemplate
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce(createMockTemplate());

      const result = await service.batchExecute({
        executions: [
          { templateId: 'tpl-1', variables: { name: 'Alice' }, executionId: 'exec-1' },
          { templateId: 'tpl-2', variables: { name: 'Bob' }, executionId: 'exec-2' },
        ],
        options: { stopOnFirstError: true },
      });

      expect(result.results).toHaveLength(1);
      expect(result.summary.failed).toBe(1);
    });
  });

  describe('previewTemplate', () => {
    it('should preview template execution', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(createMockTemplate());

      const result = await service.previewTemplate('tpl-1', { name: 'World' });

      expect(result.success).toBe(true);
      expect(result.preview).toBe('Hello World!');
      expect(result.missingVariables).toEqual([]);
    });

    it('should detect missing required variables', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(createMockTemplate());

      const result = await service.previewTemplate('tpl-1', {});

      expect(result.success).toBe(false);
      expect(result.missingVariables).toContain('name');
    });

    it('should detect unused variables', async () => {
      mockTemplateService.getTemplate.mockResolvedValue(createMockTemplate());

      const result = await service.previewTemplate('tpl-1', { name: 'World', extra: 'unused' });

      expect(result.unusedVariables).toContain('extra');
    });

    it('should handle template fetch error', async () => {
      mockTemplateService.getTemplate.mockRejectedValue(new Error('Not found'));

      const result = await service.previewTemplate('tpl-1', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not found');
    });
  });
});
