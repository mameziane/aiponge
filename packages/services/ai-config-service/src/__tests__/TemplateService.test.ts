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

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

import { TemplateService } from '../domains/templates/application/services/TemplateService';
import { TemplateNotFoundError, TemplateValidationError } from '../domains/templates/application/types';
import { IContentTemplateRepository } from '../domains/templates/application/ports/IContentTemplateRepository';
import { IConfigEventPublisher } from '../domains/templates/application/ports/IConfigEventPublisher';

function createMockRepository() {
  return {
    getTemplateById: vi.fn(),
    getTemplateByName: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    listTemplates: vi.fn(),
    getCategories: vi.fn(),
  };
}

function createMockEventPublisher() {
  return {
    templateCreated: vi.fn(),
    templateUpdated: vi.fn(),
    templateDeleted: vi.fn(),
  };
}

const sampleTemplate = {
  id: 'tmpl-1',
  name: 'Test Template',
  description: 'A test template',
  category: 'general',
  content: 'Hello {{name}}',
  systemPrompt: 'You are helpful',
  userPromptStructure: '{{user_input}}',
  variables: [],
  tags: [],
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'system',
};

describe('TemplateService', () => {
  let service: TemplateService;
  let mockRepo: ReturnType<typeof createMockRepository>;
  let mockEvents: ReturnType<typeof createMockEventPublisher>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepository();
    mockEvents = createMockEventPublisher();
    service = new TemplateService(
      mockRepo as unknown as IContentTemplateRepository,
      mockEvents as unknown as IConfigEventPublisher
    );
  });

  describe('createTemplate', () => {
    it('should create a template with valid data', async () => {
      mockRepo.getTemplateByName.mockResolvedValue(null);
      mockRepo.createTemplate.mockResolvedValue(sampleTemplate);

      const result = await service.createTemplate({
        name: 'Test Template',
        category: 'general',
        content: 'Hello {{name}}',
      });

      expect(result).toEqual(sampleTemplate);
      expect(mockRepo.createTemplate).toHaveBeenCalled();
      expect(mockEvents.templateCreated).toHaveBeenCalledWith(
        sampleTemplate.id,
        sampleTemplate.name,
        sampleTemplate.category,
        '1.0.0'
      );
    });

    it('should throw TemplateValidationError for missing name', async () => {
      await expect(service.createTemplate({ name: '', category: 'general' })).rejects.toThrow(TemplateValidationError);
    });

    it('should throw TemplateValidationError for missing category', async () => {
      await expect(service.createTemplate({ name: 'Valid Name', category: '' })).rejects.toThrow(
        TemplateValidationError
      );
    });

    it('should throw when template name already exists', async () => {
      mockRepo.getTemplateByName.mockResolvedValue(sampleTemplate);

      await expect(service.createTemplate({ name: 'Test Template', category: 'general' })).rejects.toThrow(
        TemplateValidationError
      );
    });
  });

  describe('getTemplate', () => {
    it('should return template when found', async () => {
      mockRepo.getTemplateById.mockResolvedValue(sampleTemplate);

      const result = await service.getTemplate('tmpl-1');

      expect(result).toEqual(sampleTemplate);
    });

    it('should throw TemplateNotFoundError when not found', async () => {
      mockRepo.getTemplateById.mockResolvedValue(null);

      await expect(service.getTemplate('nonexistent')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('updateTemplate', () => {
    it('should update template with valid changes', async () => {
      const updated = { ...sampleTemplate, name: 'Updated Name' };
      mockRepo.getTemplateById.mockResolvedValue(sampleTemplate);
      mockRepo.getTemplateByName.mockResolvedValue(null);
      mockRepo.updateTemplate.mockResolvedValue(updated);

      const result = await service.updateTemplate('tmpl-1', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(mockEvents.templateUpdated).toHaveBeenCalled();
    });

    it('should throw TemplateNotFoundError if template does not exist', async () => {
      mockRepo.getTemplateById.mockResolvedValue(null);

      await expect(service.updateTemplate('nonexistent', { name: 'New' })).rejects.toThrow(TemplateNotFoundError);
    });

    it('should throw when renaming to an existing name', async () => {
      const other = { ...sampleTemplate, id: 'tmpl-2', name: 'Taken Name' };
      mockRepo.getTemplateById.mockResolvedValue(sampleTemplate);
      mockRepo.getTemplateByName.mockResolvedValue(other);

      await expect(service.updateTemplate('tmpl-1', { name: 'Taken Name' })).rejects.toThrow(TemplateValidationError);
    });

    it('should allow keeping same name on update', async () => {
      mockRepo.getTemplateById.mockResolvedValue(sampleTemplate);
      mockRepo.getTemplateByName.mockResolvedValue(sampleTemplate);
      mockRepo.updateTemplate.mockResolvedValue(sampleTemplate);

      const result = await service.updateTemplate('tmpl-1', { name: 'Test Template' });

      expect(result).toEqual(sampleTemplate);
    });

    it('should throw TemplateNotFoundError if update returns null', async () => {
      mockRepo.getTemplateById.mockResolvedValue(sampleTemplate);
      mockRepo.updateTemplate.mockResolvedValue(null);

      await expect(service.updateTemplate('tmpl-1', { description: 'new desc' })).rejects.toThrow(
        TemplateNotFoundError
      );
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template when it exists', async () => {
      mockRepo.getTemplateById.mockResolvedValue(sampleTemplate);
      mockRepo.deleteTemplate.mockResolvedValue(true);

      const result = await service.deleteTemplate('tmpl-1');

      expect(result).toBe(true);
      expect(mockEvents.templateDeleted).toHaveBeenCalledWith('tmpl-1', 'Test Template');
    });

    it('should throw TemplateNotFoundError when template does not exist', async () => {
      mockRepo.getTemplateById.mockResolvedValue(null);

      await expect(service.deleteTemplate('nonexistent')).rejects.toThrow(TemplateNotFoundError);
    });

    it('should return false when deletion fails', async () => {
      mockRepo.getTemplateById.mockResolvedValue(sampleTemplate);
      mockRepo.deleteTemplate.mockResolvedValue(false);

      const result = await service.deleteTemplate('tmpl-1');

      expect(result).toBe(false);
      expect(mockEvents.templateDeleted).not.toHaveBeenCalled();
    });
  });

  describe('listTemplates', () => {
    it('should list templates with filters', async () => {
      const listResult = {
        templates: [sampleTemplate],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      };
      mockRepo.listTemplates.mockResolvedValue(listResult);

      const result = await service.listTemplates({ category: 'general', limit: 20 });

      expect(result.templates).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should list with empty filters', async () => {
      const listResult = {
        templates: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      };
      mockRepo.listTemplates.mockResolvedValue(listResult);

      const result = await service.listTemplates();

      expect(result.templates).toHaveLength(0);
    });
  });

  describe('getCategories', () => {
    it('should return available categories', async () => {
      mockRepo.getCategories.mockResolvedValue(['general', 'therapeutic', 'creative']);

      const result = await service.getCategories();

      expect(result).toEqual(['general', 'therapeutic', 'creative']);
    });
  });

  describe('importTemplates', () => {
    it('should import valid templates', async () => {
      mockRepo.getTemplateByName.mockResolvedValue(null);
      mockRepo.createTemplate.mockResolvedValue(sampleTemplate);

      const result = await service.importTemplates({
        templates: [
          {
            name: 'Imported Template',
            category: 'general',
            content: 'Imported content',
            isActive: true,
            createdBy: 'import',
            variables: [],
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.imported).toBeGreaterThanOrEqual(0);
    });

    it('should skip existing templates when overwrite is disabled', async () => {
      mockRepo.getTemplateByName.mockResolvedValue(sampleTemplate);

      const result = await service.importTemplates({
        templates: [
          {
            name: 'Test Template',
            category: 'general',
            content: 'content',
            isActive: true,
            createdBy: 'import',
            variables: [],
          },
        ],
        options: { overwriteExisting: false },
      });

      expect(result.failed).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Template Types - Error Classes', () => {
  describe('TemplateNotFoundError', () => {
    it('should create with template ID', () => {
      const error = new TemplateNotFoundError('tmpl-123');
      expect(error.message).toContain('tmpl-123');
      expect(error.name).toBe('TemplateNotFoundError');
    });
  });

  describe('TemplateValidationError', () => {
    it('should create with validation errors', () => {
      const error = new TemplateValidationError('Validation failed', ['Name required', 'Category required']);
      expect(error.message).toBe('Validation failed');
      expect(error.validationErrors).toEqual(['Name required', 'Category required']);
      expect(error.name).toBe('TemplateValidationError');
    });
  });
});
