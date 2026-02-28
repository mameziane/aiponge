import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@aiponge/platform-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aiponge/platform-core')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    getLogger: vi.fn(() => mockLogger),
    getEnabledFrameworks: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../domains/services/FrameworkSelectionService', () => ({
  FrameworkSelectionService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    selectFrameworks: vi.fn().mockResolvedValue([]),
    getAvailableFrameworks: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../config/service-urls', () => ({
  createLogger: vi.fn(() => mockLogger),
  getLogger: vi.fn(() => mockLogger),
  getServiceUrls: vi.fn(() => ({})),
}));

import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { ContentTemplateService, ContentTemplate, TemplateVariable } from '../domains/services/ContentTemplateService';

let mockLimitResult: Record<string, unknown>[] = [];
let mockWhereResult: Record<string, unknown>[] | null = null;

let mockDb: Record<string, ReturnType<typeof vi.fn>>;

const createMockDb = () => {
  const db: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(() => mockWhereResult !== null ? Promise.resolve(mockWhereResult) : db),
    limit: vi.fn().mockImplementation(() => Promise.resolve(mockLimitResult)),
  };
  return db;
};

mockDb = createMockDb();

describe('ContentTemplateService', () => {
  let service: ContentTemplateService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLimitResult = [];
    mockWhereResult = null;
    mockDb = createMockDb();
    service = new ContentTemplateService(mockDb);
  });

  describe('Template Loading', () => {
    const mockDbTemplate = {
      id: 'test-template-1',
      name: 'Test Template',
      description: 'A test template',
      contentType: 'article',
      category: 'general',
      systemPrompt: 'You are a helpful assistant.',
      userPromptStructure: 'Create content about ${topic}',
      requiredVariables: ['topic'],
      optionalVariables: ['tone', 'style'],
      tags: ['test', 'article'],
      metadata: { version: '1.0.0', author: 'test' },
      isActive: true,
      visibility: CONTENT_VISIBILITY.SHARED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should load template by ID from database', async () => {
      mockLimitResult = [mockDbTemplate];
      service = new ContentTemplateService(mockDb);

      const template = await service.loadTemplate('test-template-1');

      expect(template).toBeDefined();
      expect(template?.id).toBe('test-template-1');
      expect(template?.name).toBe('Test Template');
    });

    it('should return null for non-existent template', async () => {
      mockLimitResult = [];
      service = new ContentTemplateService(mockDb);

      const template = await service.loadTemplate('non-existent');

      expect(template).toBeNull();
    });

    it('should cache loaded templates', async () => {
      mockLimitResult = [mockDbTemplate];
      service = new ContentTemplateService(mockDb);

      await service.loadTemplate('test-template-1');
      await service.loadTemplate('test-template-1');

      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it('should load all active templates', async () => {
      mockWhereResult = [mockDbTemplate, { ...mockDbTemplate, id: 'test-template-2' }];
      service = new ContentTemplateService(mockDb);

      const templates = await service.loadTemplates();

      expect(templates).toHaveLength(2);
    });
  });

  describe('Template Variable Mapping', () => {
    const mockDbTemplate = {
      id: 'variable-test',
      name: 'Variable Test Template',
      description: 'Testing variables',
      contentType: 'creative',
      category: 'music',
      systemPrompt: 'System prompt',
      userPromptStructure: 'User prompt',
      requiredVariables: ['prompt', 'mood'],
      optionalVariables: ['language', 'style'],
      tags: [],
      metadata: {},
      isActive: true,
      visibility: CONTENT_VISIBILITY.SHARED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should map required variables correctly', async () => {
      mockLimitResult = [mockDbTemplate];
      service = new ContentTemplateService(mockDb);

      const template = await service.loadTemplate('variable-test');

      expect(template).not.toBeNull();
      const requiredVars = template?.variables.filter(v => v.required);
      expect(requiredVars).toHaveLength(2);
      expect(requiredVars?.map(v => v.name)).toContain('prompt');
      expect(requiredVars?.map(v => v.name)).toContain('mood');
    });

    it('should map optional variables correctly', async () => {
      mockLimitResult = [mockDbTemplate];
      service = new ContentTemplateService(mockDb);

      const template = await service.loadTemplate('variable-test');

      expect(template).not.toBeNull();
      const optionalVars = template?.variables.filter(v => !v.required);
      expect(optionalVars).toHaveLength(2);
      expect(optionalVars?.map(v => v.name)).toContain('language');
    });
  });

  describe('Template Processing', () => {
    const mockTemplate = {
      id: 'process-test',
      name: 'Process Test',
      description: 'Testing processing',
      contentType: 'article',
      category: 'general',
      systemPrompt: 'You are writing about ${topic}.',
      userPromptStructure: 'Create content about ${topic} with ${tone} tone.',
      requiredVariables: ['topic'],
      optionalVariables: ['tone'],
      tags: [],
      metadata: { version: '1.0.0' },
      isActive: true,
      visibility: CONTENT_VISIBILITY.SHARED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should substitute variables in template', async () => {
      mockLimitResult = [mockTemplate];
      service = new ContentTemplateService(mockDb);

      const result = await service.processTemplate('process-test', {
        topic: 'artificial intelligence',
        tone: 'professional',
      });

      expect(result.userPrompt).toContain('artificial intelligence');
      expect(result.userPrompt).toContain('professional');
    });

    it('should throw error for missing required variable', async () => {
      mockLimitResult = [mockTemplate];
      service = new ContentTemplateService(mockDb);

      await expect(
        service.processTemplate('process-test', { tone: 'casual' })
      ).rejects.toThrow('Missing required template variables: topic');
    });

    it('should use fallback for missing optional variable', async () => {
      mockLimitResult = [mockTemplate];
      service = new ContentTemplateService(mockDb);

      const result = await service.processTemplate('process-test', {
        topic: 'testing',
      });

      expect(result).toBeDefined();
      expect(result.userPrompt).toContain('testing');
    });

    it('should include processing metadata', async () => {
      mockLimitResult = [mockTemplate];
      service = new ContentTemplateService(mockDb);

      const result = await service.processTemplate('process-test', {
        topic: 'testing',
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata.templateId).toBe('process-test');
      expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0);
    });
  });




  describe('Template Search', () => {
    const mockTemplates = [
      {
        id: 'article-1',
        name: 'Article Template',
        description: 'For articles',
        contentType: 'article',
        category: 'general',
        systemPrompt: '',
        userPromptStructure: '',
        requiredVariables: [],
        optionalVariables: [],
        tags: ['article', 'professional'],
        metadata: {},
        isActive: true,
        visibility: CONTENT_VISIBILITY.SHARED,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'creative-1',
        name: 'Creative Template',
        description: 'For creative writing',
        contentType: 'creative',
        category: 'music',
        systemPrompt: '',
        userPromptStructure: '',
        requiredVariables: [],
        optionalVariables: [],
        tags: ['creative', 'music'],
        metadata: {},
        isActive: true,
        visibility: CONTENT_VISIBILITY.PERSONAL,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should search templates by content type', async () => {
      mockWhereResult = mockTemplates;
      service = new ContentTemplateService(mockDb);

      const results = await service.searchTemplates({ contentType: 'article' });

      expect(results.some(t => t.contentType === 'article')).toBe(true);
    });

    it('should search templates by category', async () => {
      mockWhereResult = mockTemplates;
      service = new ContentTemplateService(mockDb);

      const results = await service.searchTemplates({ category: 'music' });

      expect(results.some(t => t.category === 'music')).toBe(true);
    });

    it('should filter by visibility status', async () => {
      mockWhereResult = mockTemplates;
      service = new ContentTemplateService(mockDb);

      const sharedResults = await service.searchTemplates({ visibility: CONTENT_VISIBILITY.SHARED });
      const personalResults = await service.searchTemplates({ visibility: CONTENT_VISIBILITY.PERSONAL });

      expect(sharedResults.every(t => t.visibility === CONTENT_VISIBILITY.SHARED)).toBe(true);
      expect(personalResults.every(t => t.visibility === CONTENT_VISIBILITY.PERSONAL)).toBe(true);
    });

    it('should search by query string', async () => {
      mockWhereResult = mockTemplates;
      service = new ContentTemplateService(mockDb);

      const results = await service.searchTemplates({ query: 'creative' });

      expect(results.some(t => t.name.toLowerCase().includes('creative'))).toBe(true);
    });
  });

  describe('Template CRUD Operations', () => {
    it('should create a new template', async () => {
      const newTemplate = await service.createTemplate({
        name: 'New Template',
        description: 'A new template',
        contentType: 'blog',
        category: 'marketing',
        systemPrompt: 'System prompt',
        userPromptStructure: 'User prompt with ${variable}',
        variables: [{ name: 'variable', type: 'string', required: true, description: 'Test var' }],
        visibility: CONTENT_VISIBILITY.SHARED,
      });

      expect(newTemplate.id).toBeDefined();
      expect(newTemplate.name).toBe('New Template');
      expect(newTemplate.metadata.createdAt).toBeDefined();
    });

    it('should update an existing template', async () => {
      const created = await service.createTemplate({
        name: 'Original',
        description: 'Original description',
        contentType: 'article',
        category: 'general',
        systemPrompt: '',
        userPromptStructure: '',
        variables: [],
        visibility: CONTENT_VISIBILITY.SHARED,
      });

      const updated = await service.updateTemplate(created.id, {
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated description');
      expect(updated.id).toBe(created.id);
    });

    it('should delete a template', async () => {
      const created = await service.createTemplate({
        name: 'To Delete',
        description: 'Will be deleted',
        contentType: 'email',
        category: 'marketing',
        systemPrompt: '',
        userPromptStructure: '',
        variables: [],
        visibility: CONTENT_VISIBILITY.PERSONAL,
      });

      const deleted = await service.deleteTemplate(created.id);
      expect(deleted).toBe(true);

      const notDeleted = await service.deleteTemplate('non-existent');
      expect(notDeleted).toBe(false);
    });
  });

  describe('Template Statistics', () => {
    const mockTemplate = {
      id: 'stats-test',
      name: 'Stats Template',
      description: 'For stats testing',
      contentType: 'article',
      category: 'general',
      systemPrompt: '',
      userPromptStructure: '',
      requiredVariables: ['topic', 'audience'],
      optionalVariables: ['tone'],
      tags: [],
      metadata: { usageCount: 150, averageRating: 4.5 },
      isActive: true,
      visibility: CONTENT_VISIBILITY.SHARED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return template statistics', async () => {
      mockLimitResult = [mockTemplate];
      service = new ContentTemplateService(mockDb);

      const stats = await service.getTemplateStats('stats-test');

      expect(stats).toBeDefined();
    });

    it('should return null for non-existent template', async () => {
      mockLimitResult = [];
      service = new ContentTemplateService(mockDb);

      const stats = await service.getTemplateStats('non-existent');

      expect(stats).toBeNull();
    });
  });
});
